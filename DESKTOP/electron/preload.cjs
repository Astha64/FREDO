// desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fredo', {
  resizeWindow: (width, height) => ipcRenderer.send('fredo:resize', width, height),
  setMode: (mode) => ipcRenderer.send('fredo:set-mode', mode),
  setBusy: (busy) => ipcRenderer.send('fredo:set-busy', busy),
  onWalkState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('fredo:walk-state', listener);
    return () => ipcRenderer.removeListener('fredo:walk-state', listener);
  },
});