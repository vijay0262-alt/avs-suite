/**
 * Edition & feature-flag registry.
 *
 * Every gated capability lives here so the app can compile once and be
 * shipped as Free, Pro, Enterprise, or Trial by resolving the current
 * edition at runtime (from the licensing package).
 *
 * A capability is a boolean-valued key. Its enabled editions are declared
 * declaratively — no scattered `if (edition === 'pro')` in components.
 */

export type Edition = 'free' | 'pro' | 'enterprise' | 'trial';

export const ALL_EDITIONS: readonly Edition[] = ['free', 'pro', 'enterprise', 'trial'];

/**
 * A single feature capability with its declarative gating rules.
 */
export interface FeatureFlag {
  /** Unique key (kebab-case). */
  key: string;
  /** Human-readable description; used in About / Settings > About screens. */
  description: string;
  /** Editions in which this feature is available. */
  editions: readonly Edition[];
  /** If true, the feature is hidden entirely from ineligible editions. */
  hardGated?: boolean;
}

/**
 * Central feature registry. Adding a new capability = add a row here.
 */
export const FEATURES = {
  JUNK_CLEANER_BASIC: {
    key: 'junk-cleaner-basic',
    description: 'Scan and remove standard junk files.',
    editions: ['free', 'pro', 'enterprise', 'trial'] as const,
  },
  JUNK_CLEANER_DEEP: {
    key: 'junk-cleaner-deep',
    description: 'Deep browser + application cache sweep with rules engine.',
    editions: ['pro', 'enterprise', 'trial'] as const,
  },
  STARTUP_MANAGER: {
    key: 'startup-manager',
    description: 'Enable / disable Windows startup entries and services.',
    editions: ['free', 'pro', 'enterprise', 'trial'] as const,
  },
  PRIVACY_CLEANER: {
    key: 'privacy-cleaner',
    description: 'Clear traces from browsers and Windows components.',
    editions: ['free', 'pro', 'enterprise', 'trial'] as const,
  },
  DUPLICATE_FINDER: {
    key: 'duplicate-finder',
    description: 'Locate duplicate files by hash and content.',
    editions: ['pro', 'enterprise', 'trial'] as const,
  },
  DISK_ANALYZER: {
    key: 'disk-analyzer',
    description: 'Visualise disk usage by folder and file type.',
    editions: ['free', 'pro', 'enterprise', 'trial'] as const,
  },
  PERFORMANCE_BOOST: {
    key: 'performance-boost',
    description: 'One-click tuning presets for gaming, work, and battery.',
    editions: ['pro', 'enterprise', 'trial'] as const,
  },
  SCHEDULED_MAINTENANCE: {
    key: 'scheduled-maintenance',
    description: 'Run scans automatically on a schedule.',
    editions: ['pro', 'enterprise', 'trial'] as const,
  },
  MULTI_DEVICE_MANAGEMENT: {
    key: 'multi-device-management',
    description: 'Central console across multiple licensed devices.',
    editions: ['enterprise'] as const,
    hardGated: true,
  },
  PRIORITY_SUPPORT: {
    key: 'priority-support',
    description: 'Priority customer support & remote assistance.',
    editions: ['pro', 'enterprise'] as const,
  },
} as const satisfies Record<string, FeatureFlag>;

export type FeatureKey = keyof typeof FEATURES;

/**
 * Pure predicate — is `feature` enabled for the given `edition`?
 */
export function isFeatureEnabled(feature: FeatureKey, edition: Edition): boolean {
  return (FEATURES[feature].editions as readonly Edition[]).includes(edition);
}

/**
 * If the feature is hardGated and the current edition lacks it, the UI
 * should hide the entry entirely (not render a locked/upsell card).
 */
export function shouldHideFeature(feature: FeatureKey, edition: Edition): boolean {
  const f = FEATURES[feature];
  return Boolean(f.hardGated) && !(f.editions as readonly Edition[]).includes(edition);
}
