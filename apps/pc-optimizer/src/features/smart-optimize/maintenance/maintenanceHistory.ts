/**
 * Maintenance History — tracks maintenance lifecycle events.
 *
 * Tracks: Recommended, Accepted, Deferred, Skipped, Completed,
 * Cancelled, Expired, Success Rate.
 */
import type {
  MaintenanceHistoryEntry,
  MaintenanceType,
  MaintenanceOutcome,
} from './types';
import { generateHistoryId } from './types';

export class MaintenanceHistory {
  private _entries: MaintenanceHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries = 500) {
    this._maxEntries = maxEntries;
  }

  record(
    opportunityId: string,
    type: MaintenanceType,
    outcome: MaintenanceOutcome,
    confidence: number,
    duration: number = 0,
    expectedBenefit: number = 0,
    actualBenefit: number | null = null,
    metadata: Record<string, unknown> = {},
  ): void {
    this._entries.push({
      id: generateHistoryId(),
      opportunityId,
      type,
      outcome,
      timestamp: new Date().toISOString(),
      confidence,
      duration,
      expectedBenefit,
      actualBenefit,
      metadata,
    });
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
  }

  getAll(): MaintenanceHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(count: number): MaintenanceHistoryEntry[] {
    return this._entries.slice(-count);
  }

  getByOpportunity(opportunityId: string): MaintenanceHistoryEntry[] {
    return this._entries.filter((e) => e.opportunityId === opportunityId);
  }

  getByType(type: MaintenanceType): MaintenanceHistoryEntry[] {
    return this._entries.filter((e) => e.type === type);
  }

  getByOutcome(outcome: MaintenanceOutcome): MaintenanceHistoryEntry[] {
    return this._entries.filter((e) => e.outcome === outcome);
  }

  getSuccessRate(): number {
    const completed = this._entries.filter((e) =>
      e.outcome === 'completed' || e.outcome === 'accepted'
    );
    const total = this._entries.filter((e) =>
      e.outcome === 'completed' || e.outcome === 'accepted' ||
      e.outcome === 'cancelled' || e.outcome === 'failed' as MaintenanceOutcome ||
      e.outcome === 'expired'
    );
    return total.length > 0 ? completed.length / total.length : 0;
  }

  get count(): number {
    return this._entries.length;
  }

  clear(): void {
    this._entries = [];
  }

  setMaxEntries(max: number): void {
    this._maxEntries = max;
    if (this._entries.length > max) {
      this._entries = this._entries.slice(-max);
    }
  }
}
