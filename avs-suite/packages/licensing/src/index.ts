/**
 * @avs/licensing — public interfaces only.
 *
 * A working implementation (offline license file, online activation,
 * subscription renewal) is intentionally deferred. Any consumer must
 * depend on these interfaces, never on a concrete implementation.
 */
import type { Edition } from '@avs/shared/featureFlags';

export interface LicenseInfo {
  edition: Edition;
  activated: boolean;
  seats?: number;
  expiresAt?: string; // ISO-8601 UTC
  licenseeName?: string;
  licenseeEmail?: string;
}

export interface ILicensingService {
  /** Currently active edition, resolved from license file or fallback (`free`). */
  currentEdition(): Edition;
  /** True if a paid license (Pro/Enterprise/Trial) has been activated. */
  isActivated(): boolean;
  /** Read the full license record (redacted for UI display). */
  getLicense(): Promise<LicenseInfo>;
  /** Activate with a user-supplied key. */
  activate(key: string): Promise<LicenseInfo>;
  /** Deactivate and revert to Free. */
  deactivate(): Promise<void>;
  /** Force a background re-check against the license server. */
  refresh(): Promise<LicenseInfo>;
}

/**
 * Null-object implementation used until real licensing ships. Returns
 * `free` edition, no activation, and rejects activation attempts.
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
