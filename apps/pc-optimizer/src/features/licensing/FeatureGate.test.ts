/**
 * FeatureGate behavior tests — validates dynamic unlock/lock,
 * edition-based gating, and FeatureGate API.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initFeatureGate, updateFeatureGateEdition, canUse, isHidden, currentEdition } from './FeatureGate';

describe('FeatureGate', () => {
  beforeEach(() => {
    initFeatureGate('free');
  });

  describe('Free edition', () => {
    beforeEach(() => {
      initFeatureGate('free');
    });

    it('allows junk.scan in free edition', () => {
      expect(canUse('junk.scan')).toBe(true);
    });

    it('allows registry.scan in free edition', () => {
      expect(canUse('registry.scan')).toBe(true);
    });

    it('allows registry.fix in free edition', () => {
      expect(canUse('registry.fix')).toBe(true);
    });

    it('denies privacy.clean in free edition', () => {
      expect(canUse('privacy.clean')).toBe(false);
    });

    it('denies driver.update in free edition', () => {
      expect(canUse('driver.update')).toBe(false);
    });

    it('denies antivirus.scan in free edition', () => {
      expect(canUse('antivirus.scan')).toBe(false);
    });

    it('reports free as current edition', () => {
      expect(currentEdition()).toBe('free');
    });
  });

  describe('Professional edition (via state)', () => {
    beforeEach(() => {
      initFeatureGate('annual');
    });

    it('allows registry.fix in professional edition', () => {
      expect(canUse('registry.fix')).toBe(true);
    });

    it('allows performance.optimize in professional edition', () => {
      expect(canUse('performance.optimize')).toBe(true);
    });

    it('allows driver.update in professional edition', () => {
      expect(canUse('driver.update')).toBe(true);
    });

    it('allows antivirus.scan in professional edition', () => {
      expect(canUse('antivirus.scan')).toBe(true);
    });

    it('reports professional as current edition', () => {
      expect(currentEdition()).toBe('professional');
    });
  });

  describe('Trial edition (via state, maps to professional)', () => {
    beforeEach(() => {
      initFeatureGate('trial');
    });

    it('allows professional features in trial', () => {
      expect(canUse('registry.fix')).toBe(true);
      expect(canUse('performance.optimize')).toBe(true);
    });

    it('allows all features in trial (maps to professional)', () => {
      expect(canUse('driver.update')).toBe(true);
      expect(canUse('antivirus.scan')).toBe(true);
    });

    it('reports professional as current edition', () => {
      expect(currentEdition()).toBe('professional');
    });
  });

  describe('Dynamic unlocking', () => {
    it('unlocks features when state changes from free to annual', () => {
      initFeatureGate('free');
      expect(canUse('privacy.clean')).toBe(false);

      initFeatureGate('annual');
      expect(canUse('privacy.clean')).toBe(true);
    });

    it('unlocks all features when edition is updated to professional', () => {
      initFeatureGate('free');
      expect(canUse('driver.update')).toBe(false);

      updateFeatureGateEdition('professional');
      expect(canUse('driver.update')).toBe(true);
    });
  });

  describe('Dynamic locking (expiry)', () => {
    it('locks features when state changes to expired', () => {
      initFeatureGate('annual');
      expect(canUse('privacy.clean')).toBe(true);

      initFeatureGate('expired');
      expect(canUse('privacy.clean')).toBe(false);
    });

    it('locks all features when edition reverts to free', () => {
      initFeatureGate('annual');
      updateFeatureGateEdition('professional');
      expect(canUse('driver.update')).toBe(true);

      initFeatureGate('free');
      expect(canUse('driver.update')).toBe(false);
    });
  });

  describe('Offline grace period', () => {
    it('continues honoring professional edition during grace period', () => {
      initFeatureGate('grace_period');
      expect(canUse('registry.fix')).toBe(true);
      expect(canUse('performance.optimize')).toBe(true);
    });

    it('continues honoring professional edition during grace period', () => {
      initFeatureGate('grace_period');
      expect(canUse('driver.update')).toBe(true);
      expect(canUse('antivirus.scan')).toBe(true);
    });
  });

  describe('Backward compatibility', () => {
    it('normalizes old pro alias to professional', () => {
      updateFeatureGateEdition('pro');
      expect(currentEdition()).toBe('professional');
    });

    it('normalizes old enterprise alias to professional', () => {
      updateFeatureGateEdition('enterprise');
      expect(currentEdition()).toBe('professional');
    });
  });

  describe('isHidden', () => {
    it('hides hardGated features from non-eligible editions', () => {
      initFeatureGate('free');
      expect(isHidden('multi_device.management')).toBe(true);
    });

    it('does not hide hardGated features from eligible editions', () => {
      updateFeatureGateEdition('professional');
      expect(isHidden('multi_device.management')).toBe(false);
    });
  });
});
