/**
 * Optimization Recovery & Rollback Center — History
 *
 * Tracks recovery lifecycle entries with filtering and max-entry enforcement.
 */
import type { RecoveryHistoryEntry, RecoveryStatus } from './types';
import { generateRecoveryHistoryId } from './types';

export class RecoveryHistory {
  private _entries: RecoveryHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries = 200) {
    this._maxEntries = maxEntries;
  }

  record(
    recoveryId: string,
    operationId: string,
    status: RecoveryStatus,
    metadata: Record<string, unknown> = {},
  ): RecoveryHistoryEntry {
    const entry: RecoveryHistoryEntry = {
      id: generateRecoveryHistoryId(),
      recoveryId,
      operationId,
      status,
      timestamp: new Date().toISOString(),
      metadata,
      futureMetadata: {},
    };
    this._entries.push(entry);
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
    return entry;
  }

  getAll(): RecoveryHistoryEntry[] {
    return [...this._entries];
  }

  getByRecovery(recoveryId: string): RecoveryHistoryEntry[] {
    return this._entries.filter((e) => e.recoveryId === recoveryId);
  }

  getByOperation(operationId: string): RecoveryHistoryEntry[] {
    return this._entries.filter((e) => e.operationId === operationId);
  }

  getByStatus(status: RecoveryStatus): RecoveryHistoryEntry[] {
    return this._entries.filter((e) => e.status === status);
  }

  getLatest(): RecoveryHistoryEntry | undefined {
    return this._entries.length > 0 ? this._entries[this._entries.length - 1] : undefined;
  }

  getLatestByRecovery(recoveryId: string): RecoveryHistoryEntry | undefined {
    const filtered = this.getByRecovery(recoveryId);
    return filtered.length > 0 ? filtered[filtered.length - 1] : undefined;
  }

  updateStatus(recoveryId: string, status: RecoveryStatus, metadata: Record<string, unknown> = {}): RecoveryHistoryEntry {
    return this.record(recoveryId, recoveryId, status, metadata);
  }

  clear(): void {
    this._entries = [];
  }

  get count(): number {
    return this._entries.length;
  }

  setMaxEntries(max: number): void {
    this._maxEntries = max;
    if (this._entries.length > max) {
      this._entries = this._entries.slice(-max);
    }
  }
}
