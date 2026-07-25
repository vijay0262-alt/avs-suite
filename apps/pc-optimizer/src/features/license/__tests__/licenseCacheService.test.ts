/**
 * Tests for LicenseCacheService — save, load, delete, validate integrity,
 * cache corruption detection, and grace period updates.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { licenseCacheService } from '../licenseCacheService';
import { licenseStorage, type StoredLicense } from '../licenseStorage';

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

describe('licenseCacheService', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('save', () => {
    it('saves license to storage with enriched fields', () => {
      const license = makeLicense();
      licenseCacheService.save(license);
      const loaded = licenseStorage.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.uuid).toBe('lic-001');
      expect(loaded!.last_successful_validation).not.toBeNull();
      expect(loaded!.grace_period_expiration).not.toBeNull();
      expect(loaded!.cache_version).toBe(2);
    });
  });

  describe('load', () => {
    it('returns null when no cache exists', () => {
      expect(licenseCacheService.load()).toBeNull();
    });

    it('returns cached license', () => {
      const license = makeLicense();
      licenseCacheService.save(license);
      const loaded = licenseCacheService.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.uuid).toBe('lic-001');
    });
  });

  describe('delete', () => {
    it('removes the cached license', () => {
      licenseCacheService.save(makeLicense());
      expect(licenseCacheService.exists()).toBe(true);

      licenseCacheService.delete();
      expect(licenseCacheService.exists()).toBe(false);
      expect(licenseCacheService.load()).toBeNull();
    });
  });

  describe('exists', () => {
    it('returns false when empty', () => {
      expect(licenseCacheService.exists()).toBe(false);
    });

    it('returns true when license is cached', () => {
      licenseCacheService.save(makeLicense());
      expect(licenseCacheService.exists()).toBe(true);
    });
  });

  describe('validateIntegrity', () => {
    it('returns empty when no cache', async () => {
      const result = await licenseCacheService.validateIntegrity();
      expect(result.status).toBe('empty');
      expect(result.license).toBeNull();
    });

    it('returns valid for a healthy cache', async () => {
      const license = makeLicense({
        last_successful_validation: '2026-07-20T12:00:00Z',
        grace_period_expiration: '2026-08-19T12:00:00Z',
      });
      licenseCacheService.save(license);
      const result = await licenseCacheService.validateIntegrity();
      expect(result.status).toBe('valid');
      expect(result.license).not.toBeNull();
      expect(result.validation).not.toBeNull();
    });

    it('returns corrupted for malformed cache data', async () => {
      // Write invalid JSON directly to storage
      window.localStorage.setItem('avs-license-cache', btoa('not-json'));
      const result = await licenseCacheService.validateIntegrity();
      expect(result.status).toBe('corrupted');
      expect(result.license).toBeNull();
    });

    it('returns corrupted for missing required fields', async () => {
      // Write a license missing uuid
      const badLicense = { license_key: 'AVS-1234', signature: 'sig' };
      window.localStorage.setItem('avs-license-cache', btoa(JSON.stringify(badLicense)));
      const result = await licenseCacheService.validateIntegrity();
      expect(result.status).toBe('corrupted');
    });

    it('returns expired when grace period has passed', async () => {
      const license = makeLicense({
        last_successful_validation: '2026-06-01T12:00:00Z',
        grace_period_expiration: '2026-07-01T12:00:00Z',
      });
      licenseCacheService.save(license);
      // save() updates timestamps, so we need to manually write an expired license
      const expired = { ...license, last_successful_validation: '2026-06-01T12:00:00Z', grace_period_expiration: '2026-07-01T12:00:00Z' };
      licenseStorage.save(expired);
      const result = await licenseCacheService.validateIntegrity();
      expect(result.status).toBe('expired');
      expect(result.license).not.toBeNull();
    });

    it('returns invalid and clears cache for revoked license', async () => {
      const license = makeLicense({ status: 'REVOKED' });
      licenseStorage.save(license);
      const result = await licenseCacheService.validateIntegrity();
      expect(result.status).toBe('invalid');
      expect(result.license).toBeNull();
      expect(licenseCacheService.exists()).toBe(false);
    });

    it('returns invalid and clears cache for expired license', async () => {
      const license = makeLicense({ expires_at: '2026-06-01T12:00:00Z' });
      licenseStorage.save(license);
      const result = await licenseCacheService.validateIntegrity();
      expect(result.status).toBe('invalid');
      expect(licenseCacheService.exists()).toBe(false);
    });
  });

  describe('updateValidationTimestamp', () => {
    it('updates last_successful_validation and grace_period_expiration', () => {
      const license = makeLicense({
        last_successful_validation: '2026-06-01T12:00:00Z',
        grace_period_expiration: '2026-07-01T12:00:00Z',
      });
      licenseStorage.save(license);
      licenseCacheService.updateValidationTimestamp(license);
      const loaded = licenseStorage.load();
      expect(loaded!.last_successful_validation).toBe('2026-07-25T12:00:00.000Z');
      expect(loaded!.grace_period_expiration).toBe('2026-08-24T12:00:00.000Z');
    });
  });

  describe('getGracePeriodInfo', () => {
    it('returns null when no cache', () => {
      expect(licenseCacheService.getGracePeriodInfo()).toBeNull();
    });

    it('returns grace period info from cached license', () => {
      const license = makeLicense({
        last_successful_validation: '2026-07-20T12:00:00Z',
        grace_period_expiration: '2026-08-19T12:00:00Z',
      });
      licenseStorage.save(license);
      const info = licenseCacheService.getGracePeriodInfo();
      expect(info).not.toBeNull();
      expect(info!.status).toBe('active');
    });
  });
});
