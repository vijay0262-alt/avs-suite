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
} from './dashboard.types';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function scoreFromUsage(usagePercent: number): number {
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

  if (!thirdPartyAV) {
    if (!metrics.security.defender.enabled) {
      issues.push({
        id: 'security-defender',
        category: 'security',
        title: 'Windows Defender disabled',
        detail: 'Real-time antivirus protection is not active',
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
        detail: 'Windows Defender real-time protection is disabled',
        severity: 'high',
        measurableValue: 1,
        measurableUnit: 'count',
        actionPath: '/security',
        canAutoFix: false,
      });
    }

    if (!metrics.security.firewall.enabled) {
      issues.push({
        id: 'security-firewall',
        category: 'security',
        title: 'Windows Firewall disabled',
        detail: 'Network firewall is not active',
        severity: 'high',
        measurableValue: 1,
        measurableUnit: 'count',
        actionPath: '/security',
        canAutoFix: false,
      });
    }
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
      actionPath: '/system-info',
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
    if (thirdPartyAV) return `${thirdPartyAV} protecting system`;
    if (!metrics.security.defender.enabled) return 'Windows Defender disabled';
    if (!metrics.security.defender.realTimeProtection) return 'Real-time protection off';
    if (!metrics.security.firewall.enabled) return 'Firewall disabled';
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
      path: '/system-info',
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
export function calculateHealthScore(metrics: DashboardMetrics, privacyRisks: number | null = null): HealthSnapshot {
  // Storage score: based on drive usage + recoverable junk
  const driveUsageScore = average(metrics.storage.map((d) => scoreFromUsage(d.usage)));
  const junkPenalty = metrics.performance.potentialRecoverable > 0
    ? Math.min(30, Math.log10(metrics.performance.potentialRecoverable / (1024 * 1024) + 1) * 5)
    : 0;
  const storageScore = clamp(driveUsageScore - junkPenalty);

  // Startup score: penalty per enabled startup app
  const startupPenalty = Math.min(50, metrics.performance.startupApps * 5);
  const startupScore = clamp(100 - startupPenalty);

  // Privacy score: penalty per privacy risk detected
  const privacy = privacyRisks ?? 0;
  const privacyScore = clamp(100 - privacy * 10);

  // Performance score: based on CPU and memory usage
  const cpuScore = scoreFromUsage(metrics.cpu.usage);
  const memoryScore = scoreFromUsage(metrics.memory.usage);
  const performanceScore = clamp((cpuScore + memoryScore) / 2);

  // Security score: binary penalties for disabled protections
  let securityScore = 100;
  const thirdPartyAV = metrics.security.defender.thirdPartyAV || metrics.security.firewall.thirdPartyAV;
  if (!thirdPartyAV) {
    if (!metrics.security.defender.enabled) securityScore -= 30;
    if (!metrics.security.defender.realTimeProtection) securityScore -= 20;
    if (!metrics.security.firewall.enabled) securityScore -= 25;
  }
  if (!metrics.security.smartScreen) securityScore -= 10;
  if (metrics.security.updates.pendingUpdates > 0) securityScore -= 15;
  securityScore = clamp(securityScore);

  // Windows health score: uptime, system integrity
  const uptimeDays = metrics.windows.uptime / 86400;
  const windowsScore = clamp(uptimeDays > 30 ? 70 : 100);

  // Weighted overall score
  const weights = {
    storage: 0.20,
    startup: 0.15,
    privacy: 0.10,
    performance: 0.25,
    security: 0.20,
    windows: 0.10,
  };

  const overallScore = clamp(
    storageScore * weights.storage +
    startupScore * weights.startup +
    privacyScore * weights.privacy +
    performanceScore * weights.performance +
    securityScore * weights.security +
    windowsScore * weights.windows
  );

  const issues = buildAllIssues(metrics, privacyRisks);
  const summary = buildSummary(issues);
  const categoryDetails = buildCategoryDetails(metrics, privacyRisks, {
    storage: Math.round(storageScore),
    startup: Math.round(startupScore),
    privacy: Math.round(privacyScore),
    performance: Math.round(performanceScore),
    security: Math.round(securityScore),
    windows: Math.round(windowsScore),
  });

  const measuredRecoverableSpace =
    metrics.performance.temporaryFilesSize +
    metrics.performance.recycleBinSize +
    metrics.performance.browserCacheSize;

  return {
    timestamp: metrics.capturedAt,
    overallScore: Math.round(overallScore),
    categoryScores: {
      storage: Math.round(storageScore),
      startup: Math.round(startupScore),
      privacy: Math.round(privacyScore),
      performance: Math.round(performanceScore),
      security: Math.round(securityScore),
      windows: Math.round(windowsScore),
    },
    status: determineStatus(overallScore),
    issues,
    summary,
    categoryDetails,
    measuredRecoverableSpace,
    startupAppsEnabled: metrics.performance.startupApps,
    tempFilesSize: metrics.performance.temporaryFilesSize,
    browserCacheSize: metrics.performance.browserCacheSize,
    recycleBinSize: metrics.performance.recycleBinSize,
  };
}
