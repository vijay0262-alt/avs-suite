/**
 * Electron main entry — creates the BrowserWindow, spawns the Python
 * backend as a JSON-RPC child, wires the updater, structured logger, and
 * global crash handler.
 *
 * Everything Windows-specific is delegated to the Python child; this
 * module is intentionally OS-agnostic.
 */
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { installCrashHandler } from './crash/crashReporter';
import { createLogger } from './logger/logger';
import { spawnPythonBackend } from './ipc/pythonBridge';
import { registerIpcHandlers } from './ipc/handlers';
import { initAutoUpdater } from './updater/updater';
import { resolveEnvironment } from '../../../packages/shared/src/env';

const env = resolveEnvironment(process.env.AVS_ENV);
const log = createLogger('main', env.logLevel);

installCrashHandler(log);

let mainWindow: BrowserWindow | null = null;

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0F172A',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0F172A',
      symbolColor: '#F1F5F9',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    if (env.openDevTools) mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => (mainWindow = null));
}

app.whenReady().then(async () => {
  log.info(`AVS PC Optimizer starting (env=${env.env})`);

  const rpc = await spawnPythonBackend(log);
  registerIpcHandlers(rpc, log);
  initAutoUpdater(log, env);

  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  log.info('AVS PC Optimizer shutting down');
});
