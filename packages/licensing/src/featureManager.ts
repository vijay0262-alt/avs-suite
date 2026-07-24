/**
 * Feature Manager — the single entry point for feature gating.
 *
 * Every premium feature check in the application must go through:
 *   FeatureManager.has('junk.clean')
 *   FeatureGate.can_use('registry.fix')
 *
 * Never perform direct license or edition checks inside modules.
 * The FeatureManager resolves the current license state to an
 * edition and delegates to the existing @avs/shared/featureFlags
 * registry.
 *
 * This module defines the interface and a factory. The concrete
 * instance is created at bootstrap with the current license state.
 */
import type { LicenseState } from './states';
import { stateToEdition } from './states';
import type * as SharedFeatureFlagsModule from '@avs/shared/featureFlags';

type SharedFeatureFlags = typeof SharedFeatureFlagsModule;

/**
 * Action-based feature keys (dot notation).
 *
 * These are the granular actions that modules check before
 * allowing the user to perform an operation.
 *
 * Convention: <module>.<action>
 */
export type ManagedFeature =
  // Junk Cleaner
  | 'junk.scan'
  | 'junk.preview'
  | 'junk.clean'
  | 'junk.clean_unlimited'
  | 'junk.deep_scan'
  // Registry Cleaner
  | 'registry.scan'
  | 'registry.fix'
  // Startup Manager
  | 'startup.view'
  | 'startup.disable'
  // Privacy Cleaner
  | 'privacy.scan'
  | 'privacy.clean'
  // Duplicate Finder
  | 'duplicate.scan'
  | 'duplicate.delete'
  // Uninstaller
  | 'uninstaller.view'
  | 'uninstaller.standard'
  | 'uninstaller.deep'
  // Software Updater
  | 'software.update_scan'
  | 'software.update_manual'
  | 'software.update_all'
  // Performance
  | 'performance.optimize'
  // Scheduled Optimization
  | 'scheduled.optimization'
  // Smart Recommendations & History
  | 'smart.recommendations'
  | 'optimization.history'
  | 'health.timeline'
  // Background & Real-Time
  | 'background.monitoring'
  | 'real_time.protection'
  | 'auto.background_cleanup'
  | 'auto.startup_optimization'
  | 'auto.junk_cleanup'
  | 'auto.privacy_protection'
  | 'real_time.notifications'
  // Driver Updater
  | 'driver.update'
  // Antivirus
  | 'antivirus.scan'
  // AI Smart Optimization
  | 'ai.smart_optimization'
  // Browser Protection
  | 'browser.protection'
  // Battery Optimization
  | 'battery.optimization'
  // Game Mode
  | 'game.mode'
  // Support
  | 'priority.support'
  | 'premium.support'
  // Multi-Device
  | 'multi_device.management'
  // Dashboard & System Info (always available, but here for completeness)
  | 'dashboard'
  | 'system.info'
  | 'disk.analyzer';

/**
 * Mapping from ManagedFeature (dot notation) to FeatureKey (PascalCase)
 * in the @avs/shared/featureFlags registry.
 */
export const FEATURE_MAP: Record<ManagedFeature, string> = {
  // Junk Cleaner
  'junk.scan': 'JUNK_CLEANER_BASIC',
  'junk.preview': 'JUNK_CLEANER_BASIC',
  'junk.clean': 'JUNK_CLEANER_BASIC',
  'junk.clean_unlimited': 'JUNK_CLEANER_UNLIMITED',
  'junk.deep_scan': 'JUNK_CLEANER_DEEP',
  // Registry Cleaner
  'registry.scan': 'REGISTRY_SCAN',
  'registry.fix': 'REGISTRY_FIX',
  // Startup Manager
  'startup.view': 'STARTUP_VIEW',
  'startup.disable': 'STARTUP_DISABLE',
  // Privacy Cleaner
  'privacy.scan': 'PRIVACY_SCAN',
  'privacy.clean': 'PRIVACY_CLEAN',
  // Duplicate Finder
  'duplicate.scan': 'DUPLICATE_SCAN',
  'duplicate.delete': 'DUPLICATE_DELETE',
  // Uninstaller
  'uninstaller.view': 'UNINSTALLER_VIEW',
  'uninstaller.standard': 'UNINSTALLER_STANDARD',
  'uninstaller.deep': 'UNINSTALLER_DEEP',
  // Software Updater
  'software.update_scan': 'SOFTWARE_UPDATE_SCAN',
  'software.update_manual': 'SOFTWARE_UPDATE_MANUAL',
  'software.update_all': 'SOFTWARE_UPDATE_ALL',
  // Performance
  'performance.optimize': 'PERFORMANCE_OPTIMIZE',
  // Scheduled Optimization
  'scheduled.optimization': 'SCHEDULED_MAINTENANCE',
  // Smart Recommendations & History
  'smart.recommendations': 'SMART_RECOMMENDATIONS',
  'optimization.history': 'OPTIMIZATION_HISTORY',
  'health.timeline': 'HEALTH_TIMELINE',
  // Background & Real-Time
  'background.monitoring': 'BACKGROUND_MONITORING',
  'real_time.protection': 'REAL_TIME_PROTECTION',
  'auto.background_cleanup': 'AUTO_BACKGROUND_CLEANUP',
  'auto.startup_optimization': 'AUTO_STARTUP_OPTIMIZATION',
  'auto.junk_cleanup': 'AUTO_JUNK_CLEANUP',
  'auto.privacy_protection': 'AUTO_PRIVACY_PROTECTION',
  'real_time.notifications': 'REAL_TIME_NOTIFICATIONS',
  // Driver Updater
  'driver.update': 'DRIVER_UPDATER',
  // Antivirus
  'antivirus.scan': 'ANTIVIRUS',
  // AI Smart Optimization
  'ai.smart_optimization': 'AI_SMART_OPTIMIZATION',
  // Browser Protection
  'browser.protection': 'BROWSER_PROTECTION',
  // Battery Optimization
  'battery.optimization': 'BATTERY_OPTIMIZATION',
  // Game Mode
  'game.mode': 'GAME_MODE',
  // Support
  'priority.support': 'PRIORITY_SUPPORT',
  'premium.support': 'PREMIUM_SUPPORT',
  // Multi-Device
  'multi_device.management': 'MULTI_DEVICE_MANAGEMENT',
  // Dashboard & System Info
  'dashboard': 'DASHBOARD',
  'system.info': 'SYSTEM_INFO',
  'disk.analyzer': 'DISK_ANALYZER',
};

/**
 * Interface for the Feature Manager.
 * This is what modules import and call.
 */
export interface IFeatureManager {
  /** Check if a feature action is available in the current edition. */
  has(feature: ManagedFeature): boolean;
  /** Check if a feature should be hidden entirely (hard-gated). */
  isHidden(feature: ManagedFeature): boolean;
  /** Get the current resolved edition. */
  currentEdition(): 'free' | 'professional' | 'ultimate' | 'trial';
}

/**
 * Configuration for creating a FeatureManager.
 */
export interface FeatureManagerConfig {
  /** Function that returns the current license state. */
  getState: () => LicenseState;
}

/**
 * Check if a feature is available for a given license state.
 * Pure function — no side effects.
 */
export function isFeatureAvailableForState(feature: ManagedFeature, state: LicenseState): boolean {
  const edition = stateToEdition(state);
  const featureKey = FEATURE_MAP[feature];
  if (!featureKey) return false;
  return checkFeatureInRegistry(featureKey, edition);
}

function checkFeatureInRegistry(featureKey: string, edition: string): boolean {
  const flags = getSharedFeatureFlags();
  if (!flags) return edition === 'free' ? isFreeFeature(featureKey) : false;
  const FEATURES = flags.FEATURES;
  const key = featureKey as keyof typeof FEATURES;
  if (!(key in FEATURES)) return false;
  const flag = FEATURES[key];
  return (flag.editions as readonly string[]).includes(edition);
}

function isFreeFeature(featureKey: string): boolean {
  const freeFeatures = new Set([
    'DASHBOARD', 'SYSTEM_INFO', 'DISK_ANALYZER',
    'JUNK_CLEANER_BASIC', 'REGISTRY_SCAN', 'STARTUP_VIEW',
    'PRIVACY_SCAN', 'DUPLICATE_SCAN', 'UNINSTALLER_VIEW',
    'UNINSTALLER_STANDARD', 'SOFTWARE_UPDATE_SCAN',
  ]);
  return freeFeatures.has(featureKey);
}

let _sharedFlags: SharedFeatureFlags | null = null;
function getSharedFeatureFlags(): SharedFeatureFlags | null {
  if (_sharedFlags) return _sharedFlags;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sharedFlags = require('@avs/shared/featureFlags');
    return _sharedFlags;
  } catch {
    return null;
  }
}

/**
 * Factory: create a FeatureManager bound to a state provider.
 */
export function createFeatureManager(config: FeatureManagerConfig): IFeatureManager {
  const { getState } = config;
  return {
    has(feature: ManagedFeature): boolean {
      return isFeatureAvailableForState(feature, getState());
    },
    isHidden(feature: ManagedFeature): boolean {
      const edition = stateToEdition(getState());
      const featureKey = FEATURE_MAP[feature];
      if (!featureKey) return false;
      const flags = getSharedFeatureFlags();
      if (!flags) return false;
      const FEATURES = flags.FEATURES;
      const key = featureKey as keyof typeof FEATURES;
      if (!(key in FEATURES)) return false;
      const flag = FEATURES[key] as { hardGated?: boolean; editions: readonly string[] };
      return Boolean(flag.hardGated) && !(flag.editions as readonly string[]).includes(edition);
    },
    currentEdition() {
      return stateToEdition(getState());
    },
  };
}
