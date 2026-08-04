/**
 * AI Report Studio — Report Composer
 *
 * EPIC 5 PHASE A PART 5
 *
 * Composes final reports by combining builder output with filters,
 * sections, and insights. Manages incremental updates.
 */
import type { Report, ReportSection, ReportInsight, AIAssistantContext, ReportFilterSet, ReportTimeRange, ReportType } from './types';
import { ReportBuilder } from './reportBuilder';
import { ReportFilterEngine } from './reportFilterEngine';
import type { ReportTemplate } from './types';
import type { ReportWidgetRegistry } from './reportWidgetRegistry';

export class ReportComposer {
  private _builder: ReportBuilder;
  private _filterEngine: ReportFilterEngine;
  private _cache: Map<string, Report> = new Map();

  constructor() {
    this._builder = new ReportBuilder();
    this._filterEngine = new ReportFilterEngine();
  }

  compose(
    type: ReportType,
    template: ReportTemplate,
    context: AIAssistantContext,
    timeRange: ReportTimeRange,
    widgetRegistry: ReportWidgetRegistry,
    filters?: ReportFilterSet,
  ): Report {
    const cacheKey = `${type}_${timeRange.preset}_${JSON.stringify(filters ?? {})}`;
    const cached = this._cache.get(cacheKey);
    if (cached) {
      return { ...cached, id: cached.id, generatedAt: new Date().toISOString() };
    }

    const report = this._builder.build(type, template, context, timeRange, widgetRegistry);

    // Apply filters to insights if provided
    if (filters && filters.filters.length > 0) {
      const insightData = report.insights.map((i) => ({
        date_range: report.generatedAt,
        severity: i.severity,
        health_score: i.confidence,
        tags: i.type,
        ...i.futureMetadata,
      }));
      const filtered = this._filterEngine.apply(filters, insightData);
      // Keep insights that passed the filter
      report.insights = report.insights.filter((_, idx) => filtered.includes(insightData[idx]!));
    }

    // Compose sections with insights
    report.sections = this._assignInsightsToSections(report.sections, report.insights);

    this._cache.set(cacheKey, report);
    return report;
  }

  private _assignInsightsToSections(sections: ReportSection[], insights: ReportInsight[]): ReportSection[] {
    if (sections.length === 0 || insights.length === 0) return sections;

    const result = [...sections];
    // Assign summary insights to first section
    const firstSection = result[0]!;
    firstSection.insights = insights.filter((i) => i.type === 'summary' || i.type === 'achievement');

    // Assign risk insights to second section if available
    if (result.length > 1) {
      result[1]!.insights = insights.filter((i) => i.type === 'risk' || i.severity === 'warning');
    }

    // Assign next best actions to third section if available
    if (result.length > 2) {
      result[2]!.insights = insights.filter((i) => i.type === 'next_best_action' || i.type === 'opportunity' || i.type === 'recommendation');
    }

    return result;
  }

  clearCache(): void {
    this._cache.clear();
  }

  getCacheSize(): number {
    return this._cache.size;
  }
}
