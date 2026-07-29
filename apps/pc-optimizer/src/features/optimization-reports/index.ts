/**
 * Optimization Intelligence Report Engine — Barrel Export
 *
 * EPIC 3 PHASE A PART 7 — Optimization Intelligence Report Engine.
 *
 * Converts execution results into explainable, measurable reports.
 * Every optimization ends with a complete AI-generated report.
 */
// Types
export type {
  OptimizationReport,
  ReportStatus,
  OverallResult,
  ReportFormat,
  ExportFormat,
  ReportSection,
  SectionType,
  ExecutionSummary,
  HealthDeltaAnalysis,
  BenefitAnalysis,
  FormattedBenefits,
  CompletedAction,
  SkippedAction,
  PredictionDelta,
  RecommendationDelta,
  ResolvedRecommendation,
  RemainingRecommendation,
  NewRecommendation,
  NextBestAction,
  VisualMetrics,
  DeltaMetric,
  TimelineEntry,
  ReportEvidence,
  ReportComparison,
  ReportStatistics,
  ReportHistoryEntry,
  ReportValidationResult,
  ReportValidationError,
  ReportValidationWarning,
  ReportEventType,
  ReportEvent,
  ReportEventListener,
  ReportSectionConfig,
  ReportTemplate,
  ExportOptions,
  ComparisonRules,
  ReportFeatureFlags,
  ReportConfiguration,
  ExportResult,
  DeltaAnalyzerProvider,
  DeltaContext,
} from './types';

// Helpers
export {
  createDefaultReportConfiguration,
  generateReportId,
  generateComparisonId,
  generateHistoryId,
  formatDuration,
  formatBytes,
  formatDelta,
  determineTrend,
} from './types';

// Configuration
export {
  DEFAULT_REPORT_CONFIGURATION,
  createReportConfiguration,
  isSectionEnabled,
  isSectionVisible,
  getTemplate,
} from './reportConfiguration';
export type { DeepPartial as ReportDeepPartial } from './reportConfiguration';

// Events
export { ReportEvents } from './reportEvents';

// Delta Analyzers
export { HealthDeltaAnalyzer } from './healthDeltaAnalyzer';
export { PerformanceDeltaAnalyzer } from './performanceDeltaAnalyzer';
export { StorageDeltaAnalyzer } from './storageDeltaAnalyzer';
export { PrivacyDeltaAnalyzer } from './privacyDeltaAnalyzer';
export { PredictionDeltaAnalyzer } from './predictionDeltaAnalyzer';
export { RecommendationDeltaAnalyzer } from './recommendationDeltaAnalyzer';

// Benefit Analyzer
export { BenefitAnalyzer } from './benefitAnalyzer';

// Formatter
export { ReportFormatter } from './reportFormatter';

// Exporter
export { ReportExporter } from './reportExporter';

// Validator
export { ReportValidator } from './reportValidator';

// Analyzer
export { OptimizationReportAnalyzer } from './reportAnalyzer';

// Builder
export { OptimizationReportBuilder } from './reportBuilder';

// History
export { ReportHistory } from './reportHistory';

// Manager
export { OptimizationReportManager } from './reportManager';
