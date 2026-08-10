/**
 * Health Timeline — aggregates health score history, maintenance
 * executions, optimization sessions, and major health changes
 * into a unified timeline view.
 *
 * Sources:
 *   • Maintenance History (ExecutionRecord[])
 *   • Health Report snapshots
 *   • Optimization execution events
 *
 * Supports: Today, 7 Days, 30 Days ranges.
 *
 * This module does NOT modify Maintenance History or any other service.
 */
import type { TimelineEntry, TimelineRange } from './types';
import type { ExecutionRecord } from '../maintenance-history/types';
import type { HealthReport } from '../ai-health-engine/types';
import { executionHistoryRepository } from '../maintenance-history/executionHistoryRepository';
import { idbGetAll, idbPut, idbClear, idbCleanup } from '../../services/avsWithIDB';

const MAX_ENTRIES = 500;

export class HealthTimeline {
  private _entries: TimelineEntry[] = [];
  private _persistEnabled: boolean;

  constructor(persistEnabled: boolean = true) {
    this._persistEnabled = persistEnabled;
  }

  /**
   * Record a health score snapshot.
   */
  recordHealthScore(score: number, scoreChange: number | null, timestamp: string): void {
    this._addEntry({
      id: `hs-${timestamp}-${score}`,
      type: 'health_score',
      timestamp,
      title: `Health Score: ${score}`,
      description: scoreChange !== null
        ? `Score ${scoreChange > 0 ? 'improved' : 'dropped'} by ${Math.abs(scoreChange)} points`
        : 'Initial health analysis',
      score,
      scoreChange: scoreChange ?? undefined,
    });
  }

  /**
   * Record a maintenance execution.
   */
  recordMaintenance(record: ExecutionRecord): void {
    this._addEntry({
      id: `maint-${record.id}`,
      type: 'maintenance',
      timestamp: record.endTime,
      title: `Maintenance: ${record.status}`,
      description: `${record.filesRemoved} files cleaned, ${(record.totalSpaceRecovered / 1024 / 1024).toFixed(1)} MB recovered`,
      severity: record.status === 'failed' ? 'high' : 'info',
    });
  }

  /**
   * Record an optimization session.
   */
  recordOptimization(
    sessionId: string,
    status: string,
    tasksCompleted: number,
    storageRecovered: number,
    timestamp: string,
  ): void {
    this._addEntry({
      id: `opt-${sessionId}`,
      type: 'optimization',
      timestamp,
      title: `Optimization: ${status}`,
      description: `${tasksCompleted} tasks completed, ${(storageRecovered / 1024 / 1024).toFixed(1)} MB recovered`,
    });
  }

  /**
   * Record a major health change.
   */
  recordMajorChange(
    title: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical' | 'info',
    timestamp: string,
  ): void {
    this._addEntry({
      id: `change-${timestamp}-${Date.now().toString(36)}`,
      type: 'major_change',
      timestamp,
      title,
      description,
      severity,
    });
  }

  /**
   * Get timeline entries filtered by range.
   */
  getEntries(range: TimelineRange): TimelineEntry[] {
    const now = Date.now();
    const ranges: Record<TimelineRange, number> = {
      today: 24 * 60 * 60 * 1000,
      '7days': 7 * 24 * 60 * 60 * 1000,
      '30days': 30 * 24 * 60 * 60 * 1000,
    };
    const cutoff = now - ranges[range];
    return this._entries
      .filter((e) => new Date(e.timestamp).getTime() >= cutoff)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Get all entries (newest first).
   */
  getAll(): TimelineEntry[] {
    return [...this._entries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  /**
   * Sync maintenance history records into the timeline.
   */
  syncFromMaintenanceHistory(): void {
    const records = executionHistoryRepository.getAll();
    for (const record of records) {
      // Only add if not already present
      if (!this._entries.some((e) => e.id === `maint-${record.id}`)) {
        this.recordMaintenance(record);
      }
    }
  }

  /**
   * Sync health report into timeline.
   */
  syncFromHealthReport(report: HealthReport, previousScore: number | null): void {
    const score = report.overall.score;
    const change = previousScore !== null ? score - previousScore : null;

    // Record significant changes (> 5 points)
    if (change !== null && Math.abs(change) >= 5) {
      this.recordMajorChange(
        `Health Score ${change > 0 ? 'Improved' : 'Declined'}`,
        `Score ${change > 0 ? 'improved' : 'dropped'} by ${Math.abs(change)} points to ${score}`,
        change > 0 ? 'info' : 'high',
        report.generatedAt,
      );
    }

    this.recordHealthScore(score, change, report.generatedAt);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this._entries = [];
    this._persist();
  }

  /**
   * Get the total number of entries.
   */
  count(): number {
    return this._entries.length;
  }

  /**
   * Load from localStorage.
   */
  async load(): Promise<void> {
    if (!this._persistEnabled) return;
    this._entries = await idbGetAll<TimelineEntry>('healthTimeline');
  }

  // ── Internal ────────────────────────────────────────────────

  private _addEntry(entry: TimelineEntry): void {
    // Avoid duplicates
    if (this._entries.some((e) => e.id === entry.id)) return;
    this._entries.push(entry);
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(-MAX_ENTRIES);
    }
    this._persist();
  }

  private _persist(): void {
    if (!this._persistEnabled) return;
    idbClear('healthTimeline');
    this._entries.forEach((e) => idbPut('healthTimeline', e));
    idbCleanup('healthTimeline');
  }
}

/**
 * Default singleton instance.
 */
export const healthTimeline = new HealthTimeline();
