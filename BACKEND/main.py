# backend/main.py
from typing import Optional

from datetime import date

from app.greeting import build_greeting_lines

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import models, repository
from app.database import Base, engine, get_db
from app.schemas import MessageCreate, MessageOut, TaskCreate, TaskOut, TaskUpdate

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Fredo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FIXED_REPLY = "I received your message."


@app.get("/health")
def health_check():
    return {"status": "ok", "application": "Fredo"}


@app.post("/message")
def receive_message(payload: dict):
    message = payload.get("message", "")
    return {
        "received": True,
        "message": message,
        "reply": FIXED_REPLY,
    }


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

@app.get("/greeting")
def greeting(db: Session = Depends(get_db)):
    tasks = repository.list_tasks(db, "pending")
    return {
        "lines": build_greeting_lines(tasks, date.today()),
        "task_count": len(tasks),
    }