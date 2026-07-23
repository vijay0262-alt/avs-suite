/**
 * Activation Service — interfaces only.
 *
 * Per the user's directive: NO mock/fake implementations.
 * Clean interfaces are defined here. The concrete implementation
 * will be provided when the real license server is built.
 *
 * The desktop app depends on these interfaces, never on a concrete
 * implementation. At bootstrap, the Electron main process will
 * bind a real or null implementation.
 */
import type { LicenseModel } from './model';
import type { ActivationResult, DeactivationResult, ValidationResult } from './model';
import type { LicenseState } from './states';

/**
 * Activation service — handles license lifecycle operations.
 *
 * This is the primary interface the LicenseManager delegates to.
 * In offline mode, a local implementation handles validation using
 * cached data. In online mode (future), a remote implementation
 * contacts the license server.
 */
export interface IActivationService {
  /**
   * Activate a license with a user-supplied key.
   * In offline mode, this is not available (returns error).
   * In online mode (future), this contacts the server.
   */
  activate(key: string, deviceId: string, email: string): Promise<ActivationResult>;

  /**
   * Deactivate the current license on this device.
   * Frees up a device seat on the server (future).
   */
  deactivate(licenseId: string, deviceId: string): Promise<DeactivationResult>;

  /**
   * Validate the current license locally.
   * Checks expiry, state, grace period, and integrity.
   * Does NOT contact a server.
   */
  validate(license: LicenseModel): Promise<ValidationResult>;

  /**
   * Refresh the license from the server.
   * In offline mode, this is a no-op (returns current license).
   * In online mode (future), this contacts the server for updates.
   */
  refresh(license: LicenseModel): Promise<ValidationResult>;

  /**
   * Get the current license from local storage.
   * Returns null if no license is stored.
   */
  getLicense(): Promise<LicenseModel | null>;

  /**
   * Check if the activation service is online (can reach server).
   * Always returns false in offline mode.
   */
  isOnline(): Promise<boolean>;
}

/**
 * Configuration for the activation service.
 */
export interface ActivationConfig {
  /** License server API URL (future, not used in offline mode). */
  serverUrl?: string;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
  /** Maximum retry attempts for network operations. */
  maxRetries: number;
  /** Grace period duration in days. */
  gracePeriodDays: number;
  /** Trial duration in days. */
  trialDurationDays: number;
}

/**
 * Default configuration values. The serverUrl is intentionally
 * undefined — no server connection until configured.
 */
export const DEFAULT_ACTIVATION_CONFIG: ActivationConfig = {
  serverUrl: undefined,
  timeoutMs: 10000,
  maxRetries: 3,
  gracePeriodDays: 30,
  trialDurationDays: 30,
};

/**
 * Reasons for activation failure (for UI display).
 */
export const ACTIVATION_ERROR_REASONS = {
  INVALID_KEY: 'The license key is invalid or malformed.',
  KEY_IN_USE: 'This license key has reached its maximum device limit.',
  KEY_EXPIRED: 'This license key has expired.',
  KEY_REVOKED: 'This license key has been revoked.',
  NETWORK_ERROR: 'Unable to connect to the license server. Please try again later.',
  OFFLINE: 'Activation requires an internet connection.',
  DEVICE_MISMATCH: 'This license is not valid for this device.',
  UNKNOWN: 'An unexpected error occurred during activation.',
} as const;
