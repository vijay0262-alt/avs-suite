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
    isAdmin(): Promise<boolean>;
    relaunchAsAdmin(): Promise<{ success: boolean }>;
  }

  interface AvsUpdaterApi {
    check(): Promise<void>;
    onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void;
  }

  interface AvsLicenseApi {
    startup(): Promise<{
      status: string;
      edition: string;
      expiry: string | null;
      grace_expiry: string | null;
      days_remaining: number | null;
      remaining_devices: number;
      last_validated: string | null;
      is_offline: boolean;
      message: string;
    }>;
    activate(key: string, email: string, deviceName?: string): Promise<{
      success: boolean;
      license?: {
        license_key: string;
        email: string;
        device_fingerprint: string;
        device_name: string | null;
        edition: string;
        status: string;
        expiry: string | null;
        grace_expiry: string | null;
        max_devices: number;
        active_devices: number;
        remaining_devices: number;
        last_validated: string | null;
        last_refreshed: string | null;
        activation_success: boolean;
        days_remaining: number | null;
      };
      error?: string;
    }>;
    validate(): Promise<{
      status: string;
      edition: string;
      expiry: string | null;
      grace_expiry: string | null;
      days_remaining: number | null;
      remaining_devices: number;
      last_validated: string | null;
      is_offline: boolean;
      message: string;
    } | null>;
    refresh(): Promise<{
      success: boolean;
      license?: {
        license_key: string;
        email: string;
        device_fingerprint: string;
        device_name: string | null;
        edition: string;
        status: string;
        expiry: string | null;
        grace_expiry: string | null;
        max_devices: number;
        active_devices: number;
        remaining_devices: number;
        last_validated: string | null;
        last_refreshed: string | null;
        activation_success: boolean;
        days_remaining: number | null;
      };
      error?: string;
    }>;
    deactivate(): Promise<{ success: boolean; error?: string }>;
    getStatus(): Promise<{
      status: string;
      edition: string;
      expiry: string | null;
      grace_expiry: string | null;
      days_remaining: number | null;
      remaining_devices: number;
      last_validated: string | null;
      is_offline: boolean;
      message: string;
    } | null>;
    isLicensed(): Promise<boolean>;
    getInfo(): Promise<{
      status: {
        status: string;
        edition: string;
        expiry: string | null;
        grace_expiry: string | null;
        days_remaining: number | null;
        remaining_devices: number;
        last_validated: string | null;
        is_offline: boolean;
        message: string;
      };
      days_remaining: number | null;
      remaining_devices: number;
      offline_status: string;
      server_url: string;
      fingerprint: string;
      sdk_version: string;
      product_code: string;
      app_version: string;
    } | null>;
    checkUpdates(channel?: string, architecture?: string): Promise<{
      product_found: boolean;
      product_name: string | null;
      update_available: boolean;
      force_upgrade: boolean;
      critical: boolean;
      latest_version: string | null;
      current_version: string | null;
      download_url: string | null;
      sha256: string | null;
      release_notes: string | null;
      file_size: number | null;
      channel: string | null;
      architecture: string | null;
      release_id: number | null;
    } | null>;
    downloadUpdate(releaseId: number, destPath?: string): Promise<{
      success: boolean;
      file_path?: string;
      error?: string;
    }>;
    installUpdate(filePath: string, silent?: boolean): Promise<{ success: boolean; error?: string }>;
    exportDiagnostics(): Promise<{ success: boolean; diagnostics?: unknown; error?: string }>;
    onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void;
  }

  interface Window {
    avs: {
      rpc: AvsRpcClient;
      app: AvsAppApi;
      updater: AvsUpdaterApi;
      license: AvsLicenseApi;
    };
  }
}
