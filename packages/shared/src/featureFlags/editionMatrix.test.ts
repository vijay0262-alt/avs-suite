/**
 * Edition matrix tests — validates that the feature registry
 * correctly gates features according to the Free/Professional/Ultimate
 * edition matrix defined in the sprint spec.
 */
import { describe, expect, it } from 'vitest';
import {
  isFeatureEnabled,
  normalizeEdition,
  ALL_EDITIONS,
  FEATURES,
  type FeatureKey,
} from './index';

describe('Edition Matrix', () => {
  describe('Free edition', () => {
    const edition = 'free';

    it('grants Dashboard, System Info, Disk Analyzer', () => {
      expect(isFeatureEnabled('DASHBOARD', edition)).toBe(true);
      expect(isFeatureEnabled('SYSTEM_INFO', edition)).toBe(true);
      expect(isFeatureEnabled('DISK_ANALYZER', edition)).toBe(true);
    });

    it('grants Junk Cleaner Basic (scan, preview, clean)', () => {
      expect(isFeatureEnabled('JUNK_CLEANER_BASIC', edition)).toBe(true);
    });

    it('denies Junk Cleaner Deep and Unlimited', () => {
      expect(isFeatureEnabled('JUNK_CLEANER_DEEP', edition)).toBe(false);
      expect(isFeatureEnabled('JUNK_CLEANER_UNLIMITED', edition)).toBe(false);
    });

    it('grants Registry Scan but denies Registry Fix', () => {
      expect(isFeatureEnabled('REGISTRY_SCAN', edition)).toBe(true);
      expect(isFeatureEnabled('REGISTRY_FIX', edition)).toBe(false);
    });

    it('grants Startup View but denies Startup Disable', () => {
      expect(isFeatureEnabled('STARTUP_VIEW', edition)).toBe(true);
      expect(isFeatureEnabled('STARTUP_DISABLE', edition)).toBe(false);
    });

    it('grants Privacy Scan but denies Privacy Clean', () => {
      expect(isFeatureEnabled('PRIVACY_SCAN', edition)).toBe(true);
      expect(isFeatureEnabled('PRIVACY_CLEAN', edition)).toBe(false);
    });

    it('grants Duplicate Scan but denies Duplicate Delete', () => {
      expect(isFeatureEnabled('DUPLICATE_SCAN', edition)).toBe(true);
      expect(isFeatureEnabled('DUPLICATE_DELETE', edition)).toBe(false);
    });

    it('grants Uninstaller View + Standard but denies Deep', () => {
      expect(isFeatureEnabled('UNINSTALLER_VIEW', edition)).toBe(true);
      expect(isFeatureEnabled('UNINSTALLER_STANDARD', edition)).toBe(true);
      expect(isFeatureEnabled('UNINSTALLER_DEEP', edition)).toBe(false);
    });

    it('grants Software Update Scan but denies Manual and All', () => {
      expect(isFeatureEnabled('SOFTWARE_UPDATE_SCAN', edition)).toBe(true);
      expect(isFeatureEnabled('SOFTWARE_UPDATE_MANUAL', edition)).toBe(false);
      expect(isFeatureEnabled('SOFTWARE_UPDATE_ALL', edition)).toBe(false);
    });

    it('denies Performance, Scheduled, Smart Recommendations, History, Health Timeline', () => {
      expect(isFeatureEnabled('PERFORMANCE_OPTIMIZE', edition)).toBe(false);
      expect(isFeatureEnabled('SCHEDULED_MAINTENANCE', edition)).toBe(false);
      expect(isFeatureEnabled('SMART_RECOMMENDATIONS', edition)).toBe(false);
      expect(isFeatureEnabled('OPTIMIZATION_HISTORY', edition)).toBe(false);
      expect(isFeatureEnabled('HEALTH_TIMELINE', edition)).toBe(false);
    });

    it('denies all Background, Real-Time, Auto features', () => {
      expect(isFeatureEnabled('BACKGROUND_MONITORING', edition)).toBe(false);
      expect(isFeatureEnabled('REAL_TIME_PROTECTION', edition)).toBe(false);
      expect(isFeatureEnabled('AUTO_BACKGROUND_CLEANUP', edition)).toBe(false);
      expect(isFeatureEnabled('AUTO_JUNK_CLEANUP', edition)).toBe(false);
    });

    it('denies Driver, Antivirus, AI, Browser, Battery, Game Mode', () => {
      expect(isFeatureEnabled('DRIVER_UPDATER', edition)).toBe(false);
      expect(isFeatureEnabled('ANTIVIRUS', edition)).toBe(false);
      expect(isFeatureEnabled('AI_SMART_OPTIMIZATION', edition)).toBe(false);
      expect(isFeatureEnabled('BROWSER_PROTECTION', edition)).toBe(false);
      expect(isFeatureEnabled('BATTERY_OPTIMIZATION', edition)).toBe(false);
      expect(isFeatureEnabled('GAME_MODE', edition)).toBe(false);
    });

    it('denies Priority and Premium Support', () => {
      expect(isFeatureEnabled('PRIORITY_SUPPORT', edition)).toBe(false);
      expect(isFeatureEnabled('PREMIUM_SUPPORT', edition)).toBe(false);
    });
  });

  describe('Professional edition', () => {
    const edition = 'professional';

    it('grants everything from Free plus Pro features', () => {
      expect(isFeatureEnabled('JUNK_CLEANER_BASIC', edition)).toBe(true);
      expect(isFeatureEnabled('JUNK_CLEANER_DEEP', edition)).toBe(true);
      expect(isFeatureEnabled('JUNK_CLEANER_UNLIMITED', edition)).toBe(true);
    });

    it('grants Registry Fix, Startup Disable, Privacy Clean, Duplicate Delete', () => {
      expect(isFeatureEnabled('REGISTRY_FIX', edition)).toBe(true);
      expect(isFeatureEnabled('STARTUP_DISABLE', edition)).toBe(true);
      expect(isFeatureEnabled('PRIVACY_CLEAN', edition)).toBe(true);
      expect(isFeatureEnabled('DUPLICATE_DELETE', edition)).toBe(true);
    });

    it('grants Uninstaller Deep, Software Update Manual', () => {
      expect(isFeatureEnabled('UNINSTALLER_DEEP', edition)).toBe(true);
      expect(isFeatureEnabled('SOFTWARE_UPDATE_MANUAL', edition)).toBe(true);
    });

    it('grants Performance, Scheduled, Smart Recommendations, History, Health Timeline', () => {
      expect(isFeatureEnabled('PERFORMANCE_OPTIMIZE', edition)).toBe(true);
      expect(isFeatureEnabled('SCHEDULED_MAINTENANCE', edition)).toBe(true);
      expect(isFeatureEnabled('SMART_RECOMMENDATIONS', edition)).toBe(true);
      expect(isFeatureEnabled('OPTIMIZATION_HISTORY', edition)).toBe(true);
      expect(isFeatureEnabled('HEALTH_TIMELINE', edition)).toBe(true);
    });

    it('grants Priority Support', () => {
      expect(isFeatureEnabled('PRIORITY_SUPPORT', edition)).toBe(true);
    });

    it('denies Ultimate-only features', () => {
      expect(isFeatureEnabled('SOFTWARE_UPDATE_ALL', edition)).toBe(false);
      expect(isFeatureEnabled('DRIVER_UPDATER', edition)).toBe(false);
      expect(isFeatureEnabled('ANTIVIRUS', edition)).toBe(false);
      expect(isFeatureEnabled('AI_SMART_OPTIMIZATION', edition)).toBe(false);
      expect(isFeatureEnabled('BROWSER_PROTECTION', edition)).toBe(false);
      expect(isFeatureEnabled('BATTERY_OPTIMIZATION', edition)).toBe(false);
      expect(isFeatureEnabled('GAME_MODE', edition)).toBe(false);
      expect(isFeatureEnabled('PREMIUM_SUPPORT', edition)).toBe(false);
    });

    it('denies Ultimate-only background/auto features', () => {
      expect(isFeatureEnabled('BACKGROUND_MONITORING', edition)).toBe(false);
      expect(isFeatureEnabled('REAL_TIME_PROTECTION', edition)).toBe(false);
      expect(isFeatureEnabled('AUTO_BACKGROUND_CLEANUP', edition)).toBe(false);
      expect(isFeatureEnabled('AUTO_STARTUP_OPTIMIZATION', edition)).toBe(false);
      expect(isFeatureEnabled('AUTO_JUNK_CLEANUP', edition)).toBe(false);
      expect(isFeatureEnabled('AUTO_PRIVACY_PROTECTION', edition)).toBe(false);
      expect(isFeatureEnabled('REAL_TIME_NOTIFICATIONS', edition)).toBe(false);
    });
  });

  describe('Ultimate edition', () => {
    const edition = 'ultimate';

    it('grants everything from Professional', () => {
      const proFeatures: FeatureKey[] = [
        'JUNK_CLEANER_UNLIMITED', 'REGISTRY_FIX', 'STARTUP_DISABLE',
        'PRIVACY_CLEAN', 'DUPLICATE_DELETE', 'UNINSTALLER_DEEP',
        'SOFTWARE_UPDATE_MANUAL', 'PERFORMANCE_OPTIMIZE',
        'SCHEDULED_MAINTENANCE', 'SMART_RECOMMENDATIONS',
        'OPTIMIZATION_HISTORY', 'HEALTH_TIMELINE', 'PRIORITY_SUPPORT',
      ];
      for (const f of proFeatures) {
        expect(isFeatureEnabled(f, edition)).toBe(true);
      }
    });

    it('grants Ultimate-only features', () => {
      expect(isFeatureEnabled('DRIVER_UPDATER', edition)).toBe(true);
      expect(isFeatureEnabled('ANTIVIRUS', edition)).toBe(true);
      expect(isFeatureEnabled('AI_SMART_OPTIMIZATION', edition)).toBe(true);
      expect(isFeatureEnabled('SOFTWARE_UPDATE_ALL', edition)).toBe(true);
      expect(isFeatureEnabled('AUTO_BACKGROUND_CLEANUP', edition)).toBe(true);
      expect(isFeatureEnabled('BACKGROUND_MONITORING', edition)).toBe(true);
      expect(isFeatureEnabled('AUTO_STARTUP_OPTIMIZATION', edition)).toBe(true);
      expect(isFeatureEnabled('BROWSER_PROTECTION', edition)).toBe(true);
      expect(isFeatureEnabled('BATTERY_OPTIMIZATION', edition)).toBe(true);
      expect(isFeatureEnabled('GAME_MODE', edition)).toBe(true);
      expect(isFeatureEnabled('AUTO_PRIVACY_PROTECTION', edition)).toBe(true);
      expect(isFeatureEnabled('AUTO_JUNK_CLEANUP', edition)).toBe(true);
      expect(isFeatureEnabled('REAL_TIME_NOTIFICATIONS', edition)).toBe(true);
      expect(isFeatureEnabled('PREMIUM_SUPPORT', edition)).toBe(true);
    });
  });

  describe('Trial edition', () => {
    const edition = 'trial';

    it('grants Professional-level features', () => {
      expect(isFeatureEnabled('REGISTRY_FIX', edition)).toBe(true);
      expect(isFeatureEnabled('PERFORMANCE_OPTIMIZE', edition)).toBe(true);
      expect(isFeatureEnabled('PRIORITY_SUPPORT', edition)).toBe(true);
    });

    it('grants Ultimate-level features for evaluation', () => {
      expect(isFeatureEnabled('DRIVER_UPDATER', edition)).toBe(true);
      expect(isFeatureEnabled('ANTIVIRUS', edition)).toBe(true);
      expect(isFeatureEnabled('AI_SMART_OPTIMIZATION', edition)).toBe(true);
    });
  });

  describe('Backward compatibility', () => {
    it('normalizes pro → professional', () => {
      expect(normalizeEdition('pro')).toBe('professional');
    });

    it('normalizes enterprise → ultimate', () => {
      expect(normalizeEdition('enterprise')).toBe('ultimate');
    });

    it('falls back to free for unknown editions', () => {
      expect(normalizeEdition('unknown')).toBe('free');
    });
  });

  describe('Registry completeness', () => {
    it('every feature has at least one edition', () => {
      for (const key of Object.keys(FEATURES) as FeatureKey[]) {
        expect(FEATURES[key].editions.length).toBeGreaterThan(0);
      }
    });

    it('all editions are valid', () => {
      for (const key of Object.keys(FEATURES) as FeatureKey[]) {
        for (const ed of FEATURES[key].editions) {
          expect(ALL_EDITIONS).toContain(ed);
        }
      }
    });
  });
});
