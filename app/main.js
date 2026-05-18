const { app, BrowserWindow, shell, ipcMain, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let serverInstance = null;
let serverReadyResolve = null;
const serverReady = new Promise(resolve => { serverReadyResolve = resolve; });
let isQuitting = false;

const PORT = 3777;

function getAppPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'app') : __dirname;
}

function getBinPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'bin');
  return path.join(__dirname, '..', 'bin');
}

function getUserDataPath() {
  return app.getPath('userData');
}

function settingsFile() {
  return path.join(getUserDataPath(), 'settings.json');
}

function loadSettings() {
  try {
    const f = settingsFile();
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch (_) {}
  return {};
}

function saveSettings(data) {
  const f = settingsFile();
  const current = loadSettings();
  const merged = { ...current, ...data };
  fs.writeFileSync(f, JSON.stringify(merged, null, 2));
  return merged;
}

function getWindowState() {
  try {
    const s = loadSettings();
    if (s.windowState) return s.windowState;
  } catch (_) {}
  return null;
}

function saveWindowState(bounds) {
  saveSettings({ windowState: bounds });
}

const loadingHTML = `data:text/html;charset=utf-8,<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Starting...</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#e8e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px;padding:24px}
.logo{font-size:20px;font-weight:700;display:flex;align-items:center;gap:8px}
.logo i{font-size:22px;background:linear-gradient(135deg,#ef4444,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.spinner{width:36px;height:36px;border:3px solid #2a2a44;border-top-color:#ef4444;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.status{font-size:13px;color:#8888aa;text-align:center}
</style></head>
<body>
<div class="logo"><i class="fas fa-download"></i>YT-DL</div>
<div class="spinner"></div>
<div class="status" id="status">Starting server...</div>
</body></html>`;

function showLoading(msg) {
  if (!mainWindow) return;
  const html = loadingHTML.replace(
    '<div class="status" id="status">Starting server...</div>',
    `<div class="status" id="status">${msg || 'Starting server...'}</div>`
  );
  mainWindow.loadURL(html).catch(() => {});
}

function showError(msg) {
  if (!mainWindow) return;
  const html = loadingHTML
    .replace('<div class="spinner"></div>', '<div class="spinner" style="display:none"></div>')
    .replace(
      '<div class="status" id="status">Starting server...</div>',
      `<div class="status"><span style="color:#ef4444;font-weight:500">${msg}</span><br><br><button onclick="location.reload()" style="padding:8px 20px;border-radius:8px;border:1px solid #ef4444;background:transparent;color:#ef4444;cursor:pointer;font-size:13px">Retry</button></div>`
    );
  mainWindow.loadURL(html).catch(() => {});
}

function startBackend() {
  const appPath = getAppPath();
  const binPath = getBinPath();

  const settings = loadSettings();
  const defaultDl = app.isPackaged
    ? path.join(getUserDataPath(), 'downloads')
    : path.join(appPath, '..', 'downloads');
  const dlPath = settings.downloadPath || defaultDl;
  if (!fs.existsSync(dlPath)) fs.mkdirSync(dlPath, { recursive: true });

  process.env.PORT = String(PORT);
  process.env.DOWNLOAD_PATH = dlPath;
  process.env.BIN_PATH = binPath;
  process.env.ELECTRON_USERDATA = getUserDataPath();
  process.env.APP_PATH = appPath;

  try {
    const mod = require('./server');
    serverInstance = mod.server;

    mod.server.on('listening', () => {
      console.log('[main] Server listening on port', PORT);
      serverReadyResolve();
    });

    mod.server.on('error', (err) => {
      console.error('[main] Server error:', err.message);
      showError('Server error: ' + (err.message || err));
    });

    if (mod.server.listening) {
      serverReadyResolve();
    }
  } catch (e) {
    console.error('[main] Failed to start server:', e);
    showError('Failed to start server: ' + (e.message || e));
  }
}

function killServer() {
  try {
    const mod = require('./server');
    if (mod.cleanup) mod.cleanup();
  } catch (_) {}
  if (serverInstance) {
    try { serverInstance.close(); } catch (_) {}
    serverInstance = null;
  }
}

function createWindow() {
  Menu.setApplicationMenu(null);
  const appPath = getAppPath();
  app.setAppUserModelId('com.youtubedownloader.app');

  const winState = getWindowState();
  const defaultWidth = 720;
  const defaultHeight = 780;

  let winX = undefined;
  let winY = undefined;
  if (winState) {
    winX = winState.x;
    winY = winState.y;
  }

  mainWindow = new BrowserWindow({
    x: winX,
    y: winY,
    width: winState ? winState.width : defaultWidth,
    height: winState ? winState.height : defaultHeight,
    resizable: false,
    icon: path.join(appPath, '..', 'data', 'icon.png'),
    backgroundColor: '#0a0a0f',
    show: true,
    frame: false,
    webPreferences: {
      preload: path.join(appPath, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  showLoading('Starting server...');
  startBackend();

  serverReady.then(() => {
    if (!mainWindow) return;
    mainWindow.loadURL(`http://127.0.0.1:${PORT}`).catch(err => {
      console.error('[main] loadURL error:', err.message);
      showError('Failed to connect: ' + err.message);
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('close', e => {
    const bounds = mainWindow.getBounds();
    saveWindowState({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    if (!isQuitting && tray && process.platform !== 'darwin') {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const appPath = getAppPath();
  const pngPath = path.join(appPath, '..', 'data', 'icon.png');
  const icoPath = path.join(appPath, '..', 'data', 'icon.ico');
  let trayIcon;
  if (fs.existsSync(pngPath)) {
    trayIcon = nativeImage.createFromPath(pngPath);
    if (!trayIcon.isEmpty()) {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } else {
      trayIcon = null;
    }
  }
  if (!trayIcon && fs.existsSync(icoPath)) {
    trayIcon = nativeImage.createFromPath(icoPath);
    if (trayIcon.isEmpty()) trayIcon = null;
  }
  if (!trayIcon || trayIcon.isEmpty()) {
    const sz = 16;
    const buf = Buffer.alloc(sz * sz * 4, 0);
    for (let y = 0; y < sz; y++) {
      for (let x = 0; x < sz; x++) {
        const cx = sz / 2, cy = sz / 2, r = 6;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist <= r) {
          const i = (y * sz + x) * 4;
          buf[i] = 239; buf[i + 1] = 68; buf[i + 2] = 68; buf[i + 3] = 255;
        }
      }
    }
    trayIcon = nativeImage.createFromBuffer(buf, { width: sz, height: sz });
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('YouTube Downloader');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show', click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Open Downloads', click: () => {
        const settings = loadSettings();
        const defaultDl = app.isPackaged
          ? path.join(getUserDataPath(), 'downloads')
          : path.join(appPath, '..', 'downloads');
        const dlPath = settings.downloadPath || defaultDl;
        shell.openPath(dlPath);
      }
    },
    { type: 'separator' },
    {
      label: 'Exit', click: () => {
        isQuitting = true;
        try { tray.destroy(); } catch (_) {}
        tray = null;
        killServer();
        if (mainWindow) {
          try { mainWindow.destroy(); } catch (_) {}
          mainWindow = null;
        }
        app.exit(0);
        setTimeout(() => process.exit(0), 3000);
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.focus();
      else mainWindow.show();
    }
  });
}

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-path', async (_e, targetPath) => {
  try {
    if (targetPath && fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) shell.openPath(targetPath);
      else shell.showItemInFolder(targetPath);
    } else if (targetPath) {
      shell.openPath(path.dirname(targetPath));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_e, data) => saveSettings(data));
ipcMain.handle('is-electron', () => true);
ipcMain.handle('get-port', () => PORT);
ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});
ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') app.quit();
  });

  app.on('before-quit', (e) => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      saveWindowState({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    }
    isQuitting = true;
    killServer();
  });

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });
}
