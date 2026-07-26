/**
 * Edition mappings — data-driven definition of which features are available
 * in each edition tier.
 *
 * Editions are cumulative: each tier includes all features from the
 * tier below, plus additional features.
 *
 *   FREE             → basic features
 *   PROFESSIONAL     → FREE + all advanced features
 *
 * The engine reads from this map. Adding a new edition or changing
 * which features belong to a tier only requires editing this file.
 */
import { Feature } from './features';

/**
 * Edition tiers recognized by the Feature Engine.
 *
 * Note: 'trial' maps to 'professional' for feature purposes.
 * Unknown editions default to 'free'.
 */
export type FeatureEdition =
  | 'FREE'
  | 'PROFESSIONAL';

/**
 * All editions in ascending order of capability.
 */
export const EDITION_TIERS: readonly FeatureEdition[] = [
  'FREE',
  'PROFESSIONAL',
];

/**
 * Human-readable labels for editions.
 */
export const EDITION_LABELS: Record<FeatureEdition, string> = {
  FREE: 'Free',
  PROFESSIONAL: 'Professional',
};

/**
 * Features included in each edition tier (non-cumulative — the engine
 * resolves cumulative access at runtime).
 */
export const EDITION_MAPPINGS: Record<FeatureEdition, readonly Feature[]> = {
  FREE: [
    Feature.JUNK_CLEANER,
    Feature.SYSTEM_HEALTH,
    Feature.PERFORMANCE_BOOST,
  ],

  PROFESSIONAL: [
    // Everything in FREE, plus all advanced features:
    Feature.STARTUP_MANAGER,
    Feature.PRIVACY_CLEANER,
    Feature.SCHEDULED_CLEANING,
    Feature.AUTO_CLEAN,
    Feature.DISK_ANALYZER,
    Feature.REALTIME_MONITOR,
    Feature.DRIVER_UPDATER,
    Feature.FILE_SHREDDER,
    Feature.DUPLICATE_FINDER,
    Feature.UNINSTALL_MANAGER,
    Feature.REGISTRY_CLEANER,
  ],
};

/**
 * Map from license edition string (from the license store) to FeatureEdition.
 *
 * The license server sends edition strings like "FREE", "PROFESSIONAL", etc.
 * Unknown or missing editions default to "FREE".
 *
 * "TRIAL" is treated as "PROFESSIONAL" for feature access.
 */
export function resolveEdition(licenseEdition: string | null | undefined): FeatureEdition {
  if (!licenseEdition) return 'FREE';
  const upper = licenseEdition.toUpperCase();
  switch (upper) {
    case 'FREE':
      return 'FREE';
    case 'PROFESSIONAL':
    case 'PRO':
    case 'ULTIMATE':
    case 'ENTERPRISE':
    case 'TOTAL_SECURITY':
    case 'TOTAL-SECURITY':
    case 'TRIAL':
      return 'PROFESSIONAL';
    default:
      return 'FREE';
  }
}

/**
 * Get the set of all features enabled for a given edition (cumulative).
 *
 * Resolves the tier hierarchy: PROFESSIONAL includes FREE.
 */
export function getFeaturesForEdition(edition: FeatureEdition): Set<Feature> {
  const enabled = new Set<Feature>();

  // Add features from this edition's tier and all lower tiers
  const tierIndex = EDITION_TIERS.indexOf(edition);
  if (tierIndex === -1) return enabled; // Unknown edition → no features

  for (let i = 0; i <= tierIndex; i++) {
    const tier = EDITION_TIERS[i]!;
    for (const feature of EDITION_MAPPINGS[tier]) {
      enabled.add(feature);
    }
  }

  return enabled;
}

/**
 * Find the minimum edition required to enable a given feature.
 *
 * Returns the lowest tier that includes the feature, or null if the
 * feature is not in any tier (shouldn't happen for valid features).
 */
export function getRequiredEdition(feature: Feature): FeatureEdition | null {
  for (const edition of EDITION_TIERS) {
    if (EDITION_MAPPINGS[edition].includes(feature)) {
      return edition;
    }
  }
  return null;
}
