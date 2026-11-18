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

// walking
const STEP_MS = 33; // about 30 steps per second
const WALK_SPEED = 90; // pixels per second

let win = null;
let tray = null;
let backendProcess = null;

let mode = 'stay'; // 'stay' or 'wander'
let busy = false; // true while a panel is open or Fredo sleeps
let walking = false;
let facing = 'right';
let destination = null; // where Fredo is walking to
let pauseUntil = 0; // wait until this time before the next walk
let lastSet = null; // the last position we gave the window
let walkTimer = null;
let home = null; // the spot Fredo was told to stay at (used by Phase 15)

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
    if (mode === 'stay') home = { x, y };
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

/* ---------- walking ---------- */

function sendWalkState() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('fredo:walk-state', { walking, facing, mode });
  }
}

function setWalkState(nextWalking, nextFacing) {
  const newFacing = nextFacing || facing;
  if (walking === nextWalking && facing === newFacing) return;
  walking = nextWalking;
  facing = newFacing;
  sendWalkState();
}

function setMode(next) {
  mode = next === 'wander' ? 'wander' : 'stay';
  if (mode === 'wander') {
    pauseUntil = 0;
  } else {
    destination = null;
    walking = false;
    savePosition(); // this is now his home spot
  }
  buildTrayMenu();
  sendWalkState();
}

function pickDestination() {
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const maxX = Math.max(area.x, area.x + area.width - bounds.width);
  const maxY = Math.max(area.y, area.y + area.height - bounds.height);
  return {
    x: Math.round(area.x + Math.random() * (maxX - area.x)),
    y: Math.round(area.y + Math.random() * (maxY - area.y)),
  };
}

function tick() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;

  const now = Date.now();
  const [x, y] = win.getPosition();

  // Did the user drag Fredo? Then stop and wait a little.
  if (lastSet && (Math.abs(x - lastSet.x) > 3 || Math.abs(y - lastSet.y) > 3)) {
    lastSet = { x, y };
    destination = null;
    pauseUntil = now + 4000;
    setWalkState(false);
    return;
  }

  if (mode !== 'wander' || busy || now < pauseUntil) {
    lastSet = { x, y };
    setWalkState(false);
    return;
  }

  if (!destination) destination = pickDestination();

  const dx = destination.x - x;
  const dy = destination.y - y;
  const distance = Math.hypot(dx, dy);
  const step = (WALK_SPEED * STEP_MS) / 1000;

  // arrived: rest for a few seconds, then pick another place
  if (distance <= step) {
    win.setPosition(destination.x, destination.y);
    lastSet = { x: destination.x, y: destination.y };
    destination = null;
    pauseUntil = now + 3000 + Math.random() * 5000;
    setWalkState(false);
    savePosition();
    return;
  }

  const nextX = Math.round(x + (dx / distance) * step);
  const nextY = Math.round(y + (dy / distance) * step);
  win.setPosition(nextX, nextY);
  lastSet = { x: nextX, y: nextY };

  const newFacing = Math.abs(dx) > 4 ? (dx < 0 ? 'left' : 'right') : facing;
  setWalkState(true, newFacing);
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

  lastSet = null;
  win.loadURL(DEV_URL);
  win.webContents.on('did-finish-load', sendWalkState);
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

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Fredo', click: () => showWindow() },
      { label: 'Hide Fredo', click: () => win && win.hide() },
      { type: 'separator' },
      { label: 'Walk around', type: 'radio', checked: mode === 'wander', click: () => setMode('wander') },
      { label: 'Stay here', type: 'radio', checked: mode === 'stay', click: () => setMode('stay') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
}

function createTray() {
  tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON));
  tray.setToolTip('Fredo');
  tray.on('click', () => showWindow());
  buildTrayMenu();
}

/* ---------- messages from the page ---------- */

ipcMain.on('fredo:resize', (event, width, height) => {
  const sender = BrowserWindow.fromWebContents(event.sender);
  if (!sender || !Number.isFinite(width) || !Number.isFinite(height)) return;

  const bounds = sender.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const newWidth = Math.min(Math.round(width), area.width);
  const newHeight = Math.min(Math.round(height), area.height);

  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - newWidth));
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - newHeight));

  sender.setBounds({ x, y, width: newWidth, height: newHeight });
  lastSet = { x, y };
});

ipcMain.on('fredo:set-mode', (_event, next) => {
  if (next === 'wander' || next === 'stay') setMode(next);
});

ipcMain.on('fredo:set-busy', (_event, value) => {
  busy = Boolean(value);
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
    walkTimer = setInterval(tick, STEP_MS);
  });
}

app.on('before-quit', () => {
  clearInterval(walkTimer);
  stopBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});