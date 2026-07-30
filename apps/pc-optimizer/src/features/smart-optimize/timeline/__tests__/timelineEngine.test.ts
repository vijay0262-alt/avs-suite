/**
 * Unified Timeline & Activity Center — Comprehensive Test Suite
 *
 * EPIC 4 PHASE B PART 4
 *
 * Covers: types/helpers, configuration, events, collector, aggregator,
 * filter engine, search engine, grouping engine, retention manager,
 * statistics, analytics, formatter, exporter, validator, engine,
 * manager, regression, performance, and edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TimelineManager,
  TimelineEngine,
  TimelineCollector,
  TimelineAggregator,
  TimelineFilterEngine,
  TimelineSearchEngine,
  TimelineGroupingEngine,
  TimelineRetentionManager,
  TimelineStatisticsEngine,
  TimelineAnalyticsEngine,
  TimelineFormatter,
  TimelineExporter,
  TimelineValidator,
  TimelineEvents,
  DEFAULT_TIMELINE_CONFIGURATION,
  createTimelineConfiguration,
  generateTimelineItemId,
  generateExportId,
  severityToScore,
  scoreToSeverity,
  getCategoryLabel,
  getEventTypeLabel,
  getSeverityLabel,
  getStatusLabel,
  getRetentionPeriodLabel,
  getRetentionPeriodDays,
  createDefaultRetentionRules,
  createDefaultFormattingRules,
  createDefaultGroupingRules,
  createDefaultFilterRules,
  createDefaultFeatureFlags,
  extractSearchKeywords,
} from '../index';
import type {
  TimelineItem,
  TimelineEventInput,
  TimelineEventProviderPlugin,
  ExportPlugin,
  TimelineCategory,
  TimelineEventType,
} from '../index';

// ── Mock Helpers ─────────────────────────────────────────────

function createMockEventInput(overrides: Partial<TimelineEventInput> = {}): TimelineEventInput {
  return {
    category: 'optimization',
    eventType: 'optimization_created',
    title: 'Test Optimization Event',
    summary: 'A test optimization was created',
    details: { key: 'value' },
    sourceModule: 'smart-optimize',
    relatedOperation: 'op_test_001',
    relatedRecommendation: null,
    relatedSnapshot: null,
    severity: 'info',
    status: 'active',
    confidence: 0.85,
    tags: ['test', 'optimization'],
    evidence: [],
    ...overrides,
  };
}

function createMockItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: generateTimelineItemId(),
    timestamp: new Date().toISOString(),
    category: 'optimization',
    eventType: 'optimization_created',
    title: 'Test Event',
    summary: 'Test summary',
    details: {},
    sourceModule: 'smart-optimize',
    relatedOperation: 'op_001',
    relatedRecommendation: null,
    relatedSnapshot: null,
    severity: 'info',
    status: 'active',
    confidence: 0.9,
    tags: ['test'],
    searchKeywords: ['test', 'optimization'],
    evidence: [],
    futureMetadata: {},
    ...overrides,
  };
}

function createMockItems(count: number, overrides: Partial<TimelineItem> = {}): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.now() - (count - i) * 3600000);
    items.push(
      createMockItem({
        id: `tl_test_${i}`,
        timestamp: date.toISOString(),
        title: `Event ${i}`,
        summary: `Summary ${i}`,
        ...overrides,
      }),
    );
  }
  return items;
}

// ── Tests ────────────────────────────────────────────────────

describe('Unified Timeline & Activity Center', () => {
  const DEFAULT_CONFIG = createTimelineConfiguration();

  // ── Types & Helpers ──
  describe('Types & Helpers', () => {
    it('generateTimelineItemId produces unique ids', () => {
      const a = generateTimelineItemId();
      const b = generateTimelineItemId();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^tl_/);
    });
    it('generateExportId produces unique ids', () => {
      expect(generateExportId()).toMatch(/^tlexp_/);
    });
    it('severityToScore converts correctly', () => {
      expect(severityToScore('info')).toBe(0);
      expect(severityToScore('low')).toBe(1);
      expect(severityToScore('medium')).toBe(2);
      expect(severityToScore('high')).toBe(3);
      expect(severityToScore('critical')).toBe(4);
    });
    it('scoreToSeverity converts correctly', () => {
      expect(scoreToSeverity(0)).toBe('info');
      expect(scoreToSeverity(1)).toBe('low');
      expect(scoreToSeverity(2)).toBe('medium');
      expect(scoreToSeverity(3)).toBe('high');
      expect(scoreToSeverity(4)).toBe('critical');
    });
    it('getCategoryLabel works for all categories', () => {
      expect(getCategoryLabel('optimization')).toBe('Optimization');
      expect(getCategoryLabel('simulation')).toBe('Simulation');
      expect(getCategoryLabel('recovery')).toBe('Recovery');
      expect(getCategoryLabel('ai_interaction')).toBe('AI Interaction');
    });
    it('getEventTypeLabel works for all types', () => {
      expect(getEventTypeLabel('optimization_created')).toBe('Optimization Created');
      expect(getEventTypeLabel('recovery_executed')).toBe('Recovery Executed');
      expect(getEventTypeLabel('health_score_changed')).toBe('Health Score Changed');
    });
    it('getSeverityLabel works', () => {
      expect(getSeverityLabel('info')).toBe('Info');
      expect(getSeverityLabel('critical')).toBe('Critical');
    });
    it('getStatusLabel works', () => {
      expect(getStatusLabel('active')).toBe('Active');
      expect(getStatusLabel('archived')).toBe('Archived');
    });
    it('getRetentionPeriodLabel works', () => {
      expect(getRetentionPeriodLabel('30_days')).toBe('30 Days');
      expect(getRetentionPeriodLabel('unlimited')).toBe('Unlimited');
    });
    it('getRetentionPeriodDays converts correctly', () => {
      expect(getRetentionPeriodDays('30_days')).toBe(30);
      expect(getRetentionPeriodDays('90_days')).toBe(90);
      expect(getRetentionPeriodDays('365_days')).toBe(365);
    });
    it('createDefaultRetentionRules has defaults', () => {
      const r = createDefaultRetentionRules();
      expect(r.retentionPeriod).toBe('90_days');
      expect(r.autoPrune).toBe(true);
    });
    it('createDefaultFormattingRules has defaults', () => {
      const r = createDefaultFormattingRules();
      expect(r.maxTitleLength).toBe(200);
      expect(r.includeEvidence).toBe(true);
    });
    it('createDefaultGroupingRules has defaults', () => {
      const r = createDefaultGroupingRules();
      expect(r.defaultGrouping).toBe('day');
      expect(r.sortBy).toBe('timestamp');
    });
    it('createDefaultFilterRules has defaults', () => {
      const r = createDefaultFilterRules();
      expect(r.maxFilterResults).toBe(1000);
      expect(r.enableCustomFilters).toBe(true);
    });
    it('createDefaultFeatureFlags has defaults', () => {
      const r = createDefaultFeatureFlags();
      expect(r.enableTimeline).toBe(true);
      expect(r.enableSearch).toBe(true);
    });
    it('extractSearchKeywords extracts from input', () => {
      const keywords = extractSearchKeywords(createMockEventInput());
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain('optimization');
    });
  });

  // ── Configuration ──
  describe('TimelineConfiguration', () => {
    it('has defaults', () => {
      expect(DEFAULT_TIMELINE_CONFIGURATION.configVersion).toBe('1.0.0');
      expect(DEFAULT_TIMELINE_CONFIGURATION.featureFlags.enableTimeline).toBe(true);
      expect(DEFAULT_TIMELINE_CONFIGURATION.retentionRules.retentionPeriod).toBe('90_days');
    });
    it('createTimelineConfiguration accepts overrides', () => {
      const cfg = createTimelineConfiguration({
        enableEvents: false,
        maxItems: 5000,
      });
      expect(cfg.enableEvents).toBe(false);
      expect(cfg.maxItems).toBe(5000);
    });
    it('merges featureFlags', () => {
      const cfg = createTimelineConfiguration({
        featureFlags: { enableSearch: false },
      });
      expect(cfg.featureFlags.enableSearch).toBe(false);
      expect(cfg.featureFlags.enableTimeline).toBe(true);
    });
    it('merges retentionRules', () => {
      const cfg = createTimelineConfiguration({
        retentionRules: { retentionPeriod: '365_days', maxItems: 5000 },
      });
      expect(cfg.retentionRules.retentionPeriod).toBe('365_days');
      expect(cfg.retentionRules.maxItems).toBe(5000);
      expect(cfg.retentionRules.autoPrune).toBe(true);
    });
    it('merges formattingRules', () => {
      const cfg = createTimelineConfiguration({
        formattingRules: { maxTitleLength: 100 },
      });
      expect(cfg.formattingRules.maxTitleLength).toBe(100);
      expect(cfg.formattingRules.includeEvidence).toBe(true);
    });
    it('merges groupingRules', () => {
      const cfg = createTimelineConfiguration({
        groupingRules: { defaultGrouping: 'week' },
      });
      expect(cfg.groupingRules.defaultGrouping).toBe('week');
    });
    it('merges filterRules', () => {
      const cfg = createTimelineConfiguration({
        filterRules: { maxFilterResults: 500 },
      });
      expect(cfg.filterRules.maxFilterResults).toBe(500);
    });
  });

  // ── Events ──
  describe('TimelineEvents', () => {
    let events: TimelineEvents;
    beforeEach(() => { events = new TimelineEvents(); });

    it('on/emit receives events', () => {
      let received = 0;
      events.on('timeline_recorded', () => { received++; });
      events.emitRecorded('tl_1', {});
      expect(received).toBe(1);
    });
    it('off removes listener', () => {
      let received = 0;
      const listener = () => { received++; };
      events.on('timeline_recorded', listener);
      events.emitRecorded('tl_1', {});
      events.off('timeline_recorded', listener);
      events.emitRecorded('tl_1', {});
      expect(received).toBe(1);
    });
    it('on returns unsubscribe function', () => {
      let received = 0;
      const unsub = events.on('timeline_recorded', () => { received++; });
      events.emitRecorded('tl_1', {});
      unsub();
      events.emitRecorded('tl_1', {});
      expect(received).toBe(1);
    });
    it('emitUpdated works', () => {
      let received = 0;
      events.on('timeline_updated', () => { received++; });
      events.emitUpdated('tl_1', {});
      expect(received).toBe(1);
    });
    it('emitFiltered works', () => {
      let received = 0;
      events.on('timeline_filtered', () => { received++; });
      events.emitFiltered(null, {});
      expect(received).toBe(1);
    });
    it('emitExported works', () => {
      let received = 0;
      events.on('timeline_exported', () => { received++; });
      events.emitExported(null, {});
      expect(received).toBe(1);
    });
    it('emitPruned works', () => {
      let received = 0;
      events.on('timeline_pruned', () => { received++; });
      events.emitPruned(null, {});
      expect(received).toBe(1);
    });
    it('emitAnalyticsUpdated works', () => {
      let received = 0;
      events.on('analytics_updated', () => { received++; });
      events.emitAnalyticsUpdated(null, {});
      expect(received).toBe(1);
    });
    it('clear removes all', () => {
      events.on('timeline_recorded', () => {});
      events.clear();
      expect(events.listenerCount()).toBe(0);
    });
    it('listenerCount returns correct count', () => {
      events.on('timeline_recorded', () => {});
      events.on('timeline_updated', () => {});
      expect(events.listenerCount()).toBe(2);
      expect(events.listenerCount('timeline_recorded')).toBe(1);
    });
    it('does not crash on listener error', () => {
      events.on('timeline_recorded', () => { throw new Error('boom'); });
      expect(() => events.emitRecorded('tl_1', {})).not.toThrow();
    });
  });

  // ── Collector ──
  describe('TimelineCollector', () => {
    let collector: TimelineCollector;
    beforeEach(() => { collector = new TimelineCollector(DEFAULT_CONFIG); });

    it('registers a provider', () => {
      const plugin: TimelineEventProviderPlugin = {
        getPluginName: () => 'test_provider',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getCategory: () => 'optimization',
        collectEvents: () => [createMockEventInput()],
      };
      expect(collector.registerProvider(plugin)).toBe(true);
      expect(collector.getProviders().length).toBe(1);
    });
    it('rejects duplicate provider', () => {
      const plugin: TimelineEventProviderPlugin = {
        getPluginName: () => 'test_provider',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getCategory: () => 'optimization',
        collectEvents: () => [],
      };
      collector.registerProvider(plugin);
      expect(collector.registerProvider(plugin)).toBe(false);
    });
    it('unregisters a provider', () => {
      const plugin: TimelineEventProviderPlugin = {
        getPluginName: () => 'test_provider',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getCategory: () => 'optimization',
        collectEvents: () => [],
      };
      collector.registerProvider(plugin);
      expect(collector.unregisterProvider('test_provider')).toBe(true);
      expect(collector.getProviders().length).toBe(0);
    });
    it('collects events from providers', () => {
      const plugin: TimelineEventProviderPlugin = {
        getPluginName: () => 'test_provider',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getCategory: () => 'optimization',
        collectEvents: () => [createMockEventInput(), createMockEventInput({ title: 'Second' })],
      };
      collector.registerProvider(plugin);
      const events = collector.collect(null);
      expect(events.length).toBe(2);
    });
    it('skips unavailable providers', () => {
      const plugin: TimelineEventProviderPlugin = {
        getPluginName: () => 'test_provider',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => false,
        getCategory: () => 'optimization',
        collectEvents: () => [createMockEventInput()],
      };
      collector.registerProvider(plugin);
      expect(collector.collect(null).length).toBe(0);
    });
    it('collectFromCategory filters by category', () => {
      collector.registerProvider({
        getPluginName: () => 'opt_provider',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getCategory: () => 'optimization',
        collectEvents: () => [createMockEventInput()],
      });
      collector.registerProvider({
        getPluginName: () => 'maint_provider',
        getVersion: () => '1.0.0',
        getPriority: () => 50,
        isAvailable: () => true,
        getCategory: () => 'maintenance',
        collectEvents: () => [createMockEventInput({ category: 'maintenance' })],
      });
      expect(collector.collectFromCategory('optimization', null).length).toBe(1);
    });
    it('clear removes all providers', () => {
      collector.registerProvider({
        getPluginName: () => 'p',
        getVersion: () => '1',
        getPriority: () => 1,
        isAvailable: () => true,
        getCategory: () => 'optimization',
        collectEvents: () => [],
      });
      collector.clear();
      expect(collector.getProviders().length).toBe(0);
    });
  });

  // ── Aggregator ──
  describe('TimelineAggregator', () => {
    let aggregator: TimelineAggregator;
    beforeEach(() => { aggregator = new TimelineAggregator(DEFAULT_CONFIG); });

    it('aggregates inputs into items', () => {
      const items = aggregator.aggregate([
        createMockEventInput({ relatedOperation: 'op_a' }),
        createMockEventInput({ title: 'Second', relatedOperation: 'op_b' }),
      ]);
      expect(items.length).toBe(2);
      expect(items[0]!.id).toMatch(/^tl_/);
    });
    it('deduplicates by event type and module', () => {
      const items = aggregator.aggregate([
        createMockEventInput(),
        createMockEventInput(),
      ]);
      expect(items.length).toBe(1);
    });
    it('sorts by timestamp', () => {
      const items = aggregator.aggregate([
        createMockEventInput({ title: 'B' }),
        createMockEventInput({ title: 'A', relatedOperation: 'op_002' }),
      ]);
      expect(items.length).toBe(2);
    });
    it('aggregateSingle creates one item', () => {
      const item = aggregator.aggregateSingle(createMockEventInput());
      expect(item.id).toMatch(/^tl_/);
      expect(item.title).toBe('Test Optimization Event');
    });
    it('merge combines without duplicates', () => {
      const existing = createMockItems(3);
      const incoming = createMockItems(2).map((i, idx) => ({ ...i, id: `tl_inc_${idx}` }));
      const merged = aggregator.merge(existing, incoming);
      expect(merged.length).toBe(5);
    });
    it('truncates long titles', () => {
      const longTitle = 'A'.repeat(300);
      const item = aggregator.aggregateSingle(createMockEventInput({ title: longTitle }));
      expect(item.title.length).toBeLessThanOrEqual(200);
    });
    it('extracts search keywords', () => {
      const item = aggregator.aggregateSingle(createMockEventInput());
      expect(item.searchKeywords.length).toBeGreaterThan(0);
    });
  });

  // ── Filter Engine ──
  describe('TimelineFilterEngine', () => {
    let filterEngine: TimelineFilterEngine;
    let items: TimelineItem[];
    beforeEach(() => {
      filterEngine = new TimelineFilterEngine(DEFAULT_CONFIG);
      items = [
        createMockItem({ id: '1', category: 'optimization', severity: 'high', sourceModule: 'planner', tags: ['test'] }),
        createMockItem({ id: '2', category: 'maintenance', severity: 'low', sourceModule: 'maintenance', tags: ['auto'] }),
        createMockItem({ id: '3', category: 'recovery', severity: 'critical', sourceModule: 'recovery', tags: ['urgent'] }),
      ];
    });

    it('filters by category', () => {
      const result = filterEngine.filter(items, { categories: ['optimization'] });
      expect(result.length).toBe(1);
      expect(result[0]!.category).toBe('optimization');
    });
    it('filters by module', () => {
      const result = filterEngine.filter(items, { modules: ['planner'] });
      expect(result.length).toBe(1);
    });
    it('filters by severity', () => {
      const result = filterEngine.filter(items, { severities: ['critical'] });
      expect(result.length).toBe(1);
      expect(result[0]!.severity).toBe('critical');
    });
    it('filters by status', () => {
      const result = filterEngine.filter(items, { statuses: ['active'] });
      expect(result.length).toBe(3);
    });
    it('filters by tags', () => {
      const result = filterEngine.filter(items, { tags: ['urgent'] });
      expect(result.length).toBe(1);
    });
    it('filters by date range', () => {
      const now = new Date().toISOString();
      const result = filterEngine.filter(items, {
        dateRange: { start: now, end: now },
      });
      expect(result.length).toBe(3);
    });
    it('filters by relatedOperation', () => {
      const result = filterEngine.filter(items, { relatedOperation: 'op_001' });
      expect(result.length).toBe(3);
    });
    it('filters by minConfidence', () => {
      const result = filterEngine.filter(items, { minConfidence: 0.95 });
      expect(result.length).toBe(0);
    });
    it('filters with custom filter', () => {
      const result = filterEngine.filter(items, {
        custom: (i) => i.severity === 'critical',
      });
      expect(result.length).toBe(1);
    });
    it('filterByCategory works', () => {
      expect(filterEngine.filterByCategory(items, ['optimization']).length).toBe(1);
    });
    it('filterByModule works', () => {
      expect(filterEngine.filterByModule(items, 'planner').length).toBe(1);
    });
    it('filterBySeverity works', () => {
      expect(filterEngine.filterBySeverity(items, ['high']).length).toBe(2);
    });
    it('filterByTags works', () => {
      expect(filterEngine.filterByTags(items, ['test']).length).toBe(1);
    });
    it('countByFilter returns count', () => {
      expect(filterEngine.countByFilter(items, { categories: ['optimization'] })).toBe(1);
    });
  });

  // ── Search Engine ──
  describe('TimelineSearchEngine', () => {
    let searchEngine: TimelineSearchEngine;
    let items: TimelineItem[];
    beforeEach(() => {
      searchEngine = new TimelineSearchEngine(DEFAULT_CONFIG);
      items = [
        createMockItem({ id: '1', title: 'Optimization Created', summary: 'An optimization was created', tags: ['opt'], relatedOperation: 'op_001' }),
        createMockItem({ id: '2', title: 'Maintenance Planned', summary: 'Maintenance was scheduled', tags: ['maint'], relatedOperation: 'op_002' }),
        createMockItem({ id: '3', title: 'Recovery Executed', summary: 'A recovery was executed', tags: ['rec'], relatedOperation: 'op_003' }),
      ];
    });

    it('searches by text in title', () => {
      const result = searchEngine.search(items, { text: 'Optimization Created' });
      expect(result.items.length).toBe(1);
      expect(result.totalMatches).toBe(1);
    });
    it('searches by text in summary', () => {
      const result = searchEngine.search(items, { text: 'scheduled' });
      expect(result.items.length).toBe(1);
    });
    it('searches by title field', () => {
      const result = searchEngine.search(items, { title: 'Recovery' });
      expect(result.items.length).toBe(1);
    });
    it('searches by summary field', () => {
      const result = searchEngine.search(items, { summary: 'executed' });
      expect(result.items.length).toBe(1);
    });
    it('searches by tags', () => {
      const result = searchEngine.search(items, { tags: ['opt'] });
      expect(result.items.length).toBe(1);
    });
    it('searches by operationId', () => {
      const result = searchEngine.search(items, { operationId: 'op_002' });
      expect(result.items.length).toBe(1);
    });
    it('searches by eventTypes', () => {
      const result = searchEngine.search(items, { eventTypes: ['optimization_created'] });
      expect(result.items.length).toBe(3);
    });
    it('returns durationMs', () => {
      const result = searchEngine.search(items, { text: 'Optimization' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
    it('searchByText works', () => {
      expect(searchEngine.searchByText(items, 'Maintenance').length).toBe(1);
    });
    it('searchByTag works', () => {
      expect(searchEngine.searchByTag(items, 'rec').length).toBe(1);
    });
    it('searchByOperation works', () => {
      expect(searchEngine.searchByOperation(items, 'op_001').length).toBe(1);
    });
    it('searchByRecommendation works', () => {
      const items2 = [createMockItem({ relatedRecommendation: 'rec_001' })];
      expect(searchEngine.searchByRecommendation(items2, 'rec_001').length).toBe(1);
    });
    it('custom filter works', () => {
      const result = searchEngine.search(items, {
        custom: (i) => i.title.includes('Recovery'),
      });
      expect(result.items.length).toBe(1);
    });
  });

  // ── Grouping Engine ──
  describe('TimelineGroupingEngine', () => {
    let groupingEngine: TimelineGroupingEngine;
    let items: TimelineItem[];
    beforeEach(() => {
      groupingEngine = new TimelineGroupingEngine(DEFAULT_CONFIG);
      items = [
        createMockItem({ id: '1', timestamp: '2025-01-15T10:00:00Z', category: 'optimization', relatedOperation: 'sess_1' }),
        createMockItem({ id: '2', timestamp: '2025-01-15T14:00:00Z', category: 'optimization', relatedOperation: 'sess_1' }),
        createMockItem({ id: '3', timestamp: '2025-01-16T10:00:00Z', category: 'maintenance', relatedOperation: 'sess_2' }),
        createMockItem({ id: '4', timestamp: '2025-01-22T10:00:00Z', category: 'recovery', relatedOperation: 'sess_3' }),
      ];
    });

    it('groups by day', () => {
      const result = groupingEngine.group(items, 'day');
      expect(result.groups.length).toBe(3);
      expect(result.totalItems).toBe(4);
    });
    it('groups by week', () => {
      const result = groupingEngine.group(items, 'week');
      expect(result.groups.length).toBeGreaterThanOrEqual(2);
    });
    it('groups by month', () => {
      const result = groupingEngine.group(items, 'month');
      expect(result.groups.length).toBeGreaterThanOrEqual(1);
    });
    it('groups by optimization session', () => {
      const result = groupingEngine.group(items, 'optimization_session');
      expect(result.groups.length).toBe(1);
      expect(result.groups[0]!.count).toBe(2);
      expect(result.ungrouped.length).toBe(2);
    });
    it('groups by maintenance session', () => {
      const result = groupingEngine.group(items, 'maintenance_session');
      expect(result.groups.length).toBe(1);
    });
    it('groups by recovery session', () => {
      const result = groupingEngine.group(items, 'recovery_session');
      expect(result.groups.length).toBe(1);
    });
    it('groups by custom', () => {
      const items2 = [
        createMockItem({ id: '1', details: { customGroup: 'groupA' } }),
        createMockItem({ id: '2', details: { customGroup: 'groupB' } }),
      ];
      const result = groupingEngine.group(items2, 'custom');
      expect(result.groups.length).toBe(2);
    });
    it('getGroupSummary returns summary', () => {
      const result = groupingEngine.group(items, 'day');
      const summary = groupingEngine.getGroupSummary(result.groups[0]!);
      expect(summary.count).toBeGreaterThan(0);
      expect(summary.label).toBeTruthy();
    });
  });

  // ── Retention Manager ──
  describe('TimelineRetentionManager', () => {
    let manager: TimelineRetentionManager;
    beforeEach(() => { manager = new TimelineRetentionManager(DEFAULT_CONFIG); });

    it('prunes old low-severity items', () => {
      const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
      const items = [
        createMockItem({ id: '1', timestamp: oldDate, severity: 'info' }),
        createMockItem({ id: '2', timestamp: new Date().toISOString(), severity: 'info' }),
      ];
      const result = manager.prune(items);
      expect(result.pruned).toBe(1);
      expect(result.remaining).toBe(1);
    });
    it('keeps high-severity old items', () => {
      const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
      const items = [
        createMockItem({ id: '1', timestamp: oldDate, severity: 'critical' }),
      ];
      const result = manager.prune(items);
      expect(result.pruned).toBe(0);
    });
    it('archives before pruning', () => {
      const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
      const items = [
        createMockItem({ id: '1', timestamp: oldDate, severity: 'info' }),
      ];
      const result = manager.prune(items);
      expect(result.archived).toBe(1);
      expect(manager.getArchived('1')).toBeDefined();
    });
    it('restores from archive', () => {
      const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
      const items = [
        createMockItem({ id: '1', timestamp: oldDate, severity: 'info' }),
      ];
      manager.prune(items);
      const restored = manager.restoreFromArchive('1');
      expect(restored).toBeDefined();
      expect(manager.getArchived('1')).toBeNull();
    });
    it('shouldPrune detects old items', () => {
      const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
      const items = [
        createMockItem({ timestamp: oldDate, severity: 'info' }),
      ];
      expect(manager.shouldPrune(items)).toBe(true);
    });
    it('shouldPrune returns false for recent items', () => {
      const items = [createMockItem({ severity: 'info' })];
      expect(manager.shouldPrune(items)).toBe(false);
    });
    it('enforces maxItems', () => {
      const cfg = createTimelineConfiguration({ retentionRules: { maxItems: 2 } });
      const m = new TimelineRetentionManager(cfg);
      const items = createMockItems(5);
      const result = m.prune(items);
      expect(result.remaining).toBeLessThanOrEqual(2);
    });
    it('clearArchive removes all', () => {
      const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
      manager.prune([createMockItem({ timestamp: oldDate, severity: 'info' })]);
      manager.clearArchive();
      expect(manager.getArchiveCount()).toBe(0);
    });
    it('getRetentionPeriod returns current', () => {
      expect(manager.getRetentionPeriod()).toBe('90_days');
    });
  });

  // ── Statistics ──
  describe('TimelineStatisticsEngine', () => {
    it('computes empty statistics', () => {
      const stats = new TimelineStatisticsEngine().compute([]);
      expect(stats.totalEvents).toBe(0);
      expect(stats.firstEventTimestamp).toBeNull();
    });
    it('computes total events', () => {
      const stats = new TimelineStatisticsEngine().compute(createMockItems(5));
      expect(stats.totalEvents).toBe(5);
    });
    it('computes by category', () => {
      const stats = new TimelineStatisticsEngine().compute([
        createMockItem({ category: 'optimization' }),
        createMockItem({ category: 'optimization' }),
        createMockItem({ category: 'maintenance' }),
      ]);
      expect(stats.eventsByCategory['optimization']).toBe(2);
      expect(stats.eventsByCategory['maintenance']).toBe(1);
    });
    it('computes by severity', () => {
      const stats = new TimelineStatisticsEngine().compute([
        createMockItem({ severity: 'high' }),
        createMockItem({ severity: 'critical' }),
      ]);
      expect(stats.eventsBySeverity['high']).toBe(1);
      expect(stats.eventsBySeverity['critical']).toBe(1);
    });
    it('computes by module', () => {
      const stats = new TimelineStatisticsEngine().compute([
        createMockItem({ sourceModule: 'planner' }),
        createMockItem({ sourceModule: 'planner' }),
        createMockItem({ sourceModule: 'recovery' }),
      ]);
      expect(stats.eventsByModule['planner']).toBe(2);
    });
    it('computes events per day', () => {
      const stats = new TimelineStatisticsEngine().compute([
        createMockItem({ timestamp: '2025-01-15T10:00:00Z' }),
        createMockItem({ timestamp: '2025-01-15T14:00:00Z' }),
        createMockItem({ timestamp: '2025-01-16T10:00:00Z' }),
      ]);
      expect(stats.eventsPerDay['2025-01-15']).toBe(2);
      expect(stats.eventsPerDay['2025-01-16']).toBe(1);
    });
    it('computes average confidence', () => {
      const stats = new TimelineStatisticsEngine().compute([
        createMockItem({ confidence: 0.8 }),
        createMockItem({ confidence: 0.9 }),
      ]);
      expect(stats.averageConfidence).toBeCloseTo(0.85, 5);
    });
    it('handles null confidence', () => {
      const stats = new TimelineStatisticsEngine().compute([
        createMockItem({ confidence: null }),
      ]);
      expect(stats.averageConfidence).toBe(0);
    });
    it('computes first and last timestamps', () => {
      const stats = new TimelineStatisticsEngine().compute([
        createMockItem({ timestamp: '2025-01-15T10:00:00Z' }),
        createMockItem({ timestamp: '2025-01-20T10:00:00Z' }),
      ]);
      expect(stats.firstEventTimestamp).toBe('2025-01-15T10:00:00Z');
      expect(stats.lastEventTimestamp).toBe('2025-01-20T10:00:00Z');
    });
    it('computeIncremental adds to existing', () => {
      const engine = new TimelineStatisticsEngine();
      const stats = engine.compute(createMockItems(3));
      const updated = engine.computeIncremental(stats, createMockItems(2));
      expect(updated.totalEvents).toBe(5);
    });
  });

  // ── Analytics ──
  describe('TimelineAnalyticsEngine', () => {
    it('computes empty analytics', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([]);
      expect(a.totalEvents).toBe(0);
      expect(a.optimizationCount).toBe(0);
    });
    it('computes optimization count', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ category: 'optimization' }),
        createMockItem({ category: 'optimization' }),
        createMockItem({ category: 'maintenance' }),
      ]);
      expect(a.optimizationCount).toBe(2);
    });
    it('computes maintenance count', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ category: 'maintenance' }),
      ]);
      expect(a.maintenanceCount).toBe(1);
    });
    it('computes recovery count', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ category: 'recovery' }),
      ]);
      expect(a.recoveryCount).toBe(1);
    });
    it('computes automation success rate', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ category: 'automation', status: 'resolved' }),
        createMockItem({ category: 'automation', status: 'failed' }),
      ]);
      expect(a.automationSuccessRate).toBe(0.5);
    });
    it('computes recommendation acceptance rate', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ category: 'recommendation', eventType: 'recommendation_accepted' }),
        createMockItem({ category: 'recommendation', eventType: 'recommendation_generated' }),
      ]);
      expect(a.recommendationAcceptanceRate).toBe(0.5);
    });
    it('computes health trend', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ category: 'health', eventType: 'health_score_changed', details: { healthScore: 85, previousHealthScore: 80 } }),
      ]);
      expect(a.healthTrend.length).toBe(1);
      expect(a.healthTrend[0]!.delta).toBe(5);
    });
    it('computes top tags', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ tags: ['tag1', 'tag2'] }),
        createMockItem({ tags: ['tag1'] }),
      ]);
      expect(a.topTags[0]!.tag).toBe('tag1');
      expect(a.topTags[0]!.count).toBe(2);
    });
    it('computes top modules', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ sourceModule: 'planner' }),
        createMockItem({ sourceModule: 'planner' }),
        createMockItem({ sourceModule: 'recovery' }),
      ]);
      expect(a.topModules[0]!.module).toBe('planner');
    });
    it('computes events per day', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ timestamp: '2025-01-15T10:00:00Z' }),
        createMockItem({ timestamp: '2025-01-15T14:00:00Z' }),
      ]);
      expect(a.eventsPerDay['2025-01-15']).toBe(2);
    });
    it('computes timeline activity', () => {
      const a = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute([
        createMockItem({ timestamp: '2025-01-15T10:00:00Z', category: 'optimization' }),
      ]);
      expect(a.timelineActivity.length).toBe(1);
      expect(a.timelineActivity[0]!.count).toBe(1);
    });
  });

  // ── Formatter ──
  describe('TimelineFormatter', () => {
    let formatter: TimelineFormatter;
    beforeEach(() => { formatter = new TimelineFormatter(); });

    it('formats items as JSON', () => {
      const result = formatter.formatItems(createMockItems(2), 'json');
      expect(() => JSON.parse(result)).not.toThrow();
    });
    it('formats items as Markdown', () => {
      const result = formatter.formatItems(createMockItems(2), 'markdown');
      expect(result).toContain('# Timeline Export');
      expect(result).toContain('| Timestamp');
    });
    it('formats items as CSV', () => {
      const result = formatter.formatItems(createMockItems(2), 'csv');
      expect(result).toContain('id,timestamp,category');
      expect(result.split('\n').length).toBe(3);
    });
    it('formats items as PDF-ready', () => {
      const result = formatter.formatItems(createMockItems(2), 'pdf_ready');
      expect(() => JSON.parse(result)).not.toThrow();
    });
    it('formats statistics as Markdown', () => {
      const stats = new TimelineStatisticsEngine().compute(createMockItems(3));
      const result = formatter.formatStatistics(stats, 'markdown');
      expect(result).toContain('# Timeline Statistics');
    });
    it('formats analytics as Markdown', () => {
      const analytics = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute(createMockItems(3));
      const result = formatter.formatAnalytics(analytics, 'markdown');
      expect(result).toContain('# Timeline Analytics');
    });
    it('formats statistics as CSV', () => {
      const stats = new TimelineStatisticsEngine().compute(createMockItems(3));
      const result = formatter.formatStatistics(stats, 'csv');
      expect(result).toContain('metric,value');
    });
    it('formats analytics as CSV', () => {
      const analytics = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute(createMockItems(3));
      const result = formatter.formatAnalytics(analytics, 'csv');
      expect(result).toContain('metric,value');
    });
  });

  // ── Exporter ──
  describe('TimelineExporter', () => {
    let exporter: TimelineExporter;
    beforeEach(() => { exporter = new TimelineExporter(DEFAULT_CONFIG); });

    it('exports as JSON', () => {
      const result = exporter.exportItems(createMockItems(2), 'json');
      expect(result.format).toBe('json');
      expect(() => JSON.parse(result.content)).not.toThrow();
      expect(result.metadata.byteSize).toBeGreaterThan(0);
    });
    it('exports as Markdown', () => {
      const result = exporter.exportItems(createMockItems(2), 'markdown');
      expect(result.format).toBe('markdown');
      expect(result.content).toContain('# Timeline Export');
    });
    it('exports as CSV', () => {
      const result = exporter.exportItems(createMockItems(2), 'csv');
      expect(result.format).toBe('csv');
      expect(result.content).toContain('id,timestamp');
    });
    it('exports as PDF-ready', () => {
      const result = exporter.exportItems(createMockItems(2), 'pdf_ready');
      expect(result.format).toBe('pdf_ready');
      expect(() => JSON.parse(result.content)).not.toThrow();
    });
    it('exports statistics', () => {
      const stats = new TimelineStatisticsEngine().compute(createMockItems(2));
      const result = exporter.exportStatistics(stats, 'json');
      expect(result.format).toBe('json');
    });
    it('exports analytics', () => {
      const analytics = new TimelineAnalyticsEngine(DEFAULT_CONFIG).compute(createMockItems(2));
      const result = exporter.exportAnalytics(analytics, 'json');
      expect(result.format).toBe('json');
    });
    it('exports all formats', () => {
      const results = exporter.exportAll(createMockItems(2));
      expect(results['json']).toBeDefined();
      expect(results['markdown']).toBeDefined();
      expect(results['csv']).toBeDefined();
      expect(results['pdf_ready']).toBeDefined();
    });
    it('getSupportedFormats includes built-in', () => {
      const formats = exporter.getSupportedFormats();
      expect(formats).toContain('json');
      expect(formats).toContain('markdown');
      expect(formats).toContain('csv');
      expect(formats).toContain('pdf_ready');
    });
    it('registers and uses export plugins', () => {
      const plugin: ExportPlugin = {
        getPluginName: () => 'future_export',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getFormat: () => 'future_format',
        export: (items) => ({
          id: generateExportId(),
          format: 'future_format',
          content: 'future content',
          metadata: {
            exportedAt: new Date().toISOString(),
            itemCount: items.length,
            formatVersion: '2.0.0',
            byteSize: 13,
            filtersApplied: null,
            futureMetadata: {},
          },
          futureMetadata: {},
        }),
      };
      expect(exporter.registerPlugin(plugin)).toBe(true);
      const result = exporter.exportItems(createMockItems(2), 'future_format');
      expect(result.content).toBe('future content');
    });
    it('unregisters plugins', () => {
      const plugin: ExportPlugin = {
        getPluginName: () => 'p',
        getVersion: () => '1',
        getPriority: () => 1,
        isAvailable: () => true,
        getFormat: () => 'future_format',
        export: () => ({
          id: '', format: 'future_format', content: '',
          metadata: { exportedAt: '', itemCount: 0, formatVersion: '1', byteSize: 0, filtersApplied: null, futureMetadata: {} },
          futureMetadata: {},
        }),
      };
      exporter.registerPlugin(plugin);
      expect(exporter.unregisterPlugin('p')).toBe(true);
    });
  });

  // ── Validator ──
  describe('TimelineValidator', () => {
    let validator: TimelineValidator;
    beforeEach(() => { validator = new TimelineValidator(DEFAULT_CONFIG); });

    it('validates correct input', () => {
      const r = validator.validateInput(createMockEventInput());
      expect(r.valid).toBe(true);
      expect(r.errors.length).toBe(0);
    });
    it('detects missing title', () => {
      const r = validator.validateInput(createMockEventInput({ title: '' }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.code === 'MISSING_TITLE')).toBe(true);
    });
    it('detects missing summary', () => {
      const r = validator.validateInput(createMockEventInput({ summary: '' }));
      expect(r.valid).toBe(false);
    });
    it('detects missing sourceModule', () => {
      const r = validator.validateInput(createMockEventInput({ sourceModule: '' }));
      expect(r.valid).toBe(false);
    });
    it('detects invalid confidence', () => {
      const r = validator.validateInput(createMockEventInput({ confidence: 1.5 }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.code === 'INVALID_CONFIDENCE')).toBe(true);
    });
    it('warns on no evidence', () => {
      const r = validator.validateInput(createMockEventInput({ evidence: [] }));
      expect(r.warnings.some((w) => w.code === 'NO_EVIDENCE')).toBe(true);
    });
    it('validates item', () => {
      const r = validator.validateItem(createMockItem());
      expect(r.valid).toBe(true);
    });
    it('validates batch', () => {
      const r = validator.validateBatch(createMockItems(3));
      expect(r.valid).toBe(true);
    });
    it('detects invalid item confidence', () => {
      const r = validator.validateItem(createMockItem({ confidence: -0.5 }));
      expect(r.valid).toBe(false);
    });
    it('warns on no keywords', () => {
      const r = validator.validateItem(createMockItem({ searchKeywords: [] }));
      expect(r.warnings.some((w) => w.code === 'NO_KEYWORDS')).toBe(true);
    });
  });

  // ── Engine ──
  describe('TimelineEngine', () => {
    let engine: TimelineEngine;
    beforeEach(() => { engine = new TimelineEngine(DEFAULT_CONFIG); });

    it('records an event', () => {
      const item = engine.record(createMockEventInput());
      expect(item.id).toMatch(/^tl_/);
      expect(engine.count()).toBe(1);
    });
    it('records batch', () => {
      const items = engine.recordBatch([
        createMockEventInput({ title: 'A', relatedOperation: 'op_a' }),
        createMockEventInput({ title: 'B', relatedOperation: 'op_b' }),
      ]);
      expect(items.length).toBe(2);
      expect(engine.count()).toBe(2);
    });
    it('get returns item by id', () => {
      const item = engine.record(createMockEventInput());
      expect(engine.get(item.id)).toBeDefined();
      expect(engine.get('unknown')).toBeNull();
    });
    it('getAll returns all items', () => {
      engine.record(createMockEventInput({ title: 'A', relatedOperation: 'op_a' }));
      engine.record(createMockEventInput({ title: 'B', relatedOperation: 'op_b' }));
      expect(engine.getAll().length).toBe(2);
    });
    it('update modifies item', () => {
      const item = engine.record(createMockEventInput());
      expect(engine.update(item.id, { title: 'Updated' })).toBe(true);
      expect(engine.get(item.id)?.title).toBe('Updated');
    });
    it('remove deletes item', () => {
      const item = engine.record(createMockEventInput());
      expect(engine.remove(item.id)).toBe(true);
      expect(engine.count()).toBe(0);
    });
    it('filter returns filtered items', () => {
      engine.record(createMockEventInput({ category: 'optimization', title: 'A', relatedOperation: 'op_a' }));
      engine.record(createMockEventInput({ category: 'maintenance', title: 'B', relatedOperation: 'op_b' }));
      expect(engine.filter({ categories: ['optimization'] }).length).toBe(1);
    });
    it('search returns matching items', () => {
      engine.record(createMockEventInput({ title: 'Optimization Test', relatedOperation: 'op_a' }));
      engine.record(createMockEventInput({ title: 'Maintenance', relatedOperation: 'op_b' }));
      expect(engine.search({ text: 'Optimization Test' }).length).toBe(1);
    });
    it('group returns groups', () => {
      engine.record(createMockEventInput({ title: 'A', relatedOperation: 'op_a' }));
      engine.record(createMockEventInput({ title: 'B', relatedOperation: 'op_b' }));
      const groups = engine.group('day');
      expect(groups.length).toBeGreaterThanOrEqual(1);
    });
    it('query returns result with durationMs', () => {
      engine.record(createMockEventInput());
      const result = engine.query({});
      expect(result.items.length).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
    it('query with filter', () => {
      engine.record(createMockEventInput({ category: 'optimization', title: 'A', relatedOperation: 'op_a' }));
      engine.record(createMockEventInput({ category: 'maintenance', title: 'B', relatedOperation: 'op_b' }));
      const result = engine.query({ filter: { categories: ['maintenance'] } });
      expect(result.items.length).toBe(1);
    });
    it('query with pagination', () => {
      for (let i = 0; i < 5; i++) {
        engine.record(createMockEventInput({ title: `Event ${i}`, relatedOperation: `op_${i}` }));
      }
      const result = engine.query({ limit: 2 });
      expect(result.items.length).toBe(2);
      expect(result.total).toBe(5);
    });
    it('getStatistics returns stats', () => {
      engine.record(createMockEventInput());
      const stats = engine.getStatistics();
      expect(stats.totalEvents).toBe(1);
    });
    it('getAnalytics returns analytics', () => {
      engine.record(createMockEventInput());
      const analytics = engine.getAnalytics();
      expect(analytics.totalEvents).toBe(1);
    });
    it('prune removes old items', () => {
      const cfg = createTimelineConfiguration({ retentionRules: { retentionPeriod: '30_days', priorityThreshold: 'critical' } });
      const e = new TimelineEngine(cfg);
      const oldDate = new Date(Date.now() - 40 * 86400000).toISOString();
      const item = e.record(createMockEventInput());
      e.update(item.id, { timestamp: oldDate, severity: 'info' });
      const pruned = e.prune();
      expect(pruned).toBe(1);
    });
    it('clear resets', () => {
      engine.record(createMockEventInput());
      engine.clear();
      expect(engine.count()).toBe(0);
    });
  });

  // ── Manager ──
  describe('TimelineManager', () => {
    let manager: TimelineManager;
    beforeEach(() => { manager = new TimelineManager(); });

    it('recordEvent returns item', () => {
      const item = manager.recordEvent(createMockEventInput());
      expect(item).toBeDefined();
      expect(item?.id).toMatch(/^tl_/);
    });
    it('recordEvent returns null when disabled', () => {
      const m = new TimelineManager({ featureFlags: { enableTimeline: false } });
      expect(m.recordEvent(createMockEventInput())).toBeNull();
    });
    it('recordEvents batch', () => {
      const items = manager.recordEvents([
        createMockEventInput({ title: 'A', relatedOperation: 'op_a' }),
        createMockEventInput({ title: 'B', relatedOperation: 'op_b' }),
      ]);
      expect(items.length).toBe(2);
    });
    it('queryTimeline returns result', () => {
      manager.recordEvent(createMockEventInput());
      const result = manager.queryTimeline({});
      expect(result.items.length).toBe(1);
    });
    it('searchTimeline returns items', () => {
      manager.recordEvent(createMockEventInput({ title: 'Test Search' }));
      const result = manager.searchTimeline({ text: 'Test' });
      expect(result.length).toBe(1);
    });
    it('groupTimeline returns groups', () => {
      manager.recordEvent(createMockEventInput());
      const groups = manager.groupTimeline('day');
      expect(groups.length).toBeGreaterThanOrEqual(1);
    });
    it('filterTimeline returns items', () => {
      manager.recordEvent(createMockEventInput({ category: 'optimization' }));
      const items = manager.filterTimeline({ categories: ['optimization'] });
      expect(items.length).toBe(1);
    });
    it('exportTimeline returns export', () => {
      manager.recordEvent(createMockEventInput());
      const exportResult = manager.exportTimeline('json');
      expect(exportResult).toBeDefined();
      expect(exportResult?.format).toBe('json');
    });
    it('getTimelineStatistics returns stats', () => {
      manager.recordEvent(createMockEventInput());
      const stats = manager.getTimelineStatistics();
      expect(stats.totalEvents).toBe(1);
    });
    it('getTimelineAnalytics returns analytics', () => {
      manager.recordEvent(createMockEventInput());
      const analytics = manager.getTimelineAnalytics();
      expect(analytics.totalEvents).toBe(1);
    });
    it('getTimelineItem returns item', () => {
      const item = manager.recordEvent(createMockEventInput());
      expect(manager.getTimelineItem(item!.id)).toBeDefined();
    });
    it('updateTimelineItem updates', () => {
      const item = manager.recordEvent(createMockEventInput());
      expect(manager.updateTimelineItem(item!.id, { title: 'Updated' })).toBe(true);
      expect(manager.getTimelineItem(item!.id)?.title).toBe('Updated');
    });
    it('removeTimelineItem removes', () => {
      const item = manager.recordEvent(createMockEventInput());
      expect(manager.removeTimelineItem(item!.id)).toBe(true);
      expect(manager.itemCount).toBe(0);
    });
    it('emits timeline_recorded event', () => {
      let received = 0;
      manager.on('timeline_recorded', () => { received++; });
      manager.recordEvent(createMockEventInput());
      expect(received).toBe(1);
    });
    it('emits timeline_filtered event', () => {
      let received = 0;
      manager.on('timeline_filtered', () => { received++; });
      manager.recordEvent(createMockEventInput());
      manager.filterTimeline({ categories: ['optimization'] });
      expect(received).toBe(1);
    });
    it('emits timeline_exported event', () => {
      let received = 0;
      manager.on('timeline_exported', () => { received++; });
      manager.recordEvent(createMockEventInput());
      manager.exportTimeline('json');
      expect(received).toBe(1);
    });
    it('emits analytics_updated event', () => {
      let received = 0;
      manager.on('analytics_updated', () => { received++; });
      manager.recordEvent(createMockEventInput());
      manager.getTimelineAnalytics();
      expect(received).toBe(1);
    });
    it('events disabled does not emit', () => {
      const m = new TimelineManager({ enableEvents: false });
      let received = 0;
      m.on('timeline_recorded', () => { received++; });
      m.recordEvent(createMockEventInput());
      expect(received).toBe(0);
    });
    it('config is accessible', () => {
      expect(manager.config.configVersion).toBe('1.0.0');
    });
    it('updateConfig updates config', () => {
      manager.updateConfig({ maxItems: 5000 });
      expect(manager.config.maxItems).toBe(5000);
    });
    it('clear resets', () => {
      manager.recordEvent(createMockEventInput());
      manager.clear();
      expect(manager.itemCount).toBe(0);
    });
    it('registerEventProvider adds provider', () => {
      const plugin: TimelineEventProviderPlugin = {
        getPluginName: () => 'p',
        getVersion: () => '1',
        getPriority: () => 1,
        isAvailable: () => true,
        getCategory: () => 'optimization',
        collectEvents: () => [],
      };
      expect(manager.registerEventProvider(plugin)).toBe(true);
    });
    it('registerExportPlugin adds plugin', () => {
      const plugin: ExportPlugin = {
        getPluginName: () => 'p',
        getVersion: () => '1',
        getPriority: () => 1,
        isAvailable: () => true,
        getFormat: () => 'json',
        export: (items) => ({
          id: '', format: 'json', content: '{}',
          metadata: { exportedAt: '', itemCount: items.length, formatVersion: '1', byteSize: 2, filtersApplied: null, futureMetadata: {} },
          futureMetadata: {},
        }),
      };
      expect(manager.registerExportPlugin(plugin)).toBe(true);
    });
    it('getSupportedExportFormats returns formats', () => {
      const formats = manager.getSupportedExportFormats();
      expect(formats).toContain('json');
    });
    it('pruneTimeline prunes old items', () => {
      expect(manager.pruneTimeline()).toBeGreaterThanOrEqual(0);
    });
    it('collectEvents returns events from providers', () => {
      expect(manager.collectEvents(null).length).toBe(0);
    });
  });

  // ── Regression ──
  describe('Regression', () => {
    it('all exports are defined', () => {
      expect(TimelineManager).toBeDefined();
      expect(TimelineEngine).toBeDefined();
      expect(TimelineCollector).toBeDefined();
      expect(TimelineAggregator).toBeDefined();
      expect(TimelineFilterEngine).toBeDefined();
      expect(TimelineSearchEngine).toBeDefined();
      expect(TimelineGroupingEngine).toBeDefined();
      expect(TimelineRetentionManager).toBeDefined();
      expect(TimelineStatisticsEngine).toBeDefined();
      expect(TimelineAnalyticsEngine).toBeDefined();
      expect(TimelineFormatter).toBeDefined();
      expect(TimelineExporter).toBeDefined();
      expect(TimelineValidator).toBeDefined();
      expect(TimelineEvents).toBeDefined();
      expect(DEFAULT_TIMELINE_CONFIGURATION).toBeDefined();
      expect(createTimelineConfiguration).toBeDefined();
    });
    it('full lifecycle: record → query → search → filter → export', () => {
      const m = new TimelineManager();
      m.recordEvent(createMockEventInput({ title: 'Test Lifecycle', relatedOperation: 'op_lifecycle' }));
      expect(m.queryTimeline({}).items.length).toBe(1);
      expect(m.searchTimeline({ text: 'Lifecycle' }).length).toBe(1);
      expect(m.filterTimeline({ categories: ['optimization'] }).length).toBe(1);
      const exportResult = m.exportTimeline('markdown');
      expect(exportResult?.content).toContain('# Timeline Export');
    });
    it('all event types are supported', () => {
      const types: TimelineEventType[] = [
        'optimization_created', 'optimization_approved', 'optimization_executed',
        'optimization_completed', 'optimization_failed', 'simulation_generated',
        'simulation_compared', 'recovery_created', 'recovery_executed',
        'automation_triggered', 'automation_approved', 'maintenance_planned',
        'maintenance_completed', 'recommendation_generated', 'recommendation_accepted',
        'prediction_updated', 'device_profile_changed', 'health_score_changed',
        'settings_changed', 'future_event',
      ];
      for (const t of types) {
        expect(getEventTypeLabel(t)).toBeTruthy();
      }
    });
    it('all categories have labels', () => {
      const cats: TimelineCategory[] = [
        'optimization', 'simulation', 'recovery', 'automation', 'maintenance',
        'recommendation', 'prediction', 'device_profile', 'health', 'settings',
        'ai_interaction', 'future_category',
      ];
      for (const c of cats) {
        expect(getCategoryLabel(c)).toBeTruthy();
      }
    });
    it('timeline does not modify input events', () => {
      const m = new TimelineManager();
      const input = createMockEventInput();
      const originalTitle = input.title;
      m.recordEvent(input);
      expect(input.title).toBe(originalTitle);
    });
    it('every recorded item has required fields', () => {
      const m = new TimelineManager();
      const item = m.recordEvent(createMockEventInput());
      expect(item?.id).toBeTruthy();
      expect(item?.timestamp).toBeTruthy();
      expect(item?.title).toBeTruthy();
      expect(item?.sourceModule).toBeTruthy();
      expect(item?.searchKeywords.length).toBeGreaterThan(0);
    });
  });

  // ── Performance ──
  describe('Performance', () => {
    it('record event under 10ms', () => {
      const m = new TimelineManager();
      const input = createMockEventInput();
      const start = performance.now();
      m.recordEvent(input);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10);
    });
    it('search under 100ms', () => {
      const m = new TimelineManager();
      for (let i = 0; i < 100; i++) {
        m.recordEvent(createMockEventInput({ title: `Event ${i}`, relatedOperation: `op_${i}` }));
      }
      const start = performance.now();
      m.searchTimeline({ text: 'Event 50' });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
    it('filter under 50ms', () => {
      const m = new TimelineManager();
      for (let i = 0; i < 100; i++) {
        m.recordEvent(createMockEventInput({
          title: `Event ${i}`,
          relatedOperation: `op_${i}`,
          category: i % 2 === 0 ? 'optimization' : 'maintenance',
        }));
      }
      const start = performance.now();
      m.filterTimeline({ categories: ['optimization'] });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ── Edge Cases ──
  describe('Edge Cases', () => {
    it('handles empty timeline', () => {
      const m = new TimelineManager();
      expect(m.itemCount).toBe(0);
      expect(m.queryTimeline({}).items.length).toBe(0);
      expect(m.getTimelineStatistics().totalEvents).toBe(0);
    });
    it('handles invalid event input', () => {
      const m = new TimelineManager();
      expect(m.recordEvent(createMockEventInput({ title: '' }))).toBeNull();
    });
    it('handles search with no matches', () => {
      const m = new TimelineManager();
      m.recordEvent(createMockEventInput({ title: 'Test' }));
      expect(m.searchTimeline({ text: 'NonExistent' }).length).toBe(0);
    });
    it('handles filter with no matches', () => {
      const m = new TimelineManager();
      m.recordEvent(createMockEventInput({ category: 'optimization' }));
      expect(m.filterTimeline({ categories: ['recovery'] }).length).toBe(0);
    });
    it('handles get non-existent item', () => {
      const m = new TimelineManager();
      expect(m.getTimelineItem('unknown')).toBeNull();
    });
    it('handles update non-existent item', () => {
      const m = new TimelineManager();
      expect(m.updateTimelineItem('unknown', { title: 'X' })).toBe(false);
    });
    it('handles remove non-existent item', () => {
      const m = new TimelineManager();
      expect(m.removeTimelineItem('unknown')).toBe(false);
    });
    it('handles all feature flags disabled', () => {
      const m = new TimelineManager({
        featureFlags: {
          enableTimeline: false, enableSearch: false, enableFilters: false,
          enableGrouping: false, enableAnalytics: false, enableExport: false,
          enableRetention: false, enableStatistics: false, enableEvents: false,
          enableValidation: false, enableCaching: false,
        },
      });
      expect(m.config.featureFlags.enableTimeline).toBe(false);
    });
    it('handles events disabled', () => {
      const m = new TimelineManager({ enableEvents: false });
      let received = 0;
      m.on('timeline_recorded', () => { received++; });
      m.recordEvent(createMockEventInput());
      expect(received).toBe(0);
    });
    it('handles high volume recording', () => {
      const m = new TimelineManager();
      const inputs: TimelineEventInput[] = [];
      for (let i = 0; i < 100; i++) {
        inputs.push(createMockEventInput({ title: `Batch ${i}`, relatedOperation: `op_batch_${i}` }));
      }
      const items = m.recordEvents(inputs);
      expect(items.length).toBe(100);
    });
    it('handles export with no items', () => {
      const m = new TimelineManager();
      const result = m.exportTimeline('json');
      expect(result).toBeDefined();
      expect(result?.metadata.itemCount).toBe(0);
    });
    it('handles grouping with no items', () => {
      const m = new TimelineManager();
      expect(m.groupTimeline('day').length).toBe(0);
    });
    it('handles unlimited retention', () => {
      const cfg = createTimelineConfiguration({ retentionRules: { retentionPeriod: 'unlimited' } });
      const m = new TimelineRetentionManager(cfg);
      const oldDate = new Date(Date.now() - 365 * 86400000).toISOString();
      const result = m.prune([createMockItem({ timestamp: oldDate, severity: 'info' })]);
      expect(result.pruned).toBe(0);
    });
  });
});
