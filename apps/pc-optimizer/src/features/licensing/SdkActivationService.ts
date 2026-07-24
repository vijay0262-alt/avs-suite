/**
 * SdkActivationService — concrete implementation of IActivationService
 * that delegates to the AVS License SDK via Electron IPC.
 *
 * This replaces the NullLicensingService placeholder with a real
 * implementation that talks to the license server through the SDK.
 *
 * Flow: React → IPC → Electron main → Python RPC → SDK → License Server
 */
import type { IActivationService, ActivationConfig } from '@avs/licensing';
import type { LicenseModel, ActivationResult, DeactivationResult, ValidationResult } from '@avs/licensing';

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

/**
 * Map SDK status strings to AVS Suite LicenseState.
 */
function mapStatus(sdkStatus: string): LicenseModel['state'] {
  const map: Record<string, LicenseModel['state']> = {
    active: 'annual',
    offline_grace: 'grace_period',
    expired: 'expired',
    suspended: 'revoked',
    invalid: 'invalid',
    validation_required: 'expired',
  };
  return map[sdkStatus] ?? 'free';
}

/**
 * Map SDK edition to AVS Suite edition.
 */
function mapEdition(sdkEdition: string): 'professional' | 'ultimate' {
  const lower = sdkEdition.toLowerCase();
  if (lower.includes('ultimate')) return 'ultimate';
  if (lower.includes('enterprise')) return 'ultimate';
  return 'professional';
}

/**
 * Convert SDK license info to the AVS Suite LicenseModel.
 */
function toLicenseModel(info: SdkLicenseInfo): LicenseModel {
  return {
    licenseId: info.device_fingerprint, // SDK uses fingerprint as identifier
    licenseKey: info.license_key,
    state: mapStatus(info.status),
    edition: mapEdition(info.edition),
    activationDate: info.last_refreshed ?? new Date().toISOString(),
    expiryDate: info.expiry,
    maxDevices: info.max_devices,
    activatedDevices: info.active_devices,
    email: info.email,
    deviceId: info.device_fingerprint,
    lastValidation: info.last_validated ?? new Date().toISOString(),
    graceExpiry: info.grace_expiry,
    formatVersion: 1,
  };
}

/**
 * SDK-backed activation service.
 *
 * Implements the IActivationService interface that the LicenseManager
 * in @avs/licensing expects. All operations go through Electron IPC
 * to the Python backend which uses the AVS License SDK.
 */
export class SdkActivationService implements IActivationService {
  private licenseApi: AvsLicenseApi;

  constructor(_config?: ActivationConfig) {
    this.licenseApi = window.avs.license;
  }

  async activate(key: string, deviceId: string, email: string): Promise<ActivationResult> {
    try {
      const result = await this.licenseApi.activate(key, email);
      if (result.success && result.license) {
        return {
          success: true,
          license: toLicenseModel(result.license),
        };
      }
      return {
        success: false,
        error: result.error ?? 'Activation failed',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Activation failed',
      };
    }
  }

  async deactivate(_licenseId: string, _deviceId: string): Promise<DeactivationResult> {
    try {
      const result = await this.licenseApi.deactivate();
      return { success: result.success, error: result.error };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Deactivation failed',
      };
    }
  }

  async validate(_license: LicenseModel): Promise<ValidationResult> {
    try {
      const status = await this.licenseApi.getStatus();
      if (!status) {
        return { valid: false, state: 'invalid', reason: 'No license data' };
      }
      const state = mapStatus(status.status);
      return {
        valid: state === 'annual' || state === 'lifetime' || state === 'monthly' || state === 'grace_period',
        state,
        reason: status.message,
        graceExpiry: status.grace_expiry,
      };
    } catch {
      return { valid: false, state: 'invalid', reason: 'Validation failed' };
    }
  }

  async refresh(license: LicenseModel): Promise<ValidationResult> {
    try {
      const result = await this.licenseApi.refresh();
      if (result.success && result.license) {
        const state = mapStatus(result.license.status);
        return {
          valid: state === 'annual' || state === 'lifetime' || state === 'monthly' || state === 'grace_period',
          state,
          graceExpiry: result.license.grace_expiry,
        };
      }
      // Fallback to local validation
      return this.validate(license);
    } catch {
      return this.validate(license);
    }
  }

  async getLicense(): Promise<LicenseModel | null> {
    try {
      const info = await this.licenseApi.getInfo();
      if (!info || info.status.status === 'invalid') return null;
      // Reconstruct LicenseModel from status info
      return {
        licenseId: info.fingerprint,
        licenseKey: '', // Not exposed in get_info for security
        state: mapStatus(info.status.status),
        edition: mapEdition(info.status.edition),
        activationDate: info.status.last_validated ?? new Date().toISOString(),
        expiryDate: info.status.expiry,
        maxDevices: 0,
        activatedDevices: 0,
        email: '',
        deviceId: info.fingerprint,
        lastValidation: info.status.last_validated ?? new Date().toISOString(),
        graceExpiry: info.status.grace_expiry,
        formatVersion: 1,
      };
    } catch {
      return null;
    }
  }

  async isOnline(): Promise<boolean> {
    try {
      const status = await this.licenseApi.getStatus();
      return status ? !status.is_offline : false;
    } catch {
      return false;
    }
  }
}
