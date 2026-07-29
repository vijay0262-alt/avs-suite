/**
 * Insight History — tracks insight lifecycle events.
 *
 * Supports:
 *   History tracking, expiry detection, deduplication.
 */
import type {
  Insight,
  InsightHistoryEntry,
  InsightConfiguration,
} from './types';

export class InsightHistory {
  private _entries: InsightHistoryEntry[] = [];
  private _config: InsightConfiguration;
  private _seenIds: Map<string, string> = new Map();

  constructor(config: InsightConfiguration) {
    this._config = config;
  }

  updateConfig(config: InsightConfiguration): void {
    this._config = config;
  }

  recordGenerated(insights: Insight[]): void {
    if (!this._config.enableHistory) return;
    const now = new Date().toISOString();
    for (const insight of insights) {
      this._seenIds.set(insight.id, now);
      this._addEntry({
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        insightId: insight.id,
        action: 'generated',
        timestamp: now,
        metadata: { type: insight.type, category: insight.category },
      });
    }
    this._trim();
  }

  recordViewed(insightId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      insightId,
      action: 'viewed',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  recordArchived(insightId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      insightId,
      action: 'archived',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  recordExpired(insightId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      insightId,
      action: 'expired',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  recordDismissed(insightId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      insightId,
      action: 'dismissed',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  checkExpired(insights: Insight[]): string[] {
    if (!this._config.enableHistory) return [];
    const expired: string[] = [];
    const now = Date.now();

    for (const insight of insights) {
      if (insight.status === 'expired') {
        expired.push(insight.id);
        continue;
      }
      if (insight.expiresAt) {
        const expiryTime = new Date(insight.expiresAt).getTime();
        if (expiryTime <= now) {
          insight.status = 'expired';
          expired.push(insight.id);
          this._addEntry({
            id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            insightId: insight.id,
            action: 'expired',
            timestamp: new Date().toISOString(),
            metadata: {},
          });
        }
      }
    }

    return expired;
  }

  deduplicate(insights: Insight[]): Insight[] {
    const seen = new Set<string>();
    const result: Insight[] = [];
    for (const insight of insights) {
      if (!seen.has(insight.id)) {
        seen.add(insight.id);
        result.push(insight);
      }
    }
    return result;
  }

  getEntries(): InsightHistoryEntry[] {
    return [...this._entries];
  }

  getEntriesFor(insightId: string): InsightHistoryEntry[] {
    return this._entries.filter((e) => e.insightId === insightId);
  }

  hasSeen(insightId: string): boolean {
    return this._seenIds.has(insightId);
  }

  clear(): void {
    this._entries = [];
    this._seenIds.clear();
  }

  get count(): number {
    return this._entries.length;
  }

  // ── Private ────────────────────────────────────────────────

  private _addEntry(entry: InsightHistoryEntry): void {
    this._entries.push(entry);
    this._trim();
  }

  private _trim(): void {
    if (this._entries.length > this._config.maxHistoryEntries) {
      this._entries = this._entries.slice(-this._config.maxHistoryEntries);
    }
  }
}
