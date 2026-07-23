/**
 * License storage tests — validates serialization, checksum,
 * and error handling.
 */
import { serializeLicense, deserializeLicense, computeChecksum, LicenseStorageError } from './storage';
import { CURRENT_FORMAT_VERSION } from './model';
import type { LicenseModel } from './model';

function makeLicense(): LicenseModel {
  return {
    licenseId: 'test-001',
    licenseKey: 'TEST-XXXX-YYYY-ZZZZ',
    state: 'annual',
    edition: 'pro',
    activationDate: '2026-01-01T00:00:00.000Z',
    expiryDate: '2027-01-01T00:00:00.000Z',
    maxDevices: 3,
    activatedDevices: 1,
    email: 'user@example.com',
    deviceId: 'a'.repeat(64),
    lastValidation: '2026-07-23T00:00:00.000Z',
    graceExpiry: null,
    formatVersion: CURRENT_FORMAT_VERSION,
  };
}

describe('License Storage', () => {
  describe('serializeLicense', () => {
    it('produces valid JSON with formatVersion', () => {
      const license = makeLicense();
      const json = serializeLicense(license);
      const parsed = JSON.parse(json);
      expect(parsed.formatVersion).toBe(CURRENT_FORMAT_VERSION);
      expect(parsed.licenseId).toBe(license.licenseId);
    });
  });

  describe('deserializeLicense', () => {
    it('round-trips serialize then deserialize', () => {
      const license = makeLicense();
      const json = serializeLicense(license);
      const result = deserializeLicense(json);
      expect(result.licenseId).toBe(license.licenseId);
      expect(result.licenseKey).toBe(license.licenseKey);
      expect(result.state).toBe(license.state);
    });

    it('throws LicenseStorageError for unsupported version', () => {
      const license = makeLicense();
      license.formatVersion = 999;
      const json = JSON.stringify(license);
      let error: unknown;
      try {
        deserializeLicense(json);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(LicenseStorageError);
      expect((error as LicenseStorageError).type).toBe('version_unsupported');
    });

    it('throws LicenseStorageError for missing field', () => {
      const license = makeLicense();
      const partial = { ...license } as Record<string, unknown>;
      delete partial.email;
      const json = JSON.stringify(partial);
      let error: unknown;
      try {
        deserializeLicense(json);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(LicenseStorageError);
      expect((error as LicenseStorageError).type).toBe('corrupted');
    });
  });

  describe('computeChecksum', () => {
    it('produces a 64-character hex string', async () => {
      const checksum = await computeChecksum('test data');
      expect(checksum).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(checksum)).toBe(true);
    });

    it('produces different checksums for different data', async () => {
      const c1 = await computeChecksum('data1');
      const c2 = await computeChecksum('data2');
      expect(c1).not.toBe(c2);
    });

    it('produces the same checksum for the same data', async () => {
      const c1 = await computeChecksum('same data');
      const c2 = await computeChecksum('same data');
      expect(c1).toBe(c2);
    });
  });
});
