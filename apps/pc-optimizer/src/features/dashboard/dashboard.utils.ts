/**
 * Dashboard utilities — incremental health score calculation.
 *
 * Computes a HealthScore directly from DashboardMetrics so the UI can update
 * in real time without an additional RPC round-trip every poll cycle.
 */
import type { DashboardMetrics, HealthScore, HealthStatus } from './dashboard.types';

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
 */
export function calculateHealthScore(metrics: DashboardMetrics): HealthScore {
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
  };
}
