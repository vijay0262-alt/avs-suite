/**
 * Tests for licenseValidator — signature, expiration, status checks.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { validateLicense, isLicenseStructurallyValid } from '../licenseValidator';
import type { StoredLicense } from '../licenseStorage';

const VALID_LICENSE: StoredLicense = {
  uuid: 'lic-uuid-123',
  license_key: 'AVS-ABCD-1234-EFGH-5678',
  edition: 'FREE',
  status: 'ACTIVE',
  issued_at: '2026-07-25T12:00:00+00:00',
  expires_at: null,
  signature: 'base64-signature-data-here-at-least-10-chars',
  last_refreshed: '2026-07-25T12:00:00+00:00',
  last_successful_validation: '2026-07-25T12:00:00+00:00',
  grace_period_expiration: '2026-08-24T12:00:00+00:00',
  product_version: '1.0.0',
  cache_version: 2,
};

function makeLicense(overrides: Partial<StoredLicense>): StoredLicense {
  return { ...VALID_LICENSE, ...overrides };
}

describe('licenseValidator', () => {
  describe('validateLicense', () => {
    it('validates a correct active license', async () => {
      const result = await validateLicense(VALID_LICENSE);
      expect(result.valid).toBe(true);
      expect(result.code).toBe('VALID');
    });

    it('returns MISSING_LICENSE for null', async () => {
      const result = await validateLicense(null);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_LICENSE');
    });

    it('returns INVALID_SIGNATURE for empty signature', async () => {
      const result = await validateLicense(makeLicense({ signature: '' }));
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_SIGNATURE');
    });

    it('returns INVALID_SIGNATURE for short signature', async () => {
      const result = await validateLicense(makeLicense({ signature: 'short' }));
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_SIGNATURE');
    });

    it('returns EXPIRED for past expiration date', async () => {
      const result = await validateLicense(
        makeLicense({ expires_at: '2020-01-01T00:00:00+00:00' }),
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('validates lifetime license (null expires_at)', async () => {
      const result = await validateLicense(
        makeLicense({ expires_at: null }),
      );
      expect(result.valid).toBe(true);
    });

    it('validates future expiration date', async () => {
      const result = await validateLicense(
        makeLicense({ expires_at: '2099-12-31T23:59:59+00:00' }),
      );
      expect(result.valid).toBe(true);
    });

    it('returns REVOKED for revoked license', async () => {
      const result = await validateLicense(
        makeLicense({ status: 'REVOKED' }),
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('REVOKED');
    });

    it('returns SUSPENDED for suspended license', async () => {
      const result = await validateLicense(
        makeLicense({ status: 'SUSPENDED' }),
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SUSPENDED');
    });

    it('returns CORRUPTED for unknown status', async () => {
      const result = await validateLicense(
        makeLicense({ status: 'UNKNOWN_STATUS' }),
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('CORRUPTED');
    });
  });

  describe('isLicenseStructurallyValid', () => {
    it('returns true for a well-formed license', () => {
      expect(isLicenseStructurallyValid(VALID_LICENSE)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isLicenseStructurallyValid(null)).toBe(false);
    });

    it('returns false for missing fields', () => {
      expect(isLicenseStructurallyValid({ uuid: 'test' })).toBe(false);
    });

    it('returns false for wrong types', () => {
      expect(
        isLicenseStructurallyValid({ ...VALID_LICENSE, uuid: 123 }),
      ).toBe(false);
    });
  });
});
