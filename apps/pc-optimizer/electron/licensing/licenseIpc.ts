/**
 * License IPC handlers — expose license operations to the renderer
 * via `window.avs.license.*`.
 *
 * All operations delegate to the LicenseBridge which calls the Python
 * backend's JSON-RPC handlers that use the AVS License SDK.
 */
import { ipcMain, BrowserWindow } from 'electron';
import { LicenseBridge, type LicenseStatus } from './licenseBridge';
import type { RpcClient } from '../ipc/pythonBridge';

interface Logger {
  info(m: string, meta?: unknown): void;
  warn(m: string, meta?: unknown): void;
  error(m: string, meta?: unknown): void;
}

let bridge: LicenseBridge | null = null;
let updateCheckInterval: NodeJS.Timeout | null = null;
let handlersRegistered = false;

function broadcast(type: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('avs:license:event', { type, payload });
  }
}

export function initLicenseBridge(rpc: RpcClient, logger: Logger): LicenseBridge {
  // If already initialized, just update the bridge instance (e.g. after reconnect)
  // but do NOT re-register IPC handlers — Electron throws on duplicate handle() calls.
  if (handlersRegistered && bridge) {
    logger.info('License bridge already initialized — skipping IPC handler registration');
    return bridge;
  }

  bridge = new LicenseBridge(rpc);

  // ── Startup Sequence ─────────────────────────────────────
  ipcMain.handle('avs:license:startup', async () => {
    if (!bridge) return { status: 'invalid', message: 'Bridge not initialized' } as LicenseStatus;
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
      } as LicenseStatus;
    }
  });

  // ── Activate ─────────────────────────────────────────────
  ipcMain.handle('avs:license:activate', async (_e, key: string, email: string, deviceName?: string) => {
    if (!bridge) return { success: false, error: 'Bridge not initialized' };
    try {
      const info = await bridge.activate(key, email, deviceName);
      broadcast('activated', info);
      return { success: true, license: info };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Activation failed' };
    }
  });

  // ── Validate ─────────────────────────────────────────────
  ipcMain.handle('avs:license:validate', async () => {
    if (!bridge) return null;
    try {
      return await bridge.validate();
    } catch (err) {
      logger.error('License validate failed', err);
      return null;
    }
  });

  // ── Refresh ──────────────────────────────────────────────
  ipcMain.handle('avs:license:refresh', async () => {
    if (!bridge) return { success: false, error: 'Bridge not initialized' };
    try {
      const info = await bridge.refresh();
      broadcast('refreshed', info);
      return { success: true, license: info };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Refresh failed' };
    }
  });

  // ── Deactivate ───────────────────────────────────────────
  ipcMain.handle('avs:license:deactivate', async () => {
    if (!bridge) return { success: false, error: 'Bridge not initialized' };
    try {
      const success = await bridge.deactivate();
      broadcast('deactivated', { success });
      return { success };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Deactivation failed' };
    }
  });

  // ── Get Status ───────────────────────────────────────────
  ipcMain.handle('avs:license:getStatus', async () => {
    if (!bridge) return null;
    try {
      return await bridge.getStatus();
    } catch {
      return null;
    }
  });

  // ── Is Licensed ──────────────────────────────────────────
  ipcMain.handle('avs:license:isLicensed', async () => {
    if (!bridge) return false;
    try {
      return await bridge.isLicensed();
    } catch {
      return false;
    }
  });

  // ── Get Info (for About window, diagnostics) ─────────────
  ipcMain.handle('avs:license:getInfo', async () => {
    if (!bridge) return null;
    try {
      return await bridge.getInfo();
    } catch {
      return null;
    }
  });

  // ── Check Updates ────────────────────────────────────────
  ipcMain.handle('avs:license:checkUpdates', async (_e, channel?: string, architecture?: string) => {
    if (!bridge) return null;
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

  // ── Download Update ──────────────────────────────────────
  ipcMain.handle('avs:license:downloadUpdate', async (_e, releaseId: number, destPath?: string) => {
    if (!bridge) return { success: false, error: 'Bridge not initialized' };
    try {
      const filePath = await bridge.downloadUpdate(releaseId, destPath);
      broadcast('update-downloaded', { file_path: filePath });
      return { success: true, file_path: filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Download failed' };
    }
  });

  // ── Install Update ───────────────────────────────────────
  ipcMain.handle('avs:license:installUpdate', async (_e, filePath: string, silent?: boolean) => {
    if (!bridge) return { success: false, error: 'Bridge not initialized' };
    try {
      await bridge.installUpdate(filePath, silent);
      broadcast('update-installed', { file_path: filePath });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Install failed' };
    }
  });

  // ── Start Auto Update Check ──────────────────────────────
  ipcMain.handle('avs:license:startAutoUpdateCheck', async (_e, intervalHours?: number) => {
    if (updateCheckInterval) clearInterval(updateCheckInterval);
    const intervalMs = (intervalHours ?? 24) * 60 * 60 * 1000;
    updateCheckInterval = setInterval(async () => {
      if (!bridge) return;
      try {
        const result = await bridge.checkUpdates();
        if (result.update_available) {
          broadcast('update-available', result);
        }
      } catch (err) {
        logger.warn('Auto update check failed', err);
      }
    }, intervalMs);
    logger.info(`Auto update check started (every ${intervalHours ?? 24}h)`);
    return { success: true };
  });

  // ── Stop Auto Update Check ───────────────────────────────
  ipcMain.handle('avs:license:stopAutoUpdateCheck', async () => {
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
      updateCheckInterval = null;
    }
    return { success: true };
  });

  // ── Export Diagnostics ───────────────────────────────────
  ipcMain.handle('avs:license:exportDiagnostics', async () => {
    if (!bridge) return { success: false, error: 'Bridge not initialized' };
    try {
      const info = await bridge.getInfo();
      return { success: true, diagnostics: info };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed' };
    }
  });

  handlersRegistered = true;

  return bridge;
}

export function shutdownLicenseBridge(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  if (bridge) {
    bridge.close().catch(() => {});
    bridge = null;
  }
  handlersRegistered = false;
}
