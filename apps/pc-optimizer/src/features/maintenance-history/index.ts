/**
 * Public barrel export for the maintenance history & analytics feature.
 */

// Types
export type {
  ExecutionRecord,
  ExecutionSource,
  ExecutionRecordStatus,
  ExecutionFilter,
  ExecutionStatistics,
  ExecutionReport,
  ReportSummary,
  ReportTimelineEntry,
  ReportTaskResult,
  ReportPerformanceMetrics,
  ReportRecoveredSpace,
  ReportHealthStatus,
  RetentionPolicy,
  HistoryEventType,
  HistoryEventPayloads,
  HistoryEventListener,
} from './types';

export { DEFAULT_RETENTION_POLICY, resultToRecord } from './types';

// Repository
export { executionHistoryRepository } from './executionHistoryRepository';

// History events
export { historyEvents } from './historyEvents';

// Statistics
export { executionStatisticsService } from './executionStatisticsService';

// Report builder
export { executionReportBuilder } from './executionReportBuilder';

// Maintenance history service
export { maintenanceHistoryService } from './maintenanceHistoryService';
