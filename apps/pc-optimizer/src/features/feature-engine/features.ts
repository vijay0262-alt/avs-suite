/**
 * Feature definitions — the canonical list of all features in AVS AI Shield
 * Optimizer, controlled by the Feature Engine.
 *
 * Adding a new feature = add an entry to the Feature enum and to the
 * EDITION_MAPPINGS. No other code needs to change.
 *
 * This is intentionally separate from the existing @avs/shared/featureFlags
 * registry to avoid modifying shared packages. The FeatureEngine bridges
 * between the license store (which knows the edition) and the UI.
 */

/**
 * All features controlled by the Feature Enforcement Engine.
 *
 * Convention: UPPER_SNAKE_CASE, matches the module/feature name.
 */
export enum Feature {
  JUNK_CLEANER = 'JUNK_CLEANER',
  REGISTRY_CLEANER = 'REGISTRY_CLEANER',
  REALTIME_MONITOR = 'REALTIME_MONITOR',
  SCHEDULED_CLEANING = 'SCHEDULED_CLEANING',
  AUTO_CLEAN = 'AUTO_CLEAN',
  STARTUP_MANAGER = 'STARTUP_MANAGER',
  DRIVER_UPDATER = 'DRIVER_UPDATER',
  SYSTEM_HEALTH = 'SYSTEM_HEALTH',
  PERFORMANCE_BOOST = 'PERFORMANCE_BOOST',
  PRIVACY_CLEANER = 'PRIVACY_CLEANER',
  DISK_ANALYZER = 'DISK_ANALYZER',
  DUPLICATE_FINDER = 'DUPLICATE_FINDER',
  FILE_SHREDDER = 'FILE_SHREDDER',
  UNINSTALL_MANAGER = 'UNINSTALL_MANAGER',
}

/**
 * All features as a readonly array for iteration.
 */
export const ALL_FEATURES: readonly Feature[] = Object.values(Feature);

/**
 * Human-readable labels for each feature, used in Settings UI.
 */
export const FEATURE_LABELS: Record<Feature, string> = {
  [Feature.JUNK_CLEANER]: 'Junk Cleaner',
  [Feature.REGISTRY_CLEANER]: 'Registry Cleaner',
  [Feature.REALTIME_MONITOR]: 'Real-Time Monitor',
  [Feature.SCHEDULED_CLEANING]: 'Scheduled Cleaning',
  [Feature.AUTO_CLEAN]: 'Auto Clean',
  [Feature.STARTUP_MANAGER]: 'Startup Manager',
  [Feature.DRIVER_UPDATER]: 'Driver Updater',
  [Feature.SYSTEM_HEALTH]: 'System Health',
  [Feature.PERFORMANCE_BOOST]: 'Performance Boost',
  [Feature.PRIVACY_CLEANER]: 'Privacy Cleaner',
  [Feature.DISK_ANALYZER]: 'Disk Analyzer',
  [Feature.DUPLICATE_FINDER]: 'Duplicate Finder',
  [Feature.FILE_SHREDDER]: 'File Shredder',
  [Feature.UNINSTALL_MANAGER]: 'Uninstall Manager',
};
