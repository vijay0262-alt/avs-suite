/**
 * Recommendation History — tracks recommendation lifecycle events.
 *
 * Supports:
 *   History tracking, expiry detection, deduplication.
 */
import type {
  Recommendation,
  RecommendationHistoryEntry,
  RecommendationConfiguration,
} from './types';

export class RecommendationHistory {
  private _entries: RecommendationHistoryEntry[] = [];
  private _config: RecommendationConfiguration;
  private _seenIds: Map<string, string> = new Map();

  constructor(config: RecommendationConfiguration) {
    this._config = config;
  }

  updateConfig(config: RecommendationConfiguration): void {
    this._config = config;
  }

  /**
   * Record a generation event.
   */
  recordGenerated(recommendations: Recommendation[]): void {
    if (!this._config.enableHistory) return;
    const now = new Date().toISOString();
    for (const rec of recommendations) {
      this._seenIds.set(rec.id, now);
      this._addEntry({
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        recommendationId: rec.id,
        action: 'generated',
        timestamp: now,
        metadata: { category: rec.category, priority: rec.priority },
      });
    }
    this._trim();
  }

  /**
   * Record a selection event.
   */
  recordSelected(recommendationId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recommendationId,
      action: 'selected',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  /**
   * Record an update event.
   */
  recordUpdated(recommendationId: string, metadata: Record<string, unknown> = {}): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recommendationId,
      action: 'updated',
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  /**
   * Record a removal event.
   */
  recordRemoved(recommendationId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recommendationId,
      action: 'removed',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
    this._seenIds.delete(recommendationId);
  }

  /**
   * Record a dismissal event.
   */
  recordDismissed(recommendationId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recommendationId,
      action: 'dismissed',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  /**
   * Record a completion event.
   */
  recordCompleted(recommendationId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recommendationId,
      action: 'completed',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  /**
   * Check for expired recommendations and record expiry events.
   */
  checkExpired(recommendations: Recommendation[]): string[] {
    if (!this._config.enableHistory) return [];
    const expired: string[] = [];
    const now = Date.now();
    const expirationMs = this._config.autoExpirationHours * 60 * 60 * 1000;

    for (const rec of recommendations) {
      if (rec.status === 'expired') {
        expired.push(rec.id);
        continue;
      }
      if (rec.expiresAt) {
        const expiryTime = new Date(rec.expiresAt).getTime();
        if (expiryTime <= now) {
          rec.status = 'expired';
          expired.push(rec.id);
          this._addEntry({
            id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            recommendationId: rec.id,
            action: 'expired',
            timestamp: new Date().toISOString(),
            metadata: {},
          });
        }
      } else {
        const createdAt = new Date(rec.createdAt).getTime();
        if (now - createdAt > expirationMs) {
          rec.status = 'expired';
          rec.expiresAt = new Date(createdAt + expirationMs).toISOString();
          expired.push(rec.id);
          this._addEntry({
            id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            recommendationId: rec.id,
            action: 'expired',
            timestamp: new Date().toISOString(),
            metadata: {},
          });
        }
      }
    }

    return expired;
  }

  /**
   * Deduplicate recommendations by ID.
   */
  deduplicate(recommendations: Recommendation[]): Recommendation[] {
    const seen = new Set<string>();
    const result: Recommendation[] = [];
    for (const rec of recommendations) {
      if (!seen.has(rec.id)) {
        seen.add(rec.id);
        result.push(rec);
      }
    }
    return result;
  }

  /**
   * Get all history entries.
   */
  getEntries(): RecommendationHistoryEntry[] {
    return [...this._entries];
  }

  /**
   * Get entries for a specific recommendation.
   */
  getEntriesFor(recommendationId: string): RecommendationHistoryEntry[] {
    return this._entries.filter((e) => e.recommendationId === recommendationId);
  }

  /**
   * Check if a recommendation ID has been seen before.
   */
  hasSeen(recommendationId: string): boolean {
    return this._seenIds.has(recommendationId);
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this._entries = [];
    this._seenIds.clear();
  }

  get count(): number {
    return this._entries.length;
  }

  // ── Private ────────────────────────────────────────────────

  private _addEntry(entry: RecommendationHistoryEntry): void {
    this._entries.push(entry);
    this._trim();
  }

  private _trim(): void {
    if (this._entries.length > this._config.maxHistoryEntries) {
      this._entries = this._entries.slice(-this._config.maxHistoryEntries);
    }
  }
}
