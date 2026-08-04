/**
 * Edition & feature-flag registry.
 *
 * Every gated capability lives here so the app can compile once and be
 * shipped as Free or Professional by resolving the current
 * edition at runtime (from the licensing package).
 *
 * A capability is a boolean-valued key. Its enabled editions are declared
 * declaratively — no scattered `if (edition === 'professional')` in components.
 *
 * Two commercial editions:
 *   - free         — basic features, encourages upgrade
 *   - professional — full optimization suite
 */

export type Edition = 'free' | 'professional';

export const ALL_EDITIONS: readonly Edition[] = ['free', 'professional'];

/**
 * Backward-compatibility aliases.
 * Old code that references 'pro', 'enterprise', 'ultimate', or 'trial'
 * should map to the new edition names.
 */
export const EDITION_ALIASES: Record<string, Edition> = {
  pro: 'professional',
  enterprise: 'professional',
  ultimate: 'professional',
  trial: 'professional',
  total_security: 'professional',
};

/**
 * Normalize any edition string (including old aliases) to the current type.
 */
export function normalizeEdition(raw: string): Edition {
  const lower = raw.toLowerCase();
  if (EDITION_ALIASES[lower]) return EDITION_ALIASES[lower];
  if (ALL_EDITIONS.includes(lower as Edition)) return lower as Edition;
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
 *   F = free, P = professional
 */
export const FEATURES = {
  // ── Dashboard & System Info ──────────────────────────────────
  DASHBOARD: {
    key: 'dashboard',
    description: 'Full system dashboard with health overview.',
    editions: ['free', 'professional'] as const,
  },
  SYSTEM_INFO: {
    key: 'system-info',
    description: 'Full system information display.',
    editions: ['free', 'professional'] as const,
  },

  // ── Disk Analyzer ────────────────────────────────────────────
  DISK_ANALYZER: {
    key: 'disk-analyzer',
    description: 'Visualise disk usage by folder and file type.',
    editions: ['free', 'professional'] as const,
  },

  // ── Junk Cleaner ─────────────────────────────────────────────
  JUNK_CLEANER_BASIC: {
    key: 'junk-cleaner-basic',
    description: 'Scan and preview junk files.',
    editions: ['free', 'professional'] as const,
  },
  JUNK_CLEANER_DEEP: {
    key: 'junk-cleaner-deep',
    description: 'Deep browser + application cache sweep with rules engine.',
    editions: ['professional'] as const,
  },
  JUNK_CLEANER_UNLIMITED: {
    key: 'junk-cleaner-unlimited',
    description: 'Unlimited junk cleaning (no daily cap).',
    editions: ['professional'] as const,
  },

  // ── Registry Cleaner ─────────────────────────────────────────
  REGISTRY_SCAN: {
    key: 'registry-scan',
    description: 'Scan and preview registry issues.',
    editions: ['free', 'professional'] as const,
  },
  REGISTRY_FIX: {
    key: 'registry-fix',
    description: 'Fix registry issues.',
    editions: ['free', 'professional'] as const,
  },

  // ── Startup Manager ──────────────────────────────────────────
  STARTUP_VIEW: {
    key: 'startup-view',
    description: 'View startup programs and services.',
    editions: ['free', 'professional'] as const,
  },
  STARTUP_DISABLE: {
    key: 'startup-disable',
    description: 'Enable / disable Windows startup entries and services.',
    editions: ['free', 'professional'] as const,
  },

  // ── Privacy Cleaner ──────────────────────────────────────────
  PRIVACY_SCAN: {
    key: 'privacy-scan',
    description: 'Scan and preview privacy traces.',
    editions: ['professional'] as const,
  },
  PRIVACY_CLEAN: {
    key: 'privacy-clean',
    description: 'Clear traces from browsers and Windows components.',
    editions: ['professional'] as const,
  },

  // ── Duplicate Finder ─────────────────────────────────────────
  DUPLICATE_SCAN: {
    key: 'duplicate-scan',
    description: 'Scan and preview duplicate files.',
    editions: ['free', 'professional'] as const,
  },
  DUPLICATE_DELETE: {
    key: 'duplicate-delete',
    description: 'Delete duplicate files (up to 20 per session in Free).',
    editions: ['free', 'professional'] as const,
  },

  // ── Uninstaller ──────────────────────────────────────────────
  UNINSTALLER_VIEW: {
    key: 'uninstaller-view',
    description: 'View installed applications.',
    editions: ['professional'] as const,
  },
  UNINSTALLER_STANDARD: {
    key: 'uninstaller-standard',
    description: 'Standard application uninstall.',
    editions: ['professional'] as const,
  },
  UNINSTALLER_DEEP: {
    key: 'uninstaller-deep',
    description: 'Deep cleanup after uninstall (residual files, registry).',
    editions: ['professional'] as const,
  },

  // ── Software Updater ─────────────────────────────────────────
  SOFTWARE_UPDATE_SCAN: {
    key: 'software-update-scan',
    description: 'Scan installed software for available updates.',
    editions: ['professional'] as const,
  },
  SOFTWARE_UPDATE_MANUAL: {
    key: 'software-update-manual',
    description: 'Manually update individual software.',
    editions: ['professional'] as const,
  },
  SOFTWARE_UPDATE_ALL: {
    key: 'software-update-all',
    description: 'One-click update all software at once.',
    editions: ['professional'] as const,
  },

  // ── Performance ──────────────────────────────────────────────
  PERFORMANCE_OPTIMIZE: {
    key: 'performance-optimize',
    description: 'One-click tuning presets for gaming, work, and battery.',
    editions: ['professional'] as const,
  },

  // ── Scheduled Optimization ───────────────────────────────────
  SCHEDULED_MAINTENANCE: {
    key: 'scheduled-maintenance',
    description: 'Run scans automatically on a schedule (weekly, monthly, custom).',
    editions: ['professional'] as const,
  },

  // ── Smart Recommendations & History ──────────────────────────
  SMART_RECOMMENDATIONS: {
    key: 'smart-recommendations',
    description: 'AI-powered optimization recommendations.',
    editions: ['professional'] as const,
  },
  OPTIMIZATION_HISTORY: {
    key: 'optimization-history',
    description: 'View past optimization actions and results.',
    editions: ['professional'] as const,
  },
  HEALTH_TIMELINE: {
    key: 'health-timeline',
    description: 'Historical health score timeline.',
    editions: ['professional'] as const,
  },

  // ── Background & Real-Time ───────────────────────────────────
  BACKGROUND_MONITORING: {
    key: 'background-monitoring',
    description: 'Continuous background system monitoring.',
    editions: ['professional'] as const,
  },
  REAL_TIME_PROTECTION: {
    key: 'real-time-protection',
    description: 'Real-time system protection and alerts.',
    editions: ['professional'] as const,
  },
  AUTO_BACKGROUND_CLEANUP: {
    key: 'auto-background-cleanup',
    description: 'Automatic cleanup in the background without user intervention.',
    editions: ['professional'] as const,
  },
  AUTO_STARTUP_OPTIMIZATION: {
    key: 'auto-startup-optimization',
    description: 'Automatically optimize startup items.',
    editions: ['professional'] as const,
  },
  AUTO_JUNK_CLEANUP: {
    key: 'auto-junk-cleanup',
    description: 'Automatically clean junk files on a schedule.',
    editions: ['professional'] as const,
  },
  AUTO_PRIVACY_PROTECTION: {
    key: 'auto-privacy-protection',
    description: 'Automatically clear privacy traces.',
    editions: ['professional'] as const,
  },
  REAL_TIME_NOTIFICATIONS: {
    key: 'real-time-notifications',
    description: 'Real-time system notifications and alerts.',
    editions: ['professional'] as const,
  },

  // ── Driver Updater ───────────────────────────────────────────
  DRIVER_UPDATER: {
    key: 'driver-updater',
    description: 'Scan and update system drivers.',
    editions: ['professional'] as const,
  },

  // ── Antivirus ────────────────────────────────────────────────
  ANTIVIRUS: {
    key: 'antivirus',
    description: 'Built-in antivirus scanning and protection.',
    editions: ['professional'] as const,
  },

  // ── Security Center ──────────────────────────────────────────
  SECURITY_SCAN: {
    key: 'security-scan',
    description: 'AI-powered security scanning — detect spyware, adware, malware, and other threats.',
    editions: ['free', 'professional'] as const,
  },
  SECURITY_QUARANTINE: {
    key: 'security-quarantine',
    description: 'Quarantine detected threats — isolate infected files safely.',
    editions: ['professional'] as const,
  },
  SECURITY_REMEDIATE: {
    key: 'security-remediate',
    description: 'Remove threats and execute remediation plans — delete, rollback, and restore.',
    editions: ['professional'] as const,
  },

  // ── AI Smart Optimization ────────────────────────────────────
  AI_SMART_OPTIMIZATION: {
    key: 'ai-smart-optimization',
    description: 'AI-driven automatic system optimization.',
    editions: ['professional'] as const,
  },

  // ── Browser Protection ───────────────────────────────────────
  BROWSER_PROTECTION: {
    key: 'browser-protection',
    description: 'Real-time browser security and privacy protection.',
    editions: ['professional'] as const,
  },

  // ── Battery Optimization ─────────────────────────────────────
  BATTERY_OPTIMIZATION: {
    key: 'battery-optimization',
    description: 'Battery life optimization and power management.',
    editions: ['professional'] as const,
  },

  // ── Game Mode ────────────────────────────────────────────────
  GAME_MODE: {
    key: 'game-mode',
    description: 'Optimized system settings for gaming.',
    editions: ['professional'] as const,
  },

  // ── Support ──────────────────────────────────────────────────
  PRIORITY_SUPPORT: {
    key: 'priority-support',
    description: 'Priority customer support.',
    editions: ['professional'] as const,
  },
  PREMIUM_SUPPORT: {
    key: 'premium-support',
    description: 'Premium 24/7 customer support with remote assistance.',
    editions: ['professional'] as const,
  },

  // ── Multi-Device ─────────────────────────────────────────────
  MULTI_DEVICE_MANAGEMENT: {
    key: 'multi-device-management',
    description: 'Central console across multiple licensed devices.',
    editions: ['professional'] as const,
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
