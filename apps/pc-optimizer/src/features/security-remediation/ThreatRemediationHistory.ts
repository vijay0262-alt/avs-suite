/**
 * ThreatRemediationHistory — records all remediation actions.
 */
import type { RemediationHistoryEntry, RemediationHistoryData, RemediationActionType, RemediationActionStatus, RemediationRiskLevel } from './types';

export class ThreatRemediationHistory {
  private entries: RemediationHistoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  record(
    planId: string,
    investigationId: string,
    action: RemediationActionType,
    status: RemediationActionStatus,
    target: string,
    riskLevel: RemediationRiskLevel,
    userId?: string | null,
    notes?: string | null,
  ): RemediationHistoryEntry {
    const entry: RemediationHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planId,
      investigationId,
      timestamp: Date.now(),
      action,
      status,
      target,
      riskLevel,
      userId: userId ?? null,
      notes: notes ?? null,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    return entry;
  }

  getEntries(): RemediationHistoryEntry[] {
    return [...this.entries];
  }

  getByPlan(planId: string): RemediationHistoryEntry[] {
    return this.entries.filter((e) => e.planId === planId);
  }

  getByInvestigation(investigationId: string): RemediationHistoryEntry[] {
    return this.entries.filter((e) => e.investigationId === investigationId);
  }

  getSummary(): RemediationHistoryData {
    const successful = this.entries.filter((e) => e.status === 'completed').length;
    const failed = this.entries.filter((e) => e.status === 'failed').length;
    const rolledBack = this.entries.filter((e) => e.status === 'rolled_back').length;
    const quarantined = this.entries.filter((e) => e.action === 'quarantine' && e.status === 'completed').length;
    const restored = this.entries.filter((e) => e.action === 'restore' && e.status === 'completed').length;
    const deleted = this.entries.filter((e) => e.action === 'delete' && e.status === 'completed').length;
    const falsePositives = this.entries.filter((e) => e.action === 'mark_false_positive' && e.status === 'completed').length;

    return {
      entries: [...this.entries],
      totalActions: this.entries.length,
      successfulActions: successful,
      failedActions: failed,
      rolledBackActions: rolledBack,
      quarantineCount: quarantined,
      restoreCount: restored,
      deleteCount: deleted,
      falsePositiveCount: falsePositives,
      lastActionAt: this.entries.length > 0 ? this.entries[this.entries.length - 1]!.timestamp : null,
    };
  }

  clear(): void {
    this.entries = [];
  }
}
