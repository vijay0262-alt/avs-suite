/**
 * GracePeriodManager — manages the offline grace period lifecycle.
 *
 * When the application cannot reach the License Server, it continues
 * operating using the cached license. A configurable grace period
 * (default: 30 days) starts from the last successful server validation.
 *
 * During the grace period, all features remain available.
 * After the grace period expires, the application enters Limited Mode:
 *   - Premium-only features are disabled
 *   - Dashboard, Settings, Login, and License Refresh remain available
 *   - A clear notification explains why features are limited
 *
 * No immediate lockout — the user can still refresh the license
 * to restore full functionality.
 */

/** Default grace period: 30 days. */
export const DEFAULT_GRACE_PERIOD_DAYS = 30;

/** Minimum grace period: 1 day. */
export const MIN_GRACE_PERIOD_DAYS = 1;

/** Maximum grace period: 90 days. */
export const MAX_GRACE_PERIOD_DAYS = 90;

export type GracePeriodStatus =
  | 'active'       // Grace period is in effect, all features available
  | 'expired'      // Grace period has expired, Limited Mode
  | 'not_started'; // No last validation timestamp, grace not yet computed

export interface GracePeriodInfo {
  status: GracePeriodStatus;
  /** ISO timestamp of the last successful server validation. */
  lastValidation: string | null;
  /** ISO timestamp when the grace period expires. */
  graceExpiration: string | null;
  /** Days remaining in the grace period (0 if expired). */
  daysRemaining: number;
  /** Whether the application should be in Limited Mode. */
  limitedMode: boolean;
  /** Human-readable explanation of the current state. */
  message: string;
}

export class GracePeriodManager {
  private _gracePeriodDays: number;

  constructor(gracePeriodDays: number = DEFAULT_GRACE_PERIOD_DAYS) {
    this._gracePeriodDays = Math.max(
      MIN_GRACE_PERIOD_DAYS,
      Math.min(gracePeriodDays, MAX_GRACE_PERIOD_DAYS),
    );
  }

  /** Get the configured grace period in days. */
  getGracePeriodDays(): number {
    return this._gracePeriodDays;
  }

  /** Update the grace period (clamped to min/max). */
  setGracePeriodDays(days: number): void {
    this._gracePeriodDays = Math.max(
      MIN_GRACE_PERIOD_DAYS,
      Math.min(days, MAX_GRACE_PERIOD_DAYS),
    );
  }

  /**
   * Compute the grace period expiration timestamp from a validation timestamp.
   */
  computeGraceExpiration(lastValidation: string | null): string | null {
    if (!lastValidation) return null;
    try {
      const base = new Date(lastValidation).getTime();
      if (isNaN(base)) return null;
      const expiry = base + this._gracePeriodDays * 24 * 60 * 60 * 1000;
      return new Date(expiry).toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Evaluate the current grace period status.
   *
   * @param lastValidation - ISO timestamp of last successful server validation
   * @param graceExpiration - ISO timestamp of grace period expiration (from cache)
   * @returns GracePeriodInfo with status, days remaining, and message
   */
  evaluate(
    lastValidation: string | null,
    graceExpiration: string | null,
  ): GracePeriodInfo {
    // No validation timestamp — grace period hasn't started
    if (!lastValidation) {
      return {
        status: 'not_started',
        lastValidation: null,
        graceExpiration: null,
        daysRemaining: 0,
        limitedMode: false,
        message: 'No prior validation. License will be validated on next server connection.',
      };
    }

    // Use cached grace expiration, or recompute if missing
    const expiration = graceExpiration ?? this.computeGraceExpiration(lastValidation);
    if (!expiration) {
      return {
        status: 'not_started',
        lastValidation,
        graceExpiration: null,
        daysRemaining: 0,
        limitedMode: false,
        message: 'Unable to compute grace period. License will be validated on next server connection.',
      };
    }

    const now = Date.now();
    const expiryMs = new Date(expiration).getTime();
    const daysRemaining = Math.max(0, Math.ceil((expiryMs - now) / (24 * 60 * 60 * 1000)));

    if (now >= expiryMs) {
      return {
        status: 'expired',
        lastValidation,
        graceExpiration: expiration,
        daysRemaining: 0,
        limitedMode: true,
        message: `Grace period expired. Premium features are limited. Please connect to the internet and refresh your license to restore full functionality.`,
      };
    }

    return {
      status: 'active',
      lastValidation,
      graceExpiration: expiration,
      daysRemaining,
      limitedMode: false,
      message: `Offline mode active. ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining in grace period.`,
    };
  }

  /**
   * Check if a grace period expiration timestamp is still valid.
   */
  isGracePeriodValid(graceExpiration: string | null): boolean {
    if (!graceExpiration) return false;
    try {
      return Date.now() < new Date(graceExpiration).getTime();
    } catch {
      return false;
    }
  }

  /**
   * Get the number of days remaining until grace expires.
   */
  getDaysRemaining(graceExpiration: string | null): number {
    if (!graceExpiration) return 0;
    try {
      const ms = new Date(graceExpiration).getTime() - Date.now();
      return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
    } catch {
      return 0;
    }
  }
}

/** Singleton instance with default 30-day grace period. */
export const gracePeriodManager = new GracePeriodManager();
