// desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fredo', {
  resizeWindow: (width, height) => ipcRenderer.send('fredo:resize', width, height),
});