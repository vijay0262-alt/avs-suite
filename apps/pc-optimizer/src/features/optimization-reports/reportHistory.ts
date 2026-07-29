/**
 * Report History — tracks report lifecycle events.
 */
import type { ReportHistoryEntry } from './types';
import { generateHistoryId } from './types';

export class ReportHistory {
  private _entries: ReportHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 500) {
    this._maxEntries = maxEntries;
  }

  record(
    reportId: string,
    action: string,
    metadata: Record<string, unknown> = {},
  ): ReportHistoryEntry {
    const entry: ReportHistoryEntry = {
      id: generateHistoryId(),
      reportId,
      action,
      timestamp: new Date().toISOString(),
      metadata,
    };
    this._entries.push(entry);
    this._trim();
    return entry;
  }

  getAll(): ReportHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(count: number): ReportHistoryEntry[] {
    return this._entries.slice(-count);
  }

  getByReport(reportId: string): ReportHistoryEntry[] {
    return this._entries.filter((e) => e.reportId === reportId);
  }

  getByAction(action: string): ReportHistoryEntry[] {
    return this._entries.filter((e) => e.action === action);
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
