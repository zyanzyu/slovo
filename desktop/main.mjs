import { app, BrowserWindow, Menu, screen, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createSlovoServer } from '../server/http-server.mjs';

// Electron/Chromium requires /dev/shm; minimal containers and some Android-hosted
// Linux environments do not provide it. Fall back to /tmp instead of crashing.
if (process.platform === 'linux' && !fs.existsSync('/dev/shm')) {
  app.commandLine.appendSwitch('disable-dev-shm-usage');
}

app.setName('СЛОВО');
// Keep Chromium profile, localStorage and window state in an app-specific
// directory instead of Electron's shared default config root.
const userDataDir = path.join(app.getPath('appData'), 'slovo');
fs.mkdirSync(userDataDir, { recursive: true });
app.setPath('userData', userDataDir);
if (process.platform === 'win32') app.setAppUserModelId('com.slovo.app');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;
  let server = null;
  let serverPort = 0;

  const statePath = () => path.join(app.getPath('userData'), 'window-state.json');

  function loadWindowState() {
    const area = screen.getPrimaryDisplay().workArea;
    let state = { width: 820, height: 900, x: undefined, y: undefined, zoom: 1 };
    try {
      const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
      if (Number.isFinite(raw.width) && Number.isFinite(raw.height)) {
        state = {
          width: Math.min(Math.max(raw.width, 390), area.width),
          height: Math.min(Math.max(raw.height, 600), area.height),
          x: Number.isFinite(raw.x) ? raw.x : undefined,
          y: Number.isFinite(raw.y) ? raw.y : undefined,
          zoom: Number.isFinite(raw.zoom) ? Math.min(2, Math.max(0.75, raw.zoom)) : 1,
        };
      }
    } catch {
      // First run or unreadable state.
    }
    if (state.x !== undefined && state.y !== undefined) {
      const visible = state.x < area.x + area.width - 80
        && state.x + state.width > area.x + 80
        && state.y < area.y + area.height - 80
        && state.y + state.height > area.y + 80;
      if (!visible) {
        state.x = undefined;
        state.y = undefined;
      }
    }
    return state;
  }

  function saveWindowState() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const bounds = mainWindow.getBounds();
      fs.writeFileSync(
        statePath(),
        JSON.stringify({
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          zoom: mainWindow.webContents.getZoomFactor(),
        }),
      );
    } catch {
      // Window state is a convenience, never a startup blocker.
    }
  }

  function localOrigin() {
    return `http://127.0.0.1:${serverPort}`;
  }

  function createWindow() {
    const state = loadWindowState();
    mainWindow = new BrowserWindow({
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y,
      minWidth: 390,
      minHeight: 600,
      show: false,
      backgroundColor: '#f4f0e8',
      title: 'СЛОВО — 俄语单词提背',
      icon: path.join(app.getAppPath(), 'dist', 'icons', 'icon-512.png'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('close', saveWindowState);
    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    Menu.setApplicationMenu(null);

    mainWindow.webContents.setZoomFactor(state.zoom);

    // Browser zoom is a desktop-only convenience. Keep it independent from the
    // in-app font scale, and persist it with the window bounds.
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const modifier = process.platform === 'darwin' ? input.meta : input.control;
      if (!modifier || input.alt) return;
      const current = mainWindow?.webContents.getZoomFactor() ?? 1;
      let next = null;
      if (input.key === '=' || input.key === '+') next = Math.min(2, current + 0.1);
      else if (input.key === '-') next = Math.max(0.75, current - 0.1);
      else if (input.key === '0') next = 1;
      if (next === null) return;
      event.preventDefault();
      mainWindow?.webContents.setZoomFactor(Number(next.toFixed(2)));
      saveWindowState();
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith(localOrigin())) void shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(localOrigin())) return;
      event.preventDefault();
      void shell.openExternal(url);
    });

    mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
      console.error('SLOVO_LOAD_FAILED', code, description);
    });

    if (process.env.SLOVO_SMOKE) {
      mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          try {
            const image = await mainWindow.webContents.capturePage();
            fs.writeFileSync(process.env.SLOVO_SMOKE, image.toPNG());
            console.log('SLOVO_SMOKE_TITLE', mainWindow.webContents.getTitle());
            console.log('SLOVO_SMOKE_URL', mainWindow.webContents.getURL());
          } catch (error) {
            console.error('SLOVO_SMOKE_FAILED', error);
          } finally {
            app.quit();
          }
        }, 1400);
      });
    }

    void mainWindow.loadURL(`${localOrigin()}/`);
  }

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    const distDir = path.join(app.getAppPath(), 'dist');
    server = createSlovoServer({ distDir });
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      console.log('SLOVO_USER_DATA', app.getPath('userData'));
      console.log(`SLOVO_DESKTOP http://127.0.0.1:${serverPort}`);
      createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (!mainWindow && serverPort) createWindow();
  });

  app.on('before-quit', () => {
    saveWindowState();
    if (server) {
      server.close();
      server = null;
    }
  });
}
