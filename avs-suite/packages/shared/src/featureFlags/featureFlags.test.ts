import { describe, expect, it } from 'vitest';
import { isFeatureEnabled, shouldHideFeature } from './index';

describe('featureFlags', () => {
  it('grants Junk Cleaner Basic to every edition', () => {
    for (const edition of ['free', 'pro', 'enterprise', 'trial'] as const) {
      expect(isFeatureEnabled('JUNK_CLEANER_BASIC', edition)).toBe(true);
    }
  });

  it('restricts Duplicate Finder to Pro / Enterprise / Trial', () => {
    expect(isFeatureEnabled('DUPLICATE_FINDER', 'free')).toBe(false);
    expect(isFeatureEnabled('DUPLICATE_FINDER', 'pro')).toBe(true);
    expect(isFeatureEnabled('DUPLICATE_FINDER', 'enterprise')).toBe(true);
    expect(isFeatureEnabled('DUPLICATE_FINDER', 'trial')).toBe(true);
  });

  it('hides hardGated Enterprise-only features from other editions', () => {
    expect(shouldHideFeature('MULTI_DEVICE_MANAGEMENT', 'free')).toBe(true);
    expect(shouldHideFeature('MULTI_DEVICE_MANAGEMENT', 'pro')).toBe(true);
    expect(shouldHideFeature('MULTI_DEVICE_MANAGEMENT', 'enterprise')).toBe(false);
  });
});
