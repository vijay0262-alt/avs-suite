/**
 * ThreatHistory — records and summarizes investigation history.
 *
 * Tracks all investigation lifecycle events: created, updated,
 * resolved, false_positive, ignored, reopened.
 */
import type { InvestigationHistoryEntry, InvestigationHistoryData, InvestigationStatus } from './types';

export class ThreatHistory {
  private entries: InvestigationHistoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  recordCreated(investigationId: string): void {
    this.addEntry(investigationId, 'created', null, 'open', null);
  }

  recordUpdated(investigationId: string, notes?: string): void {
    this.addEntry(investigationId, 'updated', 'open', 'open', notes ?? null);
  }

  recordResolved(investigationId: string, notes?: string): void {
    this.addEntry(investigationId, 'resolved', 'open', 'resolved', notes ?? null);
  }

  recordFalsePositive(investigationId: string, notes?: string): void {
    this.addEntry(investigationId, 'false_positive', 'open', 'false_positive', notes ?? null);
  }

  recordIgnored(investigationId: string, notes?: string): void {
    this.addEntry(investigationId, 'ignored', 'open', 'ignored', notes ?? null);
  }

  recordReopened(investigationId: string, notes?: string): void {
    this.addEntry(investigationId, 'reopened', 'resolved', 'open', notes ?? null);
  }

  getEntries(): InvestigationHistoryEntry[] {
    return [...this.entries];
  }

  getEntriesForInvestigation(investigationId: string): InvestigationHistoryEntry[] {
    return this.entries.filter((e) => e.investigationId === investigationId);
  }

  getSummary(): InvestigationHistoryData {
    const resolved = this.entries.filter((e) => e.action === 'resolved').length;
    const falsePositive = this.entries.filter((e) => e.action === 'false_positive').length;
    const created = this.entries.filter((e) => e.action === 'created');

    let avgResolutionTime = 0;
    const resolutionTimes: number[] = [];
    for (const createdEntry of created) {
      const resolvedEntry = this.entries.find(
        (e) => e.investigationId === createdEntry.investigationId && (e.action === 'resolved' || e.action === 'false_positive'),
      );
      if (resolvedEntry) {
        resolutionTimes.push(resolvedEntry.timestamp - createdEntry.timestamp);
      }
    }
    if (resolutionTimes.length > 0) {
      avgResolutionTime = resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length;
    }

    const uniqueInvestigations = new Set(this.entries.map((e) => e.investigationId));

    return {
      entries: [...this.entries],
      totalInvestigations: uniqueInvestigations.size,
      resolvedCount: resolved,
      falsePositiveCount: falsePositive,
      averageResolutionTime: avgResolutionTime,
      lastUpdated: this.entries.length > 0 ? this.entries[this.entries.length - 1]!.timestamp : 0,
    };
  }

  clear(): void {
    this.entries = [];
  }

  private addEntry(
    investigationId: string,
    action: InvestigationHistoryEntry['action'],
    previousStatus: InvestigationStatus | null,
    newStatus: InvestigationStatus,
    notes: string | null,
  ): void {
    this.entries.push({
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      investigationId,
      timestamp: Date.now(),
      action,
      previousStatus,
      newStatus,
      notes,
    });

    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }
}
