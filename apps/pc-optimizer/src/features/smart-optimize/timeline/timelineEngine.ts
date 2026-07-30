/**
 * Unified Timeline & Activity Center — Engine
 *
 * The core engine that manages the timeline store, coordinates
 * filtering, searching, grouping, and provides query APIs.
 */
import type {
  TimelineItem,
  TimelineEventInput,
  TimelineFilter,
  TimelineSearchQuery,
  TimelineQuery,
  TimelineQueryResult,
  TimelineGroupingType,
  TimelineGroup,
  TimelineConfiguration,
  TimelineStatistics,
  TimelineAnalytics,
} from './types';
import { TimelineAggregator } from './timelineAggregator';
import { TimelineFilterEngine } from './timelineFilterEngine';
import { TimelineSearchEngine } from './timelineSearchEngine';
import { TimelineGroupingEngine } from './timelineGroupingEngine';
import { TimelineStatisticsEngine } from './timelineStatistics';
import { TimelineAnalyticsEngine } from './timelineAnalytics';
import { TimelineRetentionManager } from './timelineRetentionManager';
import { TimelineValidator } from './timelineValidator';

export class TimelineEngine {
  private _config: TimelineConfiguration;
  private _items: TimelineItem[] = [];
  private _aggregator: TimelineAggregator;
  private _filterEngine: TimelineFilterEngine;
  private _searchEngine: TimelineSearchEngine;
  private _groupingEngine: TimelineGroupingEngine;
  private _statsEngine: TimelineStatisticsEngine;
  private _analyticsEngine: TimelineAnalyticsEngine;
  private _retentionManager: TimelineRetentionManager;
  private _validator: TimelineValidator;
  private _cachedStats: TimelineStatistics | null = null;
  private _cachedAnalytics: TimelineAnalytics | null = null;

  constructor(config: TimelineConfiguration) {
    this._config = config;
    this._aggregator = new TimelineAggregator(config);
    this._filterEngine = new TimelineFilterEngine(config);
    this._searchEngine = new TimelineSearchEngine(config);
    this._groupingEngine = new TimelineGroupingEngine(config);
    this._statsEngine = new TimelineStatisticsEngine();
    this._analyticsEngine = new TimelineAnalyticsEngine(config);
    this._retentionManager = new TimelineRetentionManager(config);
    this._validator = new TimelineValidator(config);
  }

  record(input: TimelineEventInput): TimelineItem {
    const validation = this._validator.validateInput(input);
    if (!validation.valid) {
      throw new Error(`Invalid timeline event: ${validation.errors.map((e) => e.message).join('; ')}`);
    }

    const item = this._aggregator.aggregateSingle(input);
    this._items.push(item);
    this._invalidateCache();

    if (this._config.retentionRules.autoPrune && this._retentionManager.shouldPrune(this._items)) {
      this.prune();
    }

    return item;
  }

  recordBatch(inputs: TimelineEventInput[]): TimelineItem[] {
    const items: TimelineItem[] = [];
    for (const input of inputs) {
      try {
        items.push(this.record(input));
      } catch {
        // skip invalid items
      }
    }
    return items;
  }

  get(id: string): TimelineItem | null {
    return this._items.find((i) => i.id === id) ?? null;
  }

  getAll(): TimelineItem[] {
    return [...this._items];
  }

  count(): number {
    return this._items.length;
  }

  update(id: string, updates: Partial<TimelineItem>): boolean {
    const idx = this._items.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    const existing = this._items[idx]!;
    this._items[idx] = {
      ...existing,
      ...updates,
      id: existing.id,
      timestamp: updates.timestamp ?? existing.timestamp,
      category: updates.category ?? existing.category,
      eventType: updates.eventType ?? existing.eventType,
      title: updates.title ?? existing.title,
      summary: updates.summary ?? existing.summary,
      details: updates.details ?? existing.details,
      sourceModule: updates.sourceModule ?? existing.sourceModule,
      relatedOperation: updates.relatedOperation ?? existing.relatedOperation,
      relatedRecommendation: updates.relatedRecommendation ?? existing.relatedRecommendation,
      relatedSnapshot: updates.relatedSnapshot ?? existing.relatedSnapshot,
      severity: updates.severity ?? existing.severity,
      status: updates.status ?? existing.status,
      confidence: updates.confidence ?? existing.confidence,
      tags: updates.tags ?? existing.tags,
      searchKeywords: updates.searchKeywords ?? existing.searchKeywords,
      evidence: updates.evidence ?? existing.evidence,
      futureMetadata: updates.futureMetadata ?? existing.futureMetadata,
    };
    this._invalidateCache();
    return true;
  }

  remove(id: string): boolean {
    const idx = this._items.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    this._items.splice(idx, 1);
    this._invalidateCache();
    return true;
  }

  filter(filter: TimelineFilter): TimelineItem[] {
    return this._filterEngine.filter(this._items, filter);
  }

  search(query: TimelineSearchQuery): TimelineItem[] {
    return this._searchEngine.search(this._items, query).items;
  }

  group(type: TimelineGroupingType): TimelineGroup[] {
    return this._groupingEngine.group(this._items, type).groups;
  }

  query(query: TimelineQuery): TimelineQueryResult {
    const start = performance.now();
    let items = this._items;

    if (query.filter) {
      items = this._filterEngine.filter(items, query.filter);
    }

    if (query.search) {
      items = this._searchEngine.search(items, query.search).items;
    }

    // Sort
    const sortBy = query.sort ?? 'timestamp';
    const direction = query.sortDirection ?? 'desc';
    items = [...items].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'timestamp') cmp = a.timestamp.localeCompare(b.timestamp);
      else if (sortBy === 'severity') cmp = a.severity.localeCompare(b.severity);
      else if (sortBy === 'category') cmp = a.category.localeCompare(b.category);
      else if (sortBy === 'module') cmp = a.sourceModule.localeCompare(b.sourceModule);
      return direction === 'asc' ? cmp : -cmp;
    });

    const total = items.length;

    // Pagination
    if (query.offset) items = items.slice(query.offset);
    if (query.limit) items = items.slice(0, query.limit);

    // Grouping
    let groups: TimelineGroup[] | null = null;
    if (query.grouping) {
      groups = this._groupingEngine.group(items, query.grouping).groups;
    }

    const elapsed = performance.now() - start;
    return { items, total, groups, durationMs: elapsed };
  }

  getStatistics(): TimelineStatistics {
    if (this._cachedStats) return this._cachedStats;
    this._cachedStats = this._statsEngine.compute(this._items);
    return this._cachedStats;
  }

  getAnalytics(): TimelineAnalytics {
    if (this._cachedAnalytics) return this._cachedAnalytics;
    this._cachedAnalytics = this._analyticsEngine.compute(this._items);
    return this._cachedAnalytics;
  }

  prune(): number {
    const result = this._retentionManager.prune(this._items);
    if (result.pruned > 0) {
      const prunedSet = new Set(result.prunedIds);
      this._items = this._items.filter((i) => !prunedSet.has(i.id));
      this._invalidateCache();
    }
    return result.pruned;
  }

  clear(): void {
    this._items = [];
    this._invalidateCache();
    this._retentionManager.clearArchive();
  }

  get config(): TimelineConfiguration {
    return this._config;
  }

  get aggregator(): TimelineAggregator {
    return this._aggregator;
  }

  get filterEngine(): TimelineFilterEngine {
    return this._filterEngine;
  }

  get searchEngine(): TimelineSearchEngine {
    return this._searchEngine;
  }

  get groupingEngine(): TimelineGroupingEngine {
    return this._groupingEngine;
  }

  get retentionManager(): TimelineRetentionManager {
    return this._retentionManager;
  }

  get validator(): TimelineValidator {
    return this._validator;
  }

  private _invalidateCache(): void {
    this._cachedStats = null;
    this._cachedAnalytics = null;
  }
}
