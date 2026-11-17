import { useState } from "react";
import type { SyntheticEvent } from "react";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [sleeping, setSleeping] = useState(false);

  const [text, setText] = useState("");
  const [reply, setReply] = useState("Hi! Type a message and press Send.");
  const [isError, setIsError] = useState(false);
  const [isSending, setIsSending] = useState(false);

  async function sendMessage() {
    const message = text.trim();

    if (message === "") {
      setReply("Please type a message first.");
      setIsError(true);
      return;
    }

    setIsSending(true);
    try {
      // PHASE 4: now calls /messages and sends the key "text"
      const response = await fetch(API_URL + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });

      if (!response.ok) {
        throw new Error("Backend answered with status " + response.status);
      }

      const data = await response.json();
      setReply(data.reply);
      setIsError(false);
      setText("");
    } catch {
      setReply("I can't reach my backend right now. Please start it and try again.");
      setIsError(true);
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <main className="fredo-window">
      <div className={isError ? "bubble bubble-error" : "bubble"}>{reply}</div>

      <div className={`fredo-character ${sleeping ? "sleeping" : ""}`}>

        <div className="aura" />

        {/* Wings */}
        <div className="wing wing-left" />
        <div className="wing wing-right" />

        {/* Body */}
        <div className="body">
          {/* Arms */}
          <div className="arm arm-left">
            <div className="hand" />
          </div>

          <div className="arm arm-right">
            <div className="hand" />
          </div>

          {/* Legs */}
          <div className="leg leg-left">
            <div className="foot" />
          </div>

          <div className="leg leg-right">
            <div className="foot" />
          </div>

          <div className="chest-star">★</div>
        </div>

        {/* Head */}
        <div className="head">
          <div className="hair">
            <div className="hair-curl" />
          </div>

          <div className="ear ear-left" />
          <div className="ear ear-right" />

          <div
            className="face"
            onClick={() => setSleeping(!sleeping)}
            title="Click Fredo to sleep or wake up"
          >
            <div className="forehead-star">★</div>

            <div className="eyes">
              <div className="eye"><span /></div>
              <div className="eye"><span /></div>
            </div>

            <div className="cheek cheek-left" />
            <div className="cheek cheek-right" />

            <div className="mouth" />

            {sleeping && (
              <div className="sleep-eyes">z Z</div>
            )}
          </div>
        </div>

        {/* Scarf */}
        <div className="scarf" />

        {/* Magical sparkles */}
        <span className="sparkle sparkle-one">✦</span>
        <span className="sparkle sparkle-two">✧</span>
        <span className="sparkle sparkle-three">✦</span>

        <div className="shadow" />
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Say something to Fredo..."
        />
        <button type="submit" disabled={isSending}>
          {isSending ? "..." : "Send"}
        </button>
      </form>
    </main>
  );
}

export default App;