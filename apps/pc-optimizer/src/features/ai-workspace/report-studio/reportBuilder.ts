/**
 * AI Report Studio — Report Builder
 *
 * EPIC 5 PHASE A PART 5
 *
 * Builds reports from templates, context, and widget data.
 * Does NOT duplicate analytics logic — consumes existing modules.
 */
import type {
  Report,
  ReportType,
  ReportTimeRange,
  ReportTemplate,
  ReportWidgetDefinition,
  ReportWidgetInstance,
  ReportSection,
  CopilotContext,
  ReportInsight,
  ReportChart,
  ReportTable,
} from './types';
import {
  generateReportId,
  generateWidgetInstanceId,
  generateInsightId,
  generateChartId,
  generateTableId,
  getReportTypeLabel,
} from './types';

export class ReportBuilder {
  build(
    type: ReportType,
    template: ReportTemplate,
    context: CopilotContext,
    timeRange: ReportTimeRange,
    widgetRegistry: { get: (id: string) => ReportWidgetDefinition | null },
  ): Report {
    const widgets = this._instantiateWidgets(template, widgetRegistry, context);
    const sections = this._buildSections(template, widgets);
    const charts = this._buildCharts(type, context);
    const tables = this._buildTables(type, context);
    const insights = this._buildInsights(type, context);
    const recommendations = this._buildRecommendations(context);
    const confidence = this._calculateConfidence(context);

    return {
      id: generateReportId(),
      title: getReportTypeLabel(type),
      description: template.description,
      type,
      category: this._getCategory(type),
      generatedAt: new Date().toISOString(),
      timeRange,
      sections,
      widgets,
      charts,
      tables,
      insights,
      recommendations,
      confidence,
      status: 'generated',
      futureMetadata: {},
    };
  }

  private _instantiateWidgets(
    template: ReportTemplate,
    widgetRegistry: { get: (id: string) => ReportWidgetDefinition | null },
    context: CopilotContext,
  ): ReportWidgetInstance[] {
    const instances: ReportWidgetInstance[] = [];

    for (const widgetId of template.widgetIds) {
      const def = widgetRegistry.get(widgetId);
      if (!def) continue;

      instances.push({
        id: generateWidgetInstanceId(),
        definition: def,
        data: this._extractWidgetData(def, context),
        status: 'loaded',
        futureMetadata: {},
      });
    }

    return instances;
  }

  private _extractWidgetData(def: ReportWidgetDefinition, context: CopilotContext): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    switch (def.type) {
      case 'health_card':
        data['healthScore'] = context.healthScore;
        data['deviceProfile'] = context.deviceProfile;
        break;
      case 'trend_chart':
        data['optimizationHistory'] = context.optimizationHistory;
        break;
      case 'timeline':
        data['events'] = context.recentTimelineEvents;
        break;
      case 'recommendations':
        data['recommendations'] = context.activeRecommendations;
        break;
      case 'predictions':
        data['predictions'] = context.activePredictions;
        break;
      case 'goals':
        data['goals'] = context.activeGoals;
        break;
      case 'automation':
        data['automation'] = context.userPreferences;
        break;
      case 'maintenance':
        data['maintenanceHistory'] = context.maintenanceHistory;
        break;
      case 'recovery':
        data['recoveryHistory'] = context.recoveryHistory;
        break;
      case 'simulation':
        data['optimizationHistory'] = context.optimizationHistory;
        break;
      case 'comparison':
        data['recommendations'] = context.activeRecommendations;
        break;
      case 'statistics':
        data['healthScore'] = context.healthScore;
        data['recommendationsCount'] = context.activeRecommendations.length;
        data['predictionsCount'] = context.activePredictions.length;
        data['goalsCount'] = context.activeGoals.length;
        break;
      default:
        break;
    }

    return data;
  }

  private _buildSections(template: ReportTemplate, _widgets: ReportWidgetInstance[]): ReportSection[] {
    return template.sections.map((sec) => ({
      ...sec,
      insights: [],
    }));
  }

  private _buildCharts(type: ReportType, context: CopilotContext): ReportChart[] {
    const charts: ReportChart[] = [];

    // Health trend chart
    if (context.healthScore !== null) {
      charts.push({
        id: generateChartId(),
        type: 'gauge',
        title: 'Current Health Score',
        data: {
          labels: ['Health'],
          datasets: [{ label: 'Score', values: [context.healthScore], futureMetadata: {} }],
          futureMetadata: {},
        },
        futureMetadata: {},
      });
    }

    // Optimization history chart
    if (context.optimizationHistory.length > 0) {
      charts.push({
        id: generateChartId(),
        type: 'line',
        title: 'Optimization History',
        data: {
          labels: context.optimizationHistory.map((_, i) => `#${i + 1}`),
          datasets: [{ label: 'Health Delta', values: context.optimizationHistory.map((o) => o.healthDelta ?? 0), futureMetadata: {} }],
          futureMetadata: {},
        },
        xAxis: 'Session',
        yAxis: 'Health Delta',
        futureMetadata: {},
      });
    }

    return charts;
  }

  private _buildTables(type: ReportType, context: CopilotContext): ReportTable[] {
    const tables: ReportTable[] = [];

    // Recommendations table
    if (context.activeRecommendations.length > 0) {
      tables.push({
        id: generateTableId(),
        title: 'Active Recommendations',
        columns: ['Title', 'Category', 'Priority', 'Confidence'],
        rows: context.activeRecommendations.map((r) => [
          r.title,
          r.category,
          r.priority,
          r.confidence,
        ]),
        futureMetadata: {},
      });
    }

    // Goals table
    if (context.activeGoals.length > 0) {
      tables.push({
        id: generateTableId(),
        title: 'Active Goals',
        columns: ['Name', 'Status', 'Priority', 'Progress'],
        rows: context.activeGoals.map((g) => [
          g.name,
          g.status,
          g.priority,
          g.progress,
        ]),
        futureMetadata: {},
      });
    }

    return tables;
  }

  private _buildInsights(type: ReportType, context: CopilotContext): ReportInsight[] {
    const insights: ReportInsight[] = [];

    // Summary insight
    insights.push({
      id: generateInsightId(),
      type: 'summary',
      title: 'Report Summary',
      description: `Generated ${getReportTypeLabel(type)} report with ${context.activeRecommendations.length} recommendations, ${context.activeGoals.length} goals, and ${context.activePredictions.length} predictions.`,
      evidence: [],
      confidence: 0.9,
      severity: 'info',
      futureMetadata: {},
    });

    // Health insight
    if (context.healthScore !== null) {
      if (context.healthScore < 60) {
        insights.push({
          id: generateInsightId(),
          type: 'risk',
          title: 'Low Health Score',
          description: `Current health score is ${context.healthScore}, which is below the recommended threshold of 60.`,
          evidence: [{ source: 'health_score', metric: 'score', value: context.healthScore, timestamp: new Date().toISOString(), description: 'Current health score', confidence: 0.9, futureMetadata: {} }],
          confidence: 0.85,
          severity: 'warning',
          futureMetadata: {},
        });
      } else if (context.healthScore >= 80) {
        insights.push({
          id: generateInsightId(),
          type: 'achievement',
          title: 'Excellent Health Score',
          description: `Current health score is ${context.healthScore}, indicating excellent system health.`,
          evidence: [{ source: 'health_score', metric: 'score', value: context.healthScore, timestamp: new Date().toISOString(), description: 'Current health score', confidence: 0.9, futureMetadata: {} }],
          confidence: 0.9,
          severity: 'positive',
          futureMetadata: {},
        });
      }
    }

    // Next best action
    if (context.activeRecommendations.length > 0) {
      insights.push({
        id: generateInsightId(),
        type: 'next_best_action',
        title: 'Apply Top Recommendation',
        description: `There are ${context.activeRecommendations.length} active recommendations. Consider applying the highest priority one.`,
        evidence: [{ source: 'recommendations', metric: 'count', value: context.activeRecommendations.length, timestamp: new Date().toISOString(), description: 'Active recommendations count', confidence: 0.8, futureMetadata: {} }],
        confidence: 0.8,
        severity: 'info',
        futureMetadata: {},
      });
    }

    // Opportunity
    if (context.activeGoals.length === 0) {
      insights.push({
        id: generateInsightId(),
        type: 'opportunity',
        title: 'Create a Goal',
        description: 'No active goals detected. Creating optimization goals can help track progress.',
        evidence: [],
        confidence: 0.7,
        severity: 'info',
        futureMetadata: {},
      });
    }

    return insights;
  }

  private _buildRecommendations(context: CopilotContext): string[] {
    const recs: string[] = [];

    if (context.healthScore !== null && context.healthScore < 60) {
      recs.push('Run a system optimization to improve health score');
    }
    if (context.activeRecommendations.length > 0) {
      recs.push(`Review and apply ${context.activeRecommendations.length} pending recommendations`);
    }
    if (context.maintenanceHistory.length === 0) {
      recs.push('Schedule regular maintenance to keep system healthy');
    }
    if (context.activeGoals.length === 0) {
      recs.push('Create optimization goals to track progress');
    }

    return recs;
  }

  private _calculateConfidence(context: CopilotContext): number {
    let conf = 0.5;
    if (context.healthScore !== null) conf += 0.15;
    if (context.activeRecommendations.length > 0) conf += 0.1;
    if (context.activePredictions.length > 0) conf += 0.1;
    if (context.activeGoals.length > 0) conf += 0.05;
    if (context.recentTimelineEvents.length > 0) conf += 0.05;
    return Math.min(1, conf);
  }

  private _getCategory(type: ReportType): Report['category'] {
    const catMap: Record<string, Report['category']> = {
      system_health: 'health',
      optimization_effectiveness: 'optimization',
      maintenance_summary: 'maintenance',
      automation_summary: 'automation',
      goal_progress: 'goals',
      device_profile: 'device',
      recovery_history: 'recovery',
      prediction_accuracy: 'predictions',
      recommendation_effectiveness: 'recommendations',
      storage_trends: 'trends',
      performance_trends: 'trends',
      privacy_trends: 'trends',
      security_trends: 'trends',
      weekly_summary: 'summary',
      monthly_summary: 'summary',
      quarterly_summary: 'summary',
      annual_summary: 'summary',
      enterprise_report: 'enterprise',
      custom_report: 'custom',
      future_report: 'future_category',
    };
    return catMap[type] ?? 'custom';
  }
}
