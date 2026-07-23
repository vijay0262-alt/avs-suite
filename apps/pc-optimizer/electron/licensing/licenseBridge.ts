/**
 * License Bridge — calls Python RPC `license.*` methods via the existing
 * JSON-RPC child process. This is the ONLY way the Electron main process
 * interacts with the AVS License SDK.
 *
 * The renderer never calls REST APIs directly — only through this bridge
 * via IPC → Python → SDK → License Server.
 */
import type { RpcClient } from '../ipc/pythonBridge';

export interface LicenseStatus {
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

export interface LicenseInfo {
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

export interface UpdateCheckResult {
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

export interface LicenseInfoFull {
  status: LicenseStatus;
  days_remaining: number | null;
  remaining_devices: number;
  offline_status: string;
  server_url: string;
  fingerprint: string;
  sdk_version: string;
  product_code: string;
  app_version: string;
}

interface ErrorPayload {
  success: false;
  error: string;
  error_code: string;
}

function isError<T>(result: T | ErrorPayload): result is ErrorPayload {
  return (
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    (result as ErrorPayload).success === false
  );
}

function unwrap<T>(result: T | ErrorPayload): T {
  if (isError(result)) {
    throw new Error(`${result.error_code}: ${result.error}`);
  }
  return result;
}

export class LicenseBridge {
  constructor(private readonly rpc: RpcClient) {}

  async startup(): Promise<LicenseStatus> {
    return unwrap(await this.rpc.call<LicenseStatus | ErrorPayload>('license.startup'));
  }

  async activate(licenseKey: string, email: string, deviceName?: string): Promise<LicenseInfo> {
    const result = await this.rpc.call<{ success: true; license: LicenseInfo } | ErrorPayload>(
      'license.activate',
      { license_key: licenseKey, email, device_name: deviceName },
    );
    if (isError(result)) throw new Error(`${result.error_code}: ${result.error}`);
    return result.license;
  }

  async validate(): Promise<LicenseStatus> {
    return unwrap(await this.rpc.call<LicenseStatus | ErrorPayload>('license.validate'));
  }

  async refresh(): Promise<LicenseInfo> {
    const result = await this.rpc.call<{ success: true; license: LicenseInfo } | ErrorPayload>(
      'license.refresh',
    );
    if (isError(result)) throw new Error(`${result.error_code}: ${result.error}`);
    return result.license;
  }

  async deactivate(): Promise<boolean> {
    const result = await this.rpc.call<{ success: boolean } | ErrorPayload>('license.deactivate');
    if (isError(result)) return false;
    return result.success;
  }

  async getStatus(): Promise<LicenseStatus> {
    return unwrap(await this.rpc.call<LicenseStatus | ErrorPayload>('license.get_status'));
  }

  async isLicensed(): Promise<boolean> {
    const result = await this.rpc.call<{ licensed: boolean } | ErrorPayload>('license.is_licensed');
    if (isError(result)) return false;
    return result.licensed;
  }

  async daysRemaining(): Promise<number | null> {
    const result = await this.rpc.call<{ days_remaining: number | null } | ErrorPayload>(
      'license.days_remaining',
    );
    if (isError(result)) return null;
    return result.days_remaining;
  }

  async remainingDevices(): Promise<number> {
    const result = await this.rpc.call<{ remaining_devices: number } | ErrorPayload>(
      'license.remaining_devices',
    );
    if (isError(result)) return 0;
    return result.remaining_devices;
  }

  async offlineStatus(): Promise<string> {
    const result = await this.rpc.call<{ offline_status: string } | ErrorPayload>(
      'license.offline_status',
    );
    if (isError(result)) return 'No license found';
    return result.offline_status;
  }

  async getInfo(): Promise<LicenseInfoFull> {
    return unwrap(await this.rpc.call<LicenseInfoFull | ErrorPayload>('license.get_info'));
  }

  async checkUpdates(channel?: string, architecture?: string): Promise<UpdateCheckResult> {
    return unwrap(
      await this.rpc.call<UpdateCheckResult | ErrorPayload>('license.check_updates', {
        channel,
        architecture,
      }),
    );
  }

  async downloadUpdate(releaseId: number, destPath?: string): Promise<string> {
    const result = await this.rpc.call<{ success: true; file_path: string } | ErrorPayload>(
      'license.download_update',
      { release_id: releaseId, dest_path: destPath },
    );
    if (isError(result)) throw new Error(`${result.error_code}: ${result.error}`);
    return result.file_path;
  }

  async installUpdate(filePath: string, silent?: boolean): Promise<void> {
    const result = await this.rpc.call<{ success: boolean } | ErrorPayload>('license.install_update', {
      file_path: filePath,
      silent,
    });
    if (isError(result)) throw new Error(`${result.error_code}: ${result.error}`);
  }

  async close(): Promise<void> {
    await this.rpc.call('license.close');
  }
}
