import { describe, expect, it } from 'vitest';
import { isFeatureEnabled, shouldHideFeature, normalizeEdition, ALL_EDITIONS } from './index';

describe('featureFlags', () => {
  it('grants Junk Cleaner Basic to every edition', () => {
    for (const edition of ALL_EDITIONS) {
      expect(isFeatureEnabled('JUNK_CLEANER_BASIC', edition)).toBe(true);
    }
  });

  it('allows Duplicate Delete in Free with limits and Professional unlimited', () => {
    expect(isFeatureEnabled('DUPLICATE_DELETE', 'free')).toBe(true);
    expect(isFeatureEnabled('DUPLICATE_DELETE', 'professional')).toBe(true);
  });

  it('grants Driver Updater to Professional', () => {
    expect(isFeatureEnabled('DRIVER_UPDATER', 'free')).toBe(false);
    expect(isFeatureEnabled('DRIVER_UPDATER', 'professional')).toBe(true);
  });

  it('grants Performance Optimize to Professional', () => {
    expect(isFeatureEnabled('PERFORMANCE_OPTIMIZE', 'free')).toBe(false);
    expect(isFeatureEnabled('PERFORMANCE_OPTIMIZE', 'professional')).toBe(true);
  });

  it('grants Antivirus to Professional', () => {
    expect(isFeatureEnabled('ANTIVIRUS', 'free')).toBe(false);
    expect(isFeatureEnabled('ANTIVIRUS', 'professional')).toBe(true);
  });

  it('hides hardGated Professional-only features from Free', () => {
    expect(shouldHideFeature('MULTI_DEVICE_MANAGEMENT', 'free')).toBe(true);
    expect(shouldHideFeature('MULTI_DEVICE_MANAGEMENT', 'professional')).toBe(false);
  });

  it('normalizes old edition aliases', () => {
    expect(normalizeEdition('pro')).toBe('professional');
    expect(normalizeEdition('enterprise')).toBe('professional');
    expect(normalizeEdition('free')).toBe('free');
    expect(normalizeEdition('professional')).toBe('professional');
    expect(normalizeEdition('ultimate')).toBe('professional');
  });
});
