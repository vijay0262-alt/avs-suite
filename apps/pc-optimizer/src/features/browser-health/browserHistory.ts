/**
 * Browser History — records cleanup operations, space recovered,
 * privacy improvements, execution duration, and rollback actions.
 *
 * This module does NOT modify any existing architecture.
 */
import type { BrowserHistoryEntry, BrowserCleanupRecord, BrowserCleanupOperationType } from './types';

let _entryCounter = 0;

function generateEntryId(): string {
  _entryCounter += 1;
  return `browser-history-${Date.now().toString(36)}-${_entryCounter}`;
}

export class BrowserHistory {
  private _entries: BrowserHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 200) {
    this._maxEntries = maxEntries;
  }

  record(
    operationType: BrowserCleanupOperationType,
    browserId: string,
    browserName: string,
    profileId: string | null,
    itemsRemoved: number,
    bytesRecovered: number,
    privacyImprovement: number,
    durationMs: number,
  ): BrowserHistoryEntry {
    const entry: BrowserHistoryEntry = {
      id: generateEntryId(),
      timestamp: new Date().toISOString(),
      operationType,
      browserId,
      browserName,
      profileId,
      itemsRemoved,
      bytesRecovered,
      privacyImprovement,
      durationMs,
      rolledBack: false,
      rollbackTimestamp: null,
    };
    this._entries.unshift(entry);
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(0, this._maxEntries);
    }
    return entry;
  }

  recordFromCleanupRecord(record: BrowserCleanupRecord, browserName: string, durationMs: number): BrowserHistoryEntry {
    return this.record(
      record.operationType,
      record.browserId,
      browserName,
      record.profileId,
      record.itemsRemoved,
      record.bytesRecovered,
      this._estimatePrivacyImprovement(record.operationType, record.itemsRemoved),
      durationMs,
    );
  }

  markRolledBack(entryId: string): boolean {
    const entry = this._entries.find((e) => e.id === entryId);
    if (entry) {
      entry.rolledBack = true;
      entry.rollbackTimestamp = new Date().toISOString();
      return true;
    }
    return false;
  }

  getAll(): BrowserHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(limit: number): BrowserHistoryEntry[] {
    return this._entries.slice(0, limit);
  }

  getByBrowser(browserId: string): BrowserHistoryEntry[] {
    return this._entries.filter((e) => e.browserId === browserId);
  }

  getByOperationType(type: BrowserCleanupOperationType): BrowserHistoryEntry[] {
    return this._entries.filter((e) => e.operationType === type);
  }

  getTotalBytesRecovered(): number {
    return this._entries
      .filter((e) => !e.rolledBack)
      .reduce((sum, e) => sum + e.bytesRecovered, 0);
  }

  getTotalItemsRemoved(): number {
    return this._entries
      .filter((e) => !e.rolledBack)
      .reduce((sum, e) => sum + e.itemsRemoved, 0);
  }

  getRolledBackEntries(): BrowserHistoryEntry[] {
    return this._entries.filter((e) => e.rolledBack);
  }

  clear(): void {
    this._entries = [];
  }

  size(): number {
    return this._entries.length;
  }

  private _estimatePrivacyImprovement(type: BrowserCleanupOperationType, itemsRemoved: number): number {
    switch (type) {
      case 'cookie_cleanup':
        return Math.min(30, itemsRemoved);
      case 'history_cleanup':
        return Math.min(20, Math.floor(itemsRemoved / 10));
      case 'download_history_cleanup':
        return Math.min(10, Math.floor(itemsRemoved / 10));
      case 'cache_cleanup':
        return Math.min(5, Math.floor(itemsRemoved / 100));
      case 'temp_storage_cleanup':
        return Math.min(5, Math.floor(itemsRemoved / 100));
      default:
        return 0;
    }
  }
}

export const browserHistory = new BrowserHistory();
