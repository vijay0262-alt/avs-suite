/**
 * Goals & Objectives Engine — History
 *
 * Tracks goal lifecycle entries with filtering and max-entry enforcement.
 */
import type { GoalHistoryEntry, GoalHistoryAction } from './types';
import { generateHistoryId } from './types';

export class GoalHistory {
  private _entries: GoalHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 200) {
    this._maxEntries = maxEntries;
  }

  record(
    goalId: string,
    action: GoalHistoryAction,
    description: string,
    oldValue: unknown = null,
    newValue: unknown = null,
  ): GoalHistoryEntry {
    const entry: GoalHistoryEntry = {
      id: generateHistoryId(),
      goalId,
      action,
      timestamp: new Date().toISOString(),
      description,
      oldValue,
      newValue,
      futureMetadata: {},
    };
    this._entries.push(entry);
    if (this._entries.length > this._maxEntries) {
      this._entries.splice(0, this._entries.length - this._maxEntries);
    }
    return entry;
  }

  getAll(): GoalHistoryEntry[] {
    return [...this._entries];
  }

  getByGoal(goalId: string): GoalHistoryEntry[] {
    return this._entries.filter((e) => e.goalId === goalId);
  }

  getByAction(action: GoalHistoryAction): GoalHistoryEntry[] {
    return this._entries.filter((e) => e.action === action);
  }

  getLatest(goalId?: string): GoalHistoryEntry | null {
    if (goalId) {
      const filtered = this.getByGoal(goalId);
      return filtered[filtered.length - 1] ?? null;
    }
    return this._entries[this._entries.length - 1] ?? null;
  }

  getLatestByGoal(goalId: string): GoalHistoryEntry | null {
    return this.getLatest(goalId);
  }

  clear(): void {
    this._entries = [];
  }

  setMaxEntries(max: number): void {
    this._maxEntries = max;
    if (this._entries.length > max) {
      this._entries.splice(0, this._entries.length - max);
    }
  }

  count(): number {
    return this._entries.length;
  }
}
