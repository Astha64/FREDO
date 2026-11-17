# backend/main.py
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import models, repository
from app.database import Base, engine, get_db
from app.schemas import MessageCreate, MessageOut

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