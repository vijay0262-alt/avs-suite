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
  },
  updater: {
    check: (): Promise<void> => ipcRenderer.invoke('avs:updater:check'),
    onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void {
      const wrapped = (_e: Electron.IpcRendererEvent, ev: { type: string; payload: unknown }) => cb(ev);
      ipcRenderer.on('avs:updater:event', wrapped);
      return () => ipcRenderer.removeListener('avs:updater:event', wrapped);
    },
  },
} as const;

contextBridge.exposeInMainWorld('avs', api);

export type AvsPreloadApi = typeof api;
