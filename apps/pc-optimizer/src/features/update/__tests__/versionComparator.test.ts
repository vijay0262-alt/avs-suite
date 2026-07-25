/**
 * Tests for VersionComparator — semantic version parsing and comparison.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  parseVersion,
  compareVersions,
  isNewer,
  isOlder,
  isEqual,
  isAtLeast,
  maxVersion,
} from '../versionComparator';

describe('versionComparator', () => {
  describe('parseVersion', () => {
    it('parses a simple version', () => {
      const v = parseVersion('1.2.3');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(3);
      expect(v.prerelease).toBeNull();
      expect(v.build).toBeNull();
    });

    it('parses version with leading v', () => {
      const v = parseVersion('v2.0.0');
      expect(v.major).toBe(2);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
    });

    it('parses two-part version (defaults patch to 0)', () => {
      const v = parseVersion('1.5');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(5);
      expect(v.patch).toBe(0);
    });

    it('parses single-part version (defaults minor and patch to 0)', () => {
      const v = parseVersion('3');
      expect(v.major).toBe(3);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
    });

    it('parses pre-release version', () => {
      const v = parseVersion('1.0.0-beta.1');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
      expect(v.prerelease).toBe('beta.1');
    });

    it('parses version with build metadata', () => {
      const v = parseVersion('1.0.0+build.123');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
      expect(v.build).toBe('build.123');
    });

    it('parses version with pre-release and build', () => {
      const v = parseVersion('1.0.0-rc.1+build.456');
      expect(v.prerelease).toBe('rc.1');
      expect(v.build).toBe('build.456');
    });

    it('throws on invalid version string', () => {
      expect(() => parseVersion('not-a-version')).toThrow();
      expect(() => parseVersion('')).toThrow();
      expect(() => parseVersion('a.b.c')).toThrow();
    });
  });

  describe('compareVersions', () => {
    it('1.0.1 > 1.0.0', () => {
      expect(compareVersions(parseVersion('1.0.1'), parseVersion('1.0.0'))).toBeGreaterThan(0);
    });

    it('1.2.0 > 1.1.9', () => {
      expect(compareVersions(parseVersion('1.2.0'), parseVersion('1.1.9'))).toBeGreaterThan(0);
    });

    it('2.0.0 > 1.9.9', () => {
      expect(compareVersions(parseVersion('2.0.0'), parseVersion('1.9.9'))).toBeGreaterThan(0);
    });

    it('1.0.0 == 1.0.0', () => {
      expect(compareVersions(parseVersion('1.0.0'), parseVersion('1.0.0'))).toBe(0);
    });

    it('1.0.0 < 1.0.1', () => {
      expect(compareVersions(parseVersion('1.0.0'), parseVersion('1.0.1'))).toBeLessThan(0);
    });

    it('stable > prerelease (1.0.0 > 1.0.0-beta)', () => {
      expect(compareVersions(parseVersion('1.0.0'), parseVersion('1.0.0-beta'))).toBeGreaterThan(0);
    });

    it('beta.1 < beta.2', () => {
      expect(compareVersions(parseVersion('1.0.0-beta.1'), parseVersion('1.0.0-beta.2'))).toBeLessThan(0);
    });

    it('alpha < beta (lexical)', () => {
      expect(compareVersions(parseVersion('1.0.0-alpha'), parseVersion('1.0.0-beta'))).toBeLessThan(0);
    });

    it('numeric prerelease < non-numeric prerelease', () => {
      expect(compareVersions(parseVersion('1.0.0-1'), parseVersion('1.0.0-alpha'))).toBeLessThan(0);
    });
  });

  describe('isNewer', () => {
    it('returns true for newer version', () => {
      expect(isNewer('1.0.1', '1.0.0')).toBe(true);
      expect(isNewer('1.2.0', '1.1.9')).toBe(true);
      expect(isNewer('2.0.0', '1.9.9')).toBe(true);
    });

    it('returns false for older or equal version', () => {
      expect(isNewer('1.0.0', '1.0.1')).toBe(false);
      expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    });
  });

  describe('isOlder', () => {
    it('returns true for older version', () => {
      expect(isOlder('1.0.0', '1.0.1')).toBe(true);
      expect(isOlder('1.1.9', '1.2.0')).toBe(true);
    });

    it('returns false for newer or equal version', () => {
      expect(isOlder('1.0.1', '1.0.0')).toBe(false);
      expect(isOlder('1.0.0', '1.0.0')).toBe(false);
    });
  });

  describe('isEqual', () => {
    it('returns true for equal versions', () => {
      expect(isEqual('1.0.0', '1.0.0')).toBe(true);
      expect(isEqual('2.5.3', '2.5.3')).toBe(true);
    });

    it('returns false for different versions', () => {
      expect(isEqual('1.0.0', '1.0.1')).toBe(false);
    });
  });

  describe('isAtLeast', () => {
    it('returns true for version >= minimum', () => {
      expect(isAtLeast('1.0.0', '1.0.0')).toBe(true);
      expect(isAtLeast('1.5.0', '1.0.0')).toBe(true);
      expect(isAtLeast('2.0.0', '1.9.9')).toBe(true);
    });

    it('returns false for version < minimum', () => {
      expect(isAtLeast('1.0.0', '1.0.1')).toBe(false);
      expect(isAtLeast('0.9.9', '1.0.0')).toBe(false);
    });
  });

  describe('maxVersion', () => {
    it('returns the newer version', () => {
      expect(maxVersion('1.0.0', '1.0.1')).toBe('1.0.1');
      expect(maxVersion('2.0.0', '1.9.9')).toBe('2.0.0');
    });

    it('returns either for equal versions', () => {
      expect(maxVersion('1.0.0', '1.0.0')).toBe('1.0.0');
    });
  });
});
