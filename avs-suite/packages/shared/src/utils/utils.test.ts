import { describe, expect, it } from 'vitest';
import { formatBytes, clamp } from './index';

describe('utils', () => {
  describe('formatBytes', () => {
    it('formats bytes below 1 KiB as bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
    });
    it('formats KiB / MiB / GiB with one decimal', () => {
      expect(formatBytes(1024)).toBe('1.0 KiB');
      expect(formatBytes(1024 * 1024)).toBe('1.0 MiB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GiB');
    });
    it('handles invalid input', () => {
      expect(formatBytes(-1)).toBe('0 B');
      expect(formatBytes(Number.NaN)).toBe('0 B');
    });
  });

  describe('clamp', () => {
    it('clamps inside the range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-1, 0, 10)).toBe(0);
      expect(clamp(11, 0, 10)).toBe(10);
    });
  });
});
