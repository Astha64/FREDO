from typing import Optional

from google.genai import types

from app import config
from app.ai import _clean_error, _get_client, ai_is_configured

ALLOWED_AUDIO = {"audio/wav", "audio/x-wav", "audio/mpeg", "audio/ogg", "audio/flac"}
MAX_AUDIO_BYTES = 5 * 1024 * 1024  # 5 MB is plenty for 20 seconds of 16 kHz audio

TRANSCRIBE_PROMPT = (
    "Transcribe this audio exactly as spoken. "
    "Return only the spoken words: no quotes, no labels, no commentary. "
    "If there is no clear speech, return an empty string."
)


def transcribe_audio(data: bytes, mime_type: str) -> tuple[Optional[str], Optional[str]]:
    """Returns (text, error). text is None when something went wrong."""
    if not ai_is_configured():
        return None, "GEMINI_API_KEY is empty. Fill backend/.env first."

    print(f"[voice] got {len(data)} bytes of {mime_type}, model {config.GEMINI_STT_MODEL}")

    try:
        response = _get_client().models.generate_content(
            model=config.GEMINI_STT_MODEL,
            contents=[
                TRANSCRIBE_PROMPT,
                types.Part.from_bytes(data=data, mime_type=mime_type),
            ],
            config=types.GenerateContentConfig(
                temperature=0,
                max_output_tokens=2048,
                http_options=types.HttpOptions(timeout=int(config.STT_TIMEOUT_SECONDS * 1000)),
            ),
        )
        text = (response.text or "").strip()
    except Exception as error:
        message = _clean_error(error)
        print("[voice] transcription failed:", message)
        return None, message

    print("[voice] heard:", repr(text))
    return text[:1000], None  # /chat accepts at most 1000 characters


