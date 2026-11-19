// desktop/src/App.tsx
import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import Character from "./Character";
import TaskPanel from "./TaskPanel";
import { API_URL } from "./api";
import { ACTION_MS, IDLE_ACTIONS, MOODS, POKE_ACTIONS, pick } from "./behavior";
import type { Action, Mood } from "./behavior";

const WIDTH = 340;
const BASE_HEIGHT = 400;
const CHAT_EXTRA = 50;
const PANEL_EXTRA = 300;
const BUBBLE_SECONDS = 15;
const SLEEP_AFTER_SECONDS = 300; // falls asleep after 5 quiet minutes (use 20 to test)

type Open = "none" | "chat" | "tasks";

function App() {
  const [sleeping, setSleeping] = useState(false);
  const [mood, setMood] = useState<Mood>("happy");
  const [action, setAction] = useState<Action>("idle");
  const [talking, setTalking] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [walkMode, setWalkMode] = useState<"wander" | "stay">("stay");
  const [open, setOpen] = useState<Open>("none");
  const [text, setText] = useState("");
  const [reply, setReply] = useState("");
  const [isError, setIsError] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const bubbleTimer = useRef<number | undefined>(undefined);
  const talkTimer = useRef<number | undefined>(undefined);
  const actionTimer = useRef<number | undefined>(undefined);
  const moodTimer = useRef<number | undefined>(undefined);
  const speechRun = useRef(0);
  const lastActivity = useRef(Date.now());

  // the idle timer reads the newest values from here
  const latest = useRef({ sleeping, open, action, talking });
  useEffect(() => {
    latest.current = { sleeping, open, action, talking };
  });

  // Anything the user does counts as activity (so Fredo does not fall asleep)
  function touch() {
    lastActivity.current = Date.now();
  }

  function playAction(next: Action) {
    setAction(next);
    window.clearTimeout(actionTimer.current);
    actionTimer.current = window.setTimeout(() => setAction("idle"), ACTION_MS[next]);
  }

  // a mood that goes back to happy after a while
  function setMoodFor(next: Mood, ms: number) {
    setMood(next);
    window.clearTimeout(moodTimer.current);
    moodTimer.current = window.setTimeout(() => setMood("happy"), ms);
  }

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

    // the mouth moves while he speaks
    setTalking(true);
    window.clearTimeout(talkTimer.current);
    talkTimer.current = window.setTimeout(
      () => setTalking(false),
      Math.min(6000, Math.max(1200, message.length * 60))
    );
  }

  // Fredo says one thing (this also stops a greeting that is still going)
  function say(message: string, error: boolean) {
    speechRun.current += 1;
    touch();
    setSleeping(false);
    if (error) setMoodFor("sad", 4000);
    show(message, error);
  }

  // Fredo says several lines, one after another, like a person talking
  async function sayLines(lines: string[]) {
    speechRun.current += 1;
    const run = speechRun.current;
    setSleeping(false);

    for (let i = 0; i < lines.length; i++) {
      if (speechRun.current !== run) return; // something newer started
      show(lines[i], false);

      if (i < lines.length - 1) {
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
          playAction("wave");
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

  // Idle life: every 10 to 20 seconds he does something small, or falls asleep
  useEffect(() => {
    let timer: number;

    function schedule() {
      timer = window.setTimeout(() => {
        const s = latest.current;
        const quietFor = Date.now() - lastActivity.current;

        if (!s.sleeping && s.open === "none" && s.action === "idle" && !s.talking) {
          if (quietFor > SLEEP_AFTER_SECONDS * 1000) {
            setMood("happy");
            setSleeping(true);
          } else {
            playAction(pick(IDLE_ACTIONS));
          }
        }
        schedule();
      }, 10000 + Math.random() * 10000);
    }

    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  // Make the window the right size for what is open
  useEffect(() => {
    let height = BASE_HEIGHT;
    if (open === "chat") height += CHAT_EXTRA;
    if (open === "tasks") height += PANEL_EXTRA;
    window.fredo?.resizeWindow(WIDTH, height);
  }, [open]);

  function toggle(target: "chat" | "tasks") {
    touch();
    setSleeping(false);
    setOpen(open === target ? "none" : target);
  }

  function toggleWalk() {
    touch();
    const next = walkMode === "wander" ? "stay" : "wander";
    setWalkMode(next);
    window.fredo?.setMode(next);

    if (next === "wander") {
      setSleeping(false);
      setOpen("none");
      say("Time to stretch my legs!", false);
    } else {
      say("Okay, I will stay right here.", false);
    }
  }

  // Electron tells us when Fredo walks and which way he faces
  useEffect(() => {
    const stopListening = window.fredo?.onWalkState((state) => {
      setWalking(state.walking);
      setFacing(state.facing);
      setWalkMode(state.mode);
    });
    return () => stopListening?.();
  }, []);

  // He does not walk away while a panel is open or while he sleeps
  useEffect(() => {
    window.fredo?.setBusy(open !== "none" || sleeping);
  }, [open, sleeping]);

  // A task was finished: party time
  function celebrate() {
    touch();
    setSleeping(false);
    setMoodFor("proud", 3500);
    playAction("dance");
    setConfetti(true);
    window.setTimeout(() => setConfetti(false), 3200);
  }

  function handleFaceClick(shift: boolean) {
    touch();

    // clicking Fredo while he walks makes him stop
    if (walkMode === "wander") {
      setWalkMode("stay");
      window.fredo?.setMode("stay");
      say("Okay, okay, I am staying here.", false);
      return;
    }

    if (shift) {
      // test shortcut: Shift+click plays a random action
      setSleeping(false);
      playAction(pick(POKE_ACTIONS));
      return;
    }
    setMood("happy");
    setSleeping(!sleeping);
  }

  function handleFaceContextMenu() {
    // test shortcut: right-click cycles through the moods
    touch();
    setSleeping(false);
    window.clearTimeout(moodTimer.current);
    const next = MOODS[(MOODS.indexOf(mood) + 1) % MOODS.length];
    setMood(next);
    say("Mood: " + next, false);
  }

  async function sendMessage() {
    const message = text.trim();

    if (message === "") {
      say("Please type a message first.", true);
      return;
    }

    setIsSending(true);
    say("Let me think...", false);
    try {
      const response = await fetch(API_URL + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });

      if (!response.ok) {
        throw new Error("Backend answered with status " + response.status);
      }

      const data = await response.json();
      setText("");
      sayLines(data.lines);
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
        walking={walking}
        facing={facing}
        sleeping={sleeping}
        mood={mood}
        action={action}
        talking={talking}
        confetti={confetti}
        onFaceClick={handleFaceClick}
        onFaceContextMenu={handleFaceContextMenu}
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

      {open === "tasks" && <TaskPanel onMessage={say} onCelebrate={celebrate} />}

      <div className="button-row">
        <button className="panel-toggle" onClick={() => toggle("chat")}>
          {open === "chat" ? "Close talk" : "Talk"}
        </button>
        <button className="panel-toggle" onClick={() => toggle("tasks")}>
          {open === "tasks" ? "Close tasks" : "Tasks"}
        </button>
        <button className="panel-toggle" onClick={toggleWalk}>
          {walkMode === "wander" ? "Stay here" : "Walk"}
        </button>
      </div>
    </main>
  );
}

export default App;