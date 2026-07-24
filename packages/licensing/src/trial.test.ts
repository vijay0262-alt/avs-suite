/**
 * Trial architecture tests.
 */
import { describe, expect, it } from 'vitest';
import { getTrialInfo, isActiveTrial, isExpiredTrial, DEFAULT_TRIAL_DURATION_DAYS } from './trial';
import type { LicenseModel } from './model';

function makeTrialLicense(overrides: Partial<LicenseModel> = {}): LicenseModel {
  return {
    licenseId: 'test-id',
    licenseKey: 'TEST-KEY',
    state: 'trial',
    edition: 'professional',
    activationDate: new Date().toISOString(),
    expiryDate: null,
    maxDevices: 1,
    activatedDevices: 1,
    email: 'test@example.com',
    deviceId: 'device-1',
    lastValidation: new Date().toISOString(),
    graceExpiry: null,
    formatVersion: 1,
    ...overrides,
  };
}

describe('Trial Architecture', () => {
  describe('getTrialInfo', () => {
    it('returns non-trial info for null license', () => {
      const info = getTrialInfo(null);
      expect(info.isTrial).toBe(false);
      expect(info.startDate).toBeNull();
      expect(info.daysRemaining).toBeNull();
    });

    it('returns non-trial info for non-trial license', () => {
      const license = makeTrialLicense({ state: 'annual' });
      const info = getTrialInfo(license);
      expect(info.isTrial).toBe(false);
    });

    it('returns trial info for active trial', () => {
      const start = new Date();
      start.setDate(start.getDate() - 3);
      const license = makeTrialLicense({
        trialStartDate: start.toISOString(),
        trialDurationDays: 14,
      });
      const info = getTrialInfo(license);
      expect(info.isTrial).toBe(true);
      expect(info.durationDays).toBe(14);
      expect(info.daysRemaining).toBe(11);
      expect(info.isExpired).toBe(false);
    });

    it('returns expired trial info', () => {
      const start = new Date();
      start.setDate(start.getDate() - 20);
      const license = makeTrialLicense({
        trialStartDate: start.toISOString(),
        trialDurationDays: 14,
      });
      const info = getTrialInfo(license);
      expect(info.isTrial).toBe(true);
      expect(info.daysRemaining).toBe(0);
      expect(info.isExpired).toBe(true);
    });

    it('uses DEFAULT_TRIAL_DURATION_DAYS when not specified', () => {
      const start = new Date();
      start.setDate(start.getDate() - 1);
      const license = makeTrialLicense({
        trialStartDate: start.toISOString(),
      });
      const info = getTrialInfo(license);
      expect(info.durationDays).toBe(DEFAULT_TRIAL_DURATION_DAYS);
      expect(info.daysRemaining).toBe(DEFAULT_TRIAL_DURATION_DAYS - 1);
    });
  });

  describe('isActiveTrial', () => {
    it('returns true for active trial', () => {
      const start = new Date();
      start.setDate(start.getDate() - 5);
      const license = makeTrialLicense({ trialStartDate: start.toISOString() });
      expect(isActiveTrial(license)).toBe(true);
    });

    it('returns false for expired trial', () => {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const license = makeTrialLicense({ trialStartDate: start.toISOString() });
      expect(isActiveTrial(license)).toBe(false);
    });

    it('returns false for non-trial license', () => {
      const license = makeTrialLicense({ state: 'annual' });
      expect(isActiveTrial(license)).toBe(false);
    });
  });

  describe('isExpiredTrial', () => {
    it('returns true for expired trial', () => {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const license = makeTrialLicense({ trialStartDate: start.toISOString() });
      expect(isExpiredTrial(license)).toBe(true);
    });

    it('returns false for active trial', () => {
      const start = new Date();
      start.setDate(start.getDate() - 5);
      const license = makeTrialLicense({ trialStartDate: start.toISOString() });
      expect(isExpiredTrial(license)).toBe(false);
    });
  });
});
