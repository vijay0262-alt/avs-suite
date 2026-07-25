/**
 * Tests for OfflineLicenseValidator — validates cached licenses with
 * grace period checks, GRACE_EXPIRED detection, and limited mode.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { validateOfflineLicense, isOfflineUsable, shouldEnterLimitedMode } from '../offlineLicenseValidator';
import type { StoredLicense } from '../licenseStorage';

function makeLicense(overrides: Partial<StoredLicense> = {}): StoredLicense {
  const now = new Date();
  const graceExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    uuid: 'lic-001',
    license_key: 'AVS-ABCD-1234-EFGH-5678',
    edition: 'PROFESSIONAL',
    status: 'ACTIVE',
    issued_at: '2026-07-25T12:00:00Z',
    expires_at: null,
    signature: 'base64-signature-data-here-at-least-10-chars',
    last_refreshed: now.toISOString(),
    last_successful_validation: now.toISOString(),
    grace_period_expiration: graceExpiry.toISOString(),
    product_version: '1.0.0',
    cache_version: 2,
    ...overrides,
  };
}

describe('offlineLicenseValidator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('validateOfflineLicense', () => {
    it('returns VALID for active license within grace period', async () => {
      const license = makeLicense({
        last_successful_validation: '2026-07-20T12:00:00Z',
        grace_period_expiration: '2026-08-19T12:00:00Z',
      });
      const result = await validateOfflineLicense(license);
      expect(result.valid).toBe(true);
      expect(result.code).toBe('VALID');
      expect(result.gracePeriod).not.toBeNull();
      expect(result.gracePeriod!.status).toBe('active');
    });

    it('returns GRACE_EXPIRED when grace period has passed', async () => {
      const license = makeLicense({
        last_successful_validation: '2026-06-01T12:00:00Z',
        grace_period_expiration: '2026-07-01T12:00:00Z',
      });
      const result = await validateOfflineLicense(license);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('GRACE_EXPIRED');
      expect(result.gracePeriod).not.toBeNull();
      expect(result.gracePeriod!.limitedMode).toBe(true);
    });

    it('returns MISSING_LICENSE for null', async () => {
      const result = await validateOfflineLicense(null);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_LICENSE');
      expect(result.gracePeriod).toBeNull();
    });

    it('returns INVALID_SIGNATURE for bad signature', async () => {
      const license = makeLicense({ signature: 'short' });
      const result = await validateOfflineLicense(license);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_SIGNATURE');
    });

    it('returns REVOKED for revoked license', async () => {
      const license = makeLicense({ status: 'REVOKED' });
      const result = await validateOfflineLicense(license);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('REVOKED');
    });

    it('returns EXPIRED for expired license', async () => {
      const license = makeLicense({ expires_at: '2026-06-01T12:00:00Z' });
      const result = await validateOfflineLicense(license);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('returns VALID with not_started grace when no validation timestamp', async () => {
      const license = makeLicense({
        last_successful_validation: null,
        grace_period_expiration: null,
      });
      const result = await validateOfflineLicense(license);
      expect(result.valid).toBe(true);
      expect(result.gracePeriod!.status).toBe('not_started');
    });
  });

  describe('isOfflineUsable', () => {
    it('returns true for valid license within grace period', async () => {
      const license = makeLicense({
        last_successful_validation: '2026-07-20T12:00:00Z',
        grace_period_expiration: '2026-08-19T12:00:00Z',
      });
      expect(await isOfflineUsable(license)).toBe(true);
    });

    it('returns false when grace period expired', async () => {
      const license = makeLicense({
        last_successful_validation: '2026-06-01T12:00:00Z',
        grace_period_expiration: '2026-07-01T12:00:00Z',
      });
      expect(await isOfflineUsable(license)).toBe(false);
    });

    it('returns false for null license', async () => {
      expect(await isOfflineUsable(null)).toBe(false);
    });

    it('returns false for revoked license', async () => {
      const license = makeLicense({ status: 'REVOKED' });
      expect(await isOfflineUsable(license)).toBe(false);
    });
  });

  describe('shouldEnterLimitedMode', () => {
    it('returns true when grace period expired', async () => {
      const license = makeLicense({
        last_successful_validation: '2026-06-01T12:00:00Z',
        grace_period_expiration: '2026-07-01T12:00:00Z',
      });
      expect(await shouldEnterLimitedMode(license)).toBe(true);
    });

    it('returns false when grace period active', async () => {
      const license = makeLicense({
        last_successful_validation: '2026-07-20T12:00:00Z',
        grace_period_expiration: '2026-08-19T12:00:00Z',
      });
      expect(await shouldEnterLimitedMode(license)).toBe(false);
    });

    it('returns true for null license', async () => {
      expect(await shouldEnterLimitedMode(null)).toBe(true);
    });
  });
});
