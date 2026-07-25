/**
 * LicenseCacheService — manages the secure offline license cache.
 *
 * Responsibilities:
 *   - Save license to encrypted local storage
 *   - Load license from encrypted local storage
 *   - Delete (clear) the cached license
 *   - Validate cache integrity (structure, fields, signature)
 *   - Refresh cache from server and update grace period
 *
 * This service wraps the existing licenseStorage and licenseValidator
 * with additional integrity checks and grace period management.
 *
 * No UI component should call this directly — use the license store.
 */
import { licenseStorage, type StoredLicense } from './licenseStorage';
import { isLicenseStructurallyValid } from './licenseValidator';
import { validateOfflineLicense, type OfflineValidationResult } from './offlineLicenseValidator';
import { gracePeriodManager } from './gracePeriodManager';

export type CacheStatus =
  | 'empty'          // No cached license
  | 'valid'          // Cached license is valid and within grace period
  | 'expired'        // Cached license valid but grace period expired
  | 'corrupted'      // Cache data is corrupted or tampered
  | 'invalid';       // License data present but fails validation

export interface CacheIntegrityResult {
  status: CacheStatus;
  license: StoredLicense | null;
  validation: OfflineValidationResult | null;
  message: string;
}

/** Current cache format version. */
export const CURRENT_CACHE_VERSION = 2;

/** Current product version. */
export const CURRENT_PRODUCT_VERSION = '1.0.0';

export const licenseCacheService = {
  /**
   * Save a license to the encrypted cache.
   * Updates grace period and validation timestamps.
   */
  save(license: StoredLicense): void {
    const now = new Date().toISOString();
    const graceExpiration = gracePeriodManager.computeGraceExpiration(now);
    const enriched: StoredLicense = {
      ...license,
      last_refreshed: now,
      last_successful_validation: now,
      grace_period_expiration: graceExpiration,
      product_version: CURRENT_PRODUCT_VERSION,
      cache_version: CURRENT_CACHE_VERSION,
    };
    licenseStorage.save(enriched);
  },

  /**
   * Load the cached license.
   * Returns null if no cache exists or cache is corrupted.
   */
  load(): StoredLicense | null {
    return licenseStorage.load();
  },

  /**
   * Delete the cached license.
   */
  delete(): void {
    licenseStorage.clear();
  },

  /**
   * Check if a cached license exists.
   */
  exists(): boolean {
    return licenseStorage.exists();
  },

  /**
   * Validate the integrity of the cached license.
   *
   * Checks:
   *   1. Cache exists
   *   2. Structural validity (all required fields present)
   *   3. Cache version compatibility
   *   4. Signature, status, expiration (via offline validator)
   *   5. Grace period status
   *
   * Returns a CacheIntegrityResult with status and validation details.
   */
  async validateIntegrity(): Promise<CacheIntegrityResult> {
    const cached = licenseStorage.load();

    if (!cached) {
      // Distinguish between "no cache" and "corrupted cache"
      if (licenseStorage.hasRawData()) {
        // Raw data exists but couldn't be parsed — corrupted
        licenseStorage.clear();
        return {
          status: 'corrupted',
          license: null,
          validation: null,
          message: 'Cached license data is corrupted or unreadable. Cache has been cleared.',
        };
      }
      return {
        status: 'empty',
        license: null,
        validation: null,
        message: 'No cached license found.',
      };
    }

    // Check structural validity
    if (!isLicenseStructurallyValid(cached)) {
      // Corrupted cache — discard it
      licenseStorage.clear();
      return {
        status: 'corrupted',
        license: null,
        validation: null,
        message: 'Cached license is corrupted or has missing fields. Cache has been cleared.',
      };
    }

    // Check for missing required M4.4 fields (cache_version < 2 = old format)
    if (!cached.cache_version || cached.cache_version < 1) {
      licenseStorage.clear();
      return {
        status: 'corrupted',
        license: null,
        validation: null,
        message: 'Cache version is invalid. Cache has been cleared.',
      };
    }

    // Full offline validation (signature, status, expiration, grace period)
    const validation = await validateOfflineLicense(cached);

    if ((validation.code as string) === 'GRACE_EXPIRED') {
      return {
        status: 'expired',
        license: cached,
        validation,
        message: validation.message,
      };
    }

    if (!validation.valid) {
      // License is invalid (bad signature, revoked, expired) — discard cache
      licenseStorage.clear();
      return {
        status: 'invalid',
        license: null,
        validation,
        message: `Cached license is invalid: ${validation.message}. Cache has been cleared.`,
      };
    }

    return {
      status: 'valid',
      license: cached,
      validation,
      message: 'Cached license is valid.',
    };
  },

  /**
   * Update the grace period and validation timestamp on an existing cache entry.
   * Called after a successful server validation.
   */
  updateValidationTimestamp(license: StoredLicense): void {
    const now = new Date().toISOString();
    const graceExpiration = gracePeriodManager.computeGraceExpiration(now);
    const updated: StoredLicense = {
      ...license,
      last_successful_validation: now,
      grace_period_expiration: graceExpiration,
      last_refreshed: now,
    };
    licenseStorage.save(updated);
  },

  /**
   * Get the current grace period info from the cached license.
   */
  getGracePeriodInfo() {
    const cached = licenseStorage.load();
    if (!cached) return null;
    return gracePeriodManager.evaluate(
      cached.last_successful_validation,
      cached.grace_period_expiration,
    );
  },
};
