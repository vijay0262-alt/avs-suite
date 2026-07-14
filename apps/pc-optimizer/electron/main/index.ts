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
import { installCrashHandler } from '../crash/crashReporter';
import { createLogger } from '../logger/logger';
import { spawnPythonBackend } from '../ipc/pythonBridge';
import { registerIpcHandlers } from '../ipc/handlers';
import { initAutoUpdater } from '../updater/updater';

// Local environment configuration (copied from shared package to avoid ES module import)
type AppEnvironment = 'development' | 'staging' | 'production';

interface EnvironmentConfig {
  env: AppEnvironment;
  updateFeedUrl: string;
  licenseApiUrl: string;
  analyticsUrl: string | null;
  logLevel: 'silly' | 'debug' | 'info' | 'warn' | 'error';
  openDevTools: boolean;
}

const CONFIGS: Record<AppEnvironment, EnvironmentConfig> = {
  development: {
    env: 'development',
    updateFeedUrl: 'https://updates.dev.avs.example.com',
    licenseApiUrl: 'https://license.dev.avs.example.com',
    analyticsUrl: null,
    logLevel: 'debug',
    openDevTools: true,
  },
  staging: {
    env: 'staging',
    updateFeedUrl: 'https://updates.staging.avs.example.com',
    licenseApiUrl: 'https://license.staging.avs.example.com',
    analyticsUrl: 'https://telemetry.staging.avs.example.com',
    logLevel: 'info',
    openDevTools: false,
  },
  production: {
    env: 'production',
    updateFeedUrl: 'https://updates.avs.example.com',
    licenseApiUrl: 'https://license.avs.example.com',
    analyticsUrl: 'https://telemetry.avs.example.com',
    logLevel: 'warn',
    openDevTools: false,
  },
};

function resolveEnvironment(raw: string | undefined): EnvironmentConfig {
  const key = (raw ?? 'development').toLowerCase() as AppEnvironment;
  return CONFIGS[key] ?? CONFIGS.development;
}

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
      preload: path.join(__dirname, '../preload/preload.js'),
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

  try {
    const rpc = await spawnPythonBackend(log);
    registerIpcHandlers(rpc, log);
    initAutoUpdater(log, env);
  } catch (error) {
    log.warn('Python backend initialization failed, continuing without backend', error);
    // Create a mock RPC client that returns errors for all calls
    const mockRpc = {
      call<T>(_method: string, _params?: unknown): Promise<T> {
        return Promise.reject(new Error('Backend not available'));
      },
      shutdown(): Promise<void> {
        return Promise.resolve();
      },
    };
    registerIpcHandlers(mockRpc, log);
  }

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
