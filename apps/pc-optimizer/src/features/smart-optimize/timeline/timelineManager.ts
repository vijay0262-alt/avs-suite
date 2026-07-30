/**
 * Unified Timeline & Activity Center — Manager
 *
 * The top-level orchestrator and single source of truth for the
 * unified timeline. Exposes public APIs and emits lifecycle events.
 *
 * Public APIs:
 *   recordEvent()
 *   queryTimeline()
 *   searchTimeline()
 *   groupTimeline()
 *   filterTimeline()
 *   exportTimeline()
 *   getTimelineStatistics()
 */
import type {
  TimelineEventInput,
  TimelineItem,
  TimelineFilter,
  TimelineSearchQuery,
  TimelineQuery,
  TimelineQueryResult,
  TimelineGroupingType,
  TimelineGroup,
  TimelineExport,
  ExportFormat,
  TimelineStatistics,
  TimelineAnalytics,
  TimelineConfiguration,
  TimelineEventProviderPlugin,
  ExportPlugin,
  TimelineEventType_Emitter,
  TimelineEventListener,
} from './types';
import {
  DEFAULT_TIMELINE_CONFIGURATION,
  createTimelineConfiguration,
  type DeepPartial,
} from './timelineConfiguration';
import { TimelineEngine } from './timelineEngine';
import { TimelineCollector } from './timelineCollector';
import { TimelineExporter } from './timelineExporter';
import { TimelineEvents } from './timelineEvents';

export class TimelineManager {
  private _config: TimelineConfiguration;
  private _engine: TimelineEngine;
  private _collector: TimelineCollector;
  private _exporter: TimelineExporter;
  private _events: TimelineEvents;

  constructor(config?: DeepPartial<TimelineConfiguration>) {
    this._config = config
      ? createTimelineConfiguration(config)
      : structuredClone(DEFAULT_TIMELINE_CONFIGURATION);
    this._engine = new TimelineEngine(this._config);
    this._collector = new TimelineCollector(this._config);
    this._exporter = new TimelineExporter(this._config);
    this._events = new TimelineEvents();
  }

  // ── Public APIs ────────────────────────────────────────────

  recordEvent(input: TimelineEventInput): TimelineItem | null {
    if (!this._config.featureFlags.enableTimeline) return null;
    try {
      const item = this._engine.record(input);
      if (this._config.enableEvents) {
        this._events.emitRecorded(item.id, { category: input.category, eventType: input.eventType });
      }
      return item;
    } catch {
      return null;
    }
  }

  recordEvents(inputs: TimelineEventInput[]): TimelineItem[] {
    if (!this._config.featureFlags.enableTimeline) return [];
    const items = this._engine.recordBatch(inputs);
    if (this._config.enableEvents && items.length > 0) {
      this._events.emitRecorded(items[0]!.id, { count: items.length });
    }
    return items;
  }

  queryTimeline(query: TimelineQuery): TimelineQueryResult {
    return this._engine.query(query);
  }

  searchTimeline(query: TimelineSearchQuery): TimelineItem[] {
    if (!this._config.featureFlags.enableSearch) return [];
    const items = this._engine.search(query);
    if (this._config.enableEvents) {
      this._events.emitFiltered(null, { query, resultCount: items.length });
    }
    return items;
  }

  groupTimeline(type: TimelineGroupingType): TimelineGroup[] {
    if (!this._config.featureFlags.enableGrouping) return [];
    return this._engine.group(type);
  }

  filterTimeline(filter: TimelineFilter): TimelineItem[] {
    if (!this._config.featureFlags.enableFilters) return [];
    const items = this._engine.filter(filter);
    if (this._config.enableEvents) {
      this._events.emitFiltered(null, { filter, resultCount: items.length });
    }
    return items;
  }

  exportTimeline(
    format: ExportFormat,
    filter: TimelineFilter | null = null,
  ): TimelineExport | null {
    if (!this._config.featureFlags.enableExport) return null;
    const items = filter ? this._engine.filter(filter) : this._engine.getAll();
    const exportResult = this._exporter.exportItems(items, format, filter);
    if (this._config.enableEvents) {
      this._events.emitExported(null, { format, itemCount: items.length });
    }
    return exportResult;
  }

  getTimelineStatistics(): TimelineStatistics {
    return this._engine.getStatistics();
  }

  getTimelineAnalytics(): TimelineAnalytics {
    const analytics = this._engine.getAnalytics();
    if (this._config.enableEvents) {
      this._events.emitAnalyticsUpdated(null, { generatedAt: analytics.generatedAt });
    }
    return analytics;
  }

  // ── Item Access ────────────────────────────────────────────

  getTimelineItem(id: string): TimelineItem | null {
    return this._engine.get(id);
  }

  getAllTimelineItems(): TimelineItem[] {
    return this._engine.getAll();
  }

  updateTimelineItem(id: string, updates: Partial<TimelineItem>): boolean {
    const result = this._engine.update(id, updates);
    if (result && this._config.enableEvents) {
      this._events.emitUpdated(id, updates);
    }
    return result;
  }

  removeTimelineItem(id: string): boolean {
    return this._engine.remove(id);
  }

  // ── Collector ──────────────────────────────────────────────

  collectEvents(since: string | null): TimelineEventInput[] {
    return this._collector.collect(since);
  }

  registerEventProvider(plugin: TimelineEventProviderPlugin): boolean {
    return this._collector.registerProvider(plugin);
  }

  unregisterEventProvider(pluginName: string): boolean {
    return this._collector.unregisterProvider(pluginName);
  }

  // ── Export Plugin ──────────────────────────────────────────

  registerExportPlugin(plugin: ExportPlugin): boolean {
    return this._exporter.registerPlugin(plugin);
  }

  unregisterExportPlugin(pluginName: string): boolean {
    return this._exporter.unregisterPlugin(pluginName);
  }

  getSupportedExportFormats(): ExportFormat[] {
    return this._exporter.getSupportedFormats();
  }

  // ── Retention ──────────────────────────────────────────────

  pruneTimeline(): number {
    const pruned = this._engine.prune();
    if (pruned > 0 && this._config.enableEvents) {
      this._events.emitPruned(null, { pruned });
    }
    return pruned;
  }

  // ── Events ─────────────────────────────────────────────────

  on(event: TimelineEventType_Emitter, listener: TimelineEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: TimelineEventType_Emitter, listener: TimelineEventListener): void {
    this._events.off(event, listener);
  }

  // ── Config ─────────────────────────────────────────────────

  get config(): TimelineConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<TimelineConfiguration>): void {
    this._config = createTimelineConfiguration(overrides);
    this._engine = new TimelineEngine(this._config);
    this._collector = new TimelineCollector(this._config);
    this._exporter = new TimelineExporter(this._config);
  }

  // ── Lifecycle ──────────────────────────────────────────────

  clear(): void {
    this._engine.clear();
    this._events.clear();
  }

  get itemCount(): number {
    return this._engine.count();
  }
}
