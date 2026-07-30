/**
 * Unified Timeline & Activity Center — Retention Manager
 *
 * Manages retention policies, automatic pruning, and archiving
 * of timeline items based on configured retention rules.
 */
import type {
  TimelineItem,
  RetentionRules,
  RetentionPruneResult,
  RetentionPeriod,
  TimelineConfiguration,
} from './types';
import { getRetentionPeriodDays, severityToScore } from './types';

export class TimelineRetentionManager {
  private _config: TimelineConfiguration;
  private _archived: Map<string, TimelineItem> = new Map();
  private _lastPruneAt: string | null = null;

  constructor(config: TimelineConfiguration) {
    this._config = config;
  }

  prune(items: TimelineItem[]): RetentionPruneResult {
    const rules = this._config.retentionRules;
    const maxDays = getRetentionPeriodDays(rules.retentionPeriod);
    const now = Date.now();
    const maxAgeMs = maxDays * 86400000;
    const thresholdScore = severityToScore(rules.priorityThreshold);

    const toPrune: string[] = [];
    const toArchive: string[] = [];
    const remaining: TimelineItem[] = [];

    for (const item of items) {
      const age = now - new Date(item.timestamp).getTime();
      const isOld = age > maxAgeMs;
      const belowThreshold = severityToScore(item.severity) < thresholdScore;

      if (isOld && belowThreshold) {
        if (rules.archiveBeforePrune) {
          this._archived.set(item.id, item);
          toArchive.push(item.id);
        }
        toPrune.push(item.id);
      } else {
        remaining.push(item);
      }
    }

    // Enforce max items
    if (rules.maxItems > 0 && remaining.length > rules.maxItems) {
      remaining.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const excess = remaining.splice(rules.maxItems);
      for (const item of excess) {
        if (rules.archiveBeforePrune) {
          this._archived.set(item.id, item);
          toArchive.push(item.id);
        }
        toPrune.push(item.id);
      }
    }

    this._lastPruneAt = new Date().toISOString();

    return {
      pruned: toPrune.length,
      archived: toArchive.length,
      remaining: remaining.length,
      prunedIds: toPrune,
    };
  }

  shouldPrune(items: TimelineItem[]): boolean {
    const rules = this._config.retentionRules;
    if (!rules.autoPrune) return false;
    if (items.length > rules.maxItems) return true;

    const maxDays = getRetentionPeriodDays(rules.retentionPeriod);
    const maxAgeMs = maxDays * 86400000;
    const now = Date.now();
    const thresholdScore = severityToScore(rules.priorityThreshold);

    return items.some((item) => {
      const age = now - new Date(item.timestamp).getTime();
      return age > maxAgeMs && severityToScore(item.severity) < thresholdScore;
    });
  }

  getArchived(itemId: string): TimelineItem | null {
    return this._archived.get(itemId) ?? null;
  }

  getAllArchived(): TimelineItem[] {
    return Array.from(this._archived.values());
  }

  restoreFromArchive(itemId: string): TimelineItem | null {
    const item = this._archived.get(itemId);
    if (item) {
      this._archived.delete(itemId);
      return item;
    }
    return null;
  }

  clearArchive(): void {
    this._archived.clear();
  }

  getArchiveCount(): number {
    return this._archived.size;
  }

  getLastPruneAt(): string | null {
    return this._lastPruneAt;
  }

  updateRetentionRules(rules: DeepPartial<RetentionRules>): void {
    if (rules.retentionPeriod !== undefined) this._config.retentionRules.retentionPeriod = rules.retentionPeriod;
    if (rules.maxItems !== undefined) this._config.retentionRules.maxItems = rules.maxItems;
    if (rules.autoPrune !== undefined) this._config.retentionRules.autoPrune = rules.autoPrune;
    if (rules.pruneIntervalMs !== undefined) this._config.retentionRules.pruneIntervalMs = rules.pruneIntervalMs;
    if (rules.archiveBeforePrune !== undefined) this._config.retentionRules.archiveBeforePrune = rules.archiveBeforePrune;
    if (rules.priorityThreshold !== undefined) this._config.retentionRules.priorityThreshold = rules.priorityThreshold;
  }

  getRetentionPeriod(): RetentionPeriod {
    return this._config.retentionRules.retentionPeriod;
  }
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
