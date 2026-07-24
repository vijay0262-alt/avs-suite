/**
 * License Model — the canonical license object.
 *
 * This is the data structure that gets persisted to encrypted storage
 * and passed around the licensing subsystem. It contains every field
 * needed for offline validation, grace period calculation, and UI display.
 */
import type { LicenseState } from './states';

/**
 * The complete license record.
 *
 * Sensitive fields (licenseKey) are stored encrypted and never
 * exposed in UI-facing contexts. Use LicenseView for display.
 */
export interface LicenseModel {
  /** Unique license identifier (UUID v4, server-assigned). */
  licenseId: string;

  /** User-supplied activation key (e.g., "XXXX-XXXX-XXXX-XXXX"). Stored encrypted. */
  licenseKey: string;

  /** Current state of the license. */
  state: LicenseState;

  /** Edition this license grants. */
  edition: 'professional' | 'ultimate';

  /** ISO-8601 UTC timestamp when the license was activated on this device. */
  activationDate: string;

  /** ISO-8601 UTC timestamp when the license expires. Null for lifetime. */
  expiryDate: string | null;

  /** Maximum number of devices allowed by this license. */
  maxDevices: number;

  /** Number of devices currently activated (server-reported). */
  activatedDevices: number;

  /** Licensee email address. */
  email: string;

  /** Anonymous device fingerprint of the activating device. */
  deviceId: string;

  /** ISO-8601 UTC timestamp of the last validation check. */
  lastValidation: string;

  /** ISO-8601 UTC timestamp when the grace period ends. Null if not in grace. */
  graceExpiry: string | null;

  /** Storage format version for migration support. */
  formatVersion: number;

  /** Trial start date (ISO-8601 UTC). Null if not a trial. */
  trialStartDate?: string | null;

  /** Trial duration in days. Null if not a trial. */
  trialDurationDays?: number | null;
}

/**
 * Current storage format version. Increment when the schema changes.
 * Migrations are handled by the storage layer.
 */
export const CURRENT_FORMAT_VERSION = 1;

/**
 * A redacted, UI-safe view of the license. No sensitive fields.
 */
export interface LicenseView {
  licenseId: string;
  state: LicenseState;
  edition: 'professional' | 'ultimate';
  activationDate: string;
  expiryDate: string | null;
  maxDevices: number;
  activatedDevices: number;
  email: string;
  deviceId: string;
  lastValidation: string;
  graceExpiry: string | null;
  /** True if the license key is present (but not the key itself). */
  hasKey: boolean;
  /** Trial start date if applicable. */
  trialStartDate?: string | null;
  /** Trial duration in days if applicable. */
  trialDurationDays?: number | null;
}

/**
 * Convert a LicenseModel to a UI-safe LicenseView (strips licenseKey).
 */
export function toLicenseView(model: LicenseModel): LicenseView {
  return {
    licenseId: model.licenseId,
    state: model.state,
    edition: model.edition,
    activationDate: model.activationDate,
    expiryDate: model.expiryDate,
    maxDevices: model.maxDevices,
    activatedDevices: model.activatedDevices,
    email: model.email,
    deviceId: model.deviceId,
    lastValidation: model.lastValidation,
    graceExpiry: model.graceExpiry,
    hasKey: Boolean(model.licenseKey),
    trialStartDate: model.trialStartDate ?? null,
    trialDurationDays: model.trialDurationDays ?? null,
  };
}

/**
 * Result of a license validation check.
 */
export interface ValidationResult {
  valid: boolean;
  state: LicenseState;
  /** Reason if invalid (for logging / UI messaging). */
  reason?: string;
  /** Updated grace expiry if the validation triggered a grace period. */
  graceExpiry?: string | null;
}

/**
 * Result of an activation attempt.
 */
export interface ActivationResult {
  success: boolean;
  license?: LicenseModel;
  error?: string;
}

/**
 * Result of a deactivation attempt.
 */
export interface DeactivationResult {
  success: boolean;
  error?: string;
}
