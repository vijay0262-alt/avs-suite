/**
 * Plan History — tracks plan lifecycle events.
 *
 * Tracks: plan generated, updated, selected, validated, expired, compared.
 */
import type { PlanHistoryEntry, OptimizationPlanType } from './types';

export class PlanHistory {
  private _entries: PlanHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 500) {
    this._maxEntries = maxEntries;
  }

  record(
    planId: string,
    planType: OptimizationPlanType,
    action: PlanHistoryEntry['action'],
    metadata: Record<string, unknown> = {},
  ): PlanHistoryEntry {
    const entry: PlanHistoryEntry = {
      id: `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      planId,
      planType,
      action,
      timestamp: new Date().toISOString(),
      metadata,
    };
    this._entries.push(entry);
    this._trim();
    return entry;
  }

  getAll(): PlanHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(count: number): PlanHistoryEntry[] {
    return this._entries.slice(-count);
  }

  getByPlan(planId: string): PlanHistoryEntry[] {
    return this._entries.filter((e) => e.planId === planId);
  }

  getByAction(action: PlanHistoryEntry['action']): PlanHistoryEntry[] {
    return this._entries.filter((e) => e.action === action);
  }

  getByType(planType: OptimizationPlanType): PlanHistoryEntry[] {
    return this._entries.filter((e) => e.planType === planType);
  }

  clear(): void {
    this._entries = [];
  }

  get count(): number {
    return this._entries.length;
  }

  private _trim(): void {
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
  }
}
