# backend/app/greeting.py
from datetime import date, datetime

from app.models import Task


def time_greeting() -> str:
    hour = datetime.now().hour
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    return "Good evening"


def due_phrase(task: Task, today: date) -> str:
    if task.due_date is None:
        return ""
    if task.due_date < today:
        return "It is overdue."
    if task.due_date == today:
        return "It is due today."
    days = (task.due_date - today).days
    if days == 1:
        return "It is due tomorrow."
    return f"It is due in {days} days."


def build_greeting_lines(tasks: list[Task], today: date) -> list[str]:
    """Returns the greeting as separate lines, one bubble each."""
    lines = [time_greeting() + "!"]

    if not tasks:
        lines.append("Nothing is waiting for you right now.")
        lines.append("Add a task whenever you are ready.")
        return lines

    count = len(tasks)
    overdue = sum(1 for t in tasks if t.due_date is not None and t.due_date < today)
    word = "task is" if count == 1 else "tasks are"
    summary = f"{count} {word} waiting for you."
    if overdue:
        summary += f" {overdue} overdue."
    lines.append(summary)

    first = tasks[0]
    first_line = f"First up: {first.title.rstrip('.')}."
    due = due_phrase(first, today)
    if due:
        first_line += " " + due
    lines.append(first_line)

    reasons = []
    if first.why:
        reasons.append(f"Why it matters: {first.why.rstrip('.')}.")
    if first.consequence:
        reasons.append(f"If you skip it: {first.consequence.rstrip('.')}.")
    if reasons:
        lines.append(" ".join(reasons))

    return lines