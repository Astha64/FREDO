# backend/main.py
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import config, models, repository
from app.ai import (
    ai_is_configured,
    ask_fredo,
    extract_task_draft,
)
from app.context import build_context
from app.database import Base, engine, get_db
from app.greeting import build_greeting_lines
from app.persona import GREETING_SITUATION
from app.schemas import (
    ChatRequest,
    MessageCreate,
    MessageOut,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)

from app.intents import (
    apply_ai_intent,
    apply_command,
    detect_command,
    fallback_lines,
    reaction_situation,
)
from app.migrate import ensure_column

Base.metadata.create_all(bind=engine)

ensure_column(engine, "tasks", "snoozed_until", "DATETIME")

app = FastAPI(title="Fredo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FIXED_REPLY = "I received your message."

OFFLINE_CHAT_LINES = [
    "My brain is not reachable right now, so I cannot think of anything clever.",
    "I saved what you said, though.",
]


@app.get("/health")
def health_check():
    return {"status": "ok", "application": "Fredo"}


# ---------- old Phase 1 and 4 routes (kept for testing) ----------

@app.post("/message")
def receive_message(payload: dict):
    message = payload.get("message", "")
    return {"received": True, "message": message, "reply": FIXED_REPLY}


@app.post("/messages")
def create_message(payload: MessageCreate, db: Session = Depends(get_db)):
    saved = repository.save_message(db, payload.text)
    return {
        "id": saved.id,
        "text": saved.text,
        "created_at": saved.created_at,
        "reply": FIXED_REPLY,
    }


@app.get("/messages", response_model=list[MessageOut])
def read_messages(db: Session = Depends(get_db)):
    return repository.list_messages(db)


# ---------- tasks (Phase 5) ----------

def get_task_or_404(db: Session, task_id: int):
    task = repository.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    return repository.create_task(db, payload)


@app.get("/tasks", response_model=list[TaskOut])
def read_tasks(status: Optional[str] = None, db: Session = Depends(get_db)):
    return repository.list_tasks(db, status)


@app.patch("/tasks/{task_id}", response_model=TaskOut)
def edit_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    return repository.update_task(db, task, payload)


@app.post("/tasks/{task_id}/complete", response_model=TaskOut)
def finish_task(task_id: int, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    return repository.complete_task(db, task)


@app.delete("/tasks/{task_id}", status_code=204)
def remove_task(task_id: int, db: Session = Depends(get_db)):
    task = get_task_or_404(db, task_id)
    repository.delete_task(db, task)
    return Response(status_code=204)


# ---------- the AI brain (Phase 7) ----------

@app.get("/ai/status")
def ai_status():
    return {
        "configured": ai_is_configured(),
        "model": config.GEMINI_MODEL,
        "share_task_details": config.AI_SHARE_TASKS,
    }


@app.get("/ai/test")
def ai_test():
    reply, error = ask_fredo(
        "Say a very short hello to the user.",
        "No personal context for this test.",
    )
    return {"ok": reply is not None, "reply": reply, "error": error}


@app.post("/ai/test-task-draft")
def ai_test_task_draft(payload: ChatRequest):
    draft, error = extract_task_draft(payload.text)

    return {
        "ok": draft is not None,
        "draft": draft,
        "error": error,
    }



@app.get("/greeting")
def greeting(db: Session = Depends(get_db)):
    tasks = repository.list_tasks(db, "pending")

    lines = build_greeting_lines(tasks, date.today())
    source = "template"
    mood = "happy"
    action = "wave"

    if ai_is_configured():
        reply, _error = ask_fredo(GREETING_SITUATION, build_context(db))
        if reply is not None:
            lines = reply["lines"]
            mood = reply["mood"]
            action = reply["action"]
            source = "gemini"

    return {
        "lines": lines,
        "mood": mood,
        "action": action,
        "source": source,
        "task_count": len(tasks),
    }


@app.post("/chat")
def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    # build the context first, so the new message is not repeated inside it
    context = build_context(db)
    repository.save_turn(db, "user", payload.text)
    pending = repository.list_tasks(db, "pending")

    event = None
    source = "gemini"
    command = detect_command(payload.text, pending)

    if command is not None and command.task is None:
        # more than one task could fit: ask which one (no AI needed)
        names = ", ".join(task.title for task in command.candidates[:5])
        reply = {
            "lines": [f"Which one do you mean? I see: {names}."],
            "mood": "thinking",
            "action": "none",
        }
        source = "rules"

    elif command is not None:
        # a clear command: do it with plain code, then let Fredo react
        event = apply_command(db, command.intent, command.task, command.minutes)
        reply, _error = ask_fredo(reaction_situation(event), build_context(db))
        if reply is None:
            mood = "proud" if event["type"] == "task_done" else "happy"
            reply = {"lines": fallback_lines(event), "mood": mood, "action": "none"}
            source = "fallback"

    else:
        # normal talk. Gemini may also recognise a command we did not
        situation = f'The user says: "{payload.text}"\nReply as Fredo.'
        reply, _error = ask_fredo(situation, context)
        if reply is None:
            reply = {"lines": OFFLINE_CHAT_LINES, "mood": "sad", "action": "none"}
            source = "fallback"
        else:
            event, problem_lines = apply_ai_intent(db, reply, pending)
            if problem_lines is not None:
                reply["lines"] = problem_lines
                reply["mood"] = "thinking"

    repository.save_turn(db, "fredo", " ".join(reply["lines"]))

    return {
        "lines": reply["lines"],
        "reply": " ".join(reply["lines"]),
        "mood": reply["mood"],
        "action": reply["action"],
        "source": source,
        "event": event,
    }