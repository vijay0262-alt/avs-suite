/**
 * Electron main entry — creates the BrowserWindow, spawns the Python
 * backend as a JSON-RPC child, wires the updater, structured logger, and
 * global crash handler.
 *
 * Everything Windows-specific is delegated to the Python child; this
 * module is intentionally OS-agnostic.
 */
import { app, BrowserWindow, dialog, shell } from 'electron';
import { exec, execSync } from 'child_process';
import path from 'node:path';
import { installCrashHandler } from '../crash/crashReporter';
import { createLogger } from '../logger/logger';
import { spawnPythonBackend } from '../ipc/pythonBridge';
import { registerIpcHandlers } from '../ipc/handlers';
import { initAutoUpdater } from '../updater/updater';
import { initLicensing, shutdownLicenseBridge } from '../licensing/licenseStartup';

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
          <div class="logo">AVS PC Optimizer</div>
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

function showBackendError(error: Error): void {
  // Close splash window so the error dialog is visible
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
  dialog.showErrorBox(
    'Backend Initialization Failed',
    `The Python backend failed to start:\n\n${error.message}\n\nThe application will continue with limited functionality. License activation and Python-dependent features will be unavailable.`,
  );
}

function checkAndRelaunchAsAdmin(): boolean {
  if (process.platform !== 'win32') return false;
  if (process.env.AVS_NO_ELEVATE) return false;

  try {
    // Check if already running as admin using PowerShell
    const output = execSync(
      'powershell -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
      { encoding: 'utf8', timeout: 5000 }
    ).trim();

    if (output.toLowerCase() === 'true') {
      return false; // Already admin, no need to relaunch
    }

    // Not admin — relaunch with elevation
    const exePath = app.getPath('exe');
    const escapedPath = exePath.replace(/'/g, "''");
    exec(
      `powershell -NoProfile -Command "Start-Process -FilePath '${escapedPath}' -Verb RunAs"`,
      (err) => {
        if (err) {
          log.error('Failed to relaunch as admin', err);
        } else {
          log.info('Admin relaunch triggered, exiting current instance');
          app.quit();
        }
      }
    );
    return true;
  } catch {
    return false;
  }
}

app.whenReady().then(async () => {
  const appStart = Date.now();
  log.info(`[startup-timeline] App ready (env=${env.env}, version=${app.getVersion()})`);

  // Auto-elevate to administrator on Windows for full functionality
  // (registry access, working set trimming, startup management, etc.)
  if (checkAndRelaunchAsAdmin()) {
    // Wait briefly for the elevated instance to start, then quit
    setTimeout(() => app.quit(), 1000);
    return;
  }
  log.info(`[startup-timeline] Admin check passed (${Date.now() - appStart}ms)`);

  // Show splash screen while the backend boots
  splashWindow = createSplashWindow();

  // Start the Python backend *before* loading the renderer so IPC handlers
  // are already registered when the React app makes its first RPC calls.
  const startupBegin = Date.now();
  let rpc: Awaited<ReturnType<typeof spawnPythonBackend>> | null = null;
  try {
    const t0 = Date.now();
    rpc = await spawnPythonBackend(log);
    log.info(`[startup-timeline] Python backend spawned (${Date.now() - t0}ms)`);

    const t1 = Date.now();
    registerIpcHandlers(rpc, log);
    log.info(`[startup-timeline] Core IPC handlers registered (${Date.now() - t1}ms)`);

    const t2 = Date.now();
    initAutoUpdater(log, env);
    log.info(`[startup-timeline] Auto-updater initialized (${Date.now() - t2}ms)`);

    const t3 = Date.now();
    await initLicensing(rpc, log);
    log.info(`[startup-timeline] Licensing subsystem initialized (${Date.now() - t3}ms)`);

    log.info(`[startup-timeline] Full backend startup completed (${Date.now() - startupBegin}ms total)`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error('[startup-timeline] Backend initialization failed', err);
    showBackendError(err);
    // registerIpcHandlers is idempotent — safe to call with mock RPC
    // even if it was already called with the real RPC above.
    const mockRpc = {
      call<T>(_method: string, _params?: unknown): Promise<T> {
        return Promise.reject(new Error('Backend not available'));
      },
      shutdown(): Promise<void> {
        return Promise.resolve();
      },
    };
    registerIpcHandlers(mockRpc as unknown as Parameters<typeof registerIpcHandlers>[0], log);
  }

  // Load the main window only after handlers are registered
  const tRender = Date.now();
  await createMainWindow();
  log.info(`[startup-timeline] Renderer window created (${Date.now() - tRender}ms)`);
  log.info(`[startup-timeline] Total startup time: ${Date.now() - appStart}ms`);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  shutdownLicenseBridge();
  log.info('AVS PC Optimizer shutting down');
});
