/**
 * SecurityHistory — tracks scan history for reporting and learning.
 *
 * Records scan results over time, computes aggregate statistics,
 * and provides trend data for the dashboard.
 */
import type {
  SecurityHistoryEntry,
  SecurityHistoryData,
  SecurityHistorySummary,
  ScanResult,
  SecurityScoreTrendPoint,
} from './types';

export class SecurityHistory {
  private entries: SecurityHistoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  recordScan(result: ScanResult): void {
    const entry: SecurityHistoryEntry = {
      id: `history-${result.scanId}`,
      scanId: result.scanId,
      timestamp: result.startedAt,
      scanType: result.scanType,
      status: result.status,
      threatsDetected: result.threats.length,
      threatsResolved: 0,
      duration: result.duration,
      itemsScanned: result.itemsScanned,
      securityScore: result.securityScore,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  getHistoryData(): SecurityHistoryData {
    const completed = this.entries.filter((e) => e.status === 'completed');
    const failed = this.entries.filter((e) => e.status === 'failed');
    const totalThreats = this.entries.reduce((sum, e) => sum + e.threatsDetected, 0);
    const avgDuration = completed.length > 0
      ? completed.reduce((sum, e) => sum + e.duration, 0) / completed.length
      : 0;
    const avgScore = completed.length > 0
      ? completed.reduce((sum, e) => sum + e.securityScore, 0) / completed.length
      : 0;

    return {
      entries: [...this.entries],
      totalScans: this.entries.length,
      completedScans: completed.length,
      failedScans: failed.length,
      totalThreatsDetected: totalThreats,
      totalThreatsResolved: 0,
      averageScanDuration: Math.round(avgDuration),
      averageSecurityScore: Math.round(avgScore),
    };
  }

  getHistorySummary(): SecurityHistorySummary {
    const data = this.getHistoryData();
    const lastEntry = this.entries[this.entries.length - 1];
    const lastThreat = this.entries.find((e) => e.threatsDetected > 0);

    return {
      totalScans: data.totalScans,
      lastScanDate: lastEntry?.timestamp ?? null,
      totalThreatsDetected: data.totalThreatsDetected,
      totalThreatsResolved: data.totalThreatsResolved,
      averageScanDuration: data.averageScanDuration,
      lastThreatDetectedAt: lastThreat?.timestamp ?? null,
    };
  }

  getScoreTrend(maxPoints = 20): SecurityScoreTrendPoint[] {
    return this.entries
      .filter((e) => e.status === 'completed')
      .slice(-maxPoints)
      .map((e) => ({
        timestamp: e.timestamp,
        securityScore: e.securityScore,
        threatCount: e.threatsDetected,
      }));
  }

  getRecentEntries(count = 10): SecurityHistoryEntry[] {
    return this.entries.slice(-count);
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}
