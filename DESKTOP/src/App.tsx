// desktop/src/App.tsx
import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import Character from "./Character";
import TaskPanel from "./TaskPanel";
import { API_URL } from "./api";

const WIDTH = 340;
const BASE_HEIGHT = 400;
const CHAT_EXTRA = 50;
const PANEL_EXTRA = 300;
const BUBBLE_SECONDS = 15;

type Open = "none" | "chat" | "tasks";

function App() {
  const [sleeping, setSleeping] = useState(false);
  const [angry, setAngry] = useState(false);
  const [open, setOpen] = useState<Open>("none");
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [isError, setIsError] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const bubbleTimer = useRef<number | undefined>(undefined);

    const speechRun = useRef(0);

  // Put one message in the bubble. It hides itself later.
  function show(message: string, error: boolean) {
    setReply(message);
    setIsError(error);
    setBubbleVisible(true);
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(
      () => setBubbleVisible(false),
      BUBBLE_SECONDS * 1000
    );
  }

  // Fredo says one thing (this also stops a greeting that is still going)
  function say(message: string, error: boolean) {
    speechRun.current += 1;
    show(message, error);
  }

  // Fredo says several lines, one after another, like a person talking
  async function sayLines(lines: string[]) {
    speechRun.current += 1;
    const run = speechRun.current;

    for (let i = 0; i < lines.length; i++) {
      if (speechRun.current !== run) return; // something newer started
      show(lines[i], false);

      if (i < lines.length - 1) {
        // the pause after each line. Change 2500 to make him wait longer.
        const readTime = Math.max(2500, 1500 + lines[i].length * 55);
        await new Promise((resolve) => setTimeout(resolve, readTime));
      }
    }
  }

  // Greet by himself when the app opens
  useEffect(() => {
    async function greet() {
      // the backend may still be starting, so try a few times
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const response = await fetch(API_URL + "/greeting");
          if (!response.ok) throw new Error("bad status");
          const data = await response.json();
          sayLines(data.lines);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      say("I could not reach my backend. Please start it.", true);
    }
    greet();
  }, []);

  // Make the window the right size for what is open
  useEffect(() => {
    let height = BASE_HEIGHT;
    if (open === "chat") height += CHAT_EXTRA;
    if (open === "tasks") height += PANEL_EXTRA;
    window.fredo?.resizeWindow(WIDTH, height);
  }, [open]);

  function toggle(target: "chat" | "tasks") {
    setOpen(open === target ? "none" : target);
  }

  async function sendMessage() {
    const message = text.trim();

    if (message === "") {
      say("Please type a message first.", true);
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(API_URL + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });

      if (!response.ok) {
        throw new Error("Backend answered with status " + response.status);
      }

      const data = await response.json();
      say(data.reply, false);
      setText("");
    } catch {
      say("I can't reach my backend right now. Please start it and try again.", true);
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
      <div
        key={reply}
        className={isError ? "bubble bubble-error" : "bubble"}
        style={{ visibility: bubbleVisible ? "visible" : "hidden" }}
      >
        {reply}
      </div>

      <Character
        sleeping={sleeping}
        angry={angry}
        onFaceClick={() => {
          setAngry(false);
          setSleeping(!sleeping);
        }}
        onFaceContextMenu={() => {
          // test-only: right-click the face to see the angry look
          setSleeping(false);
          setAngry(!angry);
        }}
      />

      {open === "chat" && (
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
      )}

      {open === "tasks" && <TaskPanel onMessage={say} />}

      <div className="button-row">
        <button className="panel-toggle" onClick={() => toggle("chat")}>
          {open === "chat" ? "Close talk" : "Talk"}
        </button>
        <button className="panel-toggle" onClick={() => toggle("tasks")}>
          {open === "tasks" ? "Close tasks" : "Tasks"}
        </button>
      </div>
    </main>
  );
}

export default App;