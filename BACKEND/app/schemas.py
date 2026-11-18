# backend/app/schemas.py
from datetime import date, datetime
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, StringConstraints

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class MessageCreate(BaseModel):
    text: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=2000),
    ]


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    created_at: datetime


class TaskCreate(BaseModel):
    title: Title
    why: LongText = ""
    consequence: LongText = ""
    due_date: Optional[date] = None


class TaskUpdate(BaseModel):
    title: Optional[Title] = None
    why: Optional[LongText] = None
    consequence: Optional[LongText] = None
    due_date: Optional[date] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    why: str
    consequence: str
    due_date: Optional[date]
    status: str
    goal_id: Optional[int]
    snooze_count: int
    created_at: datetime
    completed_at: Optional[datetime]