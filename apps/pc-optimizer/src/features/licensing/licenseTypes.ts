/**
 * Shared types for the AVS License IPC API exposed by the preload script.
 *
 * All frontend modules that interact with the license SDK must use
 * these types instead of redeclaring `window.avs`.
 */

interface SdkLicenseInfo {
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
}

interface SdkLicenseStatus {
  status: string;
  edition: string;
  expiry: string | null;
  grace_expiry: string | null;
  days_remaining: number | null;
  remaining_devices: number;
  last_validated: string | null;
  is_offline: boolean;
  message: string;
}

interface SdkLicenseInfoFull {
  status: SdkLicenseStatus;
  days_remaining: number | null;
  remaining_devices: number;
  offline_status: string;
  server_url: string;
  fingerprint: string;
  sdk_version: string;
  product_code: string;
  app_version: string;
}

interface SdkUpdateCheckResult {
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
}

interface AvsLicenseApi {
  startup(): Promise<SdkLicenseStatus>;
  activate(key: string, email: string, deviceName?: string): Promise<{
    success: boolean;
    license?: SdkLicenseInfo;
    error?: string;
  }>;
  validate(): Promise<SdkLicenseStatus | null>;
  refresh(): Promise<{ success: boolean; license?: SdkLicenseInfo; error?: string }>;
  deactivate(): Promise<{ success: boolean; error?: string }>;
  getStatus(): Promise<SdkLicenseStatus | null>;
  isLicensed(): Promise<boolean>;
  getInfo(): Promise<SdkLicenseInfoFull | null>;
  checkUpdates(channel?: string, architecture?: string): Promise<SdkUpdateCheckResult | null>;
  downloadUpdate(releaseId: number, destPath?: string): Promise<{
    success: boolean;
    file_path?: string;
    error?: string;
  }>;
  installUpdate(filePath: string, silent?: boolean): Promise<{ success: boolean; error?: string }>;
  exportDiagnostics(): Promise<{ success: boolean; diagnostics?: SdkLicenseInfoFull; error?: string }>;
  onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void;
}

export type {
  SdkLicenseInfo,
  SdkLicenseStatus,
  SdkLicenseInfoFull,
  SdkUpdateCheckResult,
  AvsLicenseApi,
};
