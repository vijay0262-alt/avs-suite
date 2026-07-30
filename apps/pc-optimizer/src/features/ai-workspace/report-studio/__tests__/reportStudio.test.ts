/**
 * Tests for the AI Report Studio.
 *
 * Covers: report generation, widget rendering, filtering, comparison,
 * export, scheduling, history, events, analytics, formatter, validator,
 * regression, performance, edge cases.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ReportStudioManager } from '../reportStudioManager';
import { ReportRegistry } from '../reportRegistry';
import { ReportWidgetRegistry } from '../reportWidgetRegistry';
import { ReportTemplateEngine } from '../reportTemplateEngine';
import { ReportFilterEngine } from '../reportFilterEngine';
import { ReportComparisonEngine } from '../reportComparisonEngine';
import { ReportBuilder } from '../reportBuilder';
import { ReportComposer } from '../reportComposer';
import { ReportExporter } from '../reportExporter';
import { ReportFormatter } from '../reportFormatter';
import { ReportScheduler } from '../reportScheduler';
import { ReportHistory } from '../reportHistory';
import { ReportAnalytics } from '../reportAnalytics';
import { ReportValidator } from '../reportValidator';
import { ReportEvents } from '../reportEvents';
import {
  DEFAULT_REPORT_STUDIO_CONFIGURATION,
  createReportStudioConfiguration,
  validateReportStudioConfiguration,
} from '../reportConfiguration';
import {
  generateReportId,
  generateComparisonId,
  generateScheduleId,
  getReportTypeLabel,
  getWidgetTypeLabel,
  getExportFormatLabel,
  getScheduleFrequencyLabel,
  getComparisonTypeLabel,
  getReportStatusLabel,
  createTimeRange,
  createDefaultReportDefinitions,
  createDefaultWidgetDefinitions,
  createDefaultTemplates,
  createDefaultReportStudioConfiguration,
} from '../types';
import type {
  CopilotContext,
  Report,
  ReportType,
  ExportFormat,
  ScheduleFrequency,
  ComparisonType,
  ReportWidgetDefinition,
  ReportTemplate,
  ReportFilterSet,
  ReportPlugin,
  ReportDefinition,
  PermissionLevel,
} from '../types';

// ── Mock Helpers ─────────────────────────────────────────────

function createMockContext(healthScore: number = 75): CopilotContext {
  return {
    sources: [
      { type: 'health_score', available: true, data: healthScore, confidence: 0.9, evidence: [], futureMetadata: {} },
      { type: 'recommendations', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'predictions', available: true, data: [], confidence: 0.75, evidence: [], futureMetadata: {} },
      { type: 'timeline', available: true, data: [], confidence: 0.8, evidence: [], futureMetadata: {} },
      { type: 'goals', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'recovery_history', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'maintenance', available: true, data: [], confidence: 0.8, evidence: [], futureMetadata: {} },
      { type: 'automation', available: true, data: {}, confidence: 1.0, evidence: [], futureMetadata: {} },
      { type: 'user_preferences', available: true, data: {}, confidence: 1.0, evidence: [], futureMetadata: {} },
    ],
    healthScore,
    deviceProfile: { profileType: 'gaming', performanceTier: 'high', confidence: 0.9, futureMetadata: {} },
    activeGoals: [
      { id: 'g1', name: 'Improve Performance', status: 'in_progress', priority: 'high', progress: 0.5, futureMetadata: {} },
    ],
    recentTimelineEvents: [
      { id: 't1', title: 'Optimization completed', timestamp: new Date().toISOString(), category: 'optimization', severity: 'low', futureMetadata: {} },
    ],
    activeRecommendations: [
      { id: 'r1', title: 'Clean temp files', category: 'storage', priority: 'high', confidence: 0.85, futureMetadata: {} },
      { id: 'r2', title: 'Disable startup apps', category: 'performance', priority: 'medium', confidence: 0.75, futureMetadata: {} },
    ],
    activePredictions: [
      { id: 'p1', title: 'Disk space warning', category: 'storage', riskLevel: 'medium', confidence: 0.7, futureMetadata: {} },
    ],
    maintenanceHistory: [
      { id: 'm1', type: 'routine', timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), success: true, futureMetadata: {} },
    ],
    optimizationHistory: [
      { id: 'o1', timestamp: new Date().toISOString(), goal: 'quick_boost', success: true, healthDelta: 5, futureMetadata: {} },
      { id: 'o2', timestamp: new Date(Date.now() - 86400000).toISOString(), goal: 'deep_clean', success: true, healthDelta: 10, futureMetadata: {} },
    ],
    recoveryHistory: [
      { id: 'rc1', timestamp: new Date().toISOString(), type: 'rollback', success: true, futureMetadata: {} },
    ],
    userPreferences: { theme: 'dark' },
    futureMetadata: {},
  };
}

function createMockPlugin(): ReportPlugin {
  return {
    getPluginName: () => 'Test Plugin',
    getVersion: () => '1.0.0',
    getPriority: () => 10,
    isAvailable: () => true,
    getReportDefinitions: () => [
      { type: 'future_report', category: 'future_category', title: 'Future Report', description: 'Plugin report', defaultTemplateId: 'tpl_future', requiredDataSources: ['health_score'], requiredPermissions: 'free' as PermissionLevel, futureMetadata: {} },
    ],
    getWidgetDefinitions: () => [
      { id: 'widget_future', type: 'future_widget', title: 'Future Widget', description: 'Plugin widget', category: 'future_category', requiredDataSources: ['health_score'], defaultSize: { columns: 2, rows: 1 }, resizable: true, futureMetadata: {} },
    ],
    getTemplates: () => [
      { id: 'tpl_future', reportType: 'future_report', name: 'Future Template', description: 'Plugin template', sections: [{ id: 'sec_future', title: 'Future', order: 0, widgetIds: ['widget_future'], insights: [], futureMetadata: {} }], widgetIds: ['widget_future'], requiredDataSources: ['health_score'], isEnterprise: false, futureMetadata: {} },
    ],
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Report Studio Types & Helpers', () => {
  it('should generate unique report IDs', () => {
    expect(generateReportId()).not.toBe(generateReportId());
  });

  it('should generate unique comparison IDs', () => {
    expect(generateComparisonId()).not.toBe(generateComparisonId());
  });

  it('should generate unique schedule IDs', () => {
    expect(generateScheduleId()).not.toBe(generateScheduleId());
  });

  it('should return report type labels', () => {
    expect(getReportTypeLabel('system_health')).toBe('System Health');
    expect(getReportTypeLabel('weekly_summary')).toBe('Weekly Summary');
  });

  it('should return widget type labels', () => {
    expect(getWidgetTypeLabel('health_card')).toBe('Health Card');
    expect(getWidgetTypeLabel('trend_chart')).toBe('Trend Chart');
  });

  it('should return export format labels', () => {
    expect(getExportFormatLabel('json')).toBe('JSON');
    expect(getExportFormatLabel('markdown')).toBe('Markdown');
  });

  it('should return schedule frequency labels', () => {
    expect(getScheduleFrequencyLabel('daily')).toBe('Daily');
    expect(getScheduleFrequencyLabel('weekly')).toBe('Weekly');
  });

  it('should return comparison type labels', () => {
    expect(getComparisonTypeLabel('time_periods')).toBe('Time Periods');
    expect(getComparisonTypeLabel('goals')).toBe('Goals');
  });

  it('should return report status labels', () => {
    expect(getReportStatusLabel('generated')).toBe('Generated');
    expect(getReportStatusLabel('exported')).toBe('Exported');
  });

  it('should create time range for today', () => {
    const tr = createTimeRange('today');
    expect(tr.preset).toBe('today');
    expect(tr.start).not.toBeNull();
    expect(tr.end).not.toBeNull();
  });

  it('should create time range for last 7 days', () => {
    const tr = createTimeRange('last_7_days');
    expect(tr.preset).toBe('last_7_days');
    expect(tr.start).not.toBeNull();
  });

  it('should create time range for all_time', () => {
    const tr = createTimeRange('all_time');
    expect(tr.start).toBeNull();
    expect(tr.end).toBeNull();
  });

  it('should create default report definitions', () => {
    const defs = createDefaultReportDefinitions();
    expect(defs.length).toBe(19);
    expect(defs.some((d) => d.type === 'system_health')).toBe(true);
    expect(defs.some((d) => d.type === 'enterprise_report')).toBe(true);
  });

  it('should create default widget definitions', () => {
    const widgets = createDefaultWidgetDefinitions();
    expect(widgets.length).toBe(12);
    expect(widgets.some((w) => w.type === 'health_card')).toBe(true);
  });

  it('should create default templates', () => {
    const templates = createDefaultTemplates();
    expect(templates.length).toBe(13);
    expect(templates.some((t) => t.id === 'tpl_system_health')).toBe(true);
    expect(templates.some((t) => t.isEnterprise)).toBe(true);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('Report Studio Configuration', () => {
  it('should provide default configuration', () => {
    expect(DEFAULT_REPORT_STUDIO_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_REPORT_STUDIO_CONFIGURATION.featureFlags.enableReportStudio).toBe(true);
  });

  it('should create configuration with overrides', () => {
    const config = createReportStudioConfiguration({ configVersion: '2.0.0' });
    expect(config.configVersion).toBe('2.0.0');
  });

  it('should validate configuration', () => {
    const result = validateReportStudioConfiguration(DEFAULT_REPORT_STUDIO_CONFIGURATION);
    expect(result.valid).toBe(true);
  });

  it('should detect invalid configuration', () => {
    const config = createReportStudioConfiguration({ configVersion: '' });
    const result = validateReportStudioConfiguration(config);
    expect(result.valid).toBe(false);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('Report Events', () => {
  let events: ReportEvents;

  beforeEach(() => {
    events = new ReportEvents();
  });

  it('should register and emit events', () => {
    let received = false;
    events.on('report_generated', () => { received = true; });
    events.emit({ type: 'report_generated', timestamp: new Date().toISOString(), data: null });
    expect(received).toBe(true);
  });

  it('should unregister listeners', () => {
    let count = 0;
    const listener = () => { count++; };
    events.on('report_exported', listener);
    events.emit({ type: 'report_exported', timestamp: new Date().toISOString(), data: null });
    events.off('report_exported', listener);
    events.emit({ type: 'report_exported', timestamp: new Date().toISOString(), data: null });
    expect(count).toBe(1);
  });

  it('should count listeners', () => {
    events.on('report_generated', () => {});
    events.on('report_exported', () => {});
    expect(events.listenerCount()).toBe(2);
    expect(events.listenerCount('report_generated')).toBe(1);
  });
});

// ── Report Registry ──────────────────────────────────────────

describe('Report Registry', () => {
  let registry: ReportRegistry;

  beforeEach(() => {
    registry = new ReportRegistry();
  });

  it('should initialize with default definitions', () => {
    expect(registry.count()).toBe(19);
  });

  it('should get a definition', () => {
    const def = registry.get('system_health');
    expect(def).not.toBeNull();
    expect(def!.title).toBe('System Health Report');
  });

  it('should register a new definition', () => {
    const result = registry.register({
      type: 'future_report',
      category: 'future_category',
      title: 'Future Report',
      description: 'Test',
      defaultTemplateId: 'tpl_test',
      requiredDataSources: [],
      requiredPermissions: 'free',
      futureMetadata: {},
    });
    expect(result).toBe(true);
    expect(registry.has('future_report')).toBe(true);
  });

  it('should not register duplicate', () => {
    const result = registry.register({
      type: 'system_health',
      category: 'health',
      title: 'Duplicate',
      description: 'Test',
      defaultTemplateId: 'tpl',
      requiredDataSources: [],
      requiredPermissions: 'free',
      futureMetadata: {},
    });
    expect(result).toBe(false);
  });

  it('should unregister a definition', () => {
    expect(registry.unregister('system_health')).toBe(true);
    expect(registry.has('system_health')).toBe(false);
  });

  it('should filter by category', () => {
    const health = registry.getByCategory('health');
    expect(health.length).toBe(1);
  });

  it('should register plugin definitions', () => {
    registry.registerPlugin(createMockPlugin());
    expect(registry.has('future_report')).toBe(true);
  });
});

// ── Widget Registry ──────────────────────────────────────────

describe('Report Widget Registry', () => {
  let registry: ReportWidgetRegistry;

  beforeEach(() => {
    registry = new ReportWidgetRegistry();
  });

  it('should initialize with default widgets', () => {
    expect(registry.count()).toBe(12);
  });

  it('should get a widget', () => {
    const w = registry.get('widget_health_card');
    expect(w).not.toBeNull();
    expect(w!.type).toBe('health_card');
  });

  it('should register a new widget', () => {
    const result = registry.register({
      id: 'widget_test',
      type: 'future_widget',
      title: 'Test Widget',
      description: 'Test',
      category: 'custom',
      requiredDataSources: [],
      defaultSize: { columns: 1, rows: 1 },
      resizable: true,
      futureMetadata: {},
    });
    expect(result).toBe(true);
  });

  it('should not register duplicate', () => {
    const result = registry.register({
      id: 'widget_health_card',
      type: 'health_card',
      title: 'Duplicate',
      description: 'Test',
      category: 'health',
      requiredDataSources: [],
      defaultSize: { columns: 1, rows: 1 },
      resizable: true,
      futureMetadata: {},
    });
    expect(result).toBe(false);
  });

  it('should filter by type', () => {
    const cards = registry.getByType('health_card');
    expect(cards.length).toBe(1);
  });

  it('should register plugin widgets', () => {
    registry.registerPlugin(createMockPlugin());
    expect(registry.has('widget_future')).toBe(true);
  });
});

// ── Template Engine ──────────────────────────────────────────

describe('Report Template Engine', () => {
  let engine: ReportTemplateEngine;

  beforeEach(() => {
    engine = new ReportTemplateEngine();
  });

  it('should initialize with default templates', () => {
    expect(engine.count()).toBe(13);
  });

  it('should get a template by ID', () => {
    const tpl = engine.get('tpl_system_health');
    expect(tpl).not.toBeNull();
    expect(tpl!.reportType).toBe('system_health');
  });

  it('should get a template by report type', () => {
    const tpl = engine.getByReportType('weekly_summary');
    expect(tpl).not.toBeNull();
    expect(tpl!.id).toBe('tpl_weekly');
  });

  it('should register a new template', () => {
    const result = engine.register({
      id: 'tpl_test',
      reportType: 'custom_report',
      name: 'Test Template',
      description: 'Test',
      sections: [],
      widgetIds: [],
      requiredDataSources: [],
      isEnterprise: false,
      futureMetadata: {},
    });
    expect(result).toBe(true);
  });

  it('should get enterprise templates', () => {
    const ent = engine.getEnterpriseTemplates();
    expect(ent.length).toBe(1);
    expect(ent[0]!.id).toBe('tpl_enterprise');
  });

  it('should register plugin templates', () => {
    engine.registerPlugin(createMockPlugin());
    expect(engine.has('tpl_future')).toBe(true);
  });
});

// ── Filter Engine ────────────────────────────────────────────

describe('Report Filter Engine', () => {
  let engine: ReportFilterEngine;

  beforeEach(() => {
    engine = new ReportFilterEngine();
  });

  it('should pass through with no filters', () => {
    const data = [{ a: 1 }, { a: 2 }];
    const result = engine.apply({ filters: [], futureMetadata: {} }, data);
    expect(result.length).toBe(2);
  });

  it('should filter with eq operator', () => {
    const data = [{ severity: 'high' }, { severity: 'low' }];
    const result = engine.apply({ filters: [{ type: 'severity', value: 'high', operator: 'eq', futureMetadata: {} }], futureMetadata: {} }, data);
    expect(result.length).toBe(1);
    expect(result[0]!.severity).toBe('high');
  });

  it('should filter with gt operator', () => {
    const data = [{ health_score: 80 }, { health_score: 50 }];
    const result = engine.apply({ filters: [{ type: 'health_score', value: 60, operator: 'gt', futureMetadata: {} }], futureMetadata: {} }, data);
    expect(result.length).toBe(1);
    expect(result[0]!.health_score).toBe(80);
  });

  it('should filter with between operator', () => {
    const data = [{ health_score: 75 }, { health_score: 30 }, { health_score: 95 }];
    const result = engine.apply({ filters: [{ type: 'health_score', value: [60, 90], operator: 'between', futureMetadata: {} }], futureMetadata: {} }, data);
    expect(result.length).toBe(1);
    expect(result[0]!.health_score).toBe(75);
  });

  it('should filter with in operator', () => {
    const data = [{ severity: 'high' }, { severity: 'low' }, { severity: 'medium' }];
    const result = engine.apply({ filters: [{ type: 'severity', value: ['high', 'medium'], operator: 'in', futureMetadata: {} }], futureMetadata: {} }, data);
    expect(result.length).toBe(2);
  });

  it('should filter with contains operator', () => {
    const data = [{ tags: ['urgent', 'bug'] }, { tags: ['feature'] }];
    const result = engine.apply({ filters: [{ type: 'tags', value: 'urgent', operator: 'contains', futureMetadata: {} }], futureMetadata: {} }, data);
    expect(result.length).toBe(1);
  });

  it('should create date range filter', () => {
    const filter = engine.createDateRangeFilter('2024-01-01', '2024-12-31');
    expect(filter.type).toBe('date_range');
    expect(filter.operator).toBe('between');
  });

  it('should create health score filter', () => {
    const filter = engine.createHealthScoreFilter(60, 90);
    expect(filter.type).toBe('health_score');
  });
});

// ── Comparison Engine ────────────────────────────────────────

describe('Report Comparison Engine', () => {
  let engine: ReportComparisonEngine;
  let reportA: Report;
  let reportB: Report;

  beforeEach(() => {
    engine = new ReportComparisonEngine();
    reportA = {
      id: 'r1', title: 'Report A', description: 'Test', type: 'system_health', category: 'health',
      generatedAt: new Date().toISOString(), timeRange: { preset: 'today', start: null, end: null, futureMetadata: {} },
      sections: [], widgets: [], charts: [], tables: [], insights: [], recommendations: [],
      confidence: 0.8, status: 'generated', futureMetadata: {},
    };
    reportB = {
      id: 'r2', title: 'Report B', description: 'Test', type: 'system_health', category: 'health',
      generatedAt: new Date().toISOString(), timeRange: { preset: 'yesterday', start: null, end: null, futureMetadata: {} },
      sections: [], widgets: [], charts: [], tables: [], insights: [{ id: 'i1', type: 'summary', title: 'Insight', description: 'Test', evidence: [], confidence: 0.9, severity: 'info', futureMetadata: {} }], recommendations: ['Rec 1'],
      confidence: 0.9, status: 'generated', futureMetadata: {},
    };
  });

  it('should compare two reports', () => {
    const comp = engine.compare(reportA, reportB, 'time_periods');
    expect(comp.id).toBeDefined();
    expect(comp.type).toBe('time_periods');
    expect(comp.differences.length).toBeGreaterThan(0);
  });

  it('should detect confidence difference', () => {
    const comp = engine.compare(reportA, reportB);
    const confDiff = comp.differences.find((d) => d.field === 'confidence');
    expect(confDiff).toBeDefined();
    expect(confDiff!.delta).toBeCloseTo(0.1, 10);
  });

  it('should detect insights count difference', () => {
    const comp = engine.compare(reportA, reportB);
    const insightDiff = comp.differences.find((d) => d.field === 'insights_count');
    expect(insightDiff).toBeDefined();
  });

  it('should generate summary', () => {
    const comp = engine.compare(reportA, reportB);
    expect(comp.summary).toContain('Report A');
    expect(comp.summary).toContain('Report B');
  });

  it('should handle identical reports', () => {
    const comp = engine.compare(reportA, reportA);
    expect(comp.differences.length).toBe(0);
    expect(comp.summary).toContain('No significant differences');
  });
});

// ── Report Builder ───────────────────────────────────────────

describe('Report Builder', () => {
  let builder: ReportBuilder;
  let widgetRegistry: ReportWidgetRegistry;
  let template: ReportTemplate;

  beforeEach(() => {
    builder = new ReportBuilder();
    widgetRegistry = new ReportWidgetRegistry();
    template = createDefaultTemplates()[0]!;
  });

  it('should build a report', () => {
    const report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    expect(report.id).toBeDefined();
    expect(report.type).toBe('system_health');
    expect(report.title).toBe('System Health');
  });

  it('should include sections from template', () => {
    const report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    expect(report.sections.length).toBe(template.sections.length);
  });

  it('should instantiate widgets', () => {
    const report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    expect(report.widgets.length).toBe(template.widgetIds.length);
  });

  it('should generate insights', () => {
    const report = builder.build('system_health', template, createMockContext(50), createTimeRange('today'), widgetRegistry);
    expect(report.insights.length).toBeGreaterThan(0);
    expect(report.insights.some((i) => i.type === 'summary')).toBe(true);
  });

  it('should generate risk insight for low health', () => {
    const report = builder.build('system_health', template, createMockContext(40), createTimeRange('today'), widgetRegistry);
    expect(report.insights.some((i) => i.type === 'risk')).toBe(true);
  });

  it('should generate achievement insight for high health', () => {
    const report = builder.build('system_health', template, createMockContext(90), createTimeRange('today'), widgetRegistry);
    expect(report.insights.some((i) => i.type === 'achievement')).toBe(true);
  });

  it('should generate charts', () => {
    const report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    expect(report.charts.length).toBeGreaterThan(0);
  });

  it('should generate tables', () => {
    const report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    expect(report.tables.length).toBeGreaterThan(0);
  });

  it('should generate recommendations', () => {
    const report = builder.build('system_health', template, createMockContext(50), createTimeRange('today'), widgetRegistry);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('should calculate confidence', () => {
    const report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    expect(report.confidence).toBeGreaterThan(0);
    expect(report.confidence).toBeLessThanOrEqual(1);
  });

  it('should set status to generated', () => {
    const report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    expect(report.status).toBe('generated');
  });
});

// ── Report Composer ──────────────────────────────────────────

describe('Report Composer', () => {
  let composer: ReportComposer;
  let widgetRegistry: ReportWidgetRegistry;

  beforeEach(() => {
    composer = new ReportComposer();
    widgetRegistry = new ReportWidgetRegistry();
  });

  it('should compose a report', () => {
    const template = createDefaultTemplates()[0]!;
    const report = composer.compose('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    expect(report).toBeDefined();
    expect(report.type).toBe('system_health');
  });

  it('should cache reports', () => {
    const template = createDefaultTemplates()[0]!;
    composer.compose('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    expect(composer.getCacheSize()).toBe(1);
  });

  it('should clear cache', () => {
    const template = createDefaultTemplates()[0]!;
    composer.compose('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
    composer.clearCache();
    expect(composer.getCacheSize()).toBe(0);
  });

  it('should assign insights to sections', () => {
    const template = createDefaultTemplates()[0]!;
    const report = composer.compose('system_health', template, createMockContext(40), createTimeRange('today'), widgetRegistry);
    expect(report.sections[0]!.insights.length).toBeGreaterThan(0);
  });
});

// ── Exporter ─────────────────────────────────────────────────

describe('Report Exporter', () => {
  let exporter: ReportExporter;
  let report: Report;

  beforeEach(() => {
    exporter = new ReportExporter();
    const builder = new ReportBuilder();
    const widgetRegistry = new ReportWidgetRegistry();
    const template = createDefaultTemplates()[0]!;
    report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
  });

  it('should export to JSON', () => {
    const result = exporter.export(report, 'json');
    expect(result.format).toBe('json');
    expect(result.mimeType).toBe('application/json');
    expect(result.content).toContain('"id"');
    expect(result.filename).toContain('.json');
  });

  it('should export to Markdown', () => {
    const result = exporter.export(report, 'markdown');
    expect(result.format).toBe('markdown');
    expect(result.mimeType).toBe('text/markdown');
    expect(result.content).toContain('# System Health');
    expect(result.filename).toContain('.md');
  });

  it('should export to CSV', () => {
    const result = exporter.export(report, 'csv');
    expect(result.format).toBe('csv');
    expect(result.mimeType).toBe('text/csv');
    expect(result.filename).toContain('.csv');
  });

  it('should export to interactive', () => {
    const result = exporter.export(report, 'interactive');
    expect(result.format).toBe('interactive');
    expect(result.content).toContain('drillDown');
  });

  it('should export to PDF-ready', () => {
    const result = exporter.export(report, 'pdf_ready');
    expect(result.format).toBe('pdf_ready');
    expect(result.content).toContain('pageOrientation');
  });

  it('should include size', () => {
    const result = exporter.export(report, 'json');
    expect(result.size).toBe(result.content.length);
  });
});

// ── Formatter ────────────────────────────────────────────────

describe('Report Formatter', () => {
  let formatter: ReportFormatter;
  let report: Report;

  beforeEach(() => {
    formatter = new ReportFormatter();
    const builder = new ReportBuilder();
    const widgetRegistry = new ReportWidgetRegistry();
    const template = createDefaultTemplates()[0]!;
    report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
  });

  it('should format a report', () => {
    const formatted = formatter.format(report);
    expect(formatted.title).toBeDefined();
    expect(formatted.summary).toBeDefined();
    expect(formatted.sections).toBeDefined();
  });

  it('should format compact', () => {
    const compact = formatter.formatCompact(report);
    expect(compact).toContain('System Health');
  });

  it('should format summary', () => {
    const summary = formatter.formatSummary(report);
    expect(summary).toContain('Generated');
    expect(summary).toContain('Confidence');
  });
});

// ── Scheduler ────────────────────────────────────────────────

describe('Report Scheduler', () => {
  let scheduler: ReportScheduler;

  beforeEach(() => {
    scheduler = new ReportScheduler();
  });

  it('should schedule a report', () => {
    const sched = scheduler.schedule('system_health', 'weekly');
    expect(sched.id).toBeDefined();
    expect(sched.reportType).toBe('system_health');
    expect(sched.frequency).toBe('weekly');
    expect(sched.enabled).toBe(true);
  });

  it('should cancel a schedule', () => {
    const sched = scheduler.schedule('system_health', 'daily');
    expect(scheduler.cancel(sched.id)).toBe(true);
    expect(scheduler.get(sched.id)).toBeNull();
  });

  it('should disable a schedule', () => {
    const sched = scheduler.schedule('system_health', 'daily');
    scheduler.disable(sched.id);
    expect(scheduler.get(sched.id)!.enabled).toBe(false);
  });

  it('should enable a schedule', () => {
    const sched = scheduler.schedule('system_health', 'daily');
    scheduler.disable(sched.id);
    scheduler.enable(sched.id);
    expect(scheduler.get(sched.id)!.enabled).toBe(true);
  });

  it('should get enabled schedules', () => {
    scheduler.schedule('system_health', 'daily');
    scheduler.schedule('weekly_summary', 'weekly');
    expect(scheduler.getEnabled().length).toBe(2);
  });

  it('should mark run and update nextRunAt', async () => {
    const sched = scheduler.schedule('system_health', 'daily');
    const originalNext = sched.nextRunAt;
    await new Promise((resolve) => setTimeout(resolve, 10));
    scheduler.markRun(sched.id);
    const updated = scheduler.get(sched.id)!;
    expect(updated.lastRunAt).not.toBeNull();
    expect(updated.nextRunAt).not.toBe(originalNext);
  });

  it('should clear all', () => {
    scheduler.schedule('system_health', 'daily');
    scheduler.clearAll();
    expect(scheduler.count()).toBe(0);
  });
});

// ── History ──────────────────────────────────────────────────

describe('Report History', () => {
  let history: ReportHistory;
  let report: Report;

  beforeEach(() => {
    history = new ReportHistory();
    const builder = new ReportBuilder();
    const widgetRegistry = new ReportWidgetRegistry();
    const template = createDefaultTemplates()[0]!;
    report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
  });

  it('should record a report', () => {
    const entry = history.record(report);
    expect(entry.reportId).toBe(report.id);
    expect(entry.reportType).toBe(report.type);
  });

  it('should get all entries', () => {
    history.record(report);
    expect(history.getAll().length).toBe(1);
  });

  it('should filter by type', () => {
    history.record(report);
    const filtered = history.getByType('system_health');
    expect(filtered.length).toBe(1);
  });

  it('should get recent entries', () => {
    history.record(report);
    history.record(report);
    const recent = history.getRecent(1);
    expect(recent.length).toBe(1);
  });

  it('should clear', () => {
    history.record(report);
    history.clear();
    expect(history.count()).toBe(0);
  });

  it('should respect max entries', () => {
    history.setMaxEntries(3);
    for (let i = 0; i < 5; i++) history.record(report);
    expect(history.count()).toBe(3);
  });
});

// ── Analytics ────────────────────────────────────────────────

describe('Report Analytics', () => {
  let analytics: ReportAnalytics;

  beforeEach(() => {
    analytics = new ReportAnalytics();
  });

  it('should record generation', () => {
    analytics.recordGeneration('system_health', 200);
    analytics.recordGeneration('weekly_summary', 300);
    const data = analytics.getAnalytics();
    expect(data.totalReportsGenerated).toBe(2);
    expect(data.byReportType['system_health']).toBe(1);
    expect(data.averageGenerationTimeMs).toBe(250);
  });

  it('should record exports', () => {
    analytics.recordExport('json');
    analytics.recordExport('markdown');
    const data = analytics.getAnalytics();
    expect(data.totalExports).toBe(2);
    expect(data.byExportFormat['json']).toBe(1);
  });

  it('should record comparisons', () => {
    analytics.recordComparison();
    expect(analytics.getAnalytics().totalComparisons).toBe(1);
  });

  it('should record schedules', () => {
    analytics.recordSchedule();
    expect(analytics.getAnalytics().totalScheduled).toBe(1);
  });

  it('should reset', () => {
    analytics.recordGeneration('system_health', 100);
    analytics.reset();
    expect(analytics.getAnalytics().totalReportsGenerated).toBe(0);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('Report Validator', () => {
  let validator: ReportValidator;
  let report: Report;

  beforeEach(() => {
    validator = new ReportValidator();
    const builder = new ReportBuilder();
    const widgetRegistry = new ReportWidgetRegistry();
    const template = createDefaultTemplates()[0]!;
    report = builder.build('system_health', template, createMockContext(), createTimeRange('today'), widgetRegistry);
  });

  it('should validate a valid report', () => {
    const result = validator.validate(report, createMockContext(), 'free', ['health_score']);
    expect(result.valid).toBe(true);
  });

  it('should detect missing data source', () => {
    const ctx = createMockContext();
    ctx.sources = ctx.sources.filter((s) => s.type !== 'predictions');
    const result = validator.validate(report, ctx, 'free', ['predictions']);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_DATA_SOURCE')).toBe(true);
  });

  it('should warn on low confidence', () => {
    report.confidence = 0.3;
    const result = validator.validate(report, createMockContext(), 'free', []);
    expect(result.warnings.some((w) => w.code === 'LOW_CONFIDENCE')).toBe(true);
  });
});

// ── ReportStudioManager (Integration) ────────────────────────

describe('ReportStudioManager', () => {
  let manager: ReportStudioManager;

  beforeEach(() => {
    manager = new ReportStudioManager();
    manager.setContextProvider(() => createMockContext());
    manager.setUserPermission('pro');
  });

  it('should generate a report', () => {
    const report = manager.generateReport('system_health');
    expect(report.id).toBeDefined();
    expect(report.type).toBe('system_health');
    expect(report.sections.length).toBeGreaterThan(0);
  });

  it('should generate report with time range', () => {
    const report = manager.generateReport('system_health', 'last_7_days');
    expect(report.timeRange.preset).toBe('last_7_days');
  });

  it('should generate weekly summary', () => {
    const report = manager.generateReport('weekly_summary');
    expect(report.type).toBe('weekly_summary');
    expect(report.sections.length).toBeGreaterThan(0);
  });

  it('should generate monthly summary', () => {
    const report = manager.generateReport('monthly_summary');
    expect(report.type).toBe('monthly_summary');
  });

  it('should export a report', () => {
    const report = manager.generateReport('system_health');
    const result = manager.exportReport(report, 'json');
    expect(result.format).toBe('json');
    expect(result.content).toContain('"id"');
  });

  it('should export to markdown', () => {
    const report = manager.generateReport('system_health');
    const result = manager.exportReport(report, 'markdown');
    expect(result.content).toContain('# System Health');
  });

  it('should compare reports', () => {
    const reportA = manager.generateReport('system_health', 'today');
    const reportB = manager.generateReport('system_health', 'yesterday');
    const comp = manager.compareReports(reportA, reportB, 'time_periods');
    expect(comp.id).toBeDefined();
    expect(comp.type).toBe('time_periods');
  });

  it('should schedule a report', () => {
    const sched = manager.scheduleReport('system_health', 'weekly');
    expect(sched.id).toBeDefined();
    expect(sched.reportType).toBe('system_health');
  });

  it('should get report history', () => {
    manager.generateReport('system_health');
    const history = manager.getReportHistory();
    expect(history.length).toBe(1);
  });

  it('should register a widget', () => {
    const result = manager.registerWidget({
      id: 'widget_custom_test',
      type: 'future_widget',
      title: 'Custom Widget',
      description: 'Test',
      category: 'custom',
      requiredDataSources: [],
      defaultSize: { columns: 1, rows: 1 },
      resizable: true,
      futureMetadata: {},
    });
    expect(result).toBe(true);
  });

  it('should register a template', () => {
    const result = manager.registerTemplate({
      id: 'tpl_custom_test',
      reportType: 'custom_report',
      name: 'Custom Template',
      description: 'Test',
      sections: [],
      widgetIds: [],
      requiredDataSources: [],
      isEnterprise: false,
      futureMetadata: {},
    });
    expect(result).toBe(true);
  });

  it('should get available report types', () => {
    const types = manager.getAvailableReportTypes();
    expect(types.length).toBe(19);
    expect(types.some((t) => t.type === 'system_health')).toBe(true);
  });

  it('should get available widgets', () => {
    const widgets = manager.getAvailableWidgets();
    expect(widgets.length).toBe(12);
  });

  it('should get available templates', () => {
    const templates = manager.getAvailableTemplates();
    expect(templates.length).toBe(13);
  });

  it('should format a report', () => {
    const report = manager.generateReport('system_health');
    const formatted = manager.formatReport(report);
    expect(formatted.title).toBeDefined();
  });

  it('should get analytics', () => {
    manager.generateReport('system_health');
    const analytics = manager.getAnalytics();
    expect(analytics.totalReportsGenerated).toBe(1);
  });

  it('should emit events', () => {
    let eventReceived = false;
    manager.getEvents().on('report_generated', () => { eventReceived = true; });
    manager.generateReport('system_health');
    expect(eventReceived).toBe(true);
  });

  it('should emit widget_registered event', () => {
    let eventReceived = false;
    manager.getEvents().on('widget_registered', () => { eventReceived = true; });
    manager.registerWidget({
      id: 'widget_event_test',
      type: 'future_widget',
      title: 'Event Widget',
      description: 'Test',
      category: 'custom',
      requiredDataSources: [],
      defaultSize: { columns: 1, rows: 1 },
      resizable: true,
      futureMetadata: {},
    });
    expect(eventReceived).toBe(true);
  });

  it('should register plugin', () => {
    manager.registerPlugin(createMockPlugin());
    const types = manager.getAvailableReportTypes();
    expect(types.some((t) => t.type === 'future_report')).toBe(true);
  });

  it('should throw when generation disabled', () => {
    manager.updateConfig({ featureFlags: { ...createDefaultReportStudioConfiguration().featureFlags, enableReportGeneration: false } });
    expect(() => manager.generateReport('system_health')).toThrow();
  });

  it('should throw when no context provider', () => {
    const freshManager = new ReportStudioManager();
    expect(() => freshManager.generateReport('system_health')).toThrow();
  });

  it('should clear all', () => {
    manager.generateReport('system_health');
    manager.clearAll();
    expect(manager.getAnalytics().totalReportsGenerated).toBe(0);
  });

  it('should validate report', () => {
    const report = manager.generateReport('system_health');
    const result = manager.validateReport(report);
    expect(result.valid).toBe(true);
  });

  it('should cancel schedule', () => {
    const sched = manager.scheduleReport('system_health', 'daily');
    expect(manager.cancelSchedule(sched.id)).toBe(true);
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Report Studio Performance', () => {
  let manager: ReportStudioManager;

  beforeEach(() => {
    manager = new ReportStudioManager();
    manager.setContextProvider(() => createMockContext());
    manager.setUserPermission('pro');
  });

  it('should generate report under 500ms', () => {
    const start = Date.now();
    manager.generateReport('system_health');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('should generate weekly summary under 500ms', () => {
    const start = Date.now();
    manager.generateReport('weekly_summary');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('should export report under 100ms', () => {
    const report = manager.generateReport('system_health');
    const start = Date.now();
    manager.exportReport(report, 'json');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Report Studio Edge Cases', () => {
  it('should handle empty context', () => {
    const manager = new ReportStudioManager();
    manager.setContextProvider(() => ({
      sources: [],
      healthScore: null,
      deviceProfile: null,
      activeGoals: [],
      recentTimelineEvents: [],
      activeRecommendations: [],
      activePredictions: [],
      maintenanceHistory: [],
      optimizationHistory: [],
      recoveryHistory: [],
      userPreferences: {},
      futureMetadata: {},
    }));
    const report = manager.generateReport('system_health');
    expect(report).toBeDefined();
    expect(report.widgets.length).toBeGreaterThan(0);
  });

  it('should handle unknown report type', () => {
    const manager = new ReportStudioManager();
    manager.setContextProvider(() => createMockContext());
    expect(() => manager.generateReport('future_report' as ReportType)).toThrow();
  });

  it('should handle export of empty report', () => {
    const exporter = new ReportExporter();
    const emptyReport: Report = {
      id: 'empty', title: 'Empty', description: '', type: 'custom_report', category: 'custom',
      generatedAt: new Date().toISOString(), timeRange: { preset: 'custom', start: null, end: null, futureMetadata: {} },
      sections: [], widgets: [], charts: [], tables: [], insights: [], recommendations: [],
      confidence: 0.5, status: 'generated', futureMetadata: {},
    };
    const result = exporter.export(emptyReport, 'json');
    expect(result.content).toContain('"id"');
  });

  it('should handle schedule for non-existent report type', () => {
    const scheduler = new ReportScheduler();
    const sched = scheduler.schedule('future_report' as ReportType, 'daily');
    expect(sched.reportType).toBe('future_report');
  });

  it('should handle comparison of identical reports', () => {
    const engine = new ReportComparisonEngine();
    const report: Report = {
      id: 'r1', title: 'Report', description: '', type: 'system_health', category: 'health',
      generatedAt: new Date().toISOString(), timeRange: { preset: 'today', start: null, end: null, futureMetadata: {} },
      sections: [], widgets: [], charts: [], tables: [], insights: [], recommendations: [],
      confidence: 0.8, status: 'generated', futureMetadata: {},
    };
    const comp = engine.compare(report, report);
    expect(comp.differences.length).toBe(0);
  });
});
