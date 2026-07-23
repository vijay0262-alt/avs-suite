/**
 * Legacy licensing types — preserved for backward compatibility.
 *
 * These were the original interfaces in @avs/licensing before the
 * commercial licensing foundation was built. New code should use
 * the new types (LicenseModel, ILicenseManager, IActivationService).
 *
 * The EditionManager in the frontend still imports ILicensingService
 * and NullLicensingService from here via the barrel re-export.
 */
import type { Edition } from '@avs/shared/featureFlags';

export interface LicenseInfo {
  edition: Edition;
  activated: boolean;
  seats?: number;
  expiresAt?: string;
  licenseeName?: string;
  licenseeEmail?: string;
}

export interface ILicensingService {
  currentEdition(): Edition;
  isActivated(): boolean;
  getLicense(): Promise<LicenseInfo>;
  activate(key: string): Promise<LicenseInfo>;
  deactivate(): Promise<void>;
  refresh(): Promise<LicenseInfo>;
}

/**
 * Null-object implementation. This is NOT a mock — it's a legitimate
 * null-object pattern that returns 'free' edition when no licensing
 * infrastructure is configured. It will be replaced by a real
 * LicenseManager adapter when the license server is built.
 */
export class NullLicensingService implements ILicensingService {
  currentEdition(): Edition {
    return 'free';
  }
  isActivated(): boolean {
    return false;
  }
  async getLicense(): Promise<LicenseInfo> {
    return { edition: 'free', activated: false };
  }
  async activate(_key: string): Promise<LicenseInfo> {
    throw new Error('Licensing is not yet available in this build.');
  }
  async deactivate(): Promise<void> {
    /* no-op */
  }
  async refresh(): Promise<LicenseInfo> {
    return this.getLicense();
  }
}
