// desktop/src/behavior.ts
export const MOODS = [
  "happy",
  "sleepy",
  "angry",
  "sarcastic",
  "surprised",
  "thinking",
  "proud",
  "sad",
] as const;
export type Mood = (typeof MOODS)[number];

export const ACTIONS = ["idle", "wave", "jump", "dance", "yawn", "stretch", "look"] as const;
export type Action = (typeof ACTIONS)[number];

// how long each action plays (milliseconds)
export const ACTION_MS: Record<Action, number> = {
  idle: 0,
  wave: 1900,
  jump: 900,
  dance: 3200,
  yawn: 1900,
  stretch: 1700,
  look: 2500,
};

// small things Fredo does by himself when nothing is happening
export const IDLE_ACTIONS: Action[] = ["look", "yawn", "wave", "stretch"];

// things he does when you Shift+click his face (test shortcut)
export const POKE_ACTIONS: Action[] = ["wave", "jump", "dance", "yawn", "stretch", "look"];

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}