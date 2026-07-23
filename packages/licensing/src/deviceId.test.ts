/**
 * Device ID tests — validates fingerprint derivation and format.
 */
import { deriveDeviceId, isValidDeviceId } from '../deviceId';

describe('Device ID', () => {
  describe('deriveDeviceId', () => {
    it('produces a 64-character hex string', async () => {
      const id = await deriveDeviceId('guid-123', 'x64', '10.0.22631', 'DESKTOP-ABC');
      expect(id).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(id)).toBe(true);
    });

    it('produces the same ID for the same inputs', async () => {
      const id1 = await deriveDeviceId('guid-123', 'x64', '10.0.22631', 'DESKTOP-ABC');
      const id2 = await deriveDeviceId('guid-123', 'x64', '10.0.22631', 'DESKTOP-ABC');
      expect(id1).toBe(id2);
    });

    it('produces different IDs for different inputs', async () => {
      const id1 = await deriveDeviceId('guid-123', 'x64', '10.0.22631', 'DESKTOP-ABC');
      const id2 = await deriveDeviceId('guid-456', 'x64', '10.0.22631', 'DESKTOP-ABC');
      expect(id1).not.toBe(id2);
    });
  });

  describe('isValidDeviceId', () => {
    it('returns true for a valid 64-char hex string', () => {
      expect(isValidDeviceId('a'.repeat(64))).toBe(true);
    });

    it('returns false for wrong length', () => {
      expect(isValidDeviceId('a'.repeat(32))).toBe(false);
      expect(isValidDeviceId('a'.repeat(128))).toBe(false);
    });

    it('returns false for non-hex characters', () => {
      expect(isValidDeviceId('g'.repeat(64))).toBe(false);
    });
  });
});
