/**
 * EditionLimits — centralized service for Free vs Professional usage limits.
 *
 * This is the single source of truth for all edition-based quotas.
 * Every module queries this service instead of scattering limit logic.
 *
 * Free edition: Understand your PC — analyze, inspect, manually improve.
 * Professional edition: Let AVS Shield take care of your PC — automation, unlimited, continuous.
 */

import { useIsPro } from '../sync/syncStore';

// ── Types ──────────────────────────────────────────────────────

export interface EditionLimit {
  /** Maximum value for Free edition, or null for unlimited */
  free: number | null;
  /** Maximum value for Professional edition, or null for unlimited */
  professional: number | null;
  /** Human-readable description of the Free limit */
  freeLabel: string;
  /** Human-readable description of the Pro benefit */
  proLabel: string;
}

export interface EditionLimits {
  // Dashboard
  dashboardRecommendations: EditionLimit;
  dashboardSecurityEvents: EditionLimit;

  // AI Copilot
  aiCopilotQuestionsPerDay: EditionLimit;

  // AI Smart Optimize
  aiSmartOptimizePerRun: EditionLimit;

  // AI Daily Briefing
  dailyBriefingPerDay: EditionLimit;

  // Junk Cleaner
  junkCleanerBytesPerRun: EditionLimit;

  // Registry Cleaner
  registryCleanerIssuesPerRun: EditionLimit;

  // Startup Manager
  startupManagerEntriesPerRun: EditionLimit;

  // Browser Cleaner
  browserCleanerBrowsersPerRun: EditionLimit;

  // Duplicate Finder
  duplicateFinderFilesPerRun: EditionLimit;

  // Large File Analyzer
  largeFileAnalyzerFilesPerSession: EditionLimit;

  // Software Uninstaller
  softwareUninstallerBatchMode: EditionLimit;

  // Process Intelligence
  processIntelligenceTopProcesses: EditionLimit;

  // Hardware Center
  hardwareCenterHistoryHours: EditionLimit;

  // Predictive Health
  predictiveHealthForecastDays: EditionLimit;

  // Security
  securityRealTimeProtection: EditionLimit;
  securityScheduledScans: EditionLimit;
  securityAutoQuarantine: EditionLimit;
  securityAutoRemediation: EditionLimit;
  securityManualQuarantine: EditionLimit;
  securityManualRemediation: EditionLimit;

  // Reports
  reportsHistoryDays: EditionLimit;
  reportsExportFormats: EditionLimit;

  // Automation
  automationScheduledOptimization: EditionLimit;
  automationBackgroundOptimization: EditionLimit;
  automationAutoMaintenance: EditionLimit;
  automationAutoUpdateChecks: EditionLimit;
}

// ── Limit Definitions ──────────────────────────────────────────

export const EDITION_LIMITS: EditionLimits = {
  // Dashboard
  dashboardRecommendations: {
    free: 3,
    professional: null,
    freeLabel: 'Top 3 recommendations',
    proLabel: 'Unlimited recommendations',
  },
  dashboardSecurityEvents: {
    free: 5,
    professional: null,
    freeLabel: 'Latest 5 security events',
    proLabel: 'Unlimited security events',
  },

  // AI Copilot
  aiCopilotQuestionsPerDay: {
    free: 20,
    professional: null,
    freeLabel: '20 AI questions per day',
    proLabel: 'Unlimited AI questions',
  },

  // AI Smart Optimize
  aiSmartOptimizePerRun: {
    free: 5,
    professional: null,
    freeLabel: 'Maximum 5 optimizations per run',
    proLabel: 'Unlimited optimizations',
  },

  // AI Daily Briefing
  dailyBriefingPerDay: {
    free: 1,
    professional: null,
    freeLabel: 'One briefing per day',
    proLabel: 'Unlimited briefings + custom reports',
  },

  // Junk Cleaner
  junkCleanerBytesPerRun: {
    free: 500 * 1024 * 1024, // 500 MB
    professional: null,
    freeLabel: 'Clean up to 500 MB per run',
    proLabel: 'Unlimited cleaning',
  },

  // Registry Cleaner
  registryCleanerIssuesPerRun: {
    free: 50,
    professional: null,
    freeLabel: 'Repair up to 50 issues',
    proLabel: 'Unlimited repair',
  },

  // Startup Manager
  startupManagerEntriesPerRun: {
    free: 3,
    professional: null,
    freeLabel: 'Disable up to 3 entries',
    proLabel: 'Unlimited management',
  },

  // Browser Cleaner
  browserCleanerBrowsersPerRun: {
    free: 1,
    professional: null,
    freeLabel: 'Clean one browser at a time',
    proLabel: 'Clean all browsers simultaneously',
  },

  // Duplicate Finder
  duplicateFinderFilesPerRun: {
    free: 20,
    professional: null,
    freeLabel: 'Delete up to 20 duplicates',
    proLabel: 'Unlimited deletion',
  },

  // Large File Analyzer
  largeFileAnalyzerFilesPerSession: {
    free: 10,
    professional: null,
    freeLabel: 'Delete 10 files per session',
    proLabel: 'Unlimited deletion',
  },

  // Software Uninstaller
  softwareUninstallerBatchMode: {
    free: 0,
    professional: 1,
    freeLabel: 'Manual uninstall only',
    proLabel: 'Batch uninstall + leftover cleanup',
  },

  // Process Intelligence
  processIntelligenceTopProcesses: {
    free: 10,
    professional: null,
    freeLabel: 'Top 10 processes',
    proLabel: 'Unlimited processes + live monitoring',
  },

  // Hardware Center
  hardwareCenterHistoryHours: {
    free: 24,
    professional: null,
    freeLabel: 'Last 24 hours of history',
    proLabel: 'Unlimited history + trends + forecasting',
  },

  // Predictive Health
  predictiveHealthForecastDays: {
    free: 7,
    professional: null,
    freeLabel: '7-day forecast',
    proLabel: 'Unlimited forecast horizon',
  },

  // Security
  securityRealTimeProtection: {
    free: 0,
    professional: 1,
    freeLabel: 'Manual scans only',
    proLabel: 'Real-time protection active',
  },
  securityScheduledScans: {
    free: 0,
    professional: 1,
    freeLabel: 'Manual scans only',
    proLabel: 'Scheduled scans enabled',
  },
  securityAutoQuarantine: {
    free: 0,
    professional: 1,
    freeLabel: 'Manual quarantine',
    proLabel: 'Automatic quarantine',
  },
  securityAutoRemediation: {
    free: 0,
    professional: 1,
    freeLabel: 'Manual remediation',
    proLabel: 'Automatic remediation',
  },
  securityManualQuarantine: {
    free: 0,
    professional: 1,
    freeLabel: 'View threats only — upgrade to quarantine',
    proLabel: 'Quarantine detected threats',
  },
  securityManualRemediation: {
    free: 0,
    professional: 1,
    freeLabel: 'View threats only — upgrade to remove',
    proLabel: 'Remove threats and execute remediation plans',
  },

  // Reports
  reportsHistoryDays: {
    free: 30,
    professional: null,
    freeLabel: 'Last 30 days',
    proLabel: 'Unlimited history',
  },
  reportsExportFormats: {
    free: 1,
    professional: 4,
    freeLabel: 'PDF export only',
    proLabel: 'PDF, CSV, JSON, Excel exports',
  },

  // Automation
  automationScheduledOptimization: {
    free: 0,
    professional: 1,
    freeLabel: 'Manual only',
    proLabel: 'Scheduled optimization enabled',
  },
  automationBackgroundOptimization: {
    free: 0,
    professional: 1,
    freeLabel: 'Manual only',
    proLabel: 'Background optimization enabled',
  },
  automationAutoMaintenance: {
    free: 0,
    professional: 1,
    freeLabel: 'Manual only',
    proLabel: 'Automatic maintenance enabled',
  },
  automationAutoUpdateChecks: {
    free: 0,
    professional: 1,
    freeLabel: 'Manual update checks',
    proLabel: 'Automatic update checks',
  },
};

// ── Hook ───────────────────────────────────────────────────────

/**
 * useEditionLimits — React hook that returns limit values for the current edition.
 *
 * Usage:
 *   const limits = useEditionLimits();
 *   const maxRecs = limits.getLimit('dashboardRecommendations');
 *   const isPro = limits.isPro;
 */
export function useEditionLimits() {
  const isPro = useIsPro();

  const getLimit = (key: keyof EditionLimits): number | null => {
    const limit = EDITION_LIMITS[key];
    return isPro ? limit.professional : limit.free;
  };

  const getLabel = (key: keyof EditionLimits): string => {
    const limit = EDITION_LIMITS[key];
    return isPro ? limit.proLabel : limit.freeLabel;
  };

  const isFeatureEnabled = (key: keyof EditionLimits): boolean => {
    const limit = EDITION_LIMITS[key];
    const value = isPro ? limit.professional : limit.free;
    return value !== 0 && value !== null;
  };

  const isLimitReached = (key: keyof EditionLimits, current: number): boolean => {
    const max = getLimit(key);
    if (max === null) return false; // unlimited
    return current >= max;
  };

  const remaining = (key: keyof EditionLimits, current: number): number | null => {
    const max = getLimit(key);
    if (max === null) return null; // unlimited
    return Math.max(0, max - current);
  };

  return {
    isPro,
    getLimit,
    getLabel,
    isFeatureEnabled,
    isLimitReached,
    remaining,
  };
}

// ── Non-hook helpers (for use in ViewModels, services, etc.) ────

export function getEditionLimit(key: keyof EditionLimits, isPro: boolean): number | null {
  const limit = EDITION_LIMITS[key];
  return isPro ? limit.professional : limit.free;
}

export function getEditionLabel(key: keyof EditionLimits, isPro: boolean): string {
  const limit = EDITION_LIMITS[key];
  return isPro ? limit.proLabel : limit.freeLabel;
}

export function isEditionFeatureEnabled(key: keyof EditionLimits, isPro: boolean): boolean {
  const limit = EDITION_LIMITS[key];
  const value = isPro ? limit.professional : limit.free;
  return value !== 0 && value !== null;
}

export function isEditionLimitReached(key: keyof EditionLimits, current: number, isPro: boolean): boolean {
  const max = getEditionLimit(key, isPro);
  if (max === null) return false;
  return current >= max;
}

export function getEditionRemaining(key: keyof EditionLimits, current: number, isPro: boolean): number | null {
  const max = getEditionLimit(key, isPro);
  if (max === null) return null;
  return Math.max(0, max - current);
}
