# backend/app/repository.py
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Message, Task, utc_now
from app.schemas import TaskCreate, TaskUpdate


def save_message(db: Session, text: str) -> Message:
    message = Message(text=text)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def list_messages(db: Session) -> list[Message]:
    statement = select(Message).order_by(Message.id)
    return list(db.scalars(statement).all())


def create_task(db: Session, data: TaskCreate) -> Task:
    task = Task(
        title=data.title,
        why=data.why,
        consequence=data.consequence,
        due_date=data.due_date,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def list_tasks(db: Session, status: Optional[str] = None) -> list[Task]:
    statement = select(Task)
    if status is not None:
        statement = statement.where(Task.status == status)
    # tasks with a due date first (soonest first), tasks without one last
    statement = statement.order_by(Task.due_date.is_(None), Task.due_date, Task.id)
    return list(db.scalars(statement).all())


def get_task(db: Session, task_id: int) -> Optional[Task]:
    return db.get(Task, task_id)


def update_task(db: Session, task: Task, data: TaskUpdate) -> Task:
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        # only the due date may be cleared by sending null
        if value is None and field != "due_date":
            continue
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


def complete_task(db: Session, task: Task) -> Task:
    task.status = "done"
    task.completed_at = utc_now()
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task: Task) -> None:
    db.delete(task)
    db.commit()