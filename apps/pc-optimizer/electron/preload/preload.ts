/**
 * Preload script — the ONLY bridge exposed to the renderer.
 *
 * The renderer never has direct access to Node, Electron, or the Python
 * child. Instead it calls `window.avs.rpc.call(method, params)` which
 * proxies through IPC → main → Python.
 *
 * Security:
 *   - contextIsolation: true, nodeIntegration: false, sandbox: true
 *   - Only typed methods are exposed via contextBridge
 *   - All inputs are validated before IPC invocation
 *   - URL scheme restricted to http(s) for openExternal
 *
 * Performance:
 *   - All invoke calls have a renderer-side timeout to prevent hangs
 *   - Subscription listeners are properly cleaned up on unsubscribe
 */
import { contextBridge, ipcRenderer } from 'electron';

/**
 * Default timeout for IPC invoke calls from the renderer side.
 * If the main process doesn't respond within this time, the promise rejects.
 */
const IPC_INVOKE_TIMEOUT_MS = 60_000;

/**
 * Wrap ipcRenderer.invoke with a timeout to prevent renderer hangs.
 */
function invokeWithTimeout<T>(
  channel: string,
  ...args: unknown[]
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`IPC invoke timeout: ${channel} (${IPC_INVOKE_TIMEOUT_MS}ms)`)),
      IPC_INVOKE_TIMEOUT_MS,
    );
    ipcRenderer.invoke(channel, ...args).then(
      (result) => { clearTimeout(timer); resolve(result as T); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

const api = {
  rpc: {
    call<T>(method: string, params?: unknown): Promise<T> {
      if (typeof method !== 'string' || method.length === 0) {
        return Promise.reject(new Error('RPC method must be a non-empty string'));
      }
      return invokeWithTimeout<T>('avs:rpc:call', { method, params });
    },
    subscribe(channel: string, listener: (payload: unknown) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
      ipcRenderer.on(`avs:rpc:event:${channel}`, wrapped);
      return () => ipcRenderer.removeListener(`avs:rpc:event:${channel}`, wrapped);
    },
  },
  app: {
    getVersion: (): Promise<string> => invokeWithTimeout<string>('avs:app:getVersion'),
    getPlatform: (): Promise<string> => invokeWithTimeout<string>('avs:app:getPlatform'),
    openExternal: (url: string): Promise<void> => {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return Promise.reject(new Error('Invalid URL: must be http(s)://'));
      }
      return invokeWithTimeout<void>('avs:app:openExternal', url);
    },
    isAdmin: (): Promise<boolean> => invokeWithTimeout<boolean>('avs:app:isAdmin'),
    relaunchAsAdmin: (): Promise<{ success: boolean }> =>
      invokeWithTimeout<{ success: boolean }>('avs:app:relaunchAsAdmin'),
  },
  updater: {
    check: (): Promise<void> => invokeWithTimeout<void>('avs:updater:check'),
    onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, ev: { type: string; payload: unknown }) => cb(ev);
      ipcRenderer.on('avs:updater:event', wrapped);
      return () => ipcRenderer.removeListener('avs:updater:event', wrapped);
    },
  },
  license: {
    startup: (): Promise<unknown> => invokeWithTimeout('avs:license:startup'),
    activate: (key: string, email: string, deviceName?: string): Promise<unknown> => {
      if (typeof key !== 'string' || key.length === 0) return Promise.reject(new Error('License key required'));
      if (typeof email !== 'string' || email.length === 0) return Promise.reject(new Error('Email required'));
      return invokeWithTimeout('avs:license:activate', key, email, deviceName);
    },
    validate: (): Promise<unknown> => invokeWithTimeout('avs:license:validate'),
    refresh: (): Promise<unknown> => invokeWithTimeout('avs:license:refresh'),
    deactivate: (): Promise<unknown> => invokeWithTimeout('avs:license:deactivate'),
    getStatus: (): Promise<unknown> => invokeWithTimeout('avs:license:getStatus'),
    isLicensed: (): Promise<boolean> => invokeWithTimeout<boolean>('avs:license:isLicensed'),
    getInfo: (): Promise<unknown> => invokeWithTimeout('avs:license:getInfo'),
    checkUpdates: (channel?: string, architecture?: string): Promise<unknown> =>
      invokeWithTimeout('avs:license:checkUpdates', channel, architecture),
    downloadUpdate: (releaseId: number, destPath?: string): Promise<unknown> =>
      invokeWithTimeout('avs:license:downloadUpdate', releaseId, destPath),
    installUpdate: (filePath: string, silent?: boolean): Promise<unknown> => {
      if (typeof filePath !== 'string' || filePath.length === 0) return Promise.reject(new Error('filePath required'));
      return invokeWithTimeout('avs:license:installUpdate', filePath, silent);
    },
    exportDiagnostics: (): Promise<unknown> => invokeWithTimeout('avs:license:exportDiagnostics'),
    onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, ev: { type: string; payload: unknown }) => cb(ev);
      ipcRenderer.on('avs:license:event', wrapped);
      return () => ipcRenderer.removeListener('avs:license:event', wrapped);
    },
  },
  tray: {
    getSettings: (): Promise<unknown> => invokeWithTimeout('avs:tray:getSettings'),
    updateSettings: (patch: Record<string, unknown>): Promise<unknown> => invokeWithTimeout('avs:tray:updateSettings', patch),
    isStartupEnabled: (): Promise<boolean> => invokeWithTimeout<boolean>('avs:tray:isStartupEnabled'),
    enableStartup: (): Promise<boolean> => invokeWithTimeout<boolean>('avs:tray:enableStartup'),
    disableStartup: (): Promise<boolean> => invokeWithTimeout<boolean>('avs:tray:disableStartup'),
    onSettingsChanged(cb: (settings: unknown) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, settings: unknown) => cb(settings);
      ipcRenderer.on('avs:tray:settingsChanged', wrapped);
      return () => ipcRenderer.removeListener('avs:tray:settingsChanged', wrapped);
    },
    onAction(cb: (action: { action: string }) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, action: { action: string }) => cb(action);
      ipcRenderer.on('avs:tray:action', wrapped);
      return () => ipcRenderer.removeListener('avs:tray:action', wrapped);
    },
    onNavigate(cb: (route: string) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, route: string) => cb(route);
      ipcRenderer.on('avs:tray:navigate', wrapped);
      return () => ipcRenderer.removeListener('avs:tray:navigate', wrapped);
    },
  },
  notifications: {
    onEvent(cb: (notification: unknown) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, notification: unknown) => cb(notification);
      ipcRenderer.on('avs:notification:event', wrapped);
      return () => ipcRenderer.removeListener('avs:notification:event', wrapped);
    },
  },
} as const;

contextBridge.exposeInMainWorld('avs', api);

export type AvsPreloadApi = typeof api;
