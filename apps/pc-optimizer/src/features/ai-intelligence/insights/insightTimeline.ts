/**
 * Insight Timeline — tracks insight and system events over time.
 *
 * Supports:
 *   Daily, Weekly, Monthly, Yearly periods
 *   Optimization events, achievements, milestones, system changes
 */
import type {
  TimelineEntry,
  TimelinePeriod,
  InsightTimeline,
  Insight,
  InsightConfiguration,
} from './types';
import { generateTimelineEntryId } from './types';

export class InsightTimelineManager {
  private _entries: TimelineEntry[] = [];
  private _config: InsightConfiguration;

  constructor(config: InsightConfiguration) {
    this._config = config;
  }

  updateConfig(config: InsightConfiguration): void {
    this._config = config;
  }

  /**
   * Add an entry to the timeline.
   */
  addEntry(entry: TimelineEntry): void {
    if (!this._config.enableTimeline) return;
    this._entries.push(entry);
    this._trim();
  }

  /**
   * Add an insight as a timeline entry.
   */
  addInsight(insight: Insight): void {
    if (!this._config.enableTimeline) return;
    this.addEntry({
      id: generateTimelineEntryId(),
      timestamp: insight.generatedAt,
      type: 'insight',
      title: insight.title,
      description: insight.summary,
      category: insight.category,
      importance: insight.importanceScore,
      metadata: { insightId: insight.id, type: insight.type },
    });
  }

  /**
   * Add an achievement as a timeline entry.
   */
  addAchievement(name: string, description: string, category: string, unlockedAt: string, importance: number): void {
    if (!this._config.enableTimeline) return;
    this.addEntry({
      id: generateTimelineEntryId(),
      timestamp: unlockedAt,
      type: 'achievement',
      title: name,
      description,
      category: category as TimelineEntry['category'],
      importance,
      metadata: {},
    });
  }

  /**
   * Add a milestone as a timeline entry.
   */
  addMilestone(name: string, description: string, category: string, reachedAt: string, importance: number): void {
    if (!this._config.enableTimeline) return;
    this.addEntry({
      id: generateTimelineEntryId(),
      timestamp: reachedAt,
      type: 'milestone',
      title: name,
      description,
      category: category as TimelineEntry['category'],
      importance,
      metadata: {},
    });
  }

  /**
   * Add a system change as a timeline entry.
   */
  addSystemChange(title: string, description: string, category: string, timestamp: string): void {
    if (!this._config.enableTimeline) return;
    this.addEntry({
      id: generateTimelineEntryId(),
      timestamp,
      type: 'system_change',
      title,
      description,
      category: category as TimelineEntry['category'],
      importance: 0.5,
      metadata: {},
    });
  }

  /**
   * Add an optimization event as a timeline entry.
   */
  addOptimizationEvent(title: string, description: string, timestamp: string, metadata: Record<string, unknown> = {}): void {
    if (!this._config.enableTimeline) return;
    this.addEntry({
      id: generateTimelineEntryId(),
      timestamp,
      type: 'optimization',
      title,
      description,
      category: 'maintenance',
      importance: 0.6,
      metadata,
    });
  }

  /**
   * Get timeline for a specific period.
   */
  getTimeline(period: TimelinePeriod, startDate?: string, endDate?: string): InsightTimeline {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (period) {
      case 'daily':
        start = new Date(now);
        start.setDate(start.getDate() - 1);
        break;
      case 'weekly':
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        break;
      case 'monthly':
        start = new Date(now);
        start.setMonth(start.getMonth() - 1);
        break;
      case 'yearly':
        start = new Date(now);
        start.setFullYear(start.getFullYear() - 1);
        break;
      default:
        start = new Date(0);
    }

    if (startDate) start = new Date(startDate);
    if (endDate) end = new Date(endDate);

    const entries = this._entries.filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      return ts >= start.getTime() && ts <= end.getTime();
    });

    return {
      entries: entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalEntries: entries.length,
    };
  }

  /**
   * Get all entries.
   */
  getEntries(): TimelineEntry[] {
    return [...this._entries];
  }

  /**
   * Get entries by type.
   */
  getEntriesByType(type: TimelineEntry['type']): TimelineEntry[] {
    return this._entries.filter((e) => e.type === type);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this._entries = [];
  }

  get count(): number {
    return this._entries.length;
  }

  // ── Private ────────────────────────────────────────────────

  private _trim(): void {
    if (this._entries.length > this._config.maxTimelineEntries) {
      this._entries = this._entries.slice(-this._config.maxTimelineEntries);
    }
  }
}
