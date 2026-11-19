# backend/app/intents.py
import re
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app import config, repository
from app.models import Task

DEFAULT_SNOOZE_MINUTES = 30
MIN_SNOOZE_MINUTES = 5
MAX_SNOOZE_MINUTES = 480

QUESTION_START = re.compile(
    r"^(should|can|could|did|do|does|what|how|when|why|is|are|will|would|which|who)\b"
)
NEGATION = re.compile(r"\b(not|never|haven'?t|hasn'?t|didn'?t|yet)\b")
COMPLETE_RE = re.compile(r"\bfinished\b|\bcompleted\b|\bdone\b|\bwrapped up\b")
SNOOZE_RE = re.compile(r"\bsnooze\w*\b|\bpostpone\w*\b|\bremind me later\b|\bremind me in\b")

# words that say nothing about WHICH task
STOP_WORDS = {
    "the", "a", "an", "my", "to", "of", "for", "with", "on", "in", "and", "i", "is", "it",
    "this", "that", "task", "tasks", "done", "finished", "completed", "complete", "mark",
    "marked", "snooze", "snoozed", "postpone", "remind", "me", "later", "just", "have",
    "has", "im", "ive", "am", "please", "minutes", "minute", "mins", "min", "hour", "hours",
    "hr", "hrs", "half", "by", "at", "now", "again", "wrapped", "up", "as", "from",
}


@dataclass
class Command:
    intent: str  # "complete_task" or "snooze_task"
    task: Optional[Task] = None
    candidates: list = field(default_factory=list)  # filled when more than one task fits
    minutes: int = DEFAULT_SNOOZE_MINUTES


def _stems(text: str) -> set:
    """Important words, cut to 5 letters so 'revise' and 'revision' match."""
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {w[:5] for w in words if w not in STOP_WORDS and len(w) > 1 and not w.isdigit()}


def match_score(text: str, title: str) -> float:
    title_stems = _stems(title)
    if not title_stems:
        return 0.0
    return len(title_stems & _stems(text)) / len(title_stems)


def find_task(text: str, tasks: list) -> tuple:
    """Returns (task, candidates). A task means one clear match."""
    scored = [(match_score(text, task.title), task) for task in tasks]
    scored = [(score, task) for score, task in scored if score >= 0.5]

    if scored:
        best = max(score for score, _ in scored)
        top = [task for score, task in scored if score == best]
        if len(top) == 1:
            return top[0], []
        return None, top

    # nothing matched by name: only a bare "done" or "snooze" can mean "the task"
    if _stems(text):
        return None, []
    if len(tasks) == 1:
        return tasks[0], []
    return None, tasks


def clamp_minutes(minutes: int) -> int:
    return max(MIN_SNOOZE_MINUTES, min(MAX_SNOOZE_MINUTES, int(minutes)))


def parse_minutes(text: str) -> int:
    t = text.lower()
    if "half an hour" in t or "half hour" in t:
        return 30
    match = re.search(r"(\d+)\s*(?:hours?|hrs?|h)\b", t)
    if match:
        return clamp_minutes(int(match.group(1)) * 60)
    if re.search(r"\ban hour\b", t):
        return 60
    match = re.search(r"(\d+)\s*(?:minutes?|mins?|m)\b", t)
    if match:
        return clamp_minutes(int(match.group(1)))
    match = re.search(r"snooze\D*(\d+)", t)
    if match:
        return clamp_minutes(int(match.group(1)))
    return DEFAULT_SNOOZE_MINUTES


def detect_command(text: str, tasks: list) -> Optional[Command]:
    """Plain code: recognises clear 'done' and 'snooze' messages. No AI call."""
    lowered = text.lower().strip()
    if not tasks or lowered.endswith("?") or QUESTION_START.match(lowered):
        return None

    if SNOOZE_RE.search(lowered):
        intent = "snooze_task"
    elif COMPLETE_RE.search(lowered) and not NEGATION.search(lowered):
        intent = "complete_task"
    else:
        return None

    task, candidates = find_task(lowered, tasks)
    if task is None and not candidates:
        return None
    return Command(
        intent=intent, task=task, candidates=candidates, minutes=parse_minutes(lowered)
    )


def apply_command(db: Session, intent: str, task: Task, minutes: int) -> dict:
    """Does the real work. Returns an event that describes what happened."""
    if intent == "complete_task":
        repository.complete_task(db, task)
        return {"type": "task_done", "task_id": task.id, "title": task.title}

    minutes = clamp_minutes(minutes)
    repository.snooze_task(db, task, minutes)
    return {
        "type": "task_snoozed",
        "task_id": task.id,
        "title": task.title,
        "minutes": minutes,
        "snooze_count": task.snooze_count,
    }


def apply_ai_intent(db: Session, reply: dict, pending: list) -> tuple:
    """Gemini suggested a command. We only accept it if the task really exists.
    Returns (event, problem_lines)."""
    intent = reply.get("intent", "chat")
    if intent not in ("complete_task", "snooze_task"):
        return None, None

    task = next((t for t in pending if t.id == reply.get("task_id")), None)
    if task is None:
        return None, [
            "I could not tell which task you mean, so I changed nothing.",
            "Tell me the task name and try again.",
        ]

    minutes = reply.get("minutes") or DEFAULT_SNOOZE_MINUTES
    return apply_command(db, intent, task, minutes), None


def reaction_situation(event: dict) -> str:
    """What we tell Gemini so Fredo can react to what just happened."""
    title = event["title"] if config.AI_SHARE_TASKS else "that task"

    if event["type"] == "task_done":
        return (
            f'The user just finished the task "{title}" and it is now marked as done. '
            "React in character: celebrate briefly and, if other tasks are pending, "
            "nudge them towards the next one. Do not ask questions."
        )

    count = event["snooze_count"]
    extra = " This is not the first time, so tease the pattern lightly." if count >= 3 else ""
    return (
        f'The user snoozed the task "{title}" for {event["minutes"]} minutes. '
        f"It has now been snoozed {count} time(s).{extra} "
        "React in character: acknowledge it and hold them to the time they chose. "
        "Do not promise to remind them later. Do not ask questions."
    )


def fallback_lines(event: dict) -> list:
    """Plain lines used when Gemini is not available."""
    title = event["title"]
    if event["type"] == "task_done":
        return [f"Nice! {title} is done.", "One less thing waiting for you."]

    lines = [f"Okay, {title} is snoozed for {event['minutes']} minutes."]
    if event["snooze_count"] >= 3:
        lines.append(f"That is snooze number {event['snooze_count']}, by the way.")
    return lines