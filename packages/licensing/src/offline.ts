/**
 * Offline Mode — local license validation and grace period management.
 *
 * The application must never refuse to start because the server
 * is unreachable. This module provides the logic for:
 * - Offline startup with cached license
 * - Grace period calculation and enforcement
 * - Local validation (expiry, state, integrity)
 * - Future online validation hook
 */
import type { LicenseModel, ValidationResult } from './model';
import type { LicenseState } from './states';
import { isActiveState, isErrorState } from './states';

/**
 * Offline validation configuration.
 */
export interface OfflineConfig {
  /** Grace period in days after expiry before reverting to Free. */
  gracePeriodDays: number;
  /** Trial duration in days. */
  trialDurationDays: number;
  /** Whether to allow trial activation offline. */
  allowOfflineTrial: boolean;
}

export const DEFAULT_OFFLINE_CONFIG: OfflineConfig = {
  gracePeriodDays: 30,
  trialDurationDays: 30,
  allowOfflineTrial: false,
};

/**
 * Validate a license locally without contacting any server.
 *
 * Checks:
 * 1. License state is not invalid/revoked
 * 2. Expiry date has not passed (or grace period applies)
 * 3. Integrity of the license data
 *
 * Returns a ValidationResult with the effective state.
 */
export function validateOffline(
  license: LicenseModel,
  config: OfflineConfig = DEFAULT_OFFLINE_CONFIG,
  now: Date = new Date(),
): ValidationResult {
  // If already invalid or revoked, stay that way
  if (license.state === 'invalid') {
    return { valid: false, state: 'invalid', reason: 'License is marked as invalid.' };
  }
  if (license.state === 'revoked') {
    return { valid: false, state: 'revoked', reason: 'License has been revoked.' };
  }

  // Free state is always valid
  if (license.state === 'free') {
    return { valid: true, state: 'free' };
  }

  // Lifetime licenses never expire
  if (license.state === 'lifetime') {
    if (license.expiryDate !== null) {
      return { valid: false, state: 'invalid', reason: 'Lifetime license should not have an expiry date.' };
    }
    return { valid: true, state: 'lifetime' };
  }

  // Check expiry for time-limited licenses (trial, monthly, annual)
  if (license.expiryDate) {
    const expiry = new Date(license.expiryDate);
    if (now > expiry) {
      // Check if we're within grace period
      const graceExpiry = license.graceExpiry ? new Date(license.graceExpiry) : null;
      if (graceExpiry && now <= graceExpiry) {
        return {
          valid: true,
          state: 'grace_period',
          reason: `License expired on ${license.expiryDate}. Grace period ends on ${license.graceExpiry}.`,
          graceExpiry: license.graceExpiry,
        };
      }

      // Grace period has also expired — revert to free
      return {
        valid: false,
        state: 'expired',
        reason: `License expired on ${license.expiryDate}.`,
      };
    }
  }

  // License is active and within validity period
  if (isActiveState(license.state)) {
    return { valid: true, state: license.state };
  }

  // Unknown state — treat as invalid
  return { valid: false, state: 'invalid', reason: `Unknown license state: ${license.state}` };
}

/**
 * Calculate the grace period expiry date for a newly expired license.
 *
 * @param expiryDate - The original expiry date of the license
 * @param config - Offline configuration with gracePeriodDays
 * @returns ISO-8601 UTC string for when the grace period ends
 */
export function calculateGraceExpiry(
  expiryDate: string,
  config: OfflineConfig = DEFAULT_OFFLINE_CONFIG,
): string {
  const expiry = new Date(expiryDate);
  const graceEnd = new Date(expiry.getTime() + config.gracePeriodDays * 24 * 60 * 60 * 1000);
  return graceEnd.toISOString();
}

/**
 * Check if a license should enter grace period.
 *
 * A license enters grace period when:
 * - It has expired (expiryDate < now)
 * - It is not already in grace period
 * - It has no graceExpiry set, or graceExpiry is in the future
 */
export function shouldEnterGrace(
  license: LicenseModel,
  now: Date = new Date(),
): boolean {
  if (!license.expiryDate) return false;
  if (license.state === 'grace_period') return false;
  if (license.state === 'free') return false;
  if (isErrorState(license.state)) return false;

  const expiry = new Date(license.expiryDate);
  return now > expiry;
}

/**
 * Check if a grace period has ended.
 */
export function hasGraceEnded(
  license: LicenseModel,
  now: Date = new Date(),
): boolean {
  if (license.state !== 'grace_period') return false;
  if (!license.graceExpiry) return true; // No grace expiry set — end immediately
  return now > new Date(license.graceExpiry);
}

/**
 * Determine if the application should start in offline mode.
 * Always returns true — the application must never refuse to start.
 */
export function canStartOffline(_license: LicenseModel | null): boolean {
  return true;
}

/**
 * Get the effective license state for offline startup.
 * If no license is stored, returns 'free'.
 * If a license is stored, validates it offline.
 */
export function getOfflineState(
  license: LicenseModel | null,
  config: OfflineConfig = DEFAULT_OFFLINE_CONFIG,
  now: Date = new Date(),
): LicenseState {
  if (!license) return 'free';
  const result = validateOffline(license, config, now);
  return result.state;
}
