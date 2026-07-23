/**
 * Feature Manager — the single entry point for feature gating.
 *
 * Every premium feature check in the application must go through:
 *   FeatureManager.has('privacy_cleaner')
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

/**
 * Feature keys supported by the FeatureManager.
 * These map to the FEATURES registry in @avs/shared/featureFlags
 * but use the snake_case names specified in the sprint requirements.
 */
export type ManagedFeature =
  | 'privacy_cleaner'
  | 'registry_cleaner'
  | 'software_updater'
  | 'drive_wiper'
  | 'scheduled_cleaning'
  | 'advanced_startup'
  | 'history'
  | 'junk_cleaner_basic'
  | 'junk_cleaner_deep'
  | 'duplicate_finder'
  | 'disk_analyzer'
  | 'performance_boost'
  | 'multi_device_management'
  | 'priority_support';

/**
 * Mapping from ManagedFeature (snake_case) to FeatureKey (PascalCase)
 * in the @avs/shared/featureFlags registry.
 */
const FEATURE_MAP: Record<ManagedFeature, string> = {
  privacy_cleaner: 'PRIVACY_CLEANER',
  registry_cleaner: 'REGISTRY_CLEANER',
  software_updater: 'SOFTWARE_UPDATER',
  drive_wiper: 'DRIVE_WIPER',
  scheduled_cleaning: 'SCHEDULED_MAINTENANCE',
  advanced_startup: 'STARTUP_MANAGER',
  history: 'HISTORY',
  junk_cleaner_basic: 'JUNK_CLEANER_BASIC',
  junk_cleaner_deep: 'JUNK_CLEANER_DEEP',
  duplicate_finder: 'DUPLICATE_FINDER',
  disk_analyzer: 'DISK_ANALYZER',
  performance_boost: 'PERFORMANCE_BOOST',
  multi_device_management: 'MULTI_DEVICE_MANAGEMENT',
  priority_support: 'PRIORITY_SUPPORT',
};

/**
 * Interface for the Feature Manager.
 * This is what modules import and call.
 */
export interface IFeatureManager {
  /** Check if a feature is available in the current license state. */
  has(feature: ManagedFeature): boolean;

  /** Check if a feature should be hidden entirely (hard-gated). */
  isHidden(feature: ManagedFeature): boolean;

  /** Get the current license state. */
  currentState(): LicenseState;

  /** Get the current resolved edition. */
  currentEdition(): 'free' | 'pro' | 'enterprise' | 'trial';
}

/**
 * Feature manager configuration — maps features to their enabled states.
 * This is a pure function of the license state.
 *
 * The concrete FeatureManager is created with a license state provider
 * and uses the @avs/shared/featureFlags registry for the actual gating.
 */
export interface FeatureManagerConfig {
  /** Function that returns the current license state. */
  getState: () => LicenseState;
  /** Feature availability override (for testing or A/B testing). */
  overrides?: Partial<Record<ManagedFeature, boolean>>;
}

/**
 * Pure function: check if a feature is enabled for a given license state.
 * Uses the feature map and the shared featureFlags registry.
 *
 * This is exported for testing and for consumers that don't need
 * the full FeatureManager instance.
 */
export function isFeatureAvailableForState(
  feature: ManagedFeature,
  state: LicenseState,
): boolean {
  const edition = stateToEdition(state);

  // Features not yet in the shared registry (future features)
  // are always unavailable until the registry is updated.
  const registryKey = FEATURE_MAP[feature];
  if (registryKey === 'HISTORY' || registryKey === 'DRIVE_WIPER' || registryKey === 'SOFTWARE_UPDATER') {
    // These features are defined in the sprint but not yet in the
    // @avs/shared/featureFlags FEATURES registry. They will be
    // available in all editions once implemented, unless gated.
    // For now, return false to prevent accidental use.
    return false;
  }

  // Map to the shared featureFlags function
  // We import dynamically to avoid circular deps
  return checkSharedFeature(registryKey, edition);
}

/**
 * Delegate to @avs/shared/featureFlags at runtime.
 * This is called lazily to avoid circular import issues.
 */
function checkSharedFeature(
  registryKey: string,
  edition: 'free' | 'pro' | 'enterprise' | 'trial',
): boolean {
  try {
    // Dynamic require pattern for the shared feature flags
    // In the bundled app, this is resolved at build time via tsconfig paths
    const flags = getSharedFeatureFlags();
    if (!flags) return false;
    const featureKey = registryKey as keyof typeof flags.FEATURES;
    if (!(featureKey in flags.FEATURES)) return false;
    return flags.isFeatureEnabled(featureKey, edition);
  } catch {
    return false;
  }
}

/**
 * Lazy accessor for the shared feature flags module.
 * Avoids circular import issues.
 */
type SharedFeatureFlags = typeof SharedFeatureFlagsModule;
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
 * Factory: create a FeatureManager instance.
 *
 * Usage at bootstrap:
 *   const fm = createFeatureManager({ getState: () => licenseManager.getState() });
 *   if (fm.has('privacy_cleaner')) { ... }
 */
export function createFeatureManager(config: FeatureManagerConfig): IFeatureManager {
  return {
    has(feature: ManagedFeature): boolean {
      if (config.overrides && feature in config.overrides) {
        return config.overrides[feature]!;
      }
      return isFeatureAvailableForState(feature, config.getState());
    },

    isHidden(feature: ManagedFeature): boolean {
      const state = config.getState();
      const edition = stateToEdition(state);
      try {
        const flags = getSharedFeatureFlags();
        if (!flags) return false;
        const registryKey = FEATURE_MAP[feature] as keyof typeof flags.FEATURES;
        if (!(registryKey in flags.FEATURES)) return false;
        return flags.shouldHideFeature(registryKey, edition);
      } catch {
        return false;
      }
    },

    currentState(): LicenseState {
      return config.getState();
    },

    currentEdition() {
      return stateToEdition(config.getState());
    },
  };
}
