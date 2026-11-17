# backend/app/repository.py
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Message


def save_message(db: Session, text: str) -> Message:
    message = Message(text=text)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def list_messages(db: Session) -> list[Message]:
    statement = select(Message).order_by(Message.id)
    return list(db.scalars(statement).all())