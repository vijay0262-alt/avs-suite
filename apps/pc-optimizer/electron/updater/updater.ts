/**
 * electron-updater wrapper. Forwards update lifecycle events to the
 * renderer via `avs:updater:event`.
 *
 * The provider is configured in `package.json > build.publish`; this
 * module only wires the JavaScript API and lifecycle events.
 */
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';

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

interface Logger {
  info(m: string, meta?: unknown): void;
  warn(m: string, meta?: unknown): void;
  error(m: string, meta?: unknown): void;
}

export function initAutoUpdater(logger: Logger, env: EnvironmentConfig): void {
  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = env.env !== 'production';
  autoUpdater.logger = {
    info: (m: string) => logger.info(`[updater] ${m}`),
    warn: (m: string) => logger.warn(`[updater] ${m}`),
    error: (m: string) => logger.error(`[updater] ${m}`),
    debug: () => {},
  } as never;

  const broadcast = (type: string, payload: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('avs:updater:event', { type, payload });
    }
  };

  autoUpdater.on('checking-for-update', () => broadcast('checking', null));
  autoUpdater.on('update-available', (info) => broadcast('available', info));
  autoUpdater.on('update-not-available', () => broadcast('not-available', null));
  autoUpdater.on('download-progress', (p) => broadcast('progress', p));
  autoUpdater.on('update-downloaded', (info) => broadcast('downloaded', info));
  autoUpdater.on('error', (err) => broadcast('error', { message: err.message }));

  ipcMain.handle('avs:updater:check', () => autoUpdater.checkForUpdates());
  ipcMain.handle('avs:updater:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('avs:updater:install', () => autoUpdater.quitAndInstall());
}
