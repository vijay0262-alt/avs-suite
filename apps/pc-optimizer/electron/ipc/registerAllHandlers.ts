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
import { getTraySettings, updateTraySettings, onSettingsChanged, type TraySettings } from '../tray/traySettings';
import { isStartupEnabled, enableStartup, disableStartup } from '../tray/windowsStartup';
import { onNotification, type AvsNotification } from '../notifications/NotificationManager';

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
 * Default timeout for IPC handlers (30 seconds).
 * Long-running operations like scans use a longer timeout.
 */
const IPC_DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Wrap an IPC handler with a timeout. If the handler doesn't resolve
 * within `timeoutMs`, a timeout error is thrown to the renderer.
 */
function withTimeout<T extends IpcHandler>(
  handler: T,
  timeoutMs: number = IPC_DEFAULT_TIMEOUT_MS,
): T {
  return (async (event: Electron.IpcMainInvokeEvent, ...args: never[]) => {
    return Promise.race([
      handler(event, ...args),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`IPC timeout after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  }) as T;
}

/**
 * Validate that a value is a non-empty string.
 */
function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${name}: expected non-empty string`);
  }
  return value;
}

/**
 * Validate that a value is a positive number.
 */
function requirePositiveNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: expected positive number`);
  }
  return value;
}

/**
 * Register a single IPC handler with tracking and timeout protection.
 * Throws if the channel is already registered.
 */
function registerHandler(channel: string, handler: IpcHandler, timeoutMs?: number): void {
  if (registeredChannels.has(channel)) {
    throw new Error(`[ipc] Attempted to register duplicate handler for channel '${channel}'`);
  }
  registeredChannels.add(channel);
  ipcMain.handle(channel, timeoutMs ? withTimeout(handler, timeoutMs) : handler);
}

// ── App handlers ────────────────────────────────────────────

function registerAppHandlers(rpc: RpcClient, logger: Logger): void {
  registerHandler('avs:app:getVersion', () => app.getVersion());
  registerHandler('avs:app:getPlatform', () => process.platform);

  registerHandler('avs:app:openExternal', async (_e, url: string) => {
    const validated = requireString(url, 'url');
    if (!/^https?:\/\//i.test(validated)) {
      throw new Error('Invalid URL: must be http(s)://');
    }
    await shell.openExternal(validated);
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
    const taskName = 'AVS_AI_Shield_Elevated';
    try {
      // Try the scheduled task first (no UAC prompt if the task already exists).
      // This is the normal path after installation.
      exec(
        `schtasks /run /tn "${taskName}"`,
        { encoding: 'utf8', timeout: 5000, windowsHide: true },
        (taskErr: Error | null) => {
          if (taskErr) {
            // Task doesn't exist or failed — fall back to UAC prompt
            logger.warn('Scheduled task relaunch failed, falling back to UAC', taskErr);
            exec(
              `powershell -NoProfile -Command "Start-Process -FilePath '${exePath.replace(/'/g, "''")}' -Verb RunAs"`,
              (uacErr: Error | null) => {
                if (uacErr) {
                  logger.error('Failed to relaunch as admin via UAC', uacErr);
                } else {
                  logger.info('Admin relaunch triggered via UAC, exiting current instance');
                  app.quit();
                }
              },
            );
          } else {
            logger.info('Admin relaunch triggered via scheduled task, exiting current instance');
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
    if (!msg || typeof msg.method !== 'string' || msg.method.length === 0) {
      throw new Error('Invalid RPC payload: method must be a non-empty string');
    }
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
    requireString(key, 'license key');
    requireString(email, 'email');
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

  registerHandler('avs:license:downloadUpdate', async (_e, releaseId: number, _destPath?: string) => {
    requirePositiveNumber(releaseId, 'releaseId');
    try {
      const filePath = await bridge.downloadUpdate(releaseId, _destPath);
      broadcast('update-downloaded', { file_path: filePath });
      return { success: true, file_path: filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Download failed' };
    }
  });

  registerHandler('avs:license:installUpdate', async (_e, filePath: string, _silent?: boolean) => {
    requireString(filePath, 'filePath');
    try {
      await bridge.installUpdate(filePath, _silent);
      broadcast('update-installed', { file_path: filePath });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Install failed' };
    }
  });

  registerHandler('avs:license:startAutoUpdateCheck', async (_e, intervalHours?: number) => {
    const hours = intervalHours ?? 24;
    if (typeof hours !== 'number' || hours < 1) {
      throw new Error('intervalHours must be a positive number');
    }
    const ms = hours * 60 * 60 * 1000;
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

// ── Tray & background service handlers ──────────────────────

function registerTrayHandlers(logger: Logger): void {
  // Get current tray settings
  registerHandler('avs:tray:getSettings', () => {
    return getTraySettings();
  });

  // Update tray settings
  registerHandler('avs:tray:updateSettings', (_e, patch: Partial<TraySettings>) => {
    const updated = updateTraySettings(patch);
    logger.info('[ipc] Tray settings updated', patch);
    return updated;
  });

  // Check if startup with Windows is enabled
  registerHandler('avs:tray:isStartupEnabled', () => {
    return isStartupEnabled();
  });

  // Enable startup with Windows
  registerHandler('avs:tray:enableStartup', () => {
    return enableStartup(logger);
  });

  // Disable startup with Windows
  registerHandler('avs:tray:disableStartup', () => {
    return disableStartup(logger);
  });

  // Subscribe to settings changes (push to renderer)
  onSettingsChanged((settings) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('avs:tray:settingsChanged', settings);
    }
  });
}

// ── Notification handlers ────────────────────────────────────

function registerNotificationHandlers(logger: Logger): void {
  // Subscribe to notifications (push to renderer for in-app toasts)
  onNotification((notification: AvsNotification) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('avs:notification:event', notification);
    }
  });
  logger.info('[ipc] Notification handlers registered');
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
  registerTrayHandlers(logger);
  registerNotificationHandlers(logger);

  // Notify renderer when backend reconnects after crash
  if (rpc.onReconnect) {
    rpc.onReconnect(() => {
      logger.info('[ipc] Backend reconnected — notifying renderer');
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('avs:rpc:reconnected');
      }
    });
  }

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

/**
 * Clean up ALL IPC handlers and intervals on application shutdown.
 * Called from the main process 'will-quit' event to prevent:
 *   - Duplicate handler errors on restart
 *   - Memory leaks from lingering intervals
 *   - Stale listener references
 */
export function cleanupAllHandlers(): void {
  clearAutoUpdateIntervals();
  for (const channel of registeredChannels) {
    ipcMain.removeHandler(channel);
  }
  registeredChannels.clear();
  allHandlersRegistered = false;
}
