/**
 * Optimization Intelligence Report — Barrel Export
 *
 * EPIC 3 PHASE A PART 7 — Optimization Intelligence Report.
 *
 * Transforms execution results into explainable, user-facing reports.
 * Closes the loop between AI Recommendation Engine, Optimization Plan,
 * and Execution Pipeline.
 */
// Types
export type {
  IntelligenceReport,
  ExecutionTimeDisplay,
  HealthDeltaDisplay,
  StorageDisplay,
  StartupDisplay,
  PrivacyDisplay,
  PerformanceDisplay,
  ActionDisplay,
  ActionIcon,
  PredictionUpdateDisplay,
  RecommendationRemainingDisplay,
  RollbackDisplay,
  ReportEvidence,
  OptimizationStory,
  ReportMetadata,
  ReportStatistics,
  ReportHistoryEntry,
  ReportEventType,
  ReportEvent,
  ReportEventListener,
  ReportFormattingRules,
  ReportStoryRules,
  ReportFeatureFlags,
  ReportConfiguration,
} from './types';

// Helpers
export {
  createDefaultReportConfiguration,
  generateReportId,
  generateReportHistoryId,
  formatDuration,
  formatStorage,
  formatHealthDelta,
  determineHealthTrend,
} from './types';

// Configuration
export {
  DEFAULT_REPORT_CONFIGURATION,
  createReportConfiguration,
} from './reportConfiguration';
export type { DeepPartial as ReportDeepPartial } from './reportConfiguration';

// Events
export { ReportEvents } from './reportEvents';

// Evidence Collector
export { ReportEvidenceCollector } from './reportEvidenceCollector';

// Health Delta
export { ReportHealthDelta } from './reportHealthDelta';

// Story Generator
export { ReportStoryGenerator } from './reportStoryGenerator';

// Formatter
export { ReportFormatter } from './reportFormatter';

// Registry
export { ReportRegistry } from './reportRegistry';

// History
export { ReportHistory } from './reportHistory';

// Builder
export { ReportBuilder } from './reportBuilder';

// Manager
export { ReportManager } from './reportManager';
