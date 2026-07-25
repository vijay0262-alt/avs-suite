/**
 * Tests for FeatureEngine — isEnabled, getEnabledFeatures, getDisabledFeatures,
 * requiresEdition, refresh, subscriber notifications.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeatureEngine } from '../featureEngine';
import { Feature, ALL_FEATURES } from '../features';

describe('FeatureEngine', () => {
  let engine: FeatureEngine;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let editionProvider: any;

  beforeEach(() => {
    editionProvider = vi.fn(() => 'FREE');
    engine = new FeatureEngine(editionProvider as () => string | null);
  });

  describe('FREE edition', () => {
    it('enables JUNK_CLEANER', () => {
      expect(engine.isEnabled(Feature.JUNK_CLEANER)).toBe(true);
    });

    it('enables SYSTEM_HEALTH', () => {
      expect(engine.isEnabled(Feature.SYSTEM_HEALTH)).toBe(true);
    });

    it('enables PERFORMANCE_BOOST', () => {
      expect(engine.isEnabled(Feature.PERFORMANCE_BOOST)).toBe(true);
    });

    it('disables STARTUP_MANAGER', () => {
      expect(engine.isEnabled(Feature.STARTUP_MANAGER)).toBe(false);
    });

    it('disables DRIVER_UPDATER', () => {
      expect(engine.isEnabled(Feature.DRIVER_UPDATER)).toBe(false);
    });

    it('disables REALTIME_MONITOR', () => {
      expect(engine.isEnabled(Feature.REALTIME_MONITOR)).toBe(false);
    });

    it('returns 3 enabled features', () => {
      expect(engine.getEnabledFeatures()).toHaveLength(3);
    });

    it('returns remaining as disabled', () => {
      expect(engine.getDisabledFeatures()).toHaveLength(ALL_FEATURES.length - 3);
    });
  });

  describe('PROFESSIONAL edition', () => {
    beforeEach(() => {
      editionProvider.mockReturnValue('PROFESSIONAL');
      engine.refresh();
    });

    it('enables all FREE features', () => {
      expect(engine.isEnabled(Feature.JUNK_CLEANER)).toBe(true);
      expect(engine.isEnabled(Feature.SYSTEM_HEALTH)).toBe(true);
      expect(engine.isEnabled(Feature.PERFORMANCE_BOOST)).toBe(true);
    });

    it('enables STARTUP_MANAGER', () => {
      expect(engine.isEnabled(Feature.STARTUP_MANAGER)).toBe(true);
    });

    it('enables DISK_ANALYZER', () => {
      expect(engine.isEnabled(Feature.DISK_ANALYZER)).toBe(true);
    });

    it('disables REALTIME_MONITOR', () => {
      expect(engine.isEnabled(Feature.REALTIME_MONITOR)).toBe(false);
    });

    it('disables DRIVER_UPDATER', () => {
      expect(engine.isEnabled(Feature.DRIVER_UPDATER)).toBe(false);
    });

    it('returns 8 enabled features (3 FREE + 5 PRO)', () => {
      expect(engine.getEnabledFeatures()).toHaveLength(8);
    });
  });

  describe('TOTAL_SECURITY edition', () => {
    beforeEach(() => {
      editionProvider.mockReturnValue('TOTAL_SECURITY');
      engine.refresh();
    });

    it('enables all PROFESSIONAL features', () => {
      expect(engine.isEnabled(Feature.STARTUP_MANAGER)).toBe(true);
      expect(engine.isEnabled(Feature.PRIVACY_CLEANER)).toBe(true);
    });

    it('enables REALTIME_MONITOR', () => {
      expect(engine.isEnabled(Feature.REALTIME_MONITOR)).toBe(true);
    });

    it('enables DRIVER_UPDATER', () => {
      expect(engine.isEnabled(Feature.DRIVER_UPDATER)).toBe(true);
    });

    it('enables FILE_SHREDDER', () => {
      expect(engine.isEnabled(Feature.FILE_SHREDDER)).toBe(true);
    });

    it('disables UNINSTALL_MANAGER (ULTIMATE only)', () => {
      expect(engine.isEnabled(Feature.UNINSTALL_MANAGER)).toBe(false);
    });

    it('returns 11 enabled features (8 + 3)', () => {
      expect(engine.getEnabledFeatures()).toHaveLength(11);
    });
  });

  describe('ULTIMATE edition', () => {
    beforeEach(() => {
      editionProvider.mockReturnValue('ULTIMATE');
      engine.refresh();
    });

    it('enables all features', () => {
      for (const f of ALL_FEATURES) {
        expect(engine.isEnabled(f)).toBe(true);
      }
    });

    it('returns all features as enabled', () => {
      expect(engine.getEnabledFeatures()).toHaveLength(ALL_FEATURES.length);
    });

    it('returns 0 disabled features', () => {
      expect(engine.getDisabledFeatures()).toHaveLength(0);
    });
  });

  describe('Unknown edition', () => {
    beforeEach(() => {
      editionProvider.mockReturnValue('UNKNOWN_EDITION');
      engine.refresh();
    });

    it('defaults to FREE', () => {
      expect(engine.getEdition()).toBe('FREE');
    });

    it('enables only FREE features', () => {
      expect(engine.isEnabled(Feature.JUNK_CLEANER)).toBe(true);
      expect(engine.isEnabled(Feature.STARTUP_MANAGER)).toBe(false);
    });
  });

  describe('Null edition (no license)', () => {
    beforeEach(() => {
      editionProvider.mockReturnValue(null);
      engine.refresh();
    });

    it('defaults to FREE', () => {
      expect(engine.getEdition()).toBe('FREE');
    });
  });

  describe('TRIAL edition', () => {
    beforeEach(() => {
      editionProvider.mockReturnValue('TRIAL');
      engine.refresh();
    });

    it('resolves to PROFESSIONAL', () => {
      expect(engine.getEdition()).toBe('PROFESSIONAL');
    });

    it('enables PROFESSIONAL features', () => {
      expect(engine.isEnabled(Feature.STARTUP_MANAGER)).toBe(true);
    });
  });

  describe('refresh', () => {
    it('recalculates when edition changes', () => {
      expect(engine.isEnabled(Feature.STARTUP_MANAGER)).toBe(false);

      editionProvider.mockReturnValue('PROFESSIONAL');
      engine.refresh();

      expect(engine.isEnabled(Feature.STARTUP_MANAGER)).toBe(true);
    });

    it('notifies subscribers on change', () => {
      const listener = vi.fn();
      engine.subscribe(listener);

      editionProvider.mockReturnValue('PROFESSIONAL');
      engine.refresh();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not notify subscribers when nothing changes', () => {
      const listener = vi.fn();
      engine.subscribe(listener);

      // Edition is still FREE
      engine.refresh();

      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple subscribers', () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      engine.subscribe(l1);
      engine.subscribe(l2);

      editionProvider.mockReturnValue('ULTIMATE');
      engine.refresh();

      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops notifications', () => {
      const listener = vi.fn();
      const unsub = engine.subscribe(listener);

      editionProvider.mockReturnValue('PROFESSIONAL');
      engine.refresh();
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();

      editionProvider.mockReturnValue('ULTIMATE');
      engine.refresh();
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe('requiresEdition', () => {
    it('returns "Free" for JUNK_CLEANER', () => {
      expect(engine.requiresEdition(Feature.JUNK_CLEANER)).toBe('Free');
    });

    it('returns "Professional" for STARTUP_MANAGER', () => {
      expect(engine.requiresEdition(Feature.STARTUP_MANAGER)).toBe('Professional');
    });

    it('returns "Total Security" for REALTIME_MONITOR', () => {
      expect(engine.requiresEdition(Feature.REALTIME_MONITOR)).toBe('Total Security');
    });

    it('returns "Ultimate" for UNINSTALL_MANAGER', () => {
      expect(engine.requiresEdition(Feature.UNINSTALL_MANAGER)).toBe('Ultimate');
    });
  });

  describe('getEnabledCount / getDisabledCount', () => {
    it('returns correct counts for FREE', () => {
      expect(engine.getEnabledCount()).toBe(3);
      expect(engine.getDisabledCount()).toBe(ALL_FEATURES.length - 3);
    });

    it('returns correct counts for ULTIMATE', () => {
      editionProvider.mockReturnValue('ULTIMATE');
      engine.refresh();

      expect(engine.getEnabledCount()).toBe(ALL_FEATURES.length);
      expect(engine.getDisabledCount()).toBe(0);
    });
  });

  describe('getEditionLabel', () => {
    it('returns "Free" for FREE', () => {
      expect(engine.getEditionLabel()).toBe('Free');
    });

    it('returns "Ultimate" for ULTIMATE', () => {
      editionProvider.mockReturnValue('ULTIMATE');
      engine.refresh();
      expect(engine.getEditionLabel()).toBe('Ultimate');
    });
  });
});
