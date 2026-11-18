// desktop/electron/main.cjs
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEV_URL = 'http://127.0.0.1:5173';
const BACKEND_URL = 'http://127.0.0.1:8000';

// A tiny 32x32 round face for the tray (the icons near the Windows clock)
const TRAY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA70lEQVR42u2XLRLCMBCFk9U9DgfA41FILDdAcgMssqq+ngP0OHhQmUkZkvc25E80rs32fW+3mcyuMY2X1X7wGi/v2P5wutsiBhA41YjNDdYakZJwRkNKwhktKQ1HmlIDHtOWWvAQQ1pfRKLJ/vp4UqIozmfRFXCiSJyNWxlA2X+LhcTZOJ/ZzxnYDHRt4HbeR5+1cUkVcGJIlI1b9QM1ruBQryApbVQueF+HEFVhnhYzTwsliuJ8Fl2Bw3FHibMmfxpAVUAm3HsXxzSpNqUli2WpgQd/AVuJf+FwLsh1P8QSkpxjVopG/6NZ6eG0+foALgqGS8gZ0SQAAAAASUVORK5CYII=';

let win = null;
let tray = null;
let backendProcess = null;

/* ---------- remember where Fredo was ---------- */

function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadPosition() {
  try {
    const { x, y } = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const onScreen = screen.getAllDisplays().some(
      (d) =>
        x >= d.bounds.x &&
        y >= d.bounds.y &&
        x < d.bounds.x + d.bounds.width - 60 &&
        y < d.bounds.y + d.bounds.height - 60
    );
    return onScreen ? { x, y } : {};
  } catch {
    return {};
  }
}

function savePosition() {
  if (!win) return;
  try {
    const [x, y] = win.getPosition();
    fs.writeFileSync(stateFile(), JSON.stringify({ x, y }));
  } catch {
    // not important
  }
}

/* ---------- start and stop the backend ---------- */

async function backendIsRunning() {
  try {
    const response = await fetch(BACKEND_URL + '/health');
    return response.ok;
  } catch {
    return false;
  }
}

async function startBackend() {
  if (await backendIsRunning()) {
    console.log('[fredo] backend is already running, not starting another one');
    return;
  }

  const backendDir = path.join(__dirname, '..', '..', 'backend');
  const python = path.join(backendDir, '.venv', 'Scripts', 'python.exe');

  if (!fs.existsSync(python)) {
    console.log('[fredo] cannot find ' + python);
    return;
  }

  backendProcess = spawn(
    python,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
    { cwd: backendDir, windowsHide: true }
  );

  backendProcess.stdout.on('data', (data) => console.log('[backend] ' + data.toString().trim()));
  backendProcess.stderr.on('data', (data) => console.log('[backend] ' + data.toString().trim()));
  backendProcess.on('exit', (code) => {
    console.log('[backend] stopped, code ' + code);
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

/* ---------- window and tray ---------- */

function createWindow() {
  win = new BrowserWindow({
    ...loadPosition(),
    width: 340,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(DEV_URL);
  win.on('moved', savePosition);
  win.on('closed', () => {
    win = null;
  });
}

function showWindow() {
  if (!win) {
    createWindow();
  } else {
    win.show();
  }
}

function createTray() {
  tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON));
  tray.setToolTip('Fredo');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Fredo', click: () => showWindow() },
      { label: 'Hide Fredo', click: () => win && win.hide() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  tray.on('click', () => showWindow());
}

/* ---------- the page asks to resize the window ---------- */

ipcMain.on('fredo:resize', (event, width, height) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target || !Number.isFinite(width) || !Number.isFinite(height)) return;

  const bounds = target.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const newWidth = Math.min(Math.round(width), area.width);
  const newHeight = Math.min(Math.round(height), area.height);

  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - newWidth));
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - newHeight));

  target.setBounds({ x, y, width: newWidth, height: newHeight });
});

/* ---------- app life ---------- */

if (!app.requestSingleInstanceLock()) {
  // Fredo is already open: do not open a second one
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(async () => {
    await startBackend();
    createWindow();
    createTray();
  });
}

app.on('before-quit', stopBackend);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});