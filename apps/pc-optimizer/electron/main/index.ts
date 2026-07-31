/**
 * Electron main entry — creates the BrowserWindow, spawns the Python
 * backend as a JSON-RPC child, wires the updater, structured logger, and
 * global crash handler.
 *
 * Everything Windows-specific is delegated to the Python child; this
 * module is intentionally OS-agnostic.
 */
import { app, BrowserWindow, shell } from 'electron';
import { exec } from 'child_process';
import path from 'node:path';
import { installCrashHandler } from '../crash/crashReporter';
import { createLogger } from '../logger/logger';
import { runStartup, shutdownStartup } from '../startup/startupStateMachine';

// Local environment configuration (mirrors @avs/shared/env to avoid ES module import in Electron main)
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
    updateFeedUrl: 'http://localhost:8000/updates',
    licenseApiUrl: 'http://localhost:8000',
    analyticsUrl: null,
    logLevel: 'debug',
    openDevTools: true,
  },
  staging: {
    env: 'staging',
    updateFeedUrl: 'https://api-staging.avsshield.com/updates',
    licenseApiUrl: 'https://api-staging.avsshield.com',
    analyticsUrl: null,
    logLevel: 'info',
    openDevTools: false,
  },
  production: {
    env: 'production',
    updateFeedUrl: 'https://api.avsshield.com/updates',
    licenseApiUrl: 'https://api.avsshield.com',
    analyticsUrl: null,
    logLevel: 'warn',
    openDevTools: false,
  },
};

function resolveEnvironment(raw: string | undefined): EnvironmentConfig {
  // When AVS_ENV is not set, use production if the app is packaged, otherwise development.
  // This ensures the installed app always hits api.avsshield.com without needing env vars.
  const key = (raw ?? (app.isPackaged ? 'production' : 'development')).toLowerCase() as AppEnvironment;
  return CONFIGS[key] ?? CONFIGS.development;
}

const env = resolveEnvironment(process.env.AVS_ENV);
const log = createLogger('main', env.logLevel);

log.info(`[AVS] Environment: ${env.env}`);
log.info(`[AVS] API base URL: ${env.licenseApiUrl}`);
log.info(`[AVS] Update feed URL: ${env.updateFeedUrl}`);

// Override to write to main.log instead of avs-main.log
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');

installCrashHandler(log);

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: '#0F172A',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load a simple splash screen HTML
  splash.loadURL(`data:text/html;charset=utf-8,
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: white;
          }
          .container {
            text-align: center;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
          }
          .loading {
            font-size: 14px;
            opacity: 0.8;
          }
          .spinner {
            width: 30px;
            height: 30px;
            border: 3px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">AVS Shield Optimizer</div>
          <div class="spinner"></div>
          <div class="loading">Loading...</div>
        </div>
      </body>
    </html>
  `);

  splash.once('ready-to-show', () => splash.show());
  return splash;
}

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
      backgroundThrottling: true,
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

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow?.show();
  });
  mainWindow.on('closed', () => (mainWindow = null));
}

function checkAndRelaunchAsAdmin(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  if (process.env.AVS_NO_ELEVATE) return Promise.resolve(false);

  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
      { encoding: 'utf8', timeout: 5000 },
      (err, stdout) => {
        if (err) {
          resolve(false);
          return;
        }
        const output = stdout.trim();
        if (output.toLowerCase() === 'true') {
          resolve(false); // Already admin
          return;
        }
        // Not admin — relaunch with elevation
        const exePath = app.getPath('exe');
        const escapedPath = exePath.replace(/'/g, "''");
        exec(
          `powershell -NoProfile -Command "Start-Process -FilePath '${escapedPath}' -Verb RunAs"`,
          (relaunchErr) => {
            if (relaunchErr) {
              log.error('Failed to relaunch as admin', relaunchErr);
              resolve(false);
            } else {
              log.info('Admin relaunch triggered, exiting current instance');
              resolve(true);
            }
          }
        );
      }
    );
  });
}

app.whenReady().then(async () => {
  const appStart = Date.now();
  log.info(`[startup] AVS Shield Optimizer starting (env=${env.env}, version=${app.getVersion()})`);

  // Auto-elevate to administrator on Windows for full functionality
  const needsRelaunch = await checkAndRelaunchAsAdmin();
  if (needsRelaunch) {
    setTimeout(() => app.quit(), 1000);
    return;
  }
  log.info(`[startup] Admin check passed (${Date.now() - appStart}ms)`);

  // Show splash screen while the backend boots
  splashWindow = createSplashWindow();

  // Run the full startup state machine — handles:
  //   1. Python backend spawn
  //   2. IPC handler registration (exactly once)
  //   3. License SDK initialization
  //   4. Main window creation
  // On failure: shows error dialog, continues in degraded mode or exits.
  await runStartup(
    log,
    createMainWindow,
    () => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
    },
    env,
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  shutdownStartup();
  log.info('AVS Shield Optimizer shutting down');
});
