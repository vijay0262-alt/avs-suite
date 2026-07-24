import { describe, expect, it } from 'vitest';
import { isFeatureEnabled, shouldHideFeature, normalizeEdition, ALL_EDITIONS } from './index';

describe('featureFlags', () => {
  it('grants Junk Cleaner Basic to every edition', () => {
    for (const edition of ALL_EDITIONS) {
      expect(isFeatureEnabled('JUNK_CLEANER_BASIC', edition)).toBe(true);
    }
  });

  it('restricts Duplicate Delete to Professional / Ultimate / Trial', () => {
    expect(isFeatureEnabled('DUPLICATE_DELETE', 'free')).toBe(false);
    expect(isFeatureEnabled('DUPLICATE_DELETE', 'professional')).toBe(true);
    expect(isFeatureEnabled('DUPLICATE_DELETE', 'ultimate')).toBe(true);
    expect(isFeatureEnabled('DUPLICATE_DELETE', 'trial')).toBe(true);
  });

  it('restricts Driver Updater to Ultimate / Trial only', () => {
    expect(isFeatureEnabled('DRIVER_UPDATER', 'free')).toBe(false);
    expect(isFeatureEnabled('DRIVER_UPDATER', 'professional')).toBe(false);
    expect(isFeatureEnabled('DRIVER_UPDATER', 'ultimate')).toBe(true);
    expect(isFeatureEnabled('DRIVER_UPDATER', 'trial')).toBe(true);
  });

  it('grants Performance Optimize to Professional / Ultimate / Trial', () => {
    expect(isFeatureEnabled('PERFORMANCE_OPTIMIZE', 'free')).toBe(false);
    expect(isFeatureEnabled('PERFORMANCE_OPTIMIZE', 'professional')).toBe(true);
    expect(isFeatureEnabled('PERFORMANCE_OPTIMIZE', 'ultimate')).toBe(true);
  });

  it('grants Antivirus to Ultimate / Trial only', () => {
    expect(isFeatureEnabled('ANTIVIRUS', 'free')).toBe(false);
    expect(isFeatureEnabled('ANTIVIRUS', 'professional')).toBe(false);
    expect(isFeatureEnabled('ANTIVIRUS', 'ultimate')).toBe(true);
  });

  it('hides hardGated Ultimate-only features from other editions', () => {
    expect(shouldHideFeature('MULTI_DEVICE_MANAGEMENT', 'free')).toBe(true);
    expect(shouldHideFeature('MULTI_DEVICE_MANAGEMENT', 'professional')).toBe(true);
    expect(shouldHideFeature('MULTI_DEVICE_MANAGEMENT', 'ultimate')).toBe(false);
  });

  it('normalizes old edition aliases', () => {
    expect(normalizeEdition('pro')).toBe('professional');
    expect(normalizeEdition('enterprise')).toBe('ultimate');
    expect(normalizeEdition('free')).toBe('free');
    expect(normalizeEdition('professional')).toBe('professional');
    expect(normalizeEdition('ultimate')).toBe('ultimate');
  });
});
