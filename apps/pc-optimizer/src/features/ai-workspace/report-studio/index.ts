/**
 * AI Report Studio — Barrel Export
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

// Manager
export { ReportStudioManager } from './reportStudioManager';

// Configuration
export {
  DEFAULT_REPORT_STUDIO_CONFIGURATION,
  createReportStudioConfiguration,
  validateReportStudioConfiguration,
} from './reportConfiguration';
export type { DeepPartial as ReportDeepPartial } from './reportConfiguration';

// Events
export { ReportEvents } from './reportEvents';

// Core components
export { ReportRegistry } from './reportRegistry';
export { ReportWidgetRegistry } from './reportWidgetRegistry';
export { ReportTemplateEngine } from './reportTemplateEngine';
export { ReportFilterEngine } from './reportFilterEngine';
export { ReportComparisonEngine } from './reportComparisonEngine';
export { ReportBuilder } from './reportBuilder';
export { ReportComposer } from './reportComposer';
export { ReportExporter } from './reportExporter';
export { ReportFormatter } from './reportFormatter';
export type { FormattedReport } from './reportFormatter';
export { ReportScheduler } from './reportScheduler';
export { ReportHistory } from './reportHistory';
export { ReportAnalytics } from './reportAnalytics';
export { ReportValidator } from './reportValidator';

// Types
export type {
  ReportType,
  ReportCategory,
  TimeRangePreset,
  ReportTimeRange,
  ReportSection,
  WidgetType,
  ReportWidgetDefinition,
  ReportWidgetInstance,
  ChartType,
  ReportChart,
  ChartData,
  ChartDataset,
  ReportTable,
  InsightType,
  ReportInsight,
  Report,
  ReportStatus,
  FilterType,
  ReportFilter,
  ReportFilterSet,
  ComparisonType,
  ReportComparison,
  ComparisonDifference,
  ExportFormat,
  ReportExportResult,
  ScheduleFrequency,
  ReportSchedule,
  ReportHistoryEntry,
  ReportAnalyticsData,
  ReportEventType,
  ReportEvent,
  ReportEventListener,
  ReportStudioConfiguration,
  ReportFeatureFlags,
  ReportPerformanceTargets,
  ReportTemplate,
  ReportDefinition,
  ReportPlugin,
  ReportValidationResult,
  ReportValidationError,
  ReportValidationWarning,
} from './types';

export {
  getReportTypeLabel,
  getReportCategoryLabel,
  getTimeRangePresetLabel,
  getWidgetTypeLabel,
  getInsightTypeLabel,
  getReportStatusLabel,
  getComparisonTypeLabel,
  getExportFormatLabel,
  getScheduleFrequencyLabel,
  generateReportId,
  generateSectionId,
  generateWidgetInstanceId,
  generateChartId,
  generateTableId,
  generateInsightId,
  generateComparisonId,
  generateScheduleId,
  generateHistoryEntryId,
  createTimeRange,
  createDefaultReportDefinitions,
  createDefaultWidgetDefinitions,
  createDefaultTemplates,
  createDefaultReportFeatureFlags,
  createDefaultReportPerformanceTargets,
  createDefaultReportStudioConfiguration,
} from './types';
