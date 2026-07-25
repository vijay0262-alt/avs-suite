/**
 * Tests for ChecksumValidator — SHA256 computation and verification.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { computeSHA256, validateChecksum, isChecksumValid } from '../checksumValidator';

describe('checksumValidator', () => {
  describe('computeSHA256', () => {
    it('computes SHA256 of empty data', async () => {
      const hash = await computeSHA256(new Uint8Array(0));
      // SHA256 of empty string: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('computes SHA256 of "hello"', async () => {
      const data = new TextEncoder().encode('hello');
      const hash = await computeSHA256(data);
      // SHA256 of "hello": 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('computes SHA256 of binary data', async () => {
      const data = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
      const hash = await computeSHA256(data);
      expect(hash).toHaveLength(64); // SHA256 is 32 bytes = 64 hex chars
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('validateChecksum', () => {
    it('returns valid for matching hash', async () => {
      const data = new TextEncoder().encode('hello');
      const expectedHash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
      const result = await validateChecksum(data, expectedHash);
      expect(result.valid).toBe(true);
      expect(result.computed).toBe(expectedHash);
    });

    it('returns invalid for mismatched hash', async () => {
      const data = new TextEncoder().encode('hello');
      const wrongHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const result = await validateChecksum(data, wrongHash);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.expected).toBe(wrongHash);
        expect(result.message).toContain('Checksum mismatch');
      }
    });

    it('handles uppercase expected hash', async () => {
      const data = new TextEncoder().encode('hello');
      const upperHash = '2CF24DBA5FB0A30E26E83B2AC5B9E29E1B161E5C1FA7425E73043362938B9824';
      const result = await validateChecksum(data, upperHash);
      expect(result.valid).toBe(true);
    });

    it('handles hash with whitespace', async () => {
      const data = new TextEncoder().encode('hello');
      const hashWithSpaces = '  2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824  ';
      const result = await validateChecksum(data, hashWithSpaces);
      expect(result.valid).toBe(true);
    });
  });

  describe('isChecksumValid', () => {
    it('returns true for matching hash', async () => {
      const data = new TextEncoder().encode('hello');
      const expectedHash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
      expect(await isChecksumValid(data, expectedHash)).toBe(true);
    });

    it('returns false for mismatched hash', async () => {
      const data = new TextEncoder().encode('hello');
      const wrongHash = 'aaaa000000000000000000000000000000000000000000000000000000000000';
      expect(await isChecksumValid(data, wrongHash)).toBe(false);
    });
  });
});
