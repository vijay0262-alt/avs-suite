/**
 * Tests for edition mappings — tier resolution, cumulative features,
 * required edition lookup, and edition normalization.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  EDITION_MAPPINGS,
  EDITION_TIERS,
  resolveEdition,
  getFeaturesForEdition,
  getRequiredEdition,
} from '../editionMappings';
import { Feature, ALL_FEATURES } from '../features';

describe('editionMappings', () => {
  describe('EDITION_MAPPINGS', () => {
    it('FREE includes junk cleaner, system health, performance boost', () => {
      const free = EDITION_MAPPINGS.FREE;
      expect(free).toContain(Feature.JUNK_CLEANER);
      expect(free).toContain(Feature.SYSTEM_HEALTH);
      expect(free).toContain(Feature.PERFORMANCE_BOOST);
    });

    it('PROFESSIONAL adds startup, privacy, scheduled, auto-clean, disk analyzer', () => {
      const prof = EDITION_MAPPINGS.PROFESSIONAL;
      expect(prof).toContain(Feature.STARTUP_MANAGER);
      expect(prof).toContain(Feature.PRIVACY_CLEANER);
      expect(prof).toContain(Feature.SCHEDULED_CLEANING);
      expect(prof).toContain(Feature.AUTO_CLEAN);
      expect(prof).toContain(Feature.DISK_ANALYZER);
    });

    it('TOTAL_SECURITY adds realtime, driver updater, file shredder', () => {
      const ts = EDITION_MAPPINGS.TOTAL_SECURITY;
      expect(ts).toContain(Feature.REALTIME_MONITOR);
      expect(ts).toContain(Feature.DRIVER_UPDATER);
      expect(ts).toContain(Feature.FILE_SHREDDER);
    });

    it('ULTIMATE includes all features', () => {
      const ult = EDITION_MAPPINGS.ULTIMATE;
      expect(ult.length).toBe(ALL_FEATURES.length);
      for (const f of ALL_FEATURES) {
        expect(ult).toContain(f);
      }
    });
  });

  describe('resolveEdition', () => {
    it('resolves FREE', () => {
      expect(resolveEdition('FREE')).toBe('FREE');
    });

    it('resolves PROFESSIONAL', () => {
      expect(resolveEdition('PROFESSIONAL')).toBe('PROFESSIONAL');
    });

    it('resolves TOTAL_SECURITY', () => {
      expect(resolveEdition('TOTAL_SECURITY')).toBe('TOTAL_SECURITY');
    });

    it('resolves ULTIMATE', () => {
      expect(resolveEdition('ULTIMATE')).toBe('ULTIMATE');
    });

    it('resolves TRIAL as PROFESSIONAL', () => {
      expect(resolveEdition('TRIAL')).toBe('PROFESSIONAL');
    });

    it('resolves PRO alias to PROFESSIONAL', () => {
      expect(resolveEdition('PRO')).toBe('PROFESSIONAL');
    });

    it('resolves ENTERPRISE alias to ULTIMATE', () => {
      expect(resolveEdition('ENTERPRISE')).toBe('ULTIMATE');
    });

    it('resolves null to FREE', () => {
      expect(resolveEdition(null)).toBe('FREE');
    });

    it('resolves undefined to FREE', () => {
      expect(resolveEdition(undefined)).toBe('FREE');
    });

    it('resolves unknown edition to FREE', () => {
      expect(resolveEdition('UNKNOWN')).toBe('FREE');
    });

    it('is case-insensitive', () => {
      expect(resolveEdition('free')).toBe('FREE');
      expect(resolveEdition('Professional')).toBe('PROFESSIONAL');
      expect(resolveEdition('Ultimate')).toBe('ULTIMATE');
    });
  });

  describe('getFeaturesForEdition', () => {
    it('FREE has exactly 3 features', () => {
      const features = getFeaturesForEdition('FREE');
      expect(features.size).toBe(3);
    });

    it('PROFESSIONAL includes FREE features', () => {
      const free = getFeaturesForEdition('FREE');
      const prof = getFeaturesForEdition('PROFESSIONAL');
      for (const f of free) {
        expect(prof.has(f)).toBe(true);
      }
    });

    it('TOTAL_SECURITY includes PROFESSIONAL features', () => {
      const prof = getFeaturesForEdition('PROFESSIONAL');
      const ts = getFeaturesForEdition('TOTAL_SECURITY');
      for (const f of prof) {
        expect(ts.has(f)).toBe(true);
      }
    });

    it('ULTIMATE includes all features', () => {
      const ult = getFeaturesForEdition('ULTIMATE');
      expect(ult.size).toBe(ALL_FEATURES.length);
    });

    it('ULTIMATE includes TOTAL_SECURITY features', () => {
      const ts = getFeaturesForEdition('TOTAL_SECURITY');
      const ult = getFeaturesForEdition('ULTIMATE');
      for (const f of ts) {
        expect(ult.has(f)).toBe(true);
      }
    });

    it('FREE does not include STARTUP_MANAGER', () => {
      const free = getFeaturesForEdition('FREE');
      expect(free.has(Feature.STARTUP_MANAGER)).toBe(false);
    });

    it('FREE does not include DRIVER_UPDATER', () => {
      const free = getFeaturesForEdition('FREE');
      expect(free.has(Feature.DRIVER_UPDATER)).toBe(false);
    });

    it('PROFESSIONAL does not include REALTIME_MONITOR', () => {
      const prof = getFeaturesForEdition('PROFESSIONAL');
      expect(prof.has(Feature.REALTIME_MONITOR)).toBe(false);
    });
  });

  describe('getRequiredEdition', () => {
    it('JUNK_CLEANER requires FREE', () => {
      expect(getRequiredEdition(Feature.JUNK_CLEANER)).toBe('FREE');
    });

    it('STARTUP_MANAGER requires PROFESSIONAL', () => {
      expect(getRequiredEdition(Feature.STARTUP_MANAGER)).toBe('PROFESSIONAL');
    });

    it('REALTIME_MONITOR requires TOTAL_SECURITY', () => {
      expect(getRequiredEdition(Feature.REALTIME_MONITOR)).toBe('TOTAL_SECURITY');
    });

    it('UNINSTALL_MANAGER requires ULTIMATE', () => {
      expect(getRequiredEdition(Feature.UNINSTALL_MANAGER)).toBe('ULTIMATE');
    });
  });

  describe('EDITION_TIERS', () => {
    it('has 4 tiers in ascending order', () => {
      expect(EDITION_TIERS).toEqual(['FREE', 'PROFESSIONAL', 'TOTAL_SECURITY', 'ULTIMATE']);
    });
  });
});
