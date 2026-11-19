# backend/app/ai.py
import json
import re
from typing import Optional

from google import genai
from google.genai import types

from app import config
from app.persona import ALLOWED_ACTIONS, ALLOWED_MOODS, SYSTEM_PROMPT

_client = None


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
    return {
        "lines": clean,
        "mood": mood if mood in ALLOWED_MOODS else "happy",
        "action": action if action in ALLOWED_ACTIONS else "none",
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