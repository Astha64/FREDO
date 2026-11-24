# backend/app/schemas.py
from datetime import date, datetime
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, StringConstraints, model_validator

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
    snoozed_until: Optional[datetime] = None

class ChatRequest(BaseModel):
    text: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=1000),
    ]
    voice: bool = False   # True when the text came from speech recognition


class TaskDraft(BaseModel):
    """
    A proposed task extracted by AI.
    This is only a draft. It does not save anything to the database.
    """

    is_task: bool

    title: Optional[str] = None
    why: LongText = ""
    consequence: LongText = ""
    due_date: Optional[date] = None

    needs_clarification: bool = False
    clarification_question: Optional[str] = None

    @model_validator(mode="after")
    def validate_draft(self):
        # A real task must have a title.
        if self.is_task and not (self.title and self.title.strip()):
            raise ValueError("A task draft must have a title.")

        # If the date needs clarification, do not accept a guessed date.
        if self.needs_clarification and self.due_date is not None:
            raise ValueError(
                "A draft needing date clarification cannot have a due date."
            )

        # Keep the title within the same limit as normal task creation.
        if self.title and len(self.title.strip()) > 200:
            raise ValueError("Task title cannot exceed 200 characters.")

        if self.clarification_question and len(self.clarification_question) > 300:
            raise ValueError("Clarification question cannot exceed 300 characters.")

        return self
