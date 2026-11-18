// desktop/src/electron.d.ts
export type WalkMode = "wander" | "stay";

export type WalkState = {
  walking: boolean;
  facing: "left" | "right";
  mode: WalkMode;
};

declare global {
  interface Window {
    fredo?: {
      resizeWindow: (width: number, height: number) => void;
      setMode: (mode: WalkMode) => void;
      setBusy: (busy: boolean) => void;
      onWalkState: (callback: (state: WalkState) => void) => () => void;
    };
  }
}