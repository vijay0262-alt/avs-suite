/**
 * OptimizationHistory — tracks past optimization executions and results.
 *
 * Stores reports locally. Used for before/after comparisons, learning,
 * and dashboard trend display.
 */
import type {
  OptimizationReport,
  BeforeAfterComparison,
  SystemStateSnapshot,
} from './types';

export class OptimizationHistory {
  private reports: OptimizationReport[] = [];
  private maxReports: number;

  constructor(maxReports = 100) {
    this.maxReports = maxReports;
  }

  addReport(report: OptimizationReport): void {
    this.reports.unshift(report);
    if (this.reports.length > this.maxReports) {
      this.reports = this.reports.slice(0, this.maxReports);
    }
  }

  getReports(): OptimizationReport[] {
    return [...this.reports];
  }

  getLatestReport(): OptimizationReport | null {
    return this.reports[0] ?? null;
  }

  getReport(planId: string): OptimizationReport | null {
    return this.reports.find((r) => r.planId === planId) ?? null;
  }

  getReportCount(): number {
    return this.reports.length;
  }

  getTotalStorageRecoveredMB(): number {
    return this.reports.reduce((sum, r) => sum + r.summary.storageRecoveredMB, 0);
  }

  getTotalRamRecoveredMB(): number {
    return this.reports.reduce((sum, r) => sum + r.summary.ramRecoveredMB, 0);
  }

  getAverageHealthScoreGain(): number {
    if (this.reports.length === 0) return 0;
    const totalGain = this.reports.reduce((sum, r) => sum + r.summary.healthScoreChange, 0);
    return Math.round(totalGain / this.reports.length);
  }

  getHealthTrend(): Array<{ timestamp: number; healthScore: number; label: string }> {
    return this.reports
      .map((r) => ({
        timestamp: r.executedAt,
        healthScore: r.summary.healthScoreAfter,
        label: new Date(r.executedAt).toLocaleDateString(),
      }))
      .reverse();
  }

  createBeforeAfter(
    before: SystemStateSnapshot,
    after: SystemStateSnapshot,
  ): BeforeAfterComparison {
    return {
      before,
      after,
      deltas: {
        performanceImprovement: after.healthScore - before.healthScore,
        storageRecoveryMB: before.diskFreeSpaceMB - after.diskFreeSpaceMB,
        ramRecoveryMB: before.memoryUsageMB - after.memoryUsageMB,
        startupImprovementMs: before.startupTimeSeconds * 1000 - after.startupTimeSeconds * 1000,
        privacyImprovement: after.privacyScore - before.privacyScore,
        batteryImprovement: after.batteryEstimateHours - before.batteryEstimateHours,
        thermalImprovement: after.thermalScore - before.thermalScore,
        stabilityImpact: after.stabilityScore - before.stabilityScore,
      },
    };
  }

  clear(): void {
    this.reports = [];
  }
}
