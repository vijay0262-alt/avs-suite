/**
 * Offline mode tests — validates offline license validation,
 * grace period calculation, and state transitions.
 */
import {
  validateOffline,
  calculateGraceExpiry,
  shouldEnterGrace,
  hasGraceEnded,
  canStartOffline,
  getOfflineState,
  DEFAULT_OFFLINE_CONFIG,
} from '../offline';
import type { LicenseModel } from '../model';
import { CURRENT_FORMAT_VERSION } from '../model';

function makeLicense(overrides: Partial<LicenseModel> = {}): LicenseModel {
  return {
    licenseId: 'test-001',
    licenseKey: 'TEST-KEY-0001',
    state: 'annual',
    edition: 'pro',
    activationDate: '2026-01-01T00:00:00.000Z',
    expiryDate: '2027-01-01T00:00:00.000Z',
    maxDevices: 3,
    activatedDevices: 1,
    email: 'test@example.com',
    deviceId: 'a'.repeat(64),
    lastValidation: '2026-07-23T00:00:00.000Z',
    graceExpiry: null,
    formatVersion: CURRENT_FORMAT_VERSION,
    ...overrides,
  };
}

describe('Offline Mode', () => {
  describe('validateOffline', () => {
    it('validates a free license as valid', () => {
      const license = makeLicense({ state: 'free', edition: 'pro', expiryDate: null });
      const result = validateOffline(license);
      expect(result.valid).toBe(true);
      expect(result.state).toBe('free');
    });

    it('validates an active annual license within expiry', () => {
      const license = makeLicense({ state: 'annual' });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2026-06-01'));
      expect(result.valid).toBe(true);
      expect(result.state).toBe('annual');
    });

    it('validates a lifetime license with no expiry', () => {
      const license = makeLicense({ state: 'lifetime', expiryDate: null });
      const result = validateOffline(license);
      expect(result.valid).toBe(true);
      expect(result.state).toBe('lifetime');
    });

    it('rejects a lifetime license with an expiry date', () => {
      const license = makeLicense({ state: 'lifetime', expiryDate: '2027-01-01T00:00:00.000Z' });
      const result = validateOffline(license);
      expect(result.valid).toBe(false);
      expect(result.state).toBe('invalid');
    });

    it('returns expired for a license past expiry with no grace', () => {
      const license = makeLicense({ state: 'annual', graceExpiry: null });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2027-06-01'));
      expect(result.valid).toBe(false);
      expect(result.state).toBe('expired');
    });

    it('returns grace_period for a license past expiry but within grace', () => {
      const license = makeLicense({
        state: 'annual',
        graceExpiry: '2027-02-01T00:00:00.000Z',
      });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2027-01-15'));
      expect(result.valid).toBe(true);
      expect(result.state).toBe('grace_period');
    });

    it('returns expired when grace period has also ended', () => {
      const license = makeLicense({
        state: 'annual',
        graceExpiry: '2027-01-15T00:00:00.000Z',
      });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2027-02-01'));
      expect(result.valid).toBe(false);
      expect(result.state).toBe('expired');
    });

    it('returns invalid for an invalid license', () => {
      const license = makeLicense({ state: 'invalid' });
      const result = validateOffline(license);
      expect(result.valid).toBe(false);
      expect(result.state).toBe('invalid');
    });

    it('returns revoked for a revoked license', () => {
      const license = makeLicense({ state: 'revoked' });
      const result = validateOffline(license);
      expect(result.valid).toBe(false);
      expect(result.state).toBe('revoked');
    });
  });

  describe('calculateGraceExpiry', () => {
    it('calculates grace expiry as expiry + gracePeriodDays', () => {
      const expiry = '2027-01-01T00:00:00.000Z';
      const grace = calculateGraceExpiry(expiry);
      const expected = new Date('2027-01-31T00:00:00.000Z'); // 30 days
      expect(new Date(grace).toISOString()).toBe(expected.toISOString());
    });
  });

  describe('shouldEnterGrace', () => {
    it('returns true when license has expired and is not in grace', () => {
      const license = makeLicense({ state: 'annual', expiryDate: '2026-06-01T00:00:00.000Z' });
      expect(shouldEnterGrace(license, new Date('2026-07-01'))).toBe(true);
    });

    it('returns false when license has not expired', () => {
      const license = makeLicense({ state: 'annual', expiryDate: '2027-01-01T00:00:00.000Z' });
      expect(shouldEnterGrace(license, new Date('2026-07-01'))).toBe(false);
    });

    it('returns false when already in grace period', () => {
      const license = makeLicense({ state: 'grace_period', expiryDate: '2026-06-01T00:00:00.000Z' });
      expect(shouldEnterGrace(license, new Date('2026-07-01'))).toBe(false);
    });

    it('returns false for free state', () => {
      const license = makeLicense({ state: 'free', expiryDate: null });
      expect(shouldEnterGrace(license)).toBe(false);
    });
  });

  describe('hasGraceEnded', () => {
    it('returns true when grace expiry has passed', () => {
      const license = makeLicense({ state: 'grace_period', graceExpiry: '2026-06-01T00:00:00.000Z' });
      expect(hasGraceEnded(license, new Date('2026-07-01'))).toBe(true);
    });

    it('returns false when grace expiry is in the future', () => {
      const license = makeLicense({ state: 'grace_period', graceExpiry: '2027-01-01T00:00:00.000Z' });
      expect(hasGraceEnded(license, new Date('2026-07-01'))).toBe(false);
    });

    it('returns true when in grace but no graceExpiry set', () => {
      const license = makeLicense({ state: 'grace_period', graceExpiry: null });
      expect(hasGraceEnded(license)).toBe(true);
    });

    it('returns false when not in grace period', () => {
      const license = makeLicense({ state: 'annual', graceExpiry: null });
      expect(hasGraceEnded(license)).toBe(false);
    });
  });

  describe('canStartOffline', () => {
    it('always returns true', () => {
      expect(canStartOffline(null)).toBe(true);
      expect(canStartOffline(makeLicense())).toBe(true);
    });
  });

  describe('getOfflineState', () => {
    it('returns free when no license is stored', () => {
      expect(getOfflineState(null)).toBe('free');
    });

    it('returns the validated state for a stored license', () => {
      const license = makeLicense({ state: 'annual' });
      expect(getOfflineState(license, DEFAULT_OFFLINE_CONFIG, new Date('2026-07-01'))).toBe('annual');
    });

    it('returns expired for a past-due license', () => {
      const license = makeLicense({ state: 'annual', expiryDate: '2026-01-01T00:00:00.000Z' });
      expect(getOfflineState(license, DEFAULT_OFFLINE_CONFIG, new Date('2026-07-01'))).toBe('expired');
    });
  });
});
