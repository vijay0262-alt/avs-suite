/**
 * OfflineLicenseValidator — validates cached licenses for offline use.
 *
 * Extends the base licenseValidator with grace period checks:
 *   1. Signature verification (delegates to base validator)
 *   2. Status check (ACTIVE)
 *   3. Expiration check (not past expires_at)
 *   4. Grace period check (within grace period from last validation)
 *
 * If the license itself is valid but the grace period has expired,
 * the validator returns a GRACE_EXPIRED result so the application
 * can enter Limited Mode.
 *
 * If the license is invalid (bad signature, revoked, expired),
 * the cache must be discarded — no grace period can save it.
 */
import type { StoredLicense } from './licenseStorage';
import { validateLicense, type ValidationCode } from './licenseValidator';
import { gracePeriodManager, type GracePeriodInfo } from './gracePeriodManager';

export type OfflineValidationCode = ValidationCode | 'GRACE_EXPIRED';

export interface OfflineValidationResult {
  valid: boolean;
  code: OfflineValidationCode;
  message: string;
  /** Grace period info if the license is valid but grace may be expired. */
  gracePeriod: GracePeriodInfo | null;
}

/**
 * Validate a cached license for offline use.
 *
 * Flow:
 *   1. Run standard license validation (signature, status, expiration)
 *   2. If license is valid → check grace period
 *   3. If grace period active → return VALID with grace info
 *   4. If grace period expired → return GRACE_EXPIRED with limited mode
 *   5. If license invalid → return the error (cache should be discarded)
 */
export async function validateOfflineLicense(
  license: StoredLicense | null,
): Promise<OfflineValidationResult> {
  // Step 1: Standard license validation
  const baseResult = await validateLicense(license);

  if (!baseResult.valid) {
    return {
      ...baseResult,
      gracePeriod: null,
    };
  }

  // Step 2: Check grace period
  const graceInfo = gracePeriodManager.evaluate(
    license!.last_successful_validation,
    license!.grace_period_expiration,
  );

  if (graceInfo.limitedMode) {
    return {
      valid: false,
      code: 'GRACE_EXPIRED' as OfflineValidationCode,
      message: graceInfo.message,
      gracePeriod: graceInfo,
    };
  }

  // License is valid and grace period is active (or not started — online)
  return {
    valid: true,
    code: 'VALID',
    message: graceInfo.status === 'active'
      ? `${baseResult.message} ${graceInfo.message}`
      : baseResult.message,
    gracePeriod: graceInfo,
  };
}

/**
 * Quick check: is the cached license usable in offline mode?
 *
 * Returns true only if:
 *   - License passes standard validation
 *   - Grace period is active or not yet started
 */
export async function isOfflineUsable(license: StoredLicense | null): Promise<boolean> {
  const result = await validateOfflineLicense(license);
  return result.valid;
}

/**
 * Check if the application should be in Limited Mode.
 *
 * Limited Mode is triggered when:
 *   - The license is valid but grace period has expired
 *   - There is no cached license at all
 */
export async function shouldEnterLimitedMode(license: StoredLicense | null): Promise<boolean> {
  if (!license) return true;
  const result = await validateOfflineLicense(license);
  return (result.code as string) === 'GRACE_EXPIRED';
}
