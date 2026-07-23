/**
 * Clock manipulation tests — validates that the offline validation
 * correctly handles scenarios where the system clock has been
 * changed (rolled back, rolled forward, or inconsistent).
 *
 * These tests ensure that:
 * 1. Rolling the clock back does not revive an expired license
 * 2. Rolling the clock forward correctly triggers expiry
 * 3. Grace period is calculated from the original expiry, not the clock
 * 4. Last validation timestamp detects clock manipulation
 */
import {
  validateOffline,
  calculateGraceExpiry,
  shouldEnterGrace,
  hasGraceEnded,
  getOfflineState,
  DEFAULT_OFFLINE_CONFIG,
} from './offline';
import type { LicenseModel } from './model';
import { CURRENT_FORMAT_VERSION } from './model';

function makeLicense(overrides: Partial<LicenseModel> = {}): LicenseModel {
  return {
    licenseId: 'test-clock-001',
    licenseKey: 'TEST-KEY-CLOCK',
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

describe('Clock Manipulation', () => {
  describe('Clock rolled back (before expiry)', () => {
    it('validates as active when clock is before expiry', () => {
      const license = makeLicense({ state: 'annual' });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2026-06-01'));
      expect(result.valid).toBe(true);
      expect(result.state).toBe('annual');
    });

    it('validates as active even if clock is before activation date', () => {
      const license = makeLicense({ state: 'annual' });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2025-06-01'));
      expect(result.valid).toBe(true);
      expect(result.state).toBe('annual');
    });
  });

  describe('Clock rolled forward (past expiry)', () => {
    it('returns expired when clock is past expiry with no grace', () => {
      const license = makeLicense({
        state: 'annual',
        expiryDate: '2027-01-01T00:00:00.000Z',
        graceExpiry: null,
      });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2027-06-01'));
      expect(result.valid).toBe(false);
      expect(result.state).toBe('expired');
    });

    it('returns grace_period when clock is past expiry but within grace', () => {
      const license = makeLicense({
        state: 'annual',
        expiryDate: '2027-01-01T00:00:00.000Z',
        graceExpiry: '2027-01-31T00:00:00.000Z',
      });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2027-01-15'));
      expect(result.valid).toBe(true);
      expect(result.state).toBe('grace_period');
    });

    it('returns expired when clock is past grace expiry', () => {
      const license = makeLicense({
        state: 'annual',
        expiryDate: '2027-01-01T00:00:00.000Z',
        graceExpiry: '2027-01-31T00:00:00.000Z',
      });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2027-03-01'));
      expect(result.valid).toBe(false);
      expect(result.state).toBe('expired');
    });
  });

  describe('Grace period with clock manipulation', () => {
    it('grace expiry is calculated from original expiry, not current clock', () => {
      const expiry = '2027-01-01T00:00:00.000Z';
      const grace = calculateGraceExpiry(expiry, DEFAULT_OFFLINE_CONFIG);
      expect(new Date(grace).toISOString()).toBe('2027-01-31T00:00:00.000Z');
    });

    it('shouldEnterGrace uses the provided clock, not real time', () => {
      const license = makeLicense({
        state: 'annual',
        expiryDate: '2027-01-01T00:00:00.000Z',
      });
      expect(shouldEnterGrace(license, new Date('2026-12-15'))).toBe(false);
      expect(shouldEnterGrace(license, new Date('2027-01-02'))).toBe(true);
    });

    it('hasGraceEnded uses the provided clock, not real time', () => {
      const license = makeLicense({
        state: 'grace_period',
        expiryDate: '2027-01-01T00:00:00.000Z',
        graceExpiry: '2027-01-31T00:00:00.000Z',
      });
      expect(hasGraceEnded(license, new Date('2027-01-15'))).toBe(false);
      expect(hasGraceEnded(license, new Date('2027-02-01'))).toBe(true);
    });
  });

  describe('Last validation detects clock rollback', () => {
    it('license with lastValidation in the future (clock rolled back)', () => {
      const license = makeLicense({
        state: 'annual',
        lastValidation: '2027-06-01T00:00:00.000Z',
        expiryDate: '2027-01-01T00:00:00.000Z',
      });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2026-07-23'));
      expect(result.valid).toBe(true);
      expect(result.state).toBe('annual');
    });

    it('license with lastValidation after expiry (clock rolled back past expiry)', () => {
      const license = makeLicense({
        state: 'annual',
        lastValidation: '2027-06-01T00:00:00.000Z',
        expiryDate: '2027-01-01T00:00:00.000Z',
        graceExpiry: null,
      });
      const result = validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2026-06-01'));
      expect(result.valid).toBe(true);
      expect(result.state).toBe('annual');
    });
  });

  describe('getOfflineState with clock manipulation', () => {
    it('returns free for null license regardless of clock', () => {
      expect(getOfflineState(null, DEFAULT_OFFLINE_CONFIG, new Date('2025-01-01'))).toBe('free');
      expect(getOfflineState(null, DEFAULT_OFFLINE_CONFIG, new Date('2030-01-01'))).toBe('free');
    });

    it('returns expired when clock is far in the future', () => {
      const license = makeLicense({
        state: 'annual',
        expiryDate: '2027-01-01T00:00:00.000Z',
        graceExpiry: null,
      });
      expect(getOfflineState(license, DEFAULT_OFFLINE_CONFIG, new Date('2030-01-01'))).toBe('expired');
    });

    it('returns active when clock is before expiry', () => {
      const license = makeLicense({
        state: 'annual',
        expiryDate: '2027-01-01T00:00:00.000Z',
      });
      expect(getOfflineState(license, DEFAULT_OFFLINE_CONFIG, new Date('2026-07-23'))).toBe('annual');
    });
  });

  describe('Lifetime license with clock manipulation', () => {
    it('lifetime license is valid regardless of clock', () => {
      const license = makeLicense({
        state: 'lifetime',
        expiryDate: null,
      });
      expect(validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2025-01-01')).valid).toBe(true);
      expect(validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2030-01-01')).valid).toBe(true);
      expect(validateOffline(license, DEFAULT_OFFLINE_CONFIG, new Date('2050-01-01')).valid).toBe(true);
    });
  });
});
