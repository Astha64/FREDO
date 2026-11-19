# backend/app/context.py
from datetime import date, datetime

from sqlalchemy.orm import Session

from app import config, repository
from app.models import Task

MAX_TASKS = 5


def describe_task(task: Task, today: date) -> str:
    parts = [task.title[:200]]
    if task.due_date is not None:
        if task.due_date < today:
            parts.append(f"OVERDUE since {task.due_date.isoformat()}")
        elif task.due_date == today:
            parts.append("due today")
        else:
            parts.append(f"due {task.due_date.isoformat()}")
    if task.why:
        parts.append(f"why: {task.why[:200]}")
    if task.consequence:
        parts.append(f"if skipped: {task.consequence[:200]}")
    if task.snooze_count:
        parts.append(f"snoozed {task.snooze_count} times")
    return "- " + " | ".join(parts)


def build_context(db: Session) -> str:
    now = datetime.now()
    lines = [f"Current time: {now.strftime('%A %d %B %Y, %H:%M')}"]

    tasks = repository.list_tasks(db, "pending")
    if not tasks:
        lines.append("Pending tasks: none.")
    elif not config.AI_SHARE_TASKS:
        lines.append(f"Pending tasks: {len(tasks)} (the details are private).")
    else:
        lines.append(f"Pending tasks: {len(tasks)}. Most urgent first:")
        lines.extend(describe_task(task, now.date()) for task in tasks[:MAX_TASKS])

    turns = repository.recent_turns(db, 8)
    if turns:
        lines.append("")
        lines.append("Recent conversation (oldest first):")
        for turn in turns:
            who = "User" if turn.role == "user" else "Fredo"
            lines.append(f"{who}: {turn.text}")

    return "\n".join(lines)