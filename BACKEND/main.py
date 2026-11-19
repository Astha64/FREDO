# backend/main.py
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import config, models, repository
from app.ai import ai_is_configured, ask_fredo
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

Base.metadata.create_all(bind=engine)

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

    situation = f'The user says: "{payload.text}"\nReply as Fredo.'
    reply, _error = ask_fredo(situation, context)

    if reply is None:
        reply = {"lines": OFFLINE_CHAT_LINES, "mood": "sad", "action": "none"}
        source = "fallback"
    else:
        source = "gemini"

    repository.save_turn(db, "fredo", " ".join(reply["lines"]))

    return {
        "lines": reply["lines"],
        "reply": " ".join(reply["lines"]),
        "mood": reply["mood"],
        "action": reply["action"],
        "source": source,
    }