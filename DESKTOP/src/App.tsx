// desktop/src/App.tsx
import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import Character from "./Character";
import TaskPanel from "./TaskPanel";
import { API_URL, createTask } from "./api";
import type { TaskDraft } from "./api";
import { ACTION_MS, IDLE_ACTIONS, MOODS, POKE_ACTIONS, pick } from "./behavior";
import type { Action, Mood } from "./behavior";
import { MAX_RECORD_MS, loadMuted, saveMuted, speak, startRecording, stopSpeaking, transcribe } from "./voice";
import type { Recorder } from "./voice";

const WIDTH = 340;
const BASE_HEIGHT = 400;
const CHAT_EXTRA = 50;
const PANEL_EXTRA = 300;
const DRAFT_EXTRA = 230;
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
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [muted, setMuted] = useState(loadMuted());
  const [voiceState, setVoiceState] = useState<"idle" | "recording" | "transcribing">("idle");
  const recorderRef = useRef<Recorder | null>(null);
  const recordTimer = useRef<number | undefined>(undefined);
  const mutedRef = useRef(muted);
  useEffect(() => {
  mutedRef.current = muted;
  });
  const draftSaveLock = useRef(false);

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
  function show(message: string, error: boolean, voiced = false) {
  setReply(message);
  setIsError(error);
  setBubbleVisible(true);
  window.clearTimeout(bubbleTimer.current);
  bubbleTimer.current = window.setTimeout(() => setBubbleVisible(false), BUBBLE_SECONDS * 1000);

  setTalking(true);
  window.clearTimeout(talkTimer.current);
  if (!voiced) {
    talkTimer.current = window.setTimeout(
      () => setTalking(false),
      Math.min(6000, Math.max(1200, message.length * 60))
    );
  } // when voiced, the speech itself decides when the mouth stops
}

  // Fredo says one thing (this also stops a greeting that is still going)
  // Fredo says one thing. Pass voice=false for filler like "Let me think..."
function say(message: string, error: boolean, voice = true) {
  speechRun.current += 1;
  const run = speechRun.current;
  touch();
  setSleeping(false);
  if (error) setMoodFor("sad", 4000);
  stopSpeaking();

  if (voice && !mutedRef.current) {
    show(message, error, true);
    speak(message).then(() => {
      if (speechRun.current === run) setTalking(false);
    });
  } else {
    show(message, error);
  }
}

  // Fredo says several lines, one after another
async function sayLines(lines: string[], voice = true) {
  speechRun.current += 1;
  const run = speechRun.current;
  setSleeping(false);
  stopSpeaking();

  const speaking = voice && !mutedRef.current;

  for (let i = 0; i < lines.length; i++) {
    if (speechRun.current !== run) return; // something newer started

    if (speaking) {
      show(lines[i], false, true);
      await speak(lines[i]);
      if (speechRun.current !== run) return;
      setTalking(false);
      if (i < lines.length - 1) await new Promise((r) => setTimeout(r, 350));
    } else {
      show(lines[i], false);
      if (i < lines.length - 1) {
        const readTime = Math.max(2500, 1500 + lines[i].length * 55);
        await new Promise((resolve) => setTimeout(resolve, readTime));
      }
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
          sayLines(data.lines, false);
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
  if (taskDraft) height += DRAFT_EXTRA;

  window.fredo?.resizeWindow(WIDTH, height);
}, [open, taskDraft]);

  function toggle(panel: "chat" | "tasks") {
  touch();
  setSleeping(false);
  if (voiceState === "recording") {
    window.clearTimeout(recordTimer.current);
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setVoiceState("idle");
  }
  setOpen((current) => (current === panel ? "none" : panel));
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

  async function confirmTaskDraft() {
  if (!taskDraft || draftSaveLock.current) return;

  if (!taskDraft.title.trim()) {
    say("Please give the task a title first.", true);
    return;
  }

  if (taskDraft.needs_clarification && !taskDraft.due_date) {
    say(
      taskDraft.clarification_question || "Please clarify the deadline first.",
      true
    );
    return;
  }

  draftSaveLock.current = true;
  setSavingDraft(true);

  try {
    await createTask({
      title: taskDraft.title.trim(),
      why: taskDraft.why.trim(),
      consequence: taskDraft.consequence.trim(),
      due_date: taskDraft.due_date || null,
    });

    setTaskDraft(null);
    say("Your task is saved! Let's get it done.", false);
    playAction("jump");

  } catch {
    say("I couldn't save that task. Please try again.", true);

  } finally {
    draftSaveLock.current = false;
    setSavingDraft(false);
  }
}

function cancelTaskDraft() {
  setTaskDraft(null);
  say("Okay, I won't save that task.", false);
}

  async function sendMessage(spoken?: string) {
  const message = (spoken ?? text).trim();          // 🔧 change 1 + 2

  if (message === "") {
    say("Please type a message first.", true);
    return;
  }

  setIsSending(true);
  say("Let me think...", false, false);              // 🔧 change 3: don't speak this one
  try {
    const response = await fetch(API_URL + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, voice: spoken !== undefined }),  // 🔧 change 4
    });

    if (!response.ok) {
      throw new Error("Backend answered with status " + response.status);
    }

    const data = await response.json();

    setText("");
    setTaskDraft(data.task_draft ?? null);
    sayLines(data.lines);
  } catch {
    say("I can't reach my backend right now. Please start it and try again.", true);
  } finally {
    setIsSending(false);
  }
}

async function startListening() {
  touch();
  stopSpeaking();
  try {
    recorderRef.current = await startRecording();
  } catch {
    say("I can't use the microphone. Check Windows microphone permissions.", true, false);
    return;
  }
  setVoiceState("recording");
  setMood("surprised");
  playAction("look");
  show("I'm listening...", false);
  recordTimer.current = window.setTimeout(stopListening, MAX_RECORD_MS);
}

async function stopListening() {
  window.clearTimeout(recordTimer.current);
  const recorder = recorderRef.current;
  recorderRef.current = null;
  if (!recorder) return;

  setVoiceState("transcribing");
  setMood("thinking");
  show("Let me hear that again in my head...", false);

  try {
    const blob = await recorder.stop();
    const heard = await transcribe(blob);
    setMood("happy");

    if (!heard) {
      say("I didn't catch anything. Try again?", true, false);
    } else {
      setText(heard); // shows what Fredo heard in the input box
      await sendMessage(heard);
    }
  } catch {
    say("I couldn't understand that. Please try again.", true, false);
  } finally {
    setVoiceState("idle");
  }
}

function toggleMic() {
  if (voiceState === "idle") startListening();
  else if (voiceState === "recording") stopListening();
}

function toggleMuted() {
  const next = !muted;
  setMuted(next);
  saveMuted(next);
  if (next) stopSpeaking();
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
      placeholder="Talk to Fredo..."
    />
    <button
      type="button"
      className={voiceState === "recording" ? "icon-btn recording" : "icon-btn"}
      onClick={toggleMic}
      disabled={voiceState === "transcribing" || isSending}
      title={voiceState === "recording" ? "Stop and send" : "Talk to Fredo"}
    >
      {voiceState === "recording" ? "⏹" : "🎤"}
    </button>
    <button
      type="button"
      className="icon-btn"
      onClick={toggleMuted}
      title={muted ? "Turn Fredo's voice on" : "Mute Fredo's voice"}
    >
      {muted ? "🔇" : "🔊"}
    </button>
    <button type="submit" disabled={isSending}>
      {isSending ? "..." : "Send"}
    </button>
  </form>
)}

      {taskDraft && (
  <div className="task-draft-card">
    <h3>Let's check your task!</h3>

    {taskDraft.needs_clarification && (
      <p className="draft-question">
        {taskDraft.clarification_question}
      </p>
    )}

    <label>Task title</label>
    <input
      value={taskDraft.title}
      onChange={(e) =>
        setTaskDraft({ ...taskDraft, title: e.target.value })
      }
    />

    <label>Deadline</label>
    <input
      type="date"
      value={taskDraft.due_date ?? ""}
      onChange={(e) =>
        setTaskDraft({
          ...taskDraft,
          due_date: e.target.value || null,
          needs_clarification: e.target.value
            ? false
            : taskDraft.needs_clarification,
          clarification_question: e.target.value
            ? null
            : taskDraft.clarification_question,
        })
      }
    />

    {taskDraft.needs_clarification && (
      <button
        type="button"
        className="draft-secondary"
        onClick={() =>
          setTaskDraft({
            ...taskDraft,
            due_date: null,
            needs_clarification: false,
            clarification_question: null,
          })
        }
      >
        No deadline
      </button>
    )}

    <label>Why does it matter?</label>
    <input
      value={taskDraft.why}
      onChange={(e) =>
        setTaskDraft({ ...taskDraft, why: e.target.value })
      }
    />

    <label>If you skip it, what happens?</label>
    <input
      value={taskDraft.consequence}
      onChange={(e) =>
        setTaskDraft({ ...taskDraft, consequence: e.target.value })
      }
    />

    <div className="draft-buttons">
      <button
        type="button"
        onClick={confirmTaskDraft}
        disabled={
          savingDraft ||
          !taskDraft.title.trim() ||
          (taskDraft.needs_clarification && !taskDraft.due_date)
        }
      >
        {savingDraft ? "Saving..." : "Confirm"}
      </button>

      <button
        type="button"
        className="draft-cancel"
        onClick={cancelTaskDraft}
        disabled={savingDraft}
      >
        Cancel
      </button>
    </div>
  </div>
)}

      {open === "tasks" && <TaskPanel onMessage={say} onCelebrate={celebrate} />}

      <div className="button-row">
        <button type="button" className="panel-toggle" onClick={() => toggle("chat")}>
          {open === "chat" ? "Close talk" : "Talk"}
        </button>
        <button type="button" className="panel-toggle" onClick={() => toggle("tasks")}>
          {open === "tasks" ? "Close tasks" : "Tasks"}
        </button>
        <button type="button" className="panel-toggle" onClick={toggleWalk}>
          {walkMode === "wander" ? "Stay here" : "Walk"}
        </button>
      </div>
    </main>
  );
}

export default App;