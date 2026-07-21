/**
 * IPC handlers — the ONLY way the renderer touches privileged APIs.
 *
 * Each handler validates its inputs, invokes either the Python bridge
 * or an Electron primitive, and returns a plain-JSON result.
 */
import { app, ipcMain, shell } from 'electron';
import type { RpcClient } from './pythonBridge';

interface Logger {
  info(m: string, meta?: unknown): void;
  warn(m: string, meta?: unknown): void;
  error(m: string, meta?: unknown): void;
}

export function registerIpcHandlers(rpc: RpcClient, logger: Logger): void {
  ipcMain.handle('avs:app:getVersion', () => app.getVersion());
  ipcMain.handle('avs:app:getPlatform', () => process.platform);

  ipcMain.handle('avs:app:openExternal', async (_e, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Invalid URL');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('avs:app:isAdmin', async () => {
    try {
      const result = await rpc.call<{ isAdmin: boolean }>('system.isAdmin');
      return result.isAdmin ?? false;
    } catch {
      return false;
    }
  });

  ipcMain.handle('avs:app:relaunchAsAdmin', () => {
    logger.info('Relaunching app with admin privileges');
    // On Windows, Electron's relaunch + setAsDefaultProtocolClient won't elevate.
    // We use shell.openPath with the exe and rely on the OS UAC prompt.
    const exePath = app.getPath('exe');
    try {
      const { exec } = require('child_process');
      // Use PowerShell Start-Process -Verb RunAs to trigger UAC elevation
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

  ipcMain.handle('avs:rpc:call', async (_e, msg: { method: string; params?: unknown }) => {
    if (!msg || typeof msg.method !== 'string') throw new Error('Invalid RPC payload');
    try {
      return await rpc.call(msg.method, msg.params);
    } catch (err) {
      logger.warn(`RPC failed: ${msg.method}`, err);
      throw err;
    }
  });
}
