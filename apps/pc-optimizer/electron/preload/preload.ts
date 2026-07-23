/**
 * Preload script — the ONLY bridge exposed to the renderer.
 *
 * The renderer never has direct access to Node, Electron, or the Python
 * child. Instead it calls `window.avs.rpc.call(method, params)` which
 * proxies through IPC → main → Python.
 */
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  rpc: {
    call<T>(method: string, params?: unknown): Promise<T> {
      return ipcRenderer.invoke('avs:rpc:call', { method, params }) as Promise<T>;
    },
    subscribe(channel: string, listener: (payload: unknown) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
      ipcRenderer.on(`avs:rpc:event:${channel}`, wrapped);
      return () => ipcRenderer.removeListener(`avs:rpc:event:${channel}`, wrapped);
    },
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('avs:app:getVersion'),
    getPlatform: (): Promise<string> => ipcRenderer.invoke('avs:app:getPlatform'),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('avs:app:openExternal', url),
    isAdmin: (): Promise<boolean> => ipcRenderer.invoke('avs:app:isAdmin'),
    relaunchAsAdmin: (): Promise<{ success: boolean }> => ipcRenderer.invoke('avs:app:relaunchAsAdmin'),
  },
  updater: {
    check: (): Promise<void> => ipcRenderer.invoke('avs:updater:check'),
    onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, ev: { type: string; payload: unknown }) => cb(ev);
      ipcRenderer.on('avs:updater:event', wrapped);
      return () => ipcRenderer.removeListener('avs:updater:event', wrapped);
    },
  },
  license: {
    startup: (): Promise<unknown> => ipcRenderer.invoke('avs:license:startup'),
    activate: (key: string, email: string, deviceName?: string): Promise<unknown> =>
      ipcRenderer.invoke('avs:license:activate', key, email, deviceName),
    validate: (): Promise<unknown> => ipcRenderer.invoke('avs:license:validate'),
    refresh: (): Promise<unknown> => ipcRenderer.invoke('avs:license:refresh'),
    deactivate: (): Promise<unknown> => ipcRenderer.invoke('avs:license:deactivate'),
    getStatus: (): Promise<unknown> => ipcRenderer.invoke('avs:license:getStatus'),
    isLicensed: (): Promise<boolean> => ipcRenderer.invoke('avs:license:isLicensed'),
    getInfo: (): Promise<unknown> => ipcRenderer.invoke('avs:license:getInfo'),
    checkUpdates: (channel?: string, architecture?: string): Promise<unknown> =>
      ipcRenderer.invoke('avs:license:checkUpdates', channel, architecture),
    downloadUpdate: (releaseId: number, destPath?: string): Promise<unknown> =>
      ipcRenderer.invoke('avs:license:downloadUpdate', releaseId, destPath),
    installUpdate: (filePath: string, silent?: boolean): Promise<unknown> =>
      ipcRenderer.invoke('avs:license:installUpdate', filePath, silent),
    exportDiagnostics: (): Promise<unknown> => ipcRenderer.invoke('avs:license:exportDiagnostics'),
    onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, ev: { type: string; payload: unknown }) => cb(ev);
      ipcRenderer.on('avs:license:event', wrapped);
      return () => ipcRenderer.removeListener('avs:license:event', wrapped);
    },
  },
} as const;

contextBridge.exposeInMainWorld('avs', api);

export type AvsPreloadApi = typeof api;
