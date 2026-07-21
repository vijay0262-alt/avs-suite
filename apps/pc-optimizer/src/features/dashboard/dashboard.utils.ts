/**
 * Dashboard utilities — incremental health score calculation.
 *
 * Computes a HealthScore directly from DashboardMetrics so the UI can update
 * in real time without an additional RPC round-trip every poll cycle.
 */
import type {
  DashboardMetrics,
  HealthScore,
  HealthStatus,
  HealthSummaryItem,
  HealthCategoryDetail,
  CategoryScores,
} from './dashboard.types';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function scoreFromUsage(usagePercent: number): number {
  // Lower usage is better; invert and curve slightly.
  return clamp(100 - usagePercent * 1.1);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function determineStatus(overallScore: number): HealthStatus {
  if (overallScore >= 90) return 'excellent';
  if (overallScore >= 75) return 'good';
  if (overallScore >= 60) return 'fair';
  if (overallScore >= 40) return 'poor';
  return 'critical';
}

function buildSuggestions(metrics: DashboardMetrics): string[] {
  const suggestions: string[] = [];

  if (metrics.cpu.usage > 80) {
    suggestions.push('High CPU usage detected — close unused applications or review startup programs.');
  }
  if (metrics.memory.usage > 85) {
    suggestions.push('Memory usage is high — close background apps or disable unnecessary startup items.');
  }
  if (metrics.storage.some((d) => d.usage > 90)) {
    suggestions.push('A drive is over 90% full — run Disk Analyzer to free up space.');
  }
  if (metrics.storage.some((d) => d.usage > 80)) {
    suggestions.push('Storage is getting low — consider cleaning junk files.');
  }
  if (!metrics.security.defender.enabled || !metrics.security.defender.realTimeProtection) {
    suggestions.push('Real-time protection is disabled — re-enable Windows Defender or your antivirus.');
  }
  if (!metrics.security.firewall.enabled) {
    suggestions.push('Windows Firewall is disabled — enable it for better security.');
  }
  if (metrics.security.updates.pendingUpdates > 0) {
    suggestions.push('Windows updates are pending — install them to improve security.');
  }
  if (metrics.performance.potentialRecoverable > 1024 * 1024 * 1024) {
    suggestions.push('Over 1 GB of recoverable space found — run Junk Cleaner to reclaim it.');
  }
  if (metrics.performance.startupApps > 10) {
    suggestions.push('Many startup applications detected — review Startup Analyzer to speed up boot.');
  }

  return suggestions;
}

/**
 * Calculate an incremental HealthScore from the latest DashboardMetrics.
 *
 * This avoids a second RPC call every metrics poll and keeps the dashboard
 * score in sync with the live data already on the client.
 *
 * CANONICAL SOURCE: this is the only Health Score calculation that feeds
 * the main Dashboard (HealthScoreCard, HealthBreakdown, HealthSummary). The
 * backend `dashboard.health` RPC (`dashboard_health()` /
 * `dashboardService.getHealthScore()`) is a separate, unused calculation
 * with different weights — do not wire it into the Dashboard without first
 * retiring this one, or the two will disagree. The Health Scan modal's
 * per-run "overall score" (see `DashboardViewModel.finishHealthScan`) is
 * also a distinct, session-scoped score and is intentionally not the same
 * number as this one.
 */
function toGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

function buildSummary(metrics: DashboardMetrics, privacyRisks: number | null): HealthSummaryItem[] {
  const summary: HealthSummaryItem[] = [];

  if (metrics.performance.potentialRecoverable > 1024 * 1024 * 1024) {
    summary.push({
      text: `${toGB(metrics.performance.potentialRecoverable).toFixed(1)} GB temporary files`,
      severity: 'warning',
    });
  }

  if (metrics.performance.startupApps > 5) {
    summary.push({
      text: `${metrics.performance.startupApps} unnecessary startup applications`,
      severity: 'warning',
    });
  }

  if (metrics.memory.usage > 80) {
    summary.push({
      text: 'RAM usage is high',
      severity: 'danger',
    });
  } else if (metrics.memory.usage > 60) {
    summary.push({
      text: 'RAM usage is elevated',
      severity: 'warning',
    });
  }

  metrics.storage.forEach((drive) => {
    if (drive.usage > 90) {
      summary.push({
        text: `Drive ${drive.name} is ${drive.usage.toFixed(0)}% full`,
        severity: 'danger',
      });
    } else if (drive.usage > 75) {
      summary.push({
        text: `Drive ${drive.name} is ${drive.usage.toFixed(0)}% full`,
        severity: 'warning',
      });
    }
  });

  if (metrics.performance.browserCacheSize > 100 * 1024 * 1024) {
    summary.push({
      text: 'Browser cache can be cleaned',
      severity: 'info',
    });
  }

  if (metrics.security.updates.pendingUpdates > 0) {
    summary.push({
      text: 'Windows has pending updates',
      severity: 'warning',
    });
  }

  if (privacyRisks && privacyRisks > 0) {
    summary.push({
      text: `${privacyRisks} privacy risks found`,
      severity: 'warning',
    });
  }

  if (summary.length === 0) {
    summary.push({
      text: 'Your PC is in great shape',
      severity: 'success',
    });
  }

  return summary;
}

function determineCategorySeverity(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

function buildCategoryDetails(
  metrics: DashboardMetrics,
  privacyRisks: number | null,
  scores: CategoryScores
): HealthCategoryDetail[] {
  const privacy = privacyRisks ?? 0;
  const privacyScore = clamp(100 - privacy * 10);

  const securityDetail = (() => {
    if (!metrics.security.defender.enabled) return 'Windows Defender disabled';
    if (!metrics.security.defender.realTimeProtection) return 'Real-time protection off';
    if (!metrics.security.firewall.enabled) return 'Firewall disabled';
    if (metrics.security.updates.pendingUpdates > 0) return `${metrics.security.updates.pendingUpdates} pending updates`;
    return 'All protections active';
  })();

  const firstDrive = metrics.storage[0];
  const storageDetail = firstDrive
    ? `${toGB(metrics.performance.potentialRecoverable).toFixed(1)} GB junk files`
    : 'No storage data';

  return [
    {
      id: 'storage',
      name: 'Storage',
      score: Math.round(scores.storage),
      detail: storageDetail,
      actionLabel: 'View Details',
      path: '/junk-cleaner',
      severity: determineCategorySeverity(scores.storage),
    },
    {
      id: 'memory',
      name: 'Memory',
      score: Math.round(scores.memory),
      detail: `${metrics.memory.usage.toFixed(0)}% Used`,
      actionLabel: 'Optimize',
      path: '/performance',
      severity: determineCategorySeverity(scores.memory),
    },
    {
      id: 'startup',
      name: 'Startup',
      score: Math.round(scores.performance),
      detail: `${metrics.performance.startupApps} Startup Apps`,
      actionLabel: 'Review',
      path: '/startup',
      severity: determineCategorySeverity(scores.performance),
    },
    {
      id: 'privacy',
      name: 'Privacy',
      score: Math.round(privacyScore),
      detail: `${privacy} Privacy Risks`,
      actionLabel: 'Clean',
      path: '/privacy',
      severity: determineCategorySeverity(privacyScore),
    },
    {
      id: 'security',
      name: 'Security',
      score: Math.round(scores.security),
      detail: securityDetail,
      actionLabel: 'Review',
      path: '/security',
      severity: determineCategorySeverity(scores.security),
    },
    {
      id: 'performance',
      name: 'Performance',
      score: Math.round(scores.performance),
      detail: `CPU ${metrics.cpu.usage.toFixed(0)}% / RAM ${metrics.memory.usage.toFixed(0)}%`,
      actionLabel: 'View',
      path: '/performance',
      severity: determineCategorySeverity(scores.performance),
    },
  ];
}

export function calculateHealthScore(metrics: DashboardMetrics, privacyRisks: number | null = null): HealthScore {
  const cpuScore = scoreFromUsage(metrics.cpu.usage);

  const memoryScore = scoreFromUsage(metrics.memory.usage);

  const storageScore = clamp(
    average(metrics.storage.map((d) => scoreFromUsage(d.usage)))
  );

  // Security is binary-ish: full points when all protections are on.
  let securityScore = 100;
  if (!metrics.security.defender.enabled) securityScore -= 25;
  if (!metrics.security.defender.realTimeProtection) securityScore -= 25;
  if (!metrics.security.firewall.enabled) securityScore -= 20;
  if (!metrics.security.smartScreen) securityScore -= 10;
  if (metrics.security.updates.pendingUpdates > 0) securityScore -= 15;
  securityScore = clamp(securityScore);

  // Performance score combines startup count, recoverable space, and temp files.
  const startupPenalty = Math.min(40, metrics.performance.startupApps * 3);
  const recoverablePenalty =
    metrics.performance.potentialRecoverable > 0
      ? Math.min(25, Math.log10(metrics.performance.potentialRecoverable / (1024 * 1024) + 1) * 8)
      : 0;
  const tempPenalty =
    metrics.performance.temporaryFilesSize > 0
      ? Math.min(20, Math.log10(metrics.performance.temporaryFilesSize / (1024 * 1024) + 1) * 5)
      : 0;
  const performanceScore = clamp(100 - startupPenalty - recoverablePenalty - tempPenalty);

  const weights = {
    cpu: 0.2,
    memory: 0.2,
    storage: 0.25,
    security: 0.2,
    performance: 0.15,
  };

  const overallScore = clamp(
    cpuScore * weights.cpu +
      memoryScore * weights.memory +
      storageScore * weights.storage +
      securityScore * weights.security +
      performanceScore * weights.performance
  );

  const summary = buildSummary(metrics, privacyRisks);
  const categoryDetails = buildCategoryDetails(metrics, privacyRisks, {
    cpu: Math.round(cpuScore),
    memory: Math.round(memoryScore),
    storage: Math.round(storageScore),
    security: Math.round(securityScore),
    performance: Math.round(performanceScore),
  });

  const issuesFound = summary.filter((s) => s.severity === 'warning' || s.severity === 'danger').length;
  const bootImprovementSeconds = Math.min(60, metrics.performance.startupApps * 1.5);
  const memoryRecovery = metrics.memory.cached || 0;

  return {
    overallScore: Math.round(overallScore),
    categoryScores: {
      cpu: Math.round(cpuScore),
      memory: Math.round(memoryScore),
      storage: Math.round(storageScore),
      security: Math.round(securityScore),
      performance: Math.round(performanceScore),
    },
    status: determineStatus(overallScore),
    suggestions: buildSuggestions(metrics),
    capturedAt: metrics.capturedAt,
    issuesFound,
    recoverableSpace: metrics.performance.potentialRecoverable,
    memoryRecovery,
    bootImprovementSeconds,
    summary,
    categoryDetails,
  };
}
