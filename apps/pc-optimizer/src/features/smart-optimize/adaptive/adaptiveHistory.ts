/**
 * Adaptive History — tracks adaptation lifecycle events.
 */
import type { AdaptiveHistoryEntry, AdaptationAction, ConditionType } from './types';
import { generateAdaptiveHistoryId } from './types';

export class AdaptiveHistory {
  private _entries: AdaptiveHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries = 500) {
    this._maxEntries = maxEntries;
  }

  record(
    planId: string,
    action: AdaptationAction,
    conditionType: ConditionType,
    confidence: number,
    metadata: Record<string, unknown> = {},
  ): void {
    this._entries.push({
      id: generateAdaptiveHistoryId(),
      planId,
      action,
      conditionType,
      timestamp: new Date().toISOString(),
      confidence,
      metadata,
    });
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
  }

  getAll(): AdaptiveHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(count: number): AdaptiveHistoryEntry[] {
    return this._entries.slice(-count);
  }

  getByPlan(planId: string): AdaptiveHistoryEntry[] {
    return this._entries.filter((e) => e.planId === planId);
  }

  getByAction(action: AdaptationAction): AdaptiveHistoryEntry[] {
    return this._entries.filter((e) => e.action === action);
  }

  getByConditionType(type: ConditionType): AdaptiveHistoryEntry[] {
    return this._entries.filter((e) => e.conditionType === type);
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
