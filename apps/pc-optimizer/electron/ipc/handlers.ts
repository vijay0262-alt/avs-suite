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
