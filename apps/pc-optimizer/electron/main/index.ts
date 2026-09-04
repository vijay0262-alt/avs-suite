/**
 * Electron main entry — creates the BrowserWindow, spawns the Python
 * backend as a JSON-RPC child, wires the updater, structured logger,
 * global crash handler, system tray, and background protection service.
 *
 * Everything Windows-specific is delegated to the Python child; this
 * module is intentionally OS-agnostic.
 *
 * Window close behaviour:
 *   - Default: minimize to system tray (protection continues)
 *   - Optional: exit application (with confirmation dialog)
 *   - The background protection service runs independently of the window
 */
import { app, BrowserWindow, shell, Notification, nativeImage } from 'electron';
import { exec } from 'child_process';
import path from 'node:path';
import fs from 'node:fs';
import { installCrashHandler } from '../crash/crashReporter';
import { createLogger } from '../logger/logger';
import { runStartup, shutdownStartup, getRpcClient } from '../startup/startupStateMachine';
import { TrayManager } from '../tray/TrayManager';
import { BackgroundProtectionService } from '../tray/BackgroundProtectionService';
import { getTraySettings } from '../tray/traySettings';
import { setMainWindow, showMainWindow, getIsQuitting } from './windowManager';

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
let trayManager: TrayManager | null = null;
let bgProtection: BackgroundProtectionService | null = null;

function getAppIcon(): Electron.NativeImage | undefined {
  // V1.0: Prefer icon.ico on Windows — the ICO has proper embedded sizes
  // (16, 32, 48, 64, 128, 256) so Windows picks the right size without
  // Electron resizing/re-rendering.  This prevents the color shift that
  // occurs when Electron resizes a PNG.
  const candidates = process.platform === 'win32'
    ? [
        // 1. ICO direct in resources folder (outside asar — most reliable)
        path.join(process.resourcesPath || '', 'icon.ico'),
        // 2. ICO inside asar
        path.join(process.resourcesPath || '', 'app.asar', 'build', 'icon.ico'),
        path.join(app.getAppPath(), 'build', 'icon.ico'),
        // 3. ICO relative to __dirname (development)
        path.join(__dirname, '..', '..', 'build', 'icon.ico'),
        path.join(__dirname, '..', '..', '..', 'build', 'icon.ico'),
        // 4. Fall back to PNG if ICO not found
        path.join(process.resourcesPath || '', 'tray-icon.png'),
        path.join(process.resourcesPath || '', 'icon.png'),
        path.join(process.resourcesPath || '', 'app.asar', 'build', 'tray-icon.png'),
        path.join(app.getAppPath(), 'build', 'tray-icon.png'),
        path.join(__dirname, '..', '..', 'build', 'tray-icon.png'),
      ]
    : [
        path.join(process.resourcesPath || '', 'tray-icon.png'),
        path.join(process.resourcesPath || '', 'icon.png'),
        path.join(process.resourcesPath || '', 'app.asar', 'build', 'tray-icon.png'),
        path.join(app.getAppPath(), 'build', 'tray-icon.png'),
        path.join(__dirname, '..', '..', 'build', 'tray-icon.png'),
      ];

  for (const iconPath of candidates) {
    try {
      if (!fs.existsSync(iconPath)) continue;
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        log.info(`[icon] Loaded app icon from: ${iconPath}`);
        return img;
      }
    } catch { /* try next */ }
  }
  log.warn('[icon] Could not load app icon from any candidate path');
  return undefined;
}

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
    icon: getAppIcon(),
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
          <div class="logo">AVS AI Shield</div>
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
    backgroundColor: '#0EA5E9',
    icon: getAppIcon(),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0EA5E9',
      symbolColor: '#FFFFFF',
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

  // Register ready-to-show BEFORE loadFile/loadURL so the event is never
  // missed. When loading from a local file (production), loadFile() can
  // resolve and fire ready-to-show synchronously; registering the handler
  // after the await would lose the event and leave the splash screen stuck.
  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    // If launched with --minimized, skip showing the window
    if (process.argv.includes('--minimized')) {
      log.info('[startup] Launched with --minimized — window hidden to tray');
    } else {
      mainWindow?.show();
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    if (env.openDevTools) mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Log renderer crashes to main process log for diagnostics
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error(`[renderer] render-process-gone: reason=${details.reason} exitCode=${details.exitCode}`);
  });

  // Log unresponsive events
  mainWindow.on('unresponsive', () => {
    log.error('[renderer] Window became unresponsive');
  });

  // ── Window close behaviour ──────────────────────────────
  // Intercept the close event.  Unless the user explicitly chose
  // "Exit AVS AI Shield" from the tray (isQuitting=true), hide the
  // window instead of destroying it.  This keeps the renderer
  // state alive and protection running in the background.
  mainWindow.on('close', (event) => {
    if (!getIsQuitting()) {
      const settings = getTraySettings();
      if (settings.closeBehavior === 'minimize-to-tray') {
        event.preventDefault();
        mainWindow?.hide();
        log.info('[window] Close intercepted — hiding to tray (protection continues)');
        return;
      }
    }
    // If quitting or closeBehavior is 'exit', let the window close
    setMainWindow(null);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setMainWindow(mainWindow);
}

// ── Elevation via Scheduled Task ──────────────────────────────
// The app manifest uses asInvoker (no UAC on every launch). Instead,
// a Windows Scheduled Task with HIGHEST privileges runs the app elevated.
// The NSIS installer creates this task during installation (no UAC prompt).
// On first launch without an installer (portable), the app creates the task
// with a one-time UAC prompt. After that, every launch is silently elevated.

const ELEVATION_TASK_NAME = 'AVS_AI_Shield_Elevated';

function checkIsAdmin(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"',
      { encoding: 'utf8', timeout: 5000 },
      (err, stdout) => {
        if (err) { resolve(false); return; }
        resolve(stdout.trim().toLowerCase() === 'true');
      }
    );
  });
}

function scheduledTaskExists(): Promise<boolean> {
  return new Promise((resolve) => {
    exec(
      `schtasks /query /tn "${ELEVATION_TASK_NAME}"`,
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
      (err) => resolve(!err)
    );
  });
}

function createScheduledTask(exePath: string): Promise<boolean> {
  // Write a temporary batch file to handle the complex quoting for schtasks /tr.
  // The /tr argument needs embedded quotes around the exe path (which may contain spaces).
  const batDir = path.join(app.getPath('userData'), 'temp');
  try { fs.mkdirSync(batDir, { recursive: true }); } catch { /* ignore */ }
  const batPath = path.join(batDir, 'create_elevation_task.bat');
  const batContent = `@echo off\r\nschtasks /create /tn "${ELEVATION_TASK_NAME}" /tr "\\"${exePath}\\"" /sc ONLOGON /rl HIGHEST /f\r\n`;
  try {
    fs.writeFileSync(batPath, batContent);
  } catch {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    // Run the batch file with elevation via PowerShell Start-Process -Verb RunAs.
    // This triggers a one-time UAC prompt. After the task is created, subsequent
    // launches use `schtasks /run` which does NOT trigger UAC.
    const escapedBatPath = batPath.replace(/'/g, "''");
    exec(
      `powershell -NoProfile -Command "Start-Process -FilePath '${escapedBatPath}' -Verb RunAs -Wait"`,
      { encoding: 'utf8', timeout: 30000, windowsHide: true },
      (err) => {
        try { fs.unlinkSync(batPath); } catch { /* ignore */ }
        resolve(!err);
      }
    );
  });
}

function runScheduledTask(): Promise<boolean> {
  return new Promise((resolve) => {
    exec(
      `schtasks /run /tn "${ELEVATION_TASK_NAME}"`,
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
      (err) => resolve(!err)
    );
  });
}

/**
 * Ensure the app is running with administrator privileges.
 *
 * Strategy:
 *   1. If already admin -> continue (no action needed).
 *   2. If a scheduled task exists -> relaunch via `schtasks /run` (no UAC prompt) and exit.
 *   3. If no scheduled task exists -> create it with a one-time UAC prompt, then relaunch via it.
 *   4. If all else fails -> continue without admin (ElevationBanner shows as fallback).
 *
 * In dev mode, falls back to the old approach (PowerShell Start-Process -Verb RunAs)
 * since the scheduled task points to the packaged exe, not the dev electron path.
 */
async function ensureElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  if (process.env.AVS_NO_ELEVATE) return false;

  // Already admin — no need to relaunch
  const isAdmin = await checkIsAdmin();
  if (isAdmin) {
    log.info('[startup] Already running as administrator');
    return false;
  }

  // In dev mode, use direct UAC relaunch (the scheduled task approach
  // only works for the packaged exe path).
  if (!app.isPackaged) {
    log.info('[startup] Dev mode — relaunching with UAC elevation');
    return new Promise((resolve) => {
      const exePath = app.getPath('exe');
      const escapedPath = exePath.replace(/'/g, "''");
      exec(
        `powershell -NoProfile -Command "Start-Process -FilePath '${escapedPath}' -Verb RunAs"`,
        (relaunchErr) => {
          if (relaunchErr) {
            log.warn('Admin relaunch declined or failed — continuing without admin', relaunchErr);
            resolve(false);
          } else {
            log.info('Admin relaunch triggered — releasing lock and exiting');
            app.releaseSingleInstanceLock();
            resolve(true);
          }
        }
      );
    });
  }

  // Packaged mode: use scheduled task for silent elevation
  log.info('[startup] Not running as administrator — checking for elevation task');

  const taskExists = await scheduledTaskExists();

  if (!taskExists) {
    log.info('[startup] Elevation task not found — creating (one-time UAC prompt)');
    const exePath = app.getPath('exe');
    const created = await createScheduledTask(exePath);
    if (!created) {
      log.warn('[startup] Failed to create elevation task — continuing without admin');
      return false;
    }
    log.info('[startup] Elevation task created successfully');
  }

  // Relaunch via scheduled task (no UAC prompt)
  log.info('[startup] Relaunching via scheduled task for elevated execution');
  const ran = await runScheduledTask();
  if (ran) {
    log.info('[startup] Elevation task triggered — releasing lock and exiting');
    app.releaseSingleInstanceLock();
    return true; // Caller should quit
  }

  log.warn('[startup] Failed to trigger elevation task — continuing without admin');
  return false;
}

// ── Single instance lock ──────────────────────────────────────
// Prevent multiple instances of AVS AI Shield from running.
// If a second instance is launched, focus the existing window.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  log.info('[startup] Another instance is already running — exiting');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance — focus our window
    log.info('[startup] Second instance detected — focusing existing window');
    showMainWindow();
  });
}

// Disable GPU hardware acceleration — fixes blank-screen rendering issues
// on some Windows GPU/driver combinations. Must be called before whenReady.
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const appStart = Date.now();
  log.info(`[startup] AVS AI Shield starting (env=${env.env}, version=${app.getVersion()})`);

  // Ensure Notification support is available
  if (!Notification.isSupported()) {
    log.warn('[startup] Notifications not supported on this platform');
  }

  // Ensure the app is running with administrator privileges.
  // Uses a scheduled task for silent elevation (no UAC prompt after first install).
  // If elevation fails, the app continues without admin (ElevationBanner shows as fallback).
  const needsRelaunch = await ensureElevated();
  if (needsRelaunch) {
    app.quit();
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

  // ── Initialize system tray ──────────────────────────────
  trayManager = new TrayManager(log, {
    onRunScan: () => {
      // Tell the renderer to start a security scan
      mainWindow?.webContents.send('avs:tray:action', { action: 'run-scan' });
    },
    onRunOptimize: () => {
      // Tell the renderer to start optimization
      mainWindow?.webContents.send('avs:tray:action', { action: 'run-optimize' });
    },
    onCheckUpdates: () => {
      // Tell the renderer to check for updates
      mainWindow?.webContents.send('avs:tray:action', { action: 'check-updates' });
    },
  });
  trayManager.create();

  // ── Initialize background protection service ────────────
  const rpcClient = getRpcClient();
  bgProtection = new BackgroundProtectionService(log, rpcClient, (state) => {
    trayManager?.setProtectionState(state);
  });
  void bgProtection.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
    else showMainWindow();
  });
});

// ── Window lifecycle ──────────────────────────────────────────
// Do NOT quit when all windows are closed — the app runs in the
// background via the system tray.  Only quit when the user
// explicitly chooses "Exit AVS AI Shield" from the tray menu.
app.on('window-all-closed', (event: Electron.Event) => {
  // Prevent the default quit behavior
  event.preventDefault();
});

// ── Application shutdown ──────────────────────────────────────
app.on('will-quit', async (event) => {
  // Prevent default quit so we can do async cleanup first
  event.preventDefault();

  // Shutdown background protection and tray
  if (trayManager) {
    trayManager.destroy();
    trayManager = null;
  }
  if (bgProtection) {
    try {
      await bgProtection.shutdown();
    } catch {
      // Best-effort
    }
    bgProtection = null;
  }

  // Await the startup shutdown (kills the Python backend process)
  try {
    await shutdownStartup();
  } catch {
    // Best-effort
  }

  // V1.0: Force-kill any remaining avs-backend.exe processes on Windows.
  // The Python backend (PyInstaller bundle) may spawn child processes
  // that survive a simple kill() call.  Use taskkill /T /F to kill the
  // entire process tree.
  //
  // V1.0: Use the asynchronous `exec` API (not the synchronous variant)
  // so the Electron main process is never blocked during shutdown.  The
  // Promise resolves before app.exit(0) is called below, preserving
  // graceful shutdown.
  if (process.platform === 'win32') {
    try {
      await new Promise<void>((resolve) => {
        exec(
          'taskkill /IM avs-backend.exe /T /F 2>nul',
          { timeout: 5000, windowsHide: true },
          (err: Error | null) => {
            if (err) {
              // No remaining processes or taskkill failed — not an error
              resolve();
              return;
            }
            log.info('[shutdown] Force-killed remaining avs-backend.exe processes');
            resolve();
          },
        );
      });
    } catch {
      // Best-effort — never block shutdown
    }
  }

  log.info('AVS AI Shield shutting down');
  // Force exit — all cleanup is done
  app.exit(0);
});

// ── Export for IPC handlers ───────────────────────────────────
export function getTrayManager(): TrayManager | null {
  return trayManager;
}

export function getBackgroundProtection(): BackgroundProtectionService | null {
  return bgProtection;
}
