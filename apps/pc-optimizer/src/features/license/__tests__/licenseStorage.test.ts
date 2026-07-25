/**
 * Tests for licenseStorage — save, load, clear, corrupted cache.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { licenseStorage, type StoredLicense } from '../licenseStorage';

const VALID_LICENSE: StoredLicense = {
  uuid: 'lic-uuid-123',
  license_key: 'AVS-ABCD-1234-EFGH-5678',
  edition: 'FREE',
  status: 'ACTIVE',
  issued_at: '2026-07-25T12:00:00+00:00',
  expires_at: null,
  signature: 'base64-signature-data-here',
  last_refreshed: '2026-07-25T12:00:00+00:00',
  last_successful_validation: '2026-07-25T12:00:00+00:00',
  grace_period_expiration: '2026-08-24T12:00:00+00:00',
  product_version: '1.0.0',
  cache_version: 2,
};

describe('licenseStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads a license', () => {
    licenseStorage.save(VALID_LICENSE);
    const loaded = licenseStorage.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.uuid).toBe('lic-uuid-123');
    expect(loaded?.license_key).toBe('AVS-ABCD-1234-EFGH-5678');
    expect(loaded?.signature).toBe('base64-signature-data-here');
  });

  it('returns null when no license is stored', () => {
    expect(licenseStorage.load()).toBeNull();
  });

  it('clears the stored license', () => {
    licenseStorage.save(VALID_LICENSE);
    expect(licenseStorage.exists()).toBe(true);
    licenseStorage.clear();
    expect(licenseStorage.exists()).toBe(false);
    expect(licenseStorage.load()).toBeNull();
  });

  it('handles corrupted cache gracefully', () => {
    window.localStorage.setItem('avs-license-cache', 'corrupted-data!!!');
    expect(licenseStorage.load()).toBeNull();
  });

  it('handles cache with invalid shape', () => {
    window.localStorage.setItem(
      'avs-license-cache',
      btoa(JSON.stringify({ foo: 'bar' })),
    );
    expect(licenseStorage.load()).toBeNull();
  });

  it('exists() returns false when empty', () => {
    expect(licenseStorage.exists()).toBe(false);
  });

  it('exists() returns true when license is stored', () => {
    licenseStorage.save(VALID_LICENSE);
    expect(licenseStorage.exists()).toBe(true);
  });
});
