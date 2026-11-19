# backend/app/models.py
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String)
    why: Mapped[str] = mapped_column(String, default="")
    consequence: Mapped[str] = mapped_column(String, default="")
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, default=None)
    status: Mapped[str] = mapped_column(String, default="pending")
    goal_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    snooze_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)
    snoozed_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)

class ChatTurn(Base):
    __tablename__ = "chat_turns"

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String)  # "user" or "fredo"
    text: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)