# backend/main.py
from fastapi import FastAPI

app = FastAPI(title="Fredo API")

@app.get("/health")
def health_check():
    return {"status": "ok", "application": "Fredo"}

@app.post("/message")
def receive_message(payload: dict):
    message = payload.get("message", "")
    return {
        "received": True,
        "message": message,
        "reply": "I received your message."
    }