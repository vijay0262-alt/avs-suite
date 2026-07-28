/**
 * Duplicate History — records duplicate scan results, cleanup
 * operations, rollback operations, and health changes.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  DuplicateHistoryEntry,
  DuplicateHistoryEntryType,
} from './types';

let _entryCounter = 0;

function generateEntryId(): string {
  _entryCounter += 1;
  return `dup-history-${Date.now().toString(36)}-${_entryCounter}`;
}

export class DuplicateHistory {
  private _entries: DuplicateHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 200) {
    this._maxEntries = maxEntries;
  }

  record(
    type: DuplicateHistoryEntryType,
    description: string,
    options: {
      groupsRemoved?: number;
      filesRemoved?: number;
      spaceRecovered?: number;
      durationMs?: number;
      success?: boolean;
    } = {},
  ): DuplicateHistoryEntry {
    const entry: DuplicateHistoryEntry = {
      id: generateEntryId(),
      type,
      timestamp: new Date().toISOString(),
      description,
      groupsRemoved: options.groupsRemoved ?? 0,
      filesRemoved: options.filesRemoved ?? 0,
      spaceRecovered: options.spaceRecovered ?? 0,
      durationMs: options.durationMs ?? 0,
      success: options.success ?? true,
    };
    this._entries.unshift(entry);
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(0, this._maxEntries);
    }
    return entry;
  }

  recordScan(groups: number, wastedSpace: number, durationMs: number): DuplicateHistoryEntry {
    return this.record('scan', `Scan found ${groups} duplicate groups`, {
      durationMs,
      success: true,
    });
  }

  recordCleanup(filesRemoved: number, spaceRecovered: number, durationMs: number, success: boolean = true): DuplicateHistoryEntry {
    return this.record('cleanup', `Removed ${filesRemoved} duplicate files, recovered ${spaceRecovered} bytes`, {
      filesRemoved,
      spaceRecovered,
      durationMs,
      success,
    });
  }

  recordRollback(filesRestored: number, success: boolean): DuplicateHistoryEntry {
    return this.record('rollback', `Rolled back ${filesRestored} files`, {
      filesRemoved: 0,
      success,
    });
  }

  recordHealthChange(scoreBefore: number, scoreAfter: number): DuplicateHistoryEntry {
    const direction = scoreAfter > scoreBefore ? 'improved' : scoreAfter < scoreBefore ? 'declined' : 'unchanged';
    return this.record('health_change', `Duplicate health score ${direction}: ${scoreBefore} → ${scoreAfter}`, {
      success: true,
    });
  }

  getAll(): DuplicateHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(limit: number): DuplicateHistoryEntry[] {
    return this._entries.slice(0, limit);
  }

  getByType(type: DuplicateHistoryEntryType): DuplicateHistoryEntry[] {
    return this._entries.filter((e) => e.type === type);
  }

  getScans(): DuplicateHistoryEntry[] {
    return this.getByType('scan');
  }

  getCleanups(): DuplicateHistoryEntry[] {
    return this.getByType('cleanup');
  }

  getRollbacks(): DuplicateHistoryEntry[] {
    return this.getByType('rollback');
  }

  getTotalSpaceRecovered(): number {
    return this._entries
      .filter((e) => e.type === 'cleanup')
      .reduce((sum, e) => sum + e.spaceRecovered, 0);
  }

  getTotalFilesRemoved(): number {
    return this._entries
      .filter((e) => e.type === 'cleanup')
      .reduce((sum, e) => sum + e.filesRemoved, 0);
  }

  clear(): void {
    this._entries = [];
  }

  size(): number {
    return this._entries.length;
  }
}

export const duplicateHistory = new DuplicateHistory();
