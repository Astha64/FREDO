# backend/check_gemini.py   (run: python check_gemini.py)
from google import genai

from app import config

if not config.GEMINI_API_KEY:
    raise SystemExit("GEMINI_API_KEY is empty. Fill backend/.env first.")

client = genai.Client(api_key=config.GEMINI_API_KEY)

print("Models you can use (copy one name into GEMINI_MODEL in .env):")
skip = ("embedding", "image", "tts", "live", "audio", "robotics", "computer")
for model in client.models.list():
    name = model.name.replace("models/", "")
    if "gemini" in name and not any(word in name for word in skip):
        print("  ", name)

print()
print("Trying", config.GEMINI_MODEL, "...")
response = client.models.generate_content(
    model=config.GEMINI_MODEL,
    contents="Say hi in five words.",
)
print(response.text)