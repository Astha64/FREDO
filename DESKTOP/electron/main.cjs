// desktop/electron/main.cjs
const { app, BrowserWindow } = require('electron');

const DEV_URL = 'http://127.0.0.1:5173';

function createWindow() {
  const win = new BrowserWindow({
    width: 340,
    height: 440,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(DEV_URL);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});