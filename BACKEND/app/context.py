# backend/app/context.py
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app import config, repository
from app.models import Task

MAX_TASKS = 5


def local_time_text(value: datetime) -> str:
    """The database keeps UTC. This shows it as the laptop's local time."""
    return value.replace(tzinfo=timezone.utc).astimezone().strftime("%H:%M")


def describe_task(task: Task, today: date, now_utc: datetime) -> str:
    parts = [f"[id {task.id}] {task.title[:200]}"]
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
    if task.snoozed_until is not None and task.snoozed_until > now_utc:
        parts.append(f"snoozed until {local_time_text(task.snoozed_until)}")
    return "- " + " | ".join(parts)


def build_context(db: Session) -> str:
    now = datetime.now()
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    lines = [f"Current time: {now.strftime('%A %d %B %Y, %H:%M')}"]

    tasks = repository.list_tasks(db, "pending")
    if not tasks:
        lines.append("Pending tasks: none.")
    elif not config.AI_SHARE_TASKS:
        lines.append(f"Pending tasks: {len(tasks)} (the details are private).")
    else:
        lines.append(f"Pending tasks: {len(tasks)}. Most urgent first:")
        lines.extend(describe_task(task, now.date(), now_utc) for task in tasks[:MAX_TASKS])

    turns = repository.recent_turns(db, 8)
    if turns:
        lines.append("")
        lines.append("Recent conversation (oldest first):")
        for turn in turns:
            who = "User" if turn.role == "user" else "Fredo"
            lines.append(f"{who}: {turn.text}")

    return "\n".join(lines)