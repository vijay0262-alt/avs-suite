/**
 * AI Tool Framework — Telemetry
 *
 * EPIC 5 PHASE A PART 2
 */
import type { ToolTelemetryEntry } from './types';

export class ToolTelemetry {
  private _entries: ToolTelemetryEntry[] = [];
  private _maxEntries: number = 1000;

  record(entry: ToolTelemetryEntry): void {
    this._entries.unshift(entry);
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(0, this._maxEntries);
    }
  }

  getEntries(limit?: number): ToolTelemetryEntry[] {
    return limit ? this._entries.slice(0, limit) : [...this._entries];
  }

  getEntriesForTool(toolId: string, limit?: number): ToolTelemetryEntry[] {
    const filtered = this._entries.filter((e) => e.toolId === toolId);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  getAverageExecutionTime(toolId?: string): number {
    const entries = toolId ? this.getEntriesForTool(toolId) : this._entries;
    if (entries.length === 0) return 0;
    return entries.reduce((sum, e) => sum + e.durationMs, 0) / entries.length;
  }

  getAverageConfidence(toolId?: string): number {
    const entries = toolId ? this.getEntriesForTool(toolId) : this._entries;
    if (entries.length === 0) return 0;
    return entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length;
  }

  getCountByStatus(toolId?: string): Record<string, number> {
    const entries = toolId ? this.getEntriesForTool(toolId) : this._entries;
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    }
    return counts;
  }

  clear(): void {
    this._entries = [];
  }

  count(): number {
    return this._entries.length;
  }
}
