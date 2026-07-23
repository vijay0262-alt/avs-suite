/**
 * electron-updater wrapper. Forwards update lifecycle events to the
 * renderer via `avs:updater:event`.
 *
 * IPC handlers (avs:updater:check, etc.) are registered centrally in
 * ipc/registerAllHandlers.ts. This module only wires the autoUpdater
 * event listeners and provides the update functions that the central
 * registry calls.
 */

import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

export type AppEnvironment = 'development' | 'staging' | 'production';

export interface EnvironmentConfig {
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

let updaterInitialized = false;

export function initAutoUpdater(logger: Logger, env: EnvironmentConfig): void {
  if (updaterInitialized) {
    logger.info('[updater] Already initialized — skipping');
    return;
  }
  updaterInitialized = true;

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
}

export function checkForUpdates(): Promise<unknown> {
  return autoUpdater.checkForUpdates();
}

export function downloadUpdate(): Promise<unknown> {
  return autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
