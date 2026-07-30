/**
 * Unified Timeline & Activity Center — Barrel Exports
 *
 * EPIC 4 PHASE B PART 4
 *
 * The central event history for the platform. Records every meaningful
 * platform event in chronological order. Consumes existing events
 * rather than replacing them.
 */

// Manager
export { TimelineManager } from './timelineManager';

// Engine
export { TimelineEngine } from './timelineEngine';

// Components
export { TimelineCollector } from './timelineCollector';
export { TimelineAggregator } from './timelineAggregator';
export { TimelineFilterEngine } from './timelineFilterEngine';
export { TimelineSearchEngine } from './timelineSearchEngine';
export { TimelineGroupingEngine } from './timelineGroupingEngine';
export { TimelineRetentionManager } from './timelineRetentionManager';
export { TimelineStatisticsEngine } from './timelineStatistics';
export { TimelineAnalyticsEngine } from './timelineAnalytics';
export { TimelineFormatter } from './timelineFormatter';
export { TimelineExporter } from './timelineExporter';
export { TimelineValidator } from './timelineValidator';
export { TimelineEvents } from './timelineEvents';

// Configuration
export {
  DEFAULT_TIMELINE_CONFIGURATION,
  createTimelineConfiguration,
  type DeepPartial,
} from './timelineConfiguration';

// Types
export type {
  TimelineCategory,
  TimelineEventType,
  TimelineSeverity,
  TimelineItemStatus,
  TimelineItem,
  TimelineEventInput,
  TimelineFilter,
  TimelineSearchQuery,
  TimelineSearchResult,
  TimelineGroupingType,
  TimelineGroup,
  TimelineGroupingResult,
  RetentionPeriod,
  RetentionRules,
  RetentionPruneResult,
  TimelineStatistics,
  TimelineAnalytics,
  HealthTrendPoint,
  TagCount,
  ModuleCount,
  TimelineActivityPoint,
  ExportFormat,
  TimelineExport,
  ExportPlugin,
  TimelineValidationResult,
  TimelineValidationError,
  TimelineValidationWarning,
  TimelineEventProviderPlugin,
  TimelineFeatureFlags,
  FormattingRules,
  GroupingRules,
  FilterRules,
  TimelineConfiguration,
  TimelineEventType_Emitter,
  TimelineEvent,
  TimelineEventListener,
  TimelineQuery,
  TimelineQueryResult,
  Evidence,
} from './types';

// Helpers
export {
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
} from './types';
