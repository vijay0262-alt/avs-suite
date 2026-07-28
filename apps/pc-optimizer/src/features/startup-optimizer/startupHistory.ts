/**
 * Startup History — records all changes made to startup entries
 * for audit trail and rollback support.
 *
 * Records:
 *   • Applications disabled
 *   • Applications enabled
 *   • Restore actions
 *   • Estimated boot improvement
 *   • Execution duration
 *   • Rollback actions
 *
 * This module does NOT modify the Maintenance History architecture.
 * It maintains its own separate history store.
 */
import type { StartupChangeRecord } from './types';

const STORAGE_KEY = 'avs_startup_optimizer_history';
const MAX_RECORDS = 500;

export class StartupHistory {
  private _records: StartupChangeRecord[] = [];
  private _persistEnabled: boolean;

  constructor(persistEnabled: boolean = true) {
    this._persistEnabled = persistEnabled;
  }

  /**
   * Record a change.
   */
  record(change: StartupChangeRecord): void {
    this._records.unshift(change);
    if (this._records.length > MAX_RECORDS) {
      this._records = this._records.slice(0, MAX_RECORDS);
    }
    this._persist();
  }

  /**
   * Get all records (newest first).
   */
  getAll(): StartupChangeRecord[] {
    return [...this._records];
  }

  /**
   * Get records for a specific entry.
   */
  getByEntry(entryId: string): StartupChangeRecord[] {
    return this._records.filter((r) => r.entryId === entryId);
  }

  /**
   * Get a record by ID.
   */
  getById(recordId: string): StartupChangeRecord | null {
    return this._records.find((r) => r.recordId === recordId) ?? null;
  }

  /**
   * Get the most recent record for an entry.
   */
  getLatestForEntry(entryId: string): StartupChangeRecord | null {
    const records = this.getByEntry(entryId);
    return records.length > 0 ? records[0]! : null;
  }

  /**
   * Get all disable records.
   */
  getDisableRecords(): StartupChangeRecord[] {
    return this._records.filter((r) => r.action === 'disable');
  }

  /**
   * Get all enable records.
   */
  getEnableRecords(): StartupChangeRecord[] {
    return this._records.filter((r) => r.action === 'enable');
  }

  /**
   * Get all restore records.
   */
  getRestoreRecords(): StartupChangeRecord[] {
    return this._records.filter((r) => r.action === 'restore');
  }

  /**
   * Get the total number of records.
   */
  count(): number {
    return this._records.length;
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this._records = [];
    this._persist();
  }

  /**
   * Load from localStorage.
   */
  load(): void {
    if (!this._persistEnabled) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      this._records = JSON.parse(raw) as StartupChangeRecord[];
    } catch {
      // non-fatal
    }
  }

  /**
   * Persist to localStorage.
   */
  private _persist(): void {
    if (!this._persistEnabled) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._records));
    } catch {
      // non-fatal
    }
  }
}

let _recordCounter = 0;

/**
 * Generate a unique record ID.
 */
export function generateRecordId(): string {
  _recordCounter += 1;
  return `startup-change-${Date.now().toString(36)}-${_recordCounter}`;
}

/**
 * Default singleton instance.
 */
export const startupHistory = new StartupHistory();
