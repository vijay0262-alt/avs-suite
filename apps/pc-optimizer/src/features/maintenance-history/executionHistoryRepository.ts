/**
 * Execution History Repository — persistence layer for execution records.
 *
 * Stores records in localStorage with a configurable retention policy.
 * Supports CRUD operations, search/filtering, and automatic retention enforcement.
 *
 * The repository is a pure data store — it does not listen to events
 * or compute statistics. The MaintenanceHistoryService orchestrates it.
 */
import type {
  ExecutionRecord,
  ExecutionFilter,
  RetentionPolicy,
} from './types';
import { DEFAULT_RETENTION_POLICY } from './types';

const STORAGE_KEY = 'avs_execution_history';

// ── Persistence ───────────────────────────────────────────────

function loadFromStorage(): ExecutionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ExecutionRecord[];
  } catch {
    return [];
  }
}

function saveToStorage(records: ExecutionRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // storage full or unavailable — non-fatal
  }
}

// ── Repository ────────────────────────────────────────────────

class ExecutionHistoryRepositoryImpl {
  private _records: ExecutionRecord[] = [];
  private _policy: RetentionPolicy = { ...DEFAULT_RETENTION_POLICY };
  private _loaded = false;

  /**
   * Load records from localStorage. Called once on init.
   */
  load(): void {
    if (this._loaded) return;
    this._records = loadFromStorage();
    this._loaded = true;
    this._enforceRetention();
  }

  /**
   * Persist current records to localStorage.
   */
  private _persist(): void {
    saveToStorage(this._records);
  }

  /**
   * Get all records (newest first).
   */
  getAll(): ExecutionRecord[] {
    this.load();
    return [...this._records];
  }

  /**
   * Get a single record by ID.
   */
  getById(id: string): ExecutionRecord | null {
    this.load();
    return this._records.find((r) => r.id === id) ?? null;
  }

  /**
   * Insert a new record. If a record with the same ID exists, it is replaced.
   * Retention policy is enforced after insertion.
   */
  insert(record: ExecutionRecord): void {
    this.load();
    const existingIdx = this._records.findIndex((r) => r.id === record.id);
    if (existingIdx >= 0) {
      this._records[existingIdx] = record;
    } else {
      this._records.unshift(record);
    }
    this._enforceRetention();
    this._persist();
  }

  /**
   * Delete a record by ID.
   */
  delete(id: string): boolean {
    this.load();
    const idx = this._records.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    this._records.splice(idx, 1);
    this._persist();
    return true;
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this._records = [];
    this._persist();
  }

  /**
   * Get the current record count.
   */
  count(): number {
    this.load();
    return this._records.length;
  }

  // ── Search / Filter ─────────────────────────────────────────

  /**
   * Query records with optional filtering.
   * Returns matching records (newest first).
   */
  query(filter: ExecutionFilter = {}): ExecutionRecord[] {
    this.load();
    let results = [...this._records];

    // Date range filter
    if (filter.dateFrom) {
      const fromMs = new Date(filter.dateFrom).getTime();
      results = results.filter((r) => new Date(r.startTime).getTime() >= fromMs);
    }
    if (filter.dateTo) {
      const toMs = new Date(filter.dateTo).getTime();
      results = results.filter((r) => new Date(r.startTime).getTime() <= toMs);
    }

    // Status filter
    if (filter.status) {
      results = results.filter((r) => r.status === filter.status);
    }

    // Source filter
    if (filter.source) {
      results = results.filter((r) => r.source === filter.source);
    }

    // Task ID filter — records that executed this task
    if (filter.taskId) {
      results = results.filter((r) =>
        r.taskResults.some((t) => t.taskId === filter.taskId),
      );
    }

    // Schedule ID filter
    if (filter.scheduleId) {
      results = results.filter((r) => r.scheduleId === filter.scheduleId);
    }

    // Pagination
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? results.length;
    results = results.slice(offset, offset + limit);

    return results;
  }

  // ── Retention ───────────────────────────────────────────────

  /**
   * Get the current retention policy.
   */
  getRetentionPolicy(): RetentionPolicy {
    return { ...this._policy };
  }

  /**
   * Set the retention policy and enforce it immediately.
   */
  setRetentionPolicy(policy: Partial<RetentionPolicy>): void {
    this._policy = { ...this._policy, ...policy };
    this._enforceRetention();
    this._persist();
  }

  /**
   * Enforce the retention policy.
   * Keeps only the newest `maxRecords` records.
   * If `archiveInsteadOfDelete` is true, old records are returned
   * instead of being silently dropped (for future archiving).
   */
  private _enforceRetention(): ExecutionRecord[] {
    if (this._records.length <= this._policy.maxRecords) return [];

    const toRemove = this._records.slice(this._policy.maxRecords);
    this._records = this._records.slice(0, this._policy.maxRecords);

    if (this._policy.archiveInsteadOfDelete) {
      return toRemove;
    }
    return [];
  }

  /**
   * Manually trigger retention enforcement.
   * Returns archived records if archiving is enabled.
   */
  enforceRetention(): ExecutionRecord[] {
    this.load();
    const archived = this._enforceRetention();
    this._persist();
    return archived;
  }
}

export const executionHistoryRepository = new ExecutionHistoryRepositoryImpl();
