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

    it('PROFESSIONAL adds realtime, driver updater, file shredder, uninstall manager', () => {
      const prof = EDITION_MAPPINGS.PROFESSIONAL;
      expect(prof).toContain(Feature.REALTIME_MONITOR);
      expect(prof).toContain(Feature.DRIVER_UPDATER);
      expect(prof).toContain(Feature.FILE_SHREDDER);
      expect(prof).toContain(Feature.UNINSTALL_MANAGER);
    });
  });

  describe('resolveEdition', () => {
    it('resolves FREE', () => {
      expect(resolveEdition('FREE')).toBe('FREE');
    });

    it('resolves PROFESSIONAL', () => {
      expect(resolveEdition('PROFESSIONAL')).toBe('PROFESSIONAL');
    });

    it('resolves TRIAL as PROFESSIONAL', () => {
      expect(resolveEdition('TRIAL')).toBe('PROFESSIONAL');
    });

    it('resolves PRO alias to PROFESSIONAL', () => {
      expect(resolveEdition('PRO')).toBe('PROFESSIONAL');
    });

    it('resolves TOTAL_SECURITY alias to PROFESSIONAL', () => {
      expect(resolveEdition('TOTAL_SECURITY')).toBe('PROFESSIONAL');
    });

    it('resolves ULTIMATE alias to PROFESSIONAL', () => {
      expect(resolveEdition('ULTIMATE')).toBe('PROFESSIONAL');
    });

    it('resolves ENTERPRISE alias to PROFESSIONAL', () => {
      expect(resolveEdition('ENTERPRISE')).toBe('PROFESSIONAL');
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
      expect(resolveEdition('ultimate')).toBe('PROFESSIONAL');
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

    it('PROFESSIONAL includes all features', () => {
      const prof = getFeaturesForEdition('PROFESSIONAL');
      expect(prof.size).toBe(ALL_FEATURES.length);
    });

    it('FREE does not include STARTUP_MANAGER', () => {
      const free = getFeaturesForEdition('FREE');
      expect(free.has(Feature.STARTUP_MANAGER)).toBe(false);
    });

    it('FREE does not include DRIVER_UPDATER', () => {
      const free = getFeaturesForEdition('FREE');
      expect(free.has(Feature.DRIVER_UPDATER)).toBe(false);
    });

    it('PROFESSIONAL includes REALTIME_MONITOR', () => {
      const prof = getFeaturesForEdition('PROFESSIONAL');
      expect(prof.has(Feature.REALTIME_MONITOR)).toBe(true);
    });
  });

  describe('getRequiredEdition', () => {
    it('JUNK_CLEANER requires FREE', () => {
      expect(getRequiredEdition(Feature.JUNK_CLEANER)).toBe('FREE');
    });

    it('STARTUP_MANAGER requires PROFESSIONAL', () => {
      expect(getRequiredEdition(Feature.STARTUP_MANAGER)).toBe('PROFESSIONAL');
    });

    it('REALTIME_MONITOR requires PROFESSIONAL', () => {
      expect(getRequiredEdition(Feature.REALTIME_MONITOR)).toBe('PROFESSIONAL');
    });

    it('UNINSTALL_MANAGER requires PROFESSIONAL', () => {
      expect(getRequiredEdition(Feature.UNINSTALL_MANAGER)).toBe('PROFESSIONAL');
    });
  });

  describe('EDITION_TIERS', () => {
    it('has 2 tiers in ascending order', () => {
      expect(EDITION_TIERS).toEqual(['FREE', 'PROFESSIONAL']);
    });
  });
});
