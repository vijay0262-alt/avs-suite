/**
 * Central IPC registry — the SINGLE entry point for registering all
 * IPC handlers in the application.
 *
 * Every feature module exports a `register*Handlers` function that
 * takes its dependencies as arguments and returns nothing. This file
 * calls them all in a deterministic order.
 *
 * Invariants:
 * - This function is called exactly ONCE during the application lifetime.
 * - A guard flag prevents any accidental double-registration.
 * - No feature module self-registers on import.
 * - Registration does NOT depend on backend success.
 */

import { app, ipcMain, shell, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import type { RpcClient } from './pythonBridge';
import type { LicenseBridge } from '../licensing/licenseBridge';
import { checkForUpdates as updaterCheck, downloadUpdate as updaterDownload, quitAndInstall as updaterInstall } from '../updater/updater';

export interface IpcDependencies {
  rpc: RpcClient;
  licenseBridge: LicenseBridge;
  logger: Logger;
}

export interface Logger {
  info(m: string, meta?: unknown): void;
  warn(m: string, meta?: unknown): void;
  error(m: string, meta?: unknown): void;
}

// ── Guard ───────────────────────────────────────────────────
let allHandlersRegistered = false;
const registeredChannels = new Set<string>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IpcHandler = (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown;

/**
 * Register a single IPC handler with tracking.
 * Throws if the channel is already registered.
 */
function registerHandler(channel: string, handler: IpcHandler): void {
  if (registeredChannels.has(channel)) {
    throw new Error(`[ipc] Attempted to register duplicate handler for channel '${channel}'`);
  }
  registeredChannels.add(channel);
  ipcMain.handle(channel, handler);
}

// ── App handlers ────────────────────────────────────────────

function registerAppHandlers(rpc: RpcClient, logger: Logger): void {
  registerHandler('avs:app:getVersion', () => app.getVersion());
  registerHandler('avs:app:getPlatform', () => process.platform);

  registerHandler('avs:app:openExternal', async (_e, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Invalid URL');
    }
    await shell.openExternal(url);
  });

  registerHandler('avs:app:isAdmin', async () => {
    try {
      const result = await rpc.call<{ isAdmin: boolean }>('system.isAdmin');
      return result.isAdmin ?? false;
    } catch {
      return false;
    }
  });

  registerHandler('avs:app:relaunchAsAdmin', () => {
    logger.info('Relaunching app with admin privileges');
    const exePath = app.getPath('exe');
    try {
      exec(
        `powershell -NoProfile -Command "Start-Process -FilePath '${exePath.replace(/'/g, "''")}' -Verb RunAs"`,
        (err: Error | null) => {
          if (err) {
            logger.error('Failed to relaunch as admin', err);
          } else {
            logger.info('Admin relaunch triggered, exiting current instance');
            app.quit();
          }
        },
      );
      return { success: true };
    } catch (err) {
      logger.error('Failed to relaunch as admin', err);
      return { success: false };
    }
  });
}

// ── RPC passthrough handler ─────────────────────────────────

function registerRpcHandler(rpc: RpcClient, logger: Logger): void {
  registerHandler('avs:rpc:call', async (_e, msg: { method: string; params?: unknown }) => {
    if (!msg || typeof msg.method !== 'string') throw new Error('Invalid RPC payload');
    try {
      return await rpc.call(msg.method, msg.params);
    } catch (err) {
      logger.warn(`RPC failed: ${msg.method}`, err);
      throw err;
    }
  });
}

// ── License handlers ────────────────────────────────────────

function registerLicenseHandlers(bridge: LicenseBridge, logger: Logger): void {
  const broadcast = (type: string, payload: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('avs:license:event', { type, payload });
    }
  };

  registerHandler('avs:license:startup', async () => {
    try {
      const status = await bridge.startup();
      logger.info(`License startup: status=${status.status}, edition=${status.edition}`);
      broadcast('startup', status);
      return status;
    } catch (err) {
      logger.error('License startup failed', err);
      return {
        status: 'invalid',
        edition: '',
        message: err instanceof Error ? err.message : 'Startup failed',
        is_offline: false,
        remaining_devices: 0,
        days_remaining: null,
        expiry: null,
        grace_expiry: null,
        last_validated: null,
      };
    }
  });

  registerHandler('avs:license:activate', async (_e, key: string, email: string, deviceName?: string) => {
    try {
      const info = await bridge.activate(key, email, deviceName);
      broadcast('activated', info);
      return { success: true, license: info };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Activation failed' };
    }
  });

  registerHandler('avs:license:validate', async () => {
    try {
      return await bridge.validate();
    } catch (err) {
      logger.error('License validate failed', err);
      return null;
    }
  });

  registerHandler('avs:license:refresh', async () => {
    try {
      const info = await bridge.refresh();
      broadcast('refreshed', info);
      return { success: true, license: info };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Refresh failed' };
    }
  });

  registerHandler('avs:license:deactivate', async () => {
    try {
      const success = await bridge.deactivate();
      broadcast('deactivated', { success });
      return { success };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Deactivation failed' };
    }
  });

  registerHandler('avs:license:getStatus', async () => {
    try {
      return await bridge.getStatus();
    } catch {
      return null;
    }
  });

  registerHandler('avs:license:isLicensed', async () => {
    try {
      return await bridge.isLicensed();
    } catch {
      return false;
    }
  });

  registerHandler('avs:license:getInfo', async () => {
    try {
      return await bridge.getInfo();
    } catch {
      return null;
    }
  });

  registerHandler('avs:license:checkUpdates', async (_e, channel?: string, architecture?: string) => {
    try {
      const result = await bridge.checkUpdates(channel, architecture);
      if (result.update_available) {
        broadcast('update-available', result);
      }
      return result;
    } catch (err) {
      logger.error('Check updates failed', err);
      return null;
    }
  });

  registerHandler('avs:license:downloadUpdate', async (_e, releaseId: number, destPath?: string) => {
    try {
      const filePath = await bridge.downloadUpdate(releaseId, destPath);
      broadcast('update-downloaded', { file_path: filePath });
      return { success: true, file_path: filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Download failed' };
    }
  });

  registerHandler('avs:license:installUpdate', async (_e, filePath: string, silent?: boolean) => {
    try {
      await bridge.installUpdate(filePath, silent);
      broadcast('update-installed', { file_path: filePath });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Install failed' };
    }
  });

  registerHandler('avs:license:startAutoUpdateCheck', async (_e, intervalHours?: number) => {
    const ms = (intervalHours ?? 24) * 60 * 60 * 1000;
    const interval = setInterval(async () => {
      try {
        const result = await bridge.checkUpdates();
        if (result.update_available) {
          broadcast('update-available', result);
        }
      } catch (err) {
        logger.warn('Auto update check failed', err);
      }
    }, ms);
    autoUpdateIntervals.add(interval);
    logger.info(`Auto update check started (every ${intervalHours ?? 24}h)`);
    return { success: true };
  });

  registerHandler('avs:license:stopAutoUpdateCheck', async () => {
    for (const interval of autoUpdateIntervals) {
      clearInterval(interval);
      autoUpdateIntervals.delete(interval);
    }
    return { success: true };
  });

  registerHandler('avs:license:exportDiagnostics', async () => {
    try {
      const info = await bridge.getInfo();
      return { success: true, diagnostics: info };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed' };
    }
  });
}

// ── Updater handlers ────────────────────────────────────────

function registerUpdaterHandlers(): void {
  registerHandler('avs:updater:check', () => updaterCheck());
  registerHandler('avs:updater:download', () => updaterDownload());
  registerHandler('avs:updater:install', () => updaterInstall());
}

// ── Auto-update interval tracking ───────────────────────────

const autoUpdateIntervals = new Set<NodeJS.Timeout>();

function clearAutoUpdateIntervals(): void {
  for (const interval of autoUpdateIntervals) {
    clearInterval(interval);
    autoUpdateIntervals.delete(interval);
  }
}

// ── Main registration function ──────────────────────────────

/**
 * Register ALL IPC handlers for the application.
 *
 * This is called exactly ONCE from the startup state machine.
 * It must be called before any renderer window is created.
 *
 * Registration does NOT depend on backend success — handlers
 * are registered with whatever RPC client is available (real or mock).
 */
export function registerAllHandlers(deps: IpcDependencies): void {
  if (allHandlersRegistered) {
    deps.logger.info('[ipc] All handlers already registered — skipping');
    return;
  }
  allHandlersRegistered = true;

  const { rpc, licenseBridge, logger } = deps;

  logger.info('[ipc] Registering all IPC handlers...');

  registerAppHandlers(rpc, logger);
  registerRpcHandler(rpc, logger);
  registerLicenseHandlers(licenseBridge, logger);
  registerUpdaterHandlers();

  logger.info(`[ipc] All IPC handlers registered (${registeredChannels.size} channels)`);
}

/**
 * Get the set of registered channels (for diagnostics).
 */
export function getRegisteredChannels(): string[] {
  return Array.from(registeredChannels).sort();
}

/**
 * Reset all state — only for tests.
 */
export function _resetIpcRegistry(): void {
  allHandlersRegistered = false;
  registeredChannels.clear();
  clearAutoUpdateIntervals();
}
