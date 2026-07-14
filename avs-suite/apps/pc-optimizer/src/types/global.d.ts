/**
 * Global typings for the `window.avs` API injected by the Electron
 * preload script (`electron/preload/preload.ts`). Kept in a `.d.ts` so
 * both renderer code and unit tests can reference it without pulling in
 * Electron's types.
 */
export {};

declare global {
  interface AvsRpcClient {
    call<T>(method: string, params?: unknown): Promise<T>;
    subscribe(channel: string, listener: (payload: unknown) => void): () => void;
  }

  interface AvsAppApi {
    getVersion(): Promise<string>;
    getPlatform(): Promise<string>;
    openExternal(url: string): Promise<void>;
  }

  interface AvsUpdaterApi {
    check(): Promise<void>;
    onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void;
  }

  interface Window {
    avs?: {
      rpc: AvsRpcClient;
      app: AvsAppApi;
      updater: AvsUpdaterApi;
    };
  }
}
