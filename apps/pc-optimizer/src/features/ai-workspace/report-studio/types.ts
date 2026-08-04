/**
 * AI Report Studio — Type Definitions
 *
 * EPIC 5 PHASE A PART 5
 *
 * Generates interactive, explainable and exportable reports from
 * every intelligence module. Supports drill-down exploration and
 * multiple export formats. Does NOT duplicate analytics logic.
 *
 * Architecture:
 *   Timeline → Analytics → Recommendations → Predictions →
 *   Goals → Reports → Interactive Report → Export
 */

// ── Re-export AIAssistant types ───────────────────────────────────

export type {
  AIAssistantContext,
  AIAssistantEvidence,
  PermissionLevel,
} from '../aiAssistant/types';

import type {
  AIAssistantEvidence,
  PermissionLevel,
} from '../aiAssistant/types';

// ── Report Types ──────────────────────────────────────────────

export type ReportType =
  | 'system_health'
  | 'optimization_effectiveness'
  | 'maintenance_summary'
  | 'automation_summary'
  | 'goal_progress'
  | 'device_profile'
  | 'recovery_history'
  | 'prediction_accuracy'
  | 'recommendation_effectiveness'
  | 'storage_trends'
  | 'performance_trends'
  | 'privacy_trends'
  | 'security_trends'
  | 'weekly_summary'
  | 'monthly_summary'
  | 'quarterly_summary'
  | 'annual_summary'
  | 'enterprise_report'
  | 'custom_report'
  | 'future_report';

export function getReportTypeLabel(type: ReportType): string {
  const labels: Record<ReportType, string> = {
    system_health: 'System Health',
    optimization_effectiveness: 'Optimization Effectiveness',
    maintenance_summary: 'Maintenance Summary',
    automation_summary: 'Automation Summary',
    goal_progress: 'Goal Progress',
    device_profile: 'Device Profile',
    recovery_history: 'Recovery History',
    prediction_accuracy: 'Prediction Accuracy',
    recommendation_effectiveness: 'Recommendation Effectiveness',
    storage_trends: 'Storage Trends',
    performance_trends: 'Performance Trends',
    privacy_trends: 'Privacy Trends',
    security_trends: 'Security Trends',
    weekly_summary: 'Weekly Summary',
    monthly_summary: 'Monthly Summary',
    quarterly_summary: 'Quarterly Summary',
    annual_summary: 'Annual Summary',
    enterprise_report: 'Enterprise Report',
    custom_report: 'Custom Report',
    future_report: 'Future Report',
  };
  return labels[type] ?? 'Unknown';
}

export type ReportCategory =
  | 'health'
  | 'optimization'
  | 'maintenance'
  | 'automation'
  | 'goals'
  | 'device'
  | 'recovery'
  | 'predictions'
  | 'recommendations'
  | 'trends'
  | 'summary'
  | 'enterprise'
  | 'custom'
  | 'future_category';

export function getReportCategoryLabel(cat: ReportCategory): string {
  const labels: Record<ReportCategory, string> = {
    health: 'Health',
    optimization: 'Optimization',
    maintenance: 'Maintenance',
    automation: 'Automation',
    goals: 'Goals',
    device: 'Device',
    recovery: 'Recovery',
    predictions: 'Predictions',
    recommendations: 'Recommendations',
    trends: 'Trends',
    summary: 'Summary',
    enterprise: 'Enterprise',
    custom: 'Custom',
    future_category: 'Future Category',
  };
  return labels[cat] ?? 'Unknown';
}

// ── Time Range ────────────────────────────────────────────────

export type TimeRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'all_time'
  | 'custom'
  | 'future_range';

export function getTimeRangePresetLabel(preset: TimeRangePreset): string {
  const labels: Record<TimeRangePreset, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    last_7_days: 'Last 7 Days',
    last_30_days: 'Last 30 Days',
    last_90_days: 'Last 90 Days',
    this_week: 'This Week',
    this_month: 'This Month',
    this_quarter: 'This Quarter',
    this_year: 'This Year',
    all_time: 'All Time',
    custom: 'Custom',
    future_range: 'Future Range',
  };
  return labels[preset] ?? 'Unknown';
}

export interface ReportTimeRange {
  preset: TimeRangePreset;
  start: string | null;
  end: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Report Section ────────────────────────────────────────────

export interface ReportSection {
  id: string;
  title: string;
  order: number;
  widgetIds: string[];
  insights: ReportInsight[];
  futureMetadata: Record<string, unknown>;
}

// ── Report Widget ─────────────────────────────────────────────

export type WidgetType =
  | 'health_card'
  | 'trend_chart'
  | 'timeline'
  | 'recommendations'
  | 'predictions'
  | 'goals'
  | 'automation'
  | 'maintenance'
  | 'recovery'
  | 'simulation'
  | 'comparison'
  | 'statistics'
  | 'future_widget';

export function getWidgetTypeLabel(type: WidgetType): string {
  const labels: Record<WidgetType, string> = {
    health_card: 'Health Card',
    trend_chart: 'Trend Chart',
    timeline: 'Timeline',
    recommendations: 'Recommendations',
    predictions: 'Predictions',
    goals: 'Goals',
    automation: 'Automation',
    maintenance: 'Maintenance',
    recovery: 'Recovery',
    simulation: 'Simulation',
    comparison: 'Comparison',
    statistics: 'Statistics',
    future_widget: 'Future Widget',
  };
  return labels[type] ?? 'Unknown';
}

export interface ReportWidgetDefinition {
  id: string;
  type: WidgetType;
  title: string;
  description: string;
  category: ReportCategory;
  requiredDataSources: string[];
  defaultSize: { columns: number; rows: number };
  resizable: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface ReportWidgetInstance {
  id: string;
  definition: ReportWidgetDefinition;
  data: Record<string, unknown>;
  status: 'loaded' | 'loading' | 'error' | 'empty';
  futureMetadata: Record<string, unknown>;
}

// ── Chart ─────────────────────────────────────────────────────

export type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'scatter' | 'gauge' | 'heatmap' | 'future_chart';

export interface ReportChart {
  id: string;
  type: ChartType;
  title: string;
  data: ChartData;
  xAxis?: string;
  yAxis?: string;
  futureMetadata: Record<string, unknown>;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
  futureMetadata: Record<string, unknown>;
}

export interface ChartDataset {
  label: string;
  values: number[];
  color?: string;
  futureMetadata: Record<string, unknown>;
}

// ── Table ─────────────────────────────────────────────────────

export interface ReportTable {
  id: string;
  title: string;
  columns: string[];
  rows: unknown[][];
  futureMetadata: Record<string, unknown>;
}

// ── Insight ───────────────────────────────────────────────────

export type InsightType =
  | 'summary'
  | 'key_change'
  | 'achievement'
  | 'risk'
  | 'next_best_action'
  | 'opportunity'
  | 'recommendation'
  | 'future_insight';

export function getInsightTypeLabel(type: InsightType): string {
  const labels: Record<InsightType, string> = {
    summary: 'Summary',
    key_change: 'Key Change',
    achievement: 'Achievement',
    risk: 'Risk',
    next_best_action: 'Next Best Action',
    opportunity: 'Opportunity',
    recommendation: 'Recommendation',
    future_insight: 'Future Insight',
  };
  return labels[type] ?? 'Unknown';
}

export interface ReportInsight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  evidence: AIAssistantEvidence[];
  confidence: number;
  severity: 'info' | 'warning' | 'critical' | 'positive';
  futureMetadata: Record<string, unknown>;
}

// ── Report ────────────────────────────────────────────────────

export interface Report {
  id: string;
  title: string;
  description: string;
  type: ReportType;
  category: ReportCategory;
  generatedAt: string;
  timeRange: ReportTimeRange;
  sections: ReportSection[];
  widgets: ReportWidgetInstance[];
  charts: ReportChart[];
  tables: ReportTable[];
  insights: ReportInsight[];
  recommendations: string[];
  confidence: number;
  status: ReportStatus;
  futureMetadata: Record<string, unknown>;
}

export type ReportStatus =
  | 'draft'
  | 'generated'
  | 'exported'
  | 'scheduled'
  | 'archived'
  | 'error'
  | 'future_status';

export function getReportStatusLabel(status: ReportStatus): string {
  const labels: Record<ReportStatus, string> = {
    draft: 'Draft',
    generated: 'Generated',
    exported: 'Exported',
    scheduled: 'Scheduled',
    archived: 'Archived',
    error: 'Error',
    future_status: 'Future Status',
  };
  return labels[status] ?? 'Unknown';
}

// ── Filters ───────────────────────────────────────────────────

export type FilterType =
  | 'date_range'
  | 'device_profile'
  | 'goal'
  | 'optimization_type'
  | 'automation'
  | 'maintenance'
  | 'recovery'
  | 'health_score'
  | 'tags'
  | 'severity'
  | 'custom_filter'
  | 'future_filter';

export interface ReportFilter {
  type: FilterType;
  value: unknown;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in' | 'between';
  futureMetadata: Record<string, unknown>;
}

export interface ReportFilterSet {
  filters: ReportFilter[];
  futureMetadata: Record<string, unknown>;
}

// ── Comparison ────────────────────────────────────────────────

export type ComparisonType =
  | 'time_periods'
  | 'goals'
  | 'optimization_plans'
  | 'device_profiles'
  | 'health_scores'
  | 'recovery_sessions'
  | 'automation_results'
  | 'future_comparison';

export function getComparisonTypeLabel(type: ComparisonType): string {
  const labels: Record<ComparisonType, string> = {
    time_periods: 'Time Periods',
    goals: 'Goals',
    optimization_plans: 'Optimization Plans',
    device_profiles: 'Device Profiles',
    health_scores: 'Health Scores',
    recovery_sessions: 'Recovery Sessions',
    automation_results: 'Automation Results',
    future_comparison: 'Future Comparison',
  };
  return labels[type] ?? 'Unknown';
}

export interface ReportComparison {
  id: string;
  type: ComparisonType;
  reportA: Report;
  reportB: Report;
  differences: ComparisonDifference[];
  summary: string;
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface ComparisonDifference {
  field: string;
  valueA: unknown;
  valueB: unknown;
  delta: number | string;
  description: string;
  futureMetadata: Record<string, unknown>;
}

// ── Export ────────────────────────────────────────────────────

export type ExportFormat =
  | 'interactive'
  | 'json'
  | 'markdown'
  | 'csv'
  | 'pdf_ready'
  | 'future_format';

export function getExportFormatLabel(format: ExportFormat): string {
  const labels: Record<ExportFormat, string> = {
    interactive: 'Interactive View',
    json: 'JSON',
    markdown: 'Markdown',
    csv: 'CSV',
    pdf_ready: 'PDF-Ready Data Model',
    future_format: 'Future Format',
  };
  return labels[format] ?? 'Unknown';
}

export interface ReportExportResult {
  format: ExportFormat;
  content: string;
  mimeType: string;
  filename: string;
  size: number;
  exportedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Scheduling ────────────────────────────────────────────────

export type ScheduleFrequency =
  | 'one_time'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'event_driven'
  | 'future_schedule';

export function getScheduleFrequencyLabel(freq: ScheduleFrequency): string {
  const labels: Record<ScheduleFrequency, string> = {
    one_time: 'One-Time',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annual: 'Annual',
    event_driven: 'Event Driven',
    future_schedule: 'Future Schedule',
  };
  return labels[freq] ?? 'Unknown';
}

export interface ReportSchedule {
  id: string;
  reportType: ReportType;
  frequency: ScheduleFrequency;
  filters: ReportFilterSet;
  nextRunAt: string;
  lastRunAt: string | null;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── History ───────────────────────────────────────────────────

export interface ReportHistoryEntry {
  id: string;
  reportId: string;
  reportType: ReportType;
  title: string;
  generatedAt: string;
  status: ReportStatus;
  timeRange: ReportTimeRange;
  futureMetadata: Record<string, unknown>;
}

// ── Analytics ─────────────────────────────────────────────────

export interface ReportAnalyticsData {
  totalReportsGenerated: number;
  totalExports: number;
  totalComparisons: number;
  totalScheduled: number;
  byReportType: Record<string, number>;
  byExportFormat: Record<string, number>;
  averageGenerationTimeMs: number;
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Events ────────────────────────────────────────────────────

export type ReportEventType =
  | 'report_generated'
  | 'report_exported'
  | 'report_compared'
  | 'report_scheduled'
  | 'report_viewed'
  | 'widget_registered';

export interface ReportEvent {
  type: ReportEventType;
  timestamp: string;
  data: unknown;
}

export type ReportEventListener = (event: ReportEvent) => void;

// ── Validation ────────────────────────────────────────────────

export interface ReportValidationError {
  code: string;
  message: string;
  field: string;
}

export interface ReportValidationWarning {
  code: string;
  message: string;
  field: string;
}

export interface ReportValidationResult {
  valid: boolean;
  errors: ReportValidationError[];
  warnings: ReportValidationWarning[];
  futureMetadata: Record<string, unknown>;
}

// ── Configuration ─────────────────────────────────────────────

export interface ReportStudioConfiguration {
  configVersion: string;
  defaultTimeRange: TimeRangePreset;
  defaultExportFormat: ExportFormat;
  featureFlags: ReportFeatureFlags;
  performanceTargets: ReportPerformanceTargets;
  enterpriseTemplates: string[];
  futureMetadata: Record<string, unknown>;
}

export interface ReportFeatureFlags {
  enableReportStudio: boolean;
  enableReportGeneration: boolean;
  enableComparison: boolean;
  enableExport: boolean;
  enableScheduling: boolean;
  enableHistory: boolean;
  enableAnalytics: boolean;
  enableEvents: boolean;
  enablePlugins: boolean;
  futureFlags: Record<string, boolean>;
}

export interface ReportPerformanceTargets {
  reportGenerationTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Templates ─────────────────────────────────────────────────

export interface ReportTemplate {
  id: string;
  reportType: ReportType;
  name: string;
  description: string;
  sections: ReportSection[];
  widgetIds: string[];
  requiredDataSources: string[];
  isEnterprise: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Report Definition (for registry) ──────────────────────────

export interface ReportDefinition {
  type: ReportType;
  category: ReportCategory;
  title: string;
  description: string;
  defaultTemplateId: string;
  requiredDataSources: string[];
  requiredPermissions: PermissionLevel;
  futureMetadata: Record<string, unknown>;
}

// ── Plugin ────────────────────────────────────────────────────

export interface ReportPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getReportDefinitions(): ReportDefinition[];
  getWidgetDefinitions(): ReportWidgetDefinition[];
  getTemplates(): ReportTemplate[];
}

// ── Helper Functions ───────────────────────────────────────────

export function generateReportId(): string {
  return `report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateSectionId(): string {
  return `section_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateWidgetInstanceId(): string {
  return `widget_inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateChartId(): string {
  return `chart_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateTableId(): string {
  return `table_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateInsightId(): string {
  return `insight_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateComparisonId(): string {
  return `comparison_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateScheduleId(): string {
  return `schedule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateHistoryEntryId(): string {
  return `history_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createTimeRange(preset: TimeRangePreset): ReportTimeRange {
  const now = new Date();
  let start: string | null = null;
  let end: string | null = now.toISOString();

  switch (preset) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = new Date(y.getFullYear(), y.getMonth(), y.getDate()).toISOString();
      end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59).toISOString();
      break;
    }
    case 'last_7_days':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case 'last_30_days':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case 'last_90_days':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case 'this_week': {
      const day = now.getDay();
      start = new Date(now.getTime() - day * 24 * 60 * 60 * 1000).toISOString();
      break;
    }
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      break;
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1).toISOString();
      break;
    }
    case 'this_year':
      start = new Date(now.getFullYear(), 0, 1).toISOString();
      break;
    case 'all_time':
      start = null;
      end = null;
      break;
    case 'custom':
      start = null;
      end = null;
      break;
    default:
      start = null;
      end = null;
      break;
  }

  return { preset, start, end, futureMetadata: {} };
}

// ── Default Factories ─────────────────────────────────────────

export function createDefaultReportDefinitions(): ReportDefinition[] {
  return [
    { type: 'system_health', category: 'health', title: 'System Health Report', description: 'Comprehensive system health overview', defaultTemplateId: 'tpl_system_health', requiredDataSources: ['health_score'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'optimization_effectiveness', category: 'optimization', title: 'Optimization Effectiveness Report', description: 'Analysis of optimization results', defaultTemplateId: 'tpl_optimization', requiredDataSources: ['optimization_history'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'maintenance_summary', category: 'maintenance', title: 'Maintenance Summary Report', description: 'Summary of maintenance activities', defaultTemplateId: 'tpl_maintenance', requiredDataSources: ['maintenance'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'automation_summary', category: 'automation', title: 'Automation Summary Report', description: 'Summary of automation activities', defaultTemplateId: 'tpl_automation', requiredDataSources: ['automation'], requiredPermissions: 'pro', futureMetadata: {} },
    { type: 'goal_progress', category: 'goals', title: 'Goal Progress Report', description: 'Progress tracking for all goals', defaultTemplateId: 'tpl_goals', requiredDataSources: ['goals'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'device_profile', category: 'device', title: 'Device Profile Report', description: 'Device profile analysis', defaultTemplateId: 'tpl_device', requiredDataSources: ['device_profile'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'recovery_history', category: 'recovery', title: 'Recovery History Report', description: 'History of recovery actions', defaultTemplateId: 'tpl_recovery', requiredDataSources: ['recovery_history'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'prediction_accuracy', category: 'predictions', title: 'Prediction Accuracy Report', description: 'Accuracy analysis of predictions', defaultTemplateId: 'tpl_predictions', requiredDataSources: ['predictions'], requiredPermissions: 'pro', futureMetadata: {} },
    { type: 'recommendation_effectiveness', category: 'recommendations', title: 'Recommendation Effectiveness Report', description: 'Effectiveness of applied recommendations', defaultTemplateId: 'tpl_recommendations', requiredDataSources: ['recommendations'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'storage_trends', category: 'trends', title: 'Storage Trends Report', description: 'Storage usage trends over time', defaultTemplateId: 'tpl_storage_trends', requiredDataSources: ['health_score'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'performance_trends', category: 'trends', title: 'Performance Trends Report', description: 'Performance trends over time', defaultTemplateId: 'tpl_perf_trends', requiredDataSources: ['health_score'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'privacy_trends', category: 'trends', title: 'Privacy Trends Report', description: 'Privacy protection trends', defaultTemplateId: 'tpl_privacy_trends', requiredDataSources: ['health_score'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'security_trends', category: 'trends', title: 'Security Trends Report', description: 'Security posture trends', defaultTemplateId: 'tpl_security_trends', requiredDataSources: ['health_score'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'weekly_summary', category: 'summary', title: 'Weekly Summary Report', description: 'Weekly system summary', defaultTemplateId: 'tpl_weekly', requiredDataSources: ['health_score', 'timeline'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'monthly_summary', category: 'summary', title: 'Monthly Summary Report', description: 'Monthly system summary', defaultTemplateId: 'tpl_monthly', requiredDataSources: ['health_score', 'timeline'], requiredPermissions: 'free', futureMetadata: {} },
    { type: 'quarterly_summary', category: 'summary', title: 'Quarterly Summary Report', description: 'Quarterly system summary', defaultTemplateId: 'tpl_quarterly', requiredDataSources: ['health_score', 'timeline'], requiredPermissions: 'pro', futureMetadata: {} },
    { type: 'annual_summary', category: 'summary', title: 'Annual Summary Report', description: 'Annual system summary', defaultTemplateId: 'tpl_annual', requiredDataSources: ['health_score', 'timeline'], requiredPermissions: 'pro', futureMetadata: {} },
    { type: 'enterprise_report', category: 'enterprise', title: 'Enterprise Report', description: 'Enterprise-level comprehensive report', defaultTemplateId: 'tpl_enterprise', requiredDataSources: ['health_score', 'timeline', 'recommendations', 'predictions'], requiredPermissions: 'enterprise', futureMetadata: {} },
    { type: 'custom_report', category: 'custom', title: 'Custom Report', description: 'User-defined custom report', defaultTemplateId: 'tpl_custom', requiredDataSources: [], requiredPermissions: 'free', futureMetadata: {} },
  ];
}

export function createDefaultWidgetDefinitions(): ReportWidgetDefinition[] {
  return [
    { id: 'widget_health_card', type: 'health_card', title: 'Health Card', description: 'Current system health score', category: 'health', requiredDataSources: ['health_score'], defaultSize: { columns: 2, rows: 1 }, resizable: true, futureMetadata: {} },
    { id: 'widget_trend_chart', type: 'trend_chart', title: 'Trend Chart', description: 'Trend visualization over time', category: 'trends', requiredDataSources: ['health_score'], defaultSize: { columns: 4, rows: 2 }, resizable: true, futureMetadata: {} },
    { id: 'widget_timeline', type: 'timeline', title: 'Timeline', description: 'Timeline of system events', category: 'health', requiredDataSources: ['timeline'], defaultSize: { columns: 4, rows: 2 }, resizable: true, futureMetadata: {} },
    { id: 'widget_recommendations', type: 'recommendations', title: 'Recommendations', description: 'AI recommendations', category: 'recommendations', requiredDataSources: ['recommendations'], defaultSize: { columns: 2, rows: 2 }, resizable: true, futureMetadata: {} },
    { id: 'widget_predictions', type: 'predictions', title: 'Predictions', description: 'AI predictions', category: 'predictions', requiredDataSources: ['predictions'], defaultSize: { columns: 2, rows: 2 }, resizable: true, futureMetadata: {} },
    { id: 'widget_goals', type: 'goals', title: 'Goals', description: 'Goal progress tracking', category: 'goals', requiredDataSources: ['goals'], defaultSize: { columns: 2, rows: 2 }, resizable: true, futureMetadata: {} },
    { id: 'widget_automation', type: 'automation', title: 'Automation', description: 'Automation status', category: 'automation', requiredDataSources: ['automation'], defaultSize: { columns: 2, rows: 1 }, resizable: true, futureMetadata: {} },
    { id: 'widget_maintenance', type: 'maintenance', title: 'Maintenance', description: 'Maintenance status', category: 'maintenance', requiredDataSources: ['maintenance'], defaultSize: { columns: 2, rows: 1 }, resizable: true, futureMetadata: {} },
    { id: 'widget_recovery', type: 'recovery', title: 'Recovery', description: 'Recovery history', category: 'recovery', requiredDataSources: ['recovery_history'], defaultSize: { columns: 2, rows: 1 }, resizable: true, futureMetadata: {} },
    { id: 'widget_simulation', type: 'simulation', title: 'Simulation', description: 'Simulation results', category: 'optimization', requiredDataSources: ['optimization_history'], defaultSize: { columns: 3, rows: 2 }, resizable: true, futureMetadata: {} },
    { id: 'widget_comparison', type: 'comparison', title: 'Comparison', description: 'Side-by-side comparison', category: 'optimization', requiredDataSources: ['optimization_history'], defaultSize: { columns: 4, rows: 2 }, resizable: true, futureMetadata: {} },
    { id: 'widget_statistics', type: 'statistics', title: 'Statistics', description: 'Statistical summary', category: 'health', requiredDataSources: ['health_score'], defaultSize: { columns: 2, rows: 1 }, resizable: true, futureMetadata: {} },
  ];
}

export function createDefaultTemplates(): ReportTemplate[] {
  return [
    {
      id: 'tpl_system_health', reportType: 'system_health', name: 'System Health Template',
      description: 'Standard system health report',
      sections: [
        { id: 'sec_health_overview', title: 'Health Overview', order: 0, widgetIds: ['widget_health_card', 'widget_statistics'], insights: [], futureMetadata: {} },
        { id: 'sec_health_trends', title: 'Health Trends', order: 1, widgetIds: ['widget_trend_chart'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_health_card', 'widget_statistics', 'widget_trend_chart'],
      requiredDataSources: ['health_score'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_weekly', reportType: 'weekly_summary', name: 'Weekly Summary Template',
      description: 'Standard weekly summary report',
      sections: [
        { id: 'sec_weekly_overview', title: 'Weekly Overview', order: 0, widgetIds: ['widget_health_card', 'widget_statistics'], insights: [], futureMetadata: {} },
        { id: 'sec_weekly_timeline', title: 'Weekly Timeline', order: 1, widgetIds: ['widget_timeline'], insights: [], futureMetadata: {} },
        { id: 'sec_weekly_recommendations', title: 'Recommendations', order: 2, widgetIds: ['widget_recommendations'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_health_card', 'widget_statistics', 'widget_timeline', 'widget_recommendations'],
      requiredDataSources: ['health_score', 'timeline', 'recommendations'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_monthly', reportType: 'monthly_summary', name: 'Monthly Summary Template',
      description: 'Standard monthly summary report',
      sections: [
        { id: 'sec_monthly_overview', title: 'Monthly Overview', order: 0, widgetIds: ['widget_health_card', 'widget_statistics'], insights: [], futureMetadata: {} },
        { id: 'sec_monthly_timeline', title: 'Monthly Timeline', order: 1, widgetIds: ['widget_timeline'], insights: [], futureMetadata: {} },
        { id: 'sec_monthly_goals', title: 'Goal Progress', order: 2, widgetIds: ['widget_goals'], insights: [], futureMetadata: {} },
        { id: 'sec_monthly_predictions', title: 'Predictions', order: 3, widgetIds: ['widget_predictions'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_health_card', 'widget_statistics', 'widget_timeline', 'widget_goals', 'widget_predictions'],
      requiredDataSources: ['health_score', 'timeline', 'goals', 'predictions'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_enterprise', reportType: 'enterprise_report', name: 'Enterprise Template',
      description: 'Comprehensive enterprise report',
      sections: [
        { id: 'sec_ent_overview', title: 'Enterprise Overview', order: 0, widgetIds: ['widget_health_card', 'widget_statistics'], insights: [], futureMetadata: {} },
        { id: 'sec_ent_timeline', title: 'Activity Timeline', order: 1, widgetIds: ['widget_timeline'], insights: [], futureMetadata: {} },
        { id: 'sec_ent_recommendations', title: 'Recommendations', order: 2, widgetIds: ['widget_recommendations'], insights: [], futureMetadata: {} },
        { id: 'sec_ent_predictions', title: 'Predictions', order: 3, widgetIds: ['widget_predictions'], insights: [], futureMetadata: {} },
        { id: 'sec_ent_goals', title: 'Goals', order: 4, widgetIds: ['widget_goals'], insights: [], futureMetadata: {} },
        { id: 'sec_ent_automation', title: 'Automation', order: 5, widgetIds: ['widget_automation'], insights: [], futureMetadata: {} },
        { id: 'sec_ent_maintenance', title: 'Maintenance', order: 6, widgetIds: ['widget_maintenance'], insights: [], futureMetadata: {} },
        { id: 'sec_ent_recovery', title: 'Recovery', order: 7, widgetIds: ['widget_recovery'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_health_card', 'widget_statistics', 'widget_timeline', 'widget_recommendations', 'widget_predictions', 'widget_goals', 'widget_automation', 'widget_maintenance', 'widget_recovery'],
      requiredDataSources: ['health_score', 'timeline', 'recommendations', 'predictions', 'goals', 'automation', 'maintenance', 'recovery_history'],
      isEnterprise: true, futureMetadata: {},
    },
    {
      id: 'tpl_optimization', reportType: 'optimization_effectiveness', name: 'Optimization Template',
      description: 'Optimization effectiveness report',
      sections: [
        { id: 'sec_opt_overview', title: 'Optimization Overview', order: 0, widgetIds: ['widget_health_card'], insights: [], futureMetadata: {} },
        { id: 'sec_opt_simulation', title: 'Simulation Results', order: 1, widgetIds: ['widget_simulation'], insights: [], futureMetadata: {} },
        { id: 'sec_opt_comparison', title: 'Plan Comparison', order: 2, widgetIds: ['widget_comparison'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_health_card', 'widget_simulation', 'widget_comparison'],
      requiredDataSources: ['health_score', 'optimization_history'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_goals', reportType: 'goal_progress', name: 'Goal Progress Template',
      description: 'Goal progress report',
      sections: [
        { id: 'sec_goals_overview', title: 'Goals Overview', order: 0, widgetIds: ['widget_goals'], insights: [], futureMetadata: {} },
        { id: 'sec_goals_health', title: 'Health Context', order: 1, widgetIds: ['widget_health_card'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_goals', 'widget_health_card'],
      requiredDataSources: ['goals', 'health_score'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_maintenance', reportType: 'maintenance_summary', name: 'Maintenance Template',
      description: 'Maintenance summary report',
      sections: [
        { id: 'sec_maint_overview', title: 'Maintenance Overview', order: 0, widgetIds: ['widget_maintenance'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_maintenance'],
      requiredDataSources: ['maintenance'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_automation', reportType: 'automation_summary', name: 'Automation Template',
      description: 'Automation summary report',
      sections: [
        { id: 'sec_auto_overview', title: 'Automation Overview', order: 0, widgetIds: ['widget_automation'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_automation'],
      requiredDataSources: ['automation'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_device', reportType: 'device_profile', name: 'Device Profile Template',
      description: 'Device profile report',
      sections: [
        { id: 'sec_dev_overview', title: 'Device Overview', order: 0, widgetIds: ['widget_health_card', 'widget_statistics'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_health_card', 'widget_statistics'],
      requiredDataSources: ['device_profile', 'health_score'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_recovery', reportType: 'recovery_history', name: 'Recovery Template',
      description: 'Recovery history report',
      sections: [
        { id: 'sec_rec_overview', title: 'Recovery Overview', order: 0, widgetIds: ['widget_recovery'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_recovery'],
      requiredDataSources: ['recovery_history'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_predictions', reportType: 'prediction_accuracy', name: 'Predictions Template',
      description: 'Prediction accuracy report',
      sections: [
        { id: 'sec_pred_overview', title: 'Predictions Overview', order: 0, widgetIds: ['widget_predictions'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_predictions'],
      requiredDataSources: ['predictions'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_recommendations', reportType: 'recommendation_effectiveness', name: 'Recommendations Template',
      description: 'Recommendation effectiveness report',
      sections: [
        { id: 'sec_rec_overview', title: 'Recommendations Overview', order: 0, widgetIds: ['widget_recommendations'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_recommendations'],
      requiredDataSources: ['recommendations'], isEnterprise: false, futureMetadata: {},
    },
    {
      id: 'tpl_custom', reportType: 'custom_report', name: 'Custom Template',
      description: 'Custom report template',
      sections: [
        { id: 'sec_custom', title: 'Custom Section', order: 0, widgetIds: ['widget_health_card'], insights: [], futureMetadata: {} },
      ],
      widgetIds: ['widget_health_card'],
      requiredDataSources: [], isEnterprise: false, futureMetadata: {},
    },
  ];
}

export function createDefaultReportFeatureFlags(): ReportFeatureFlags {
  return {
    enableReportStudio: true,
    enableReportGeneration: true,
    enableComparison: true,
    enableExport: true,
    enableScheduling: true,
    enableHistory: true,
    enableAnalytics: true,
    enableEvents: true,
    enablePlugins: true,
    futureFlags: {},
  };
}

export function createDefaultReportPerformanceTargets(): ReportPerformanceTargets {
  return {
    reportGenerationTargetMs: 500,
    futureMetadata: {},
  };
}

export function createDefaultReportStudioConfiguration(): ReportStudioConfiguration {
  return {
    configVersion: '1.0.0',
    defaultTimeRange: 'last_30_days',
    defaultExportFormat: 'interactive',
    featureFlags: createDefaultReportFeatureFlags(),
    performanceTargets: createDefaultReportPerformanceTargets(),
    enterpriseTemplates: ['tpl_enterprise'],
    futureMetadata: {},
  };
}
