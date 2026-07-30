/**
 * AI Report Studio — Manager
 *
 * EPIC 5 PHASE A PART 5
 *
 * Main public API facade for the AI Report Studio.
 * Generates interactive, explainable and exportable reports from
 * every intelligence module. Does NOT duplicate analytics logic.
 *
 * Public APIs:
 *   generateReport(), compareReports(), exportReport(),
 *   scheduleReport(), getReportHistory(),
 *   registerWidget(), registerTemplate()
 *
 * Architecture:
 *   Timeline → Analytics → Recommendations → Predictions →
 *   Goals → Reports → Interactive Report → Export
 */
import type {
  ReportStudioConfiguration,
  Report,
  ReportType,
  ReportTimeRange,
  ReportComparison,
  ComparisonType,
  ReportExportResult,
  ExportFormat,
  ReportSchedule,
  ScheduleFrequency,
  ReportHistoryEntry,
  ReportAnalyticsData,
  ReportWidgetDefinition,
  ReportTemplate,
  ReportFilterSet,
  CopilotContext,
  PermissionLevel,
  ReportPlugin,
  ReportValidationResult,
} from './types';
import {
  DEFAULT_REPORT_STUDIO_CONFIGURATION,
  createReportStudioConfiguration,
  validateReportStudioConfiguration,
} from './reportConfiguration';
import { ReportEvents } from './reportEvents';
import { ReportRegistry } from './reportRegistry';
import { ReportWidgetRegistry } from './reportWidgetRegistry';
import { ReportTemplateEngine } from './reportTemplateEngine';
import { ReportFilterEngine } from './reportFilterEngine';
import { ReportComparisonEngine } from './reportComparisonEngine';
import { ReportComposer } from './reportComposer';
import { ReportExporter } from './reportExporter';
import { ReportFormatter } from './reportFormatter';
import { ReportScheduler } from './reportScheduler';
import { ReportHistory } from './reportHistory';
import { ReportAnalytics } from './reportAnalytics';
import { ReportValidator } from './reportValidator';
import { createTimeRange } from './types';

export class ReportStudioManager {
  private _config: ReportStudioConfiguration;
  private _events: ReportEvents;
  private _registry: ReportRegistry;
  private _widgetRegistry: ReportWidgetRegistry;
  private _templateEngine: ReportTemplateEngine;
  private _filterEngine: ReportFilterEngine;
  private _comparisonEngine: ReportComparisonEngine;
  private _composer: ReportComposer;
  private _exporter: ReportExporter;
  private _formatter: ReportFormatter;
  private _scheduler: ReportScheduler;
  private _history: ReportHistory;
  private _analytics: ReportAnalytics;
  private _validator: ReportValidator;
  private _contextProvider: (() => CopilotContext) | null = null;
  private _userPermission: PermissionLevel = 'free';

  constructor(config?: Partial<ReportStudioConfiguration>) {
    this._config = config
      ? createReportStudioConfiguration(config as never)
      : structuredClone(DEFAULT_REPORT_STUDIO_CONFIGURATION);

    const validation = validateReportStudioConfiguration(this._config);
    if (!validation.valid) {
      throw new Error(`Invalid Report Studio configuration: ${validation.errors.join('; ')}`);
    }

    this._events = new ReportEvents();
    this._registry = new ReportRegistry();
    this._widgetRegistry = new ReportWidgetRegistry();
    this._templateEngine = new ReportTemplateEngine();
    this._filterEngine = new ReportFilterEngine();
    this._comparisonEngine = new ReportComparisonEngine();
    this._composer = new ReportComposer();
    this._exporter = new ReportExporter();
    this._formatter = new ReportFormatter();
    this._scheduler = new ReportScheduler();
    this._history = new ReportHistory();
    this._analytics = new ReportAnalytics();
    this._validator = new ReportValidator();
  }

  // ── Public API ──────────────────────────────────────────────

  setContextProvider(provider: () => CopilotContext): void {
    this._contextProvider = provider;
  }

  setUserPermission(permission: PermissionLevel): void {
    this._userPermission = permission;
  }

  generateReport(
    type: ReportType,
    timeRangePreset?: ReportTimeRange['preset'],
    filters?: ReportFilterSet,
  ): Report {
    if (!this._config.featureFlags.enableReportGeneration) {
      throw new Error('Report generation is disabled');
    }

    const start = Date.now();

    const def = this._registry.get(type);
    if (!def) throw new Error(`Unknown report type: ${type}`);

    if (!this._contextProvider) throw new Error('No context provider set');

    const context = this._contextProvider();
    const timeRange = createTimeRange(timeRangePreset ?? this._config.defaultTimeRange);
    const template = this._templateEngine.get(def.defaultTemplateId) ?? this._templateEngine.getByReportType(type);

    if (!template) throw new Error(`No template found for report type: ${type}`);

    const report = this._composer.compose(type, template, context, timeRange, this._widgetRegistry, filters);
    const generationTime = Date.now() - start;

    this._analytics.recordGeneration(type, generationTime);
    this._history.record(report);

    this._events.emit({
      type: 'report_generated',
      timestamp: new Date().toISOString(),
      data: { reportId: report.id, type, generationTimeMs: generationTime },
    });

    return report;
  }

  compareReports(
    reportA: Report,
    reportB: Report,
    type?: ComparisonType,
  ): ReportComparison {
    if (!this._config.featureFlags.enableComparison) {
      throw new Error('Report comparison is disabled');
    }

    const comparison = this._comparisonEngine.compare(reportA, reportB, type);
    this._analytics.recordComparison();

    this._events.emit({
      type: 'report_compared',
      timestamp: new Date().toISOString(),
      data: { comparisonId: comparison.id, type: comparison.type },
    });

    return comparison;
  }

  exportReport(report: Report, format?: ExportFormat): ReportExportResult {
    if (!this._config.featureFlags.enableExport) {
      throw new Error('Report export is disabled');
    }

    const exportFormat = format ?? this._config.defaultExportFormat;
    const result = this._exporter.export(report, exportFormat);
    this._analytics.recordExport(exportFormat);

    report.status = 'exported';

    this._events.emit({
      type: 'report_exported',
      timestamp: new Date().toISOString(),
      data: { reportId: report.id, format: exportFormat, size: result.size },
    });

    return result;
  }

  scheduleReport(
    reportType: ReportType,
    frequency: ScheduleFrequency,
    filters?: ReportFilterSet,
  ): ReportSchedule {
    if (!this._config.featureFlags.enableScheduling) {
      throw new Error('Report scheduling is disabled');
    }

    const schedule = this._scheduler.schedule(reportType, frequency, filters);
    this._analytics.recordSchedule();

    this._events.emit({
      type: 'report_scheduled',
      timestamp: new Date().toISOString(),
      data: { scheduleId: schedule.id, reportType, frequency },
    });

    return schedule;
  }

  getReportHistory(): ReportHistoryEntry[] {
    if (!this._config.featureFlags.enableHistory) return [];
    return this._history.getAll();
  }

  registerWidget(widget: ReportWidgetDefinition): boolean {
    const result = this._widgetRegistry.register(widget);

    if (result) {
      this._events.emit({
        type: 'widget_registered',
        timestamp: new Date().toISOString(),
        data: { widgetId: widget.id, type: widget.type },
      });
    }

    return result;
  }

  registerTemplate(template: ReportTemplate): boolean {
    return this._templateEngine.register(template);
  }

  registerPlugin(plugin: ReportPlugin): void {
    if (!this._config.featureFlags.enablePlugins) return;
    this._registry.registerPlugin(plugin);
    this._widgetRegistry.registerPlugin(plugin);
    this._templateEngine.registerPlugin(plugin);
  }

  // ── Utility ─────────────────────────────────────────────────

  getAvailableReportTypes(): { type: ReportType; title: string; description: string }[] {
    return this._registry.getAll().map((d) => ({
      type: d.type,
      title: d.title,
      description: d.description,
    }));
  }

  getAvailableWidgets(): ReportWidgetDefinition[] {
    return this._widgetRegistry.getAll();
  }

  getAvailableTemplates(): ReportTemplate[] {
    return this._templateEngine.getAll();
  }

  formatReport(report: Report) {
    return this._formatter.format(report);
  }

  formatReportCompact(report: Report): string {
    return this._formatter.formatCompact(report);
  }

  getAnalytics(): ReportAnalyticsData {
    return this._analytics.getAnalytics();
  }

  getConfig(): ReportStudioConfiguration {
    return this._config;
  }

  updateConfig(config: Partial<ReportStudioConfiguration>): void {
    this._config = createReportStudioConfiguration(config as never);
  }

  getEvents(): ReportEvents {
    return this._events;
  }

  validateReport(report: Report): ReportValidationResult {
    if (!this._contextProvider) {
      return { valid: false, errors: [{ code: 'NO_CONTEXT', message: 'No context provider set', field: 'context' }], warnings: [], futureMetadata: {} };
    }
    const context = this._contextProvider();
    const def = this._registry.get(report.type);
    const requiredSources = def?.requiredDataSources ?? [];
    return this._validator.validate(report, context, this._userPermission, requiredSources);
  }

  getScheduledReports(): ReportSchedule[] {
    return this._scheduler.getAll();
  }

  cancelSchedule(scheduleId: string): boolean {
    return this._scheduler.cancel(scheduleId);
  }

  clearAll(): void {
    this._composer.clearCache();
    this._history.clear();
    this._analytics.reset();
    this._scheduler.clearAll();
    this._events.removeAllListeners();
  }
}
