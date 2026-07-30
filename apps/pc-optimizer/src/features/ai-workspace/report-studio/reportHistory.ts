/**
 * AI Report Studio — History
 *
 * EPIC 5 PHASE A PART 5
 *
 * Tracks report generation history.
 */
import type { ReportHistoryEntry, Report, ReportType } from './types';
import { generateHistoryEntryId } from './types';

export class ReportHistory {
  private _entries: ReportHistoryEntry[] = [];
  private _maxEntries: number = 100;

  record(report: Report): ReportHistoryEntry {
    const entry: ReportHistoryEntry = {
      id: generateHistoryEntryId(),
      reportId: report.id,
      reportType: report.type,
      title: report.title,
      generatedAt: report.generatedAt,
      status: report.status,
      timeRange: report.timeRange,
      futureMetadata: {},
    };

    this._entries.unshift(entry);

    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(0, this._maxEntries);
    }

    return entry;
  }

  getAll(): ReportHistoryEntry[] {
    return [...this._entries];
  }

  getByType(type: ReportType): ReportHistoryEntry[] {
    return this._entries.filter((e) => e.reportType === type);
  }

  getRecent(limit: number = 10): ReportHistoryEntry[] {
    return this._entries.slice(0, limit);
  }

  getById(id: string): ReportHistoryEntry | null {
    return this._entries.find((e) => e.id === id) ?? null;
  }

  count(): number {
    return this._entries.length;
  }

  clear(): void {
    this._entries = [];
  }

  setMaxEntries(max: number): void {
    this._maxEntries = max;
    if (this._entries.length > max) {
      this._entries = this._entries.slice(0, max);
    }
  }
}
