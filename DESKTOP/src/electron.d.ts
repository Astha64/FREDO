// desktop/src/electron.d.ts
export {};

declare global {
  interface Window {
    fredo?: {
      resizeWindow: (width: number, height: number) => void;
    };
  }
}