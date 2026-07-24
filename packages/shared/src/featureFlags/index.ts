/**
 * Edition & feature-flag registry.
 *
 * Every gated capability lives here so the app can compile once and be
 * shipped as Free, Professional, or Ultimate by resolving the current
 * edition at runtime (from the licensing package).
 *
 * A capability is a boolean-valued key. Its enabled editions are declared
 * declaratively — no scattered `if (edition === 'professional')` in components.
 *
 * Three commercial editions:
 *   - free         — basic features, encourages upgrade
 *   - professional — full optimization suite
 *   - ultimate     — premium suite with extras (antivirus, driver updater, AI, etc.)
 *
 * Trial maps to professional-level access for evaluation.
 */

export type Edition = 'free' | 'professional' | 'ultimate' | 'trial';

export const ALL_EDITIONS: readonly Edition[] = ['free', 'professional', 'ultimate', 'trial'];

/**
 * Backward-compatibility aliases.
 * Old code that references 'pro' or 'enterprise' should use these
 * to map to the new edition names.
 */
export const EDITION_ALIASES: Record<string, Edition> = {
  pro: 'professional',
  enterprise: 'ultimate',
};

/**
 * Normalize any edition string (including old aliases) to the current type.
 */
export function normalizeEdition(raw: string): Edition {
  if (EDITION_ALIASES[raw]) return EDITION_ALIASES[raw];
  if (ALL_EDITIONS.includes(raw as Edition)) return raw as Edition;
  return 'free';
}

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
 *
 * Edition matrix:
 *   F = free, P = professional, U = ultimate, T = trial
 */
export const FEATURES = {
  // ── Dashboard & System Info ──────────────────────────────────
  DASHBOARD: {
    key: 'dashboard',
    description: 'Full system dashboard with health overview.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },
  SYSTEM_INFO: {
    key: 'system-info',
    description: 'Full system information display.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },

  // ── Disk Analyzer ────────────────────────────────────────────
  DISK_ANALYZER: {
    key: 'disk-analyzer',
    description: 'Visualise disk usage by folder and file type.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },

  // ── Junk Cleaner ─────────────────────────────────────────────
  JUNK_CLEANER_BASIC: {
    key: 'junk-cleaner-basic',
    description: 'Scan and preview junk files.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },
  JUNK_CLEANER_DEEP: {
    key: 'junk-cleaner-deep',
    description: 'Deep browser + application cache sweep with rules engine.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },
  JUNK_CLEANER_UNLIMITED: {
    key: 'junk-cleaner-unlimited',
    description: 'Unlimited junk cleaning (no daily cap).',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },

  // ── Registry Cleaner ─────────────────────────────────────────
  REGISTRY_SCAN: {
    key: 'registry-scan',
    description: 'Scan and preview registry issues.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },
  REGISTRY_FIX: {
    key: 'registry-fix',
    description: 'Fix registry issues (unlimited entries).',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },

  // ── Startup Manager ──────────────────────────────────────────
  STARTUP_VIEW: {
    key: 'startup-view',
    description: 'View startup programs and services.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },
  STARTUP_DISABLE: {
    key: 'startup-disable',
    description: 'Enable / disable Windows startup entries and services.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },

  // ── Privacy Cleaner ──────────────────────────────────────────
  PRIVACY_SCAN: {
    key: 'privacy-scan',
    description: 'Scan and preview privacy traces.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },
  PRIVACY_CLEAN: {
    key: 'privacy-clean',
    description: 'Clear traces from browsers and Windows components.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },

  // ── Duplicate Finder ─────────────────────────────────────────
  DUPLICATE_SCAN: {
    key: 'duplicate-scan',
    description: 'Scan and preview duplicate files.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },
  DUPLICATE_DELETE: {
    key: 'duplicate-delete',
    description: 'Delete duplicate files.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },

  // ── Uninstaller ──────────────────────────────────────────────
  UNINSTALLER_VIEW: {
    key: 'uninstaller-view',
    description: 'View installed applications.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },
  UNINSTALLER_STANDARD: {
    key: 'uninstaller-standard',
    description: 'Standard application uninstall.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },
  UNINSTALLER_DEEP: {
    key: 'uninstaller-deep',
    description: 'Deep cleanup after uninstall (residual files, registry).',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },

  // ── Software Updater ─────────────────────────────────────────
  SOFTWARE_UPDATE_SCAN: {
    key: 'software-update-scan',
    description: 'Scan installed software for available updates.',
    editions: ['free', 'professional', 'ultimate', 'trial'] as const,
  },
  SOFTWARE_UPDATE_MANUAL: {
    key: 'software-update-manual',
    description: 'Manually update individual software.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },
  SOFTWARE_UPDATE_ALL: {
    key: 'software-update-all',
    description: 'One-click update all software at once.',
    editions: ['ultimate', 'trial'] as const,
  },

  // ── Performance ──────────────────────────────────────────────
  PERFORMANCE_OPTIMIZE: {
    key: 'performance-optimize',
    description: 'One-click tuning presets for gaming, work, and battery.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },

  // ── Scheduled Optimization ───────────────────────────────────
  SCHEDULED_MAINTENANCE: {
    key: 'scheduled-maintenance',
    description: 'Run scans automatically on a schedule (weekly, monthly, custom).',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },

  // ── Smart Recommendations & History ──────────────────────────
  SMART_RECOMMENDATIONS: {
    key: 'smart-recommendations',
    description: 'AI-powered optimization recommendations.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },
  OPTIMIZATION_HISTORY: {
    key: 'optimization-history',
    description: 'View past optimization actions and results.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },
  HEALTH_TIMELINE: {
    key: 'health-timeline',
    description: 'Historical health score timeline.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },

  // ── Background & Real-Time ───────────────────────────────────
  BACKGROUND_MONITORING: {
    key: 'background-monitoring',
    description: 'Continuous background system monitoring.',
    editions: ['ultimate', 'trial'] as const,
  },
  REAL_TIME_PROTECTION: {
    key: 'real-time-protection',
    description: 'Real-time system protection and alerts.',
    editions: ['ultimate', 'trial'] as const,
  },
  AUTO_BACKGROUND_CLEANUP: {
    key: 'auto-background-cleanup',
    description: 'Automatic cleanup in the background without user intervention.',
    editions: ['ultimate', 'trial'] as const,
  },
  AUTO_STARTUP_OPTIMIZATION: {
    key: 'auto-startup-optimization',
    description: 'Automatically optimize startup items.',
    editions: ['ultimate', 'trial'] as const,
  },
  AUTO_JUNK_CLEANUP: {
    key: 'auto-junk-cleanup',
    description: 'Automatically clean junk files on a schedule.',
    editions: ['ultimate', 'trial'] as const,
  },
  AUTO_PRIVACY_PROTECTION: {
    key: 'auto-privacy-protection',
    description: 'Automatically clear privacy traces.',
    editions: ['ultimate', 'trial'] as const,
  },
  REAL_TIME_NOTIFICATIONS: {
    key: 'real-time-notifications',
    description: 'Real-time system notifications and alerts.',
    editions: ['ultimate', 'trial'] as const,
  },

  // ── Driver Updater (Ultimate) ────────────────────────────────
  DRIVER_UPDATER: {
    key: 'driver-updater',
    description: 'Scan and update system drivers.',
    editions: ['ultimate', 'trial'] as const,
  },

  // ── Antivirus (Ultimate) ─────────────────────────────────────
  ANTIVIRUS: {
    key: 'antivirus',
    description: 'Built-in antivirus scanning and protection.',
    editions: ['ultimate', 'trial'] as const,
  },

  // ── AI Smart Optimization (Ultimate) ─────────────────────────
  AI_SMART_OPTIMIZATION: {
    key: 'ai-smart-optimization',
    description: 'AI-driven automatic system optimization.',
    editions: ['ultimate', 'trial'] as const,
  },

  // ── Browser Protection (Ultimate) ────────────────────────────
  BROWSER_PROTECTION: {
    key: 'browser-protection',
    description: 'Real-time browser security and privacy protection.',
    editions: ['ultimate', 'trial'] as const,
  },

  // ── Battery Optimization (Ultimate) ──────────────────────────
  BATTERY_OPTIMIZATION: {
    key: 'battery-optimization',
    description: 'Battery life optimization and power management.',
    editions: ['ultimate', 'trial'] as const,
  },

  // ── Game Mode (Ultimate) ─────────────────────────────────────
  GAME_MODE: {
    key: 'game-mode',
    description: 'Optimized system settings for gaming.',
    editions: ['ultimate', 'trial'] as const,
  },

  // ── Support ──────────────────────────────────────────────────
  PRIORITY_SUPPORT: {
    key: 'priority-support',
    description: 'Priority customer support.',
    editions: ['professional', 'ultimate', 'trial'] as const,
  },
  PREMIUM_SUPPORT: {
    key: 'premium-support',
    description: 'Premium 24/7 customer support with remote assistance.',
    editions: ['ultimate', 'trial'] as const,
  },

  // ── Multi-Device (kept for backward compat) ──────────────────
  MULTI_DEVICE_MANAGEMENT: {
    key: 'multi-device-management',
    description: 'Central console across multiple licensed devices.',
    editions: ['ultimate'] as const,
    hardGated: true,
  },
} satisfies Record<string, FeatureFlag>;

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
  const f = FEATURES[feature] as FeatureFlag;
  return Boolean(f.hardGated) && !(f.editions as readonly Edition[]).includes(edition);
}
