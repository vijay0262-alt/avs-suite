/**
 * Trial license architecture — types and helpers for future trial support.
 *
 * No UI is required yet. This module provides the architecture so that
 * trial licenses can be activated, tracked, and expired in the future.
 *
 * Trial states:
 *   - Trial Started: trialStartDate is set, days remaining > 0
 *   - Trial Remaining: days remaining > 0
 *   - Trial Expired: days remaining <= 0
 */
import type { LicenseModel } from './model';

/**
 * Trial information derived from a LicenseModel.
 */
export interface TrialInfo {
  /** Whether this license is a trial. */
  isTrial: boolean;
  /** Trial start date (ISO-8601 UTC). */
  startDate: string | null;
  /** Trial duration in days. */
  durationDays: number | null;
  /** Days remaining in the trial (0 if expired). */
  daysRemaining: number | null;
  /** Whether the trial has expired. */
  isExpired: boolean;
}

/**
 * Default trial duration in days.
 */
export const DEFAULT_TRIAL_DURATION_DAYS = 14;

/**
 * Derive trial info from a LicenseModel.
 * Returns a non-trial TrialInfo if the license is not a trial.
 */
export function getTrialInfo(license: LicenseModel | null, now: Date = new Date()): TrialInfo {
  if (!license || license.state !== 'trial') {
    return {
      isTrial: false,
      startDate: null,
      durationDays: null,
      daysRemaining: null,
      isExpired: false,
    };
  }

  const startDate = license.trialStartDate ?? license.activationDate;
  const durationDays = license.trialDurationDays ?? DEFAULT_TRIAL_DURATION_DAYS;

  if (!startDate) {
    return {
      isTrial: true,
      startDate: null,
      durationDays,
      daysRemaining: null,
      isExpired: true,
    };
  }

  const startMs = new Date(startDate).getTime();
  const elapsedMs = now.getTime() - startMs;
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, durationDays - elapsedDays);

  return {
    isTrial: true,
    startDate,
    durationDays,
    daysRemaining,
    isExpired: daysRemaining <= 0,
  };
}

/**
 * Check if a license is an active (non-expired) trial.
 */
export function isActiveTrial(license: LicenseModel | null, now: Date = new Date()): boolean {
  const info = getTrialInfo(license, now);
  return info.isTrial && !info.isExpired;
}

/**
 * Check if a license is an expired trial.
 */
export function isExpiredTrial(license: LicenseModel | null, now: Date = new Date()): boolean {
  const info = getTrialInfo(license, now);
  return info.isTrial && info.isExpired;
}
