/**
 * Dashboard utilities — HealthSnapshot calculation from real measured values.
 *
 * Computes a HealthSnapshot directly from DashboardMetrics so the UI can
 * update in real time without an additional RPC round-trip every poll cycle.
 *
 * Every score is derived from actual measured system values.
 * No predictions. No estimates. No hardcoded scores.
 */
import type {
  DashboardMetrics,
  HealthSnapshot,
  HealthStatus,
  HealthSummaryItem,
  HealthCategoryDetail,
  HealthIssue,
  CategoryScores,
  ScoreZone,
  HealthScoreWeights,
} from './dashboard.types';
import { DEFAULT_HEALTH_WEIGHTS } from './dashboard.types';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function determineStatus(overallScore: number): HealthStatus {
  if (overallScore >= 100) return 'perfect';
  if (overallScore >= 90) return 'excellent';
  if (overallScore >= 80) return 'good';
  if (overallScore >= 60) return 'fair';
  if (overallScore >= 40) return 'poor';
  return 'critical';
}

/**
 * Determine the score zone from the overall score.
 * Used by the UI to pick the correct color and message for the gauge.
 *
 *   100      → perfect   (green)
 *   90–99    → excellent (green)
 *   80–89    → good      (yellow)
 *   60–79    → fair      (orange)
 *   40–59    → poor      (orange-red)
 *   0–39     → critical  (red)
 */
function determineScoreZone(overallScore: number): ScoreZone {
  if (overallScore >= 100) return 'perfect';
  if (overallScore >= 90) return 'excellent';
  if (overallScore >= 80) return 'good';
  if (overallScore >= 60) return 'fair';
  if (overallScore >= 40) return 'poor';
  return 'critical';
}

function determineCategorySeverity(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

function toGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

function toMB(bytes: number): number {
  return bytes / (1024 * 1024);
}

// ── Issue builders ──────────────────────────────────────────────────

function buildStorageIssues(metrics: DashboardMetrics): HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (metrics.performance.temporaryFilesSize > 50 * 1024 * 1024) {
    issues.push({
      id: 'storage-temp-files',
      category: 'storage',
      title: 'Temporary Files',
      detail: `${toMB(metrics.performance.temporaryFilesSize).toFixed(0)} MB of temporary files`,
      severity: metrics.performance.temporaryFilesSize > 1024 * 1024 * 1024 ? 'high' : 'medium',
      measurableValue: metrics.performance.temporaryFilesSize,
      measurableUnit: 'bytes',
      actionPath: '/junk-cleaner',
      canAutoFix: true,
    });
  }

  if (metrics.performance.recycleBinSize > 50 * 1024 * 1024) {
    issues.push({
      id: 'storage-recycle-bin',
      category: 'storage',
      title: 'Recycle Bin',
      detail: `${toMB(metrics.performance.recycleBinSize).toFixed(0)} MB in Recycle Bin`,
      severity: 'medium',
      measurableValue: metrics.performance.recycleBinSize,
      measurableUnit: 'bytes',
      actionPath: '/junk-cleaner',
      canAutoFix: true,
    });
  }

  if (metrics.performance.browserCacheSize > 100 * 1024 * 1024) {
    issues.push({
      id: 'storage-browser-cache',
      category: 'storage',
      title: 'Browser Cache',
      detail: `${toMB(metrics.performance.browserCacheSize).toFixed(0)} MB of browser cache`,
      severity: 'low',
      measurableValue: metrics.performance.browserCacheSize,
      measurableUnit: 'bytes',
      actionPath: '/privacy-cleaner',
      canAutoFix: true,
    });
  }

  metrics.storage.forEach((drive) => {
    if (drive.usage > 90) {
      issues.push({
        id: `storage-drive-${drive.mount}`,
        category: 'storage',
        title: `Drive ${drive.name || drive.mount} nearly full`,
        detail: `${drive.usage.toFixed(0)}% used, ${toGB(drive.free).toFixed(1)} GB free`,
        severity: 'high',
        measurableValue: drive.usage,
        measurableUnit: 'percent',
        actionPath: '/disk-analyzer',
        canAutoFix: false,
      });
    } else if (drive.usage > 80) {
      issues.push({
        id: `storage-drive-${drive.mount}`,
        category: 'storage',
        title: `Drive ${drive.name || drive.mount} getting full`,
        detail: `${drive.usage.toFixed(0)}% used, ${toGB(drive.free).toFixed(1)} GB free`,
        severity: 'medium',
        measurableValue: drive.usage,
        measurableUnit: 'percent',
        actionPath: '/disk-analyzer',
        canAutoFix: false,
      });
    }
  });

  return issues;
}

function buildStartupIssues(metrics: DashboardMetrics): HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (metrics.performance.startupApps > 0) {
    issues.push({
      id: 'startup-enabled-apps',
      category: 'startup',
      title: `${metrics.performance.startupApps} startup apps enabled`,
      detail: `${metrics.performance.startupApps} applications launch at startup`,
      severity: metrics.performance.startupApps > 10 ? 'high' : metrics.performance.startupApps > 5 ? 'medium' : 'low',
      measurableValue: metrics.performance.startupApps,
      measurableUnit: 'count',
      actionPath: '/startup-manager',
      canAutoFix: true,
    });
  }

  return issues;
}

function buildPrivacyIssues(metrics: DashboardMetrics, privacyRisks: number | null): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const privacy = privacyRisks ?? 0;

  if (privacy > 0) {
    issues.push({
      id: 'privacy-browsers',
      category: 'privacy',
      title: `${privacy} browser(s) with privacy traces`,
      detail: `${privacy} browser(s) detected with cache, cookies, or history`,
      severity: privacy > 3 ? 'medium' : 'low',
      measurableValue: privacy,
      measurableUnit: 'count',
      actionPath: '/privacy-cleaner',
      canAutoFix: true,
    });
  }

  if (metrics.performance.browserCacheSize > 100 * 1024 * 1024) {
    issues.push({
      id: 'privacy-cache',
      category: 'privacy',
      title: 'Browser cache can be cleared',
      detail: `${toMB(metrics.performance.browserCacheSize).toFixed(0)} MB of browser cache data`,
      severity: 'low',
      measurableValue: metrics.performance.browserCacheSize,
      measurableUnit: 'bytes',
      actionPath: '/privacy-cleaner',
      canAutoFix: true,
    });
  }

  return issues;
}

function buildPerformanceIssues(metrics: DashboardMetrics): HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (metrics.cpu.usage > 80) {
    issues.push({
      id: 'perf-cpu-high',
      category: 'performance',
      title: 'High CPU usage',
      detail: `CPU usage is ${metrics.cpu.usage.toFixed(0)}%`,
      severity: 'high',
      measurableValue: metrics.cpu.usage,
      measurableUnit: 'percent',
      actionPath: '/performance',
      canAutoFix: false,
    });
  } else if (metrics.cpu.usage > 60) {
    issues.push({
      id: 'perf-cpu-elevated',
      category: 'performance',
      title: 'Elevated CPU usage',
      detail: `CPU usage is ${metrics.cpu.usage.toFixed(0)}%`,
      severity: 'medium',
      measurableValue: metrics.cpu.usage,
      measurableUnit: 'percent',
      actionPath: '/performance',
      canAutoFix: false,
    });
  }

  if (metrics.memory.usage > 85) {
    issues.push({
      id: 'perf-memory-high',
      category: 'performance',
      title: 'High memory usage',
      detail: `RAM usage is ${metrics.memory.usage.toFixed(0)}% (${toGB(metrics.memory.used).toFixed(1)} GB of ${toGB(metrics.memory.total).toFixed(1)} GB)`,
      severity: 'high',
      measurableValue: metrics.memory.usage,
      measurableUnit: 'percent',
      actionPath: '/performance',
      canAutoFix: true,
    });
  } else if (metrics.memory.usage > 70) {
    issues.push({
      id: 'perf-memory-elevated',
      category: 'performance',
      title: 'Elevated memory usage',
      detail: `RAM usage is ${metrics.memory.usage.toFixed(0)}%`,
      severity: 'medium',
      measurableValue: metrics.memory.usage,
      measurableUnit: 'percent',
      actionPath: '/performance',
      canAutoFix: true,
    });
  }

  return issues;
}

function buildSecurityIssues(metrics: DashboardMetrics): HealthIssue[] {
  const issues: HealthIssue[] = [];

  const thirdPartyAV = metrics.security.defender.thirdPartyAV || metrics.security.firewall.thirdPartyAV;
  const thirdPartyFirewall = metrics.security.firewall.thirdPartyFirewall;

  if (!thirdPartyAV) {
    if (!metrics.security.defender.enabled) {
      issues.push({
        id: 'security-defender',
        category: 'security',
        title: 'No active antivirus detected',
        detail: 'No antivirus product is registered with Windows Security Center',
        severity: 'high',
        measurableValue: 1,
        measurableUnit: 'count',
        actionPath: '/security',
        canAutoFix: false,
      });
    } else if (!metrics.security.defender.realTimeProtection) {
      issues.push({
        id: 'security-rtp',
        category: 'security',
        title: 'Real-time protection off',
        detail: 'Antivirus real-time protection is disabled',
        severity: 'high',
        measurableValue: 1,
        measurableUnit: 'count',
        actionPath: '/security',
        canAutoFix: false,
      });
    }

    if (!metrics.security.firewall.enabled && !thirdPartyFirewall) {
      issues.push({
        id: 'security-firewall',
        category: 'security',
        title: 'No active firewall detected',
        detail: 'No firewall product is active — your PC is exposed to network attacks',
        severity: 'high',
        measurableValue: 1,
        measurableUnit: 'count',
        actionPath: '/security',
        canAutoFix: false,
      });
    }
  }

  if (metrics.security.updates.serviceEnabled === false) {
    issues.push({
      id: 'security-updates-disabled',
      category: 'security',
      title: 'Windows Update service disabled',
      detail: 'Automatic updates are turned off — your system may miss critical security patches',
      severity: 'high',
      measurableValue: 1,
      measurableUnit: 'count',
      actionPath: '/security',
      canAutoFix: false,
    });
  }

  if (metrics.security.updates.pendingUpdates > 0) {
    issues.push({
      id: 'security-updates',
      category: 'security',
      title: `${metrics.security.updates.pendingUpdates} pending Windows updates`,
      detail: `${metrics.security.updates.pendingUpdates} updates are waiting to be installed`,
      severity: 'medium',
      measurableValue: metrics.security.updates.pendingUpdates,
      measurableUnit: 'count',
      actionPath: '/security',
      canAutoFix: false,
    });
  }

  return issues;
}

function buildWindowsIssues(metrics: DashboardMetrics): HealthIssue[] {
  const issues: HealthIssue[] = [];

  const uptimeDays = metrics.windows.uptime / 86400;
  if (uptimeDays > 30) {
    issues.push({
      id: 'windows-uptime',
      category: 'windows',
      title: 'System restart recommended',
      detail: `System has been running for ${Math.round(uptimeDays)} days without a restart`,
      severity: 'medium',
      measurableValue: Math.round(uptimeDays),
      measurableUnit: 'count',
      actionPath: '/system-information',
      canAutoFix: false,
    });
  }

  return issues;
}

function buildAllIssues(metrics: DashboardMetrics, privacyRisks: number | null): HealthIssue[] {
  return [
    ...buildStorageIssues(metrics),
    ...buildStartupIssues(metrics),
    ...buildPrivacyIssues(metrics, privacyRisks),
    ...buildPerformanceIssues(metrics),
    ...buildSecurityIssues(metrics),
    ...buildWindowsIssues(metrics),
  ];
}

// ── Summary ─────────────────────────────────────────────────────────

function buildSummary(issues: HealthIssue[]): HealthSummaryItem[] {
  if (issues.length === 0) {
    return [{ text: 'Your PC is in great shape', severity: 'success' }];
  }

  return issues.map((issue) => ({
    text: issue.detail,
    severity: issue.severity === 'high' ? 'danger' : issue.severity === 'medium' ? 'warning' : 'info',
  }));
}

// ── Category details ────────────────────────────────────────────────

function buildCategoryDetails(
  metrics: DashboardMetrics,
  privacyRisks: number | null,
  scores: CategoryScores
): HealthCategoryDetail[] {
  const privacy = privacyRisks ?? 0;

  const securityDetail = (() => {
    const thirdPartyAV = metrics.security.defender.thirdPartyAV || metrics.security.firewall.thirdPartyAV;
    const thirdPartyFirewall = metrics.security.firewall.thirdPartyFirewall;
    if (thirdPartyAV) return `${thirdPartyAV} protecting system`;
    if (!metrics.security.defender.enabled) return 'No antivirus detected';
    if (!metrics.security.defender.realTimeProtection) return 'Real-time protection off';
    if (!metrics.security.firewall.enabled && !thirdPartyFirewall) return 'No firewall active';
    if (metrics.security.updates.serviceEnabled === false) return 'Windows Update disabled';
    if (metrics.security.updates.pendingUpdates > 0) return `${metrics.security.updates.pendingUpdates} pending updates`;
    return 'All protections active';
  })();

  const storageDetail = metrics.performance.temporaryFilesSize > 0
    ? `${toMB(metrics.performance.temporaryFilesSize).toFixed(0)} MB temp files`
    : 'No junk files detected';

  const startupDetail = `${metrics.performance.startupApps} startup apps enabled`;

  const privacyDetail = privacy > 0
    ? `${privacy} browser(s) with traces`
    : 'No privacy risks detected';

  const perfDetail = `CPU ${metrics.cpu.usage.toFixed(0)}% / RAM ${metrics.memory.usage.toFixed(0)}%`;

  const windowsDetail = metrics.windows.uptime > 30 * 86400
    ? `Uptime ${Math.round(metrics.windows.uptime / 86400)} days`
    : 'System healthy';

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
      id: 'startup',
      name: 'Startup',
      score: Math.round(scores.startup),
      detail: startupDetail,
      actionLabel: 'Review',
      path: '/startup-manager',
      severity: determineCategorySeverity(scores.startup),
    },
    {
      id: 'privacy',
      name: 'Privacy',
      score: Math.round(scores.privacy),
      detail: privacyDetail,
      actionLabel: 'Clean',
      path: '/privacy-cleaner',
      severity: determineCategorySeverity(scores.privacy),
    },
    {
      id: 'performance',
      name: 'Performance',
      score: Math.round(scores.performance),
      detail: perfDetail,
      actionLabel: 'View',
      path: '/performance',
      severity: determineCategorySeverity(scores.performance),
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
      id: 'windows',
      name: 'Windows Health',
      score: Math.round(scores.windows),
      detail: windowsDetail,
      actionLabel: 'View',
      path: '/system-information',
      severity: determineCategorySeverity(scores.windows),
    },
  ];
}

// ── Main calculation ────────────────────────────────────────────────

/**
 * Calculate a HealthSnapshot from the latest DashboardMetrics.
 *
 * CANONICAL SOURCE: This is the ONLY health score calculation.
 * All dashboard components read from this HealthSnapshot.
 * No predictions. No estimates. Every value is measured from real system state.
 */
export function calculateHealthScore(
  metrics: DashboardMetrics | null | undefined,
  privacyRisks: number | null = null,
  weights: HealthScoreWeights = DEFAULT_HEALTH_WEIGHTS,
): HealthSnapshot {
  // Guard against empty/partial metrics (e.g. backend still loading)
  const cpu = metrics?.cpu ?? { usage: 0, frequency: 0, logicalProcessors: 0, physicalProcessors: 0, processes: 0, threads: 0, temperature: null };
  const memory = metrics?.memory ?? { total: 0, used: 0, available: 0, usage: 0, cached: 0, swapTotal: 0, swapUsed: 0, swapUsage: 0 };
  const storage = metrics?.storage ?? [];
  const windows = metrics?.windows ?? { version: '', build: '', uptime: 0, isAdministrator: false, powerMode: 'unknown', battery: null, secureBoot: false, tpmStatus: false };
  const security = metrics?.security ?? { defender: { enabled: false, realTimeProtection: false }, firewall: { enabled: false }, updates: { pendingUpdates: 0, lastUpdateDate: null }, realTimeProtection: false, smartScreen: false };
  const performance = metrics?.performance ?? { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 };
  const capturedAt = metrics?.capturedAt ?? new Date().toISOString();

  // Storage score: 100 when no junk. Penalty based on recoverable junk size.
  // Drive usage is informational — only penalize if critically full (>90%).
  const junkPenalty = performance.potentialRecoverable > 0
    ? Math.min(40, Math.log10(performance.potentialRecoverable / (1024 * 1024) + 1) * 5)
    : 0;
  const driveFullPenalty = storage.reduce((max, d) => {
    if (d.usage > 90) return Math.max(max, 20);
    if (d.usage > 80) return Math.max(max, 10);
    return max;
  }, 0);
  const storageScore = clamp(100 - junkPenalty - driveFullPenalty);

  // Startup score: 100 when no startup apps. Penalty per app.
  const startupPenalty = Math.min(50, performance.startupApps * 5);
  const startupScore = clamp(100 - startupPenalty);

  // Privacy score: 100 when no privacy risks. Penalty per risk.
  const privacy = privacyRisks ?? 0;
  const privacyScore = clamp(100 - privacy * 10);

  // Performance score: 100 baseline. Only penalized when CPU/memory cross
  // issue thresholds (CPU > 60%, memory > 70%). Normal usage = perfect score.
  // This ensures that after optimization (when no performance issues exist),
  // the performance category contributes 100 to the overall score.
  let performanceScore = 100;
  if (cpu.usage > 80) {
    performanceScore -= 30;
  } else if (cpu.usage > 60) {
    performanceScore -= 15;
  }
  if (memory.usage > 85) {
    performanceScore -= 25;
  } else if (memory.usage > 70) {
    performanceScore -= 12;
  }
  performanceScore = clamp(performanceScore);

  // Security score: binary penalties for disabled protections
  let securityScore = 100;
  const thirdPartyAV = security.defender.thirdPartyAV || security.firewall.thirdPartyAV;
  if (!thirdPartyAV) {
    if (!security.defender.enabled) securityScore -= 30;
    if (!security.defender.realTimeProtection) securityScore -= 20;
    if (!security.firewall.enabled) securityScore -= 25;
  }
  if (!security.smartScreen) securityScore -= 10;
  if (security.updates.pendingUpdates > 0) securityScore -= 15;
  securityScore = clamp(securityScore);

  // Windows health score: graduated penalty for long uptime.
  //   < 7 days  → 100 (freshly restarted)
  //   < 30 days → 90  (normal)
  //   < 60 days → 70  (restart recommended)
  //   >= 60 days → 40 (restart strongly recommended)
  const uptimeDays = windows.uptime / 86400;
  const windowsScore = clamp(
    uptimeDays >= 60 ? 40 : uptimeDays > 30 ? 70 : uptimeDays > 7 ? 90 : 100
  );

  // Weighted overall score — weights are configurable (Part 5).
  // Default weights sum to 1.0 so the overall is a direct weighted average.
  // Future modules can register custom weights without changing this logic.
  const weightSum =
    weights.storage + weights.startup + weights.privacy +
    weights.performance + weights.security + weights.windows;

  const overallScore = clamp(
    (storageScore * weights.storage +
    startupScore * weights.startup +
    privacyScore * weights.privacy +
    performanceScore * weights.performance +
    securityScore * weights.security +
    windowsScore * weights.windows) / (weightSum || 1)
  );

  const issues = buildAllIssues({ cpu, memory, storage, windows, security, performance, capturedAt } as DashboardMetrics, privacyRisks);
  const summary = buildSummary(issues);
  const categoryDetails = buildCategoryDetails({ cpu, memory, storage, windows, security, performance, capturedAt } as DashboardMetrics, privacyRisks, {
    storage: Math.round(storageScore),
    startup: Math.round(startupScore),
    privacy: Math.round(privacyScore),
    performance: Math.round(performanceScore),
    security: Math.round(securityScore),
    windows: Math.round(windowsScore),
  });

  const measuredRecoverableSpace =
    performance.temporaryFilesSize +
    performance.recycleBinSize +
    performance.browserCacheSize;

  return {
    timestamp: capturedAt,
    overallScore: Math.round(overallScore),
    scoreZone: determineScoreZone(Math.round(overallScore)),
    categoryScores: {
      storage: Math.round(storageScore),
      startup: Math.round(startupScore),
      privacy: Math.round(privacyScore),
      performance: Math.round(performanceScore),
      security: Math.round(securityScore),
      windows: Math.round(windowsScore),
    },
    status: determineStatus(Math.round(overallScore)),
    issues,
    summary,
    categoryDetails,
    measuredRecoverableSpace,
    startupAppsEnabled: performance.startupApps,
    tempFilesSize: performance.temporaryFilesSize,
    browserCacheSize: performance.browserCacheSize,
    recycleBinSize: performance.recycleBinSize,
  };
}
