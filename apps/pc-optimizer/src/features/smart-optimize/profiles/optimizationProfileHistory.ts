/**
 * Optimization Profile History — tracks profile lifecycle events.
 */
import type { ProfileHistoryEntry, ProfileHistoryAction } from './types';
import { generateProfileHistoryId } from './types';

export class OptimizationProfileHistory {
  private _entries: ProfileHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries = 500) {
    this._maxEntries = maxEntries;
  }

  record(profileId: string, action: ProfileHistoryAction, metadata: Record<string, unknown> = {}): void {
    this._entries.push({
      id: generateProfileHistoryId(),
      profileId,
      action,
      timestamp: new Date().toISOString(),
      metadata,
    });
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
  }

  getAll(): ProfileHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(count: number): ProfileHistoryEntry[] {
    return this._entries.slice(-count);
  }

  getByProfile(profileId: string): ProfileHistoryEntry[] {
    return this._entries.filter((e) => e.profileId === profileId);
  }

  getByAction(action: ProfileHistoryAction): ProfileHistoryEntry[] {
    return this._entries.filter((e) => e.action === action);
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
