# backend/app/ai.py
import json
import re
from datetime import date
from typing import Optional

from google import genai
from google.genai import types

from app import config
from app.persona import (
    ALLOWED_ACTIONS,
    ALLOWED_MOODS,
    SYSTEM_PROMPT,
    TASK_EXTRACTION_PROMPT,
)
_client = None

ALLOWED_INTENTS = ["chat", "complete_task", "snooze_task"]


def ai_is_configured() -> bool:
    return bool(config.GEMINI_API_KEY)


def _get_client():
    global _client
    if _client is None:
        _client = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=int(config.AI_TIMEOUT_SECONDS * 1000)),
        )
    return _client


def _clean_error(error: Exception) -> str:
    message = f"{type(error).__name__}: {error}"
    if config.GEMINI_API_KEY:
        message = message.replace(config.GEMINI_API_KEY, "***")
    return message[:300]


def _to_int(value) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def parse_reply(raw: Optional[str]) -> Optional[dict]:
    """Checks Gemini's answer. Returns a clean dict, or None if it is not usable."""
    if not raw:
        return None

    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None

    lines = data.get("lines")
    if isinstance(lines, str):
        lines = [lines]
    if not isinstance(lines, list):
        return None

    clean = [str(line).strip()[:300] for line in lines if str(line).strip()][:4]
    if not clean:
        return None

    mood = data.get("mood")
    action = data.get("action")
    intent = data.get("intent")
    return {
        "lines": clean,
        "mood": mood if mood in ALLOWED_MOODS else "happy",
        "action": action if action in ALLOWED_ACTIONS else "none",
        "intent": intent if intent in ALLOWED_INTENTS else "chat",
        "task_id": _to_int(data.get("task_id")),
        "minutes": _to_int(data.get("minutes")),
    }


def ask_fredo(situation: str, context: str) -> tuple[Optional[dict], Optional[str]]:
    """Asks Gemini. Returns (reply, error). reply is None when anything goes wrong."""
    if not ai_is_configured():
        return None, "GEMINI_API_KEY is empty. Fill backend/.env first."

    prompt = f"CONTEXT ABOUT THE USER:\n{context}\n\nSITUATION:\n{situation}"

    try:
        response = _get_client().models.generate_content(
            model=config.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.9,
                max_output_tokens=2048,
            ),
        )
        raw = response.text
    except Exception as error:
        message = _clean_error(error)
        print("[ai] Gemini call failed:", message)
        return None, message

    reply = parse_reply(raw)
    if reply is None:
        print("[ai] Gemini answered, but not in a usable shape")
        return None, "Gemini answered, but the answer was not usable JSON."
    return reply, None


def parse_task_draft(raw: Optional[str]) -> Optional[dict]:
    """Validate Gemini's extracted task draft. This function never saves it."""
    if not raw:
        return None

    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    if not isinstance(data.get("is_task"), bool):
        return None

    if not data["is_task"]:
        return {
            "is_task": False,
            "title": "",
            "why": "",
            "consequence": "",
            "due_date": None,
            "needs_clarification": False,
            "clarification_question": None,
        }

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return None

    title = title.strip()
    if len(title) > 200:
        title = title[:200].strip()

    why = data.get("why", "")
    consequence = data.get("consequence", "")

    if not isinstance(why, str) or not isinstance(consequence, str):
        return None

    why = why.strip()[:500]
    consequence = consequence.strip()[:500]

    due_date = data.get("due_date")

    if due_date is not None:
        if not isinstance(due_date, str):
            return None

        try:
            date.fromisoformat(due_date)
        except ValueError:
            return None

    needs_clarification = data.get("needs_clarification", False)

    if not isinstance(needs_clarification, bool):
        return None

    question = data.get("clarification_question")

    if question is not None and not isinstance(question, str):
        return None

    if needs_clarification:
        due_date = None
        question = (question or "").strip()[:300]

    return {
        "is_task": True,
        "title": title,
        "why": why,
        "consequence": consequence,
        "due_date": due_date,
        "needs_clarification": needs_clarification,
        "clarification_question": question,
    }


def extract_task_draft(
    user_message: str,
    today: Optional[date] = None,
) -> tuple[Optional[dict], Optional[str]]:
    """
    Ask Gemini to extract a proposed task.
    Returns (draft, error). Does not create or save a task.
    """
    if not ai_is_configured():
        return None, "GEMINI_API_KEY is empty. Fill backend/.env first."

    current_date = today or date.today()

    prompt = f"""
CURRENT DATE: {current_date.isoformat()}

USER MESSAGE:
{user_message}

Extract the task details according to your instructions.
Return only the required JSON.
"""

    try:
        response = _get_client().models.generate_content(
            model=config.GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=TASK_EXTRACTION_PROMPT,
                response_mime_type="application/json",
                temperature=0.2,
                max_output_tokens=1000,
            ),
        )

        raw = response.text

    except Exception as error:
        message = _clean_error(error)
        print("[ai] Task extraction failed:", message)
        return None, message

    draft = parse_task_draft(raw)

    if draft is None:
        return None, "Gemini returned an invalid task draft."

    return draft, None
