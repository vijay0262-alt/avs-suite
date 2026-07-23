/**
 * License model tests — validates serialization, deserialization,
 * and view conversion.
 */
import { toLicenseView, deserializeLicense, CURRENT_FORMAT_VERSION } from '../model';
import type { LicenseModel } from '../model';
import { LicenseStorageError } from '../storage';

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

describe('License Model', () => {
  describe('toLicenseView', () => {
    it('strips the license key', () => {
      const license = makeLicense();
      const view = toLicenseView(license);
      expect(view.hasKey).toBe(true);
      expect((view as Record<string, unknown>).licenseKey).toBeUndefined();
    });

    it('preserves all non-sensitive fields', () => {
      const license = makeLicense();
      const view = toLicenseView(license);
      expect(view.licenseId).toBe(license.licenseId);
      expect(view.state).toBe(license.state);
      expect(view.edition).toBe(license.edition);
      expect(view.activationDate).toBe(license.activationDate);
      expect(view.expiryDate).toBe(license.expiryDate);
      expect(view.maxDevices).toBe(license.maxDevices);
      expect(view.activatedDevices).toBe(license.activatedDevices);
      expect(view.email).toBe(license.email);
      expect(view.deviceId).toBe(license.deviceId);
      expect(view.lastValidation).toBe(license.lastValidation);
      expect(view.graceExpiry).toBe(license.graceExpiry);
    });

    it('reports hasKey=false when key is empty', () => {
      const license = makeLicense();
      license.licenseKey = '';
      const view = toLicenseView(license);
      expect(view.hasKey).toBe(false);
    });
  });

  describe('deserializeLicense', () => {
    it('deserializes a valid license JSON', () => {
      const license = makeLicense();
      const json = JSON.stringify(license);
      const result = deserializeLicense(json);
      expect(result.licenseId).toBe(license.licenseId);
      expect(result.state).toBe(license.state);
    });

    it('throws version_unsupported for wrong format version', () => {
      const license = makeLicense();
      license.formatVersion = 999;
      const json = JSON.stringify(license);
      expect(() => deserializeLicense(json)).toThrow(LicenseStorageError);
      expect(() => deserializeLicense(json)).toThrow(/version_unsupported|Unsupported/);
    });

    it('throws corrupted for missing required field', () => {
      const license = makeLicense();
      const partial = { ...license } as Record<string, unknown>;
      delete partial.licenseId;
      const json = JSON.stringify(partial);
      expect(() => deserializeLicense(json)).toThrow(LicenseStorageError);
      expect(() => deserializeLicense(json)).toThrow(/corrupted|Missing/);
    });
  });
});
