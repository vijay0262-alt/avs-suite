/**
 * Goal Orchestration Engine — History Aggregator
 *
 * Tracks orchestration lifecycle events with filtering,
 * max-entry enforcement, and retrieval methods.
 */
import type {
  OrchestrationHistoryEntry,
  OrchestrationHistoryAction,
  Evidence,
} from './types';
import { generateOrchestrationHistoryId } from './types';

export class GoalHistoryAggregator {
  private _entries: OrchestrationHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 500) {
    this._maxEntries = maxEntries;
  }

  record(
    orchestrationId: string,
    goalId: string | null,
    action: OrchestrationHistoryAction,
    description: string,
    oldValue: unknown = null,
    newValue: unknown = null,
    evidence: Evidence[] = [],
  ): OrchestrationHistoryEntry {
    const entry: OrchestrationHistoryEntry = {
      id: generateOrchestrationHistoryId(),
      orchestrationId,
      goalId,
      action,
      timestamp: new Date().toISOString(),
      description,
      oldValue,
      newValue,
      evidence,
      futureMetadata: {},
    };

    this._entries.push(entry);

    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }

    return entry;
  }

  getAll(): OrchestrationHistoryEntry[] {
    return [...this._entries];
  }

  getByOrchestration(orchestrationId: string): OrchestrationHistoryEntry[] {
    return this._entries.filter((e) => e.orchestrationId === orchestrationId);
  }

  getByGoal(goalId: string): OrchestrationHistoryEntry[] {
    return this._entries.filter((e) => e.goalId === goalId);
  }

  getByAction(action: OrchestrationHistoryAction): OrchestrationHistoryEntry[] {
    return this._entries.filter((e) => e.action === action);
  }

  getLatest(): OrchestrationHistoryEntry | null {
    if (this._entries.length === 0) return null;
    return this._entries[this._entries.length - 1]!;
  }

  getLatestForGoal(goalId: string): OrchestrationHistoryEntry | null {
    const entries = this.getByGoal(goalId);
    if (entries.length === 0) return null;
    return entries[entries.length - 1]!;
  }

  getEntriesSince(timestamp: string): OrchestrationHistoryEntry[] {
    const ts = new Date(timestamp).getTime();
    return this._entries.filter((e) => new Date(e.timestamp).getTime() >= ts);
  }

  clear(): void {
    this._entries = [];
  }

  count(): number {
    return this._entries.length;
  }

  setMaxEntries(max: number): void {
    this._maxEntries = max;
    if (this._entries.length > max) {
      this._entries = this._entries.slice(-max);
    }
  }
}
