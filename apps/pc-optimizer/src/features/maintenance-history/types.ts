/**
 * Maintenance History & Execution Analytics — Type Definitions
 *
 * Data model for permanently recording maintenance executions,
 * computing statistics, and generating reports.
 *
 * This module is read-only with respect to the execution engine.
 * It listens to execution events and records results — it never
 * modifies engine behavior.
 */
import type { ExecutionResult, TaskResult, JobSource } from '../maintenance-engine/types';

// ── Execution Record ──────────────────────────────────────────

/**
 * Permanent record of a single maintenance execution.
 * Stored in the repository and used for statistics and reports.
 */
export interface ExecutionRecord {
  /** Unique record ID (same as execution ID from the engine). */
  id: string;
  /** Schedule ID if the execution was triggered by a schedule. */
  scheduleId: string | null;
  /** Job ID from the maintenance job. */
  jobId: string;
  /** Source of the execution (scheduled, manual, AI, etc.). */
  source: ExecutionSource;
  /** ISO timestamp when execution started. */
  startTime: string;
  /** ISO timestamp when execution ended. */
  endTime: string;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Overall execution status. */
  status: ExecutionRecordStatus;
  /** Per-task results. */
  taskResults: TaskResult[];
  /** Total files removed across all tasks. */
  filesRemoved: number;
  /** Total folders removed across all tasks. */
  foldersRemoved: number;
  /** Registry entries removed (future — 0 for now). */
  registryEntriesRemoved: number;
  /** Recycle bin items removed. */
  recycleBinItemsRemoved: number;
  /** Temporary files removed. */
  temporaryFilesRemoved: number;
  /** Browser data items removed. */
  browserDataRemoved: number;
  /** Total bytes recovered across all tasks. */
  totalSpaceRecovered: number;
  /** Warnings collected during execution. */
  warnings: string[];
  /** Errors collected during execution. */
  errors: string[];
  /** Application version at time of execution. */
  appVersion: string;
  /** When this record was logged (ISO timestamp). */
  loggedAt: string;
}

// ── Execution Source (extended from JobSource) ────────────────

export type ExecutionSource = JobSource | 'deep_clean';

// ── Execution Record Status ───────────────────────────────────

export type ExecutionRecordStatus = 'succeeded' | 'partially_completed' | 'failed' | 'cancelled';

// ── Search / Filter ───────────────────────────────────────────

export interface ExecutionFilter {
  /** Filter by start date (inclusive). ISO string or null. */
  dateFrom?: string | null;
  /** Filter by end date (inclusive). ISO string or null. */
  dateTo?: string | null;
  /** Filter by status. */
  status?: ExecutionRecordStatus | null;
  /** Filter by execution source. */
  source?: ExecutionSource | null;
  /** Filter by task ID (records that executed this task). */
  taskId?: string | null;
  /** Filter by schedule ID. */
  scheduleId?: string | null;
  /** Maximum number of results to return. */
  limit?: number | null;
  /** Offset for pagination. */
  offset?: number | null;
}

// ── Statistics ────────────────────────────────────────────────

export interface ExecutionStatistics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  partialExecutions: number;
  cancelledExecutions: number;
  successRate: number;
  averageDurationMs: number;
  averageSpaceRecovered: number;
  largestCleanupBytes: number;
  largestCleanupExecutionId: string | null;
  mostFrequentTaskId: string | null;
  mostFrequentTaskName: string | null;
  mostFrequentTaskCount: number;
  lastRunAt: string | null;
  longestRunMs: number;
  longestRunExecutionId: string | null;
  totalFilesRemoved: number;
  totalSpaceRecovered: number;
}

// ── Reports ───────────────────────────────────────────────────

export interface ExecutionReport {
  reportId: string;
  generatedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  summary: ReportSummary;
  timeline: ReportTimelineEntry[];
  taskResults: ReportTaskResult[];
  performanceMetrics: ReportPerformanceMetrics;
  recoveredSpace: ReportRecoveredSpace;
  warnings: string[];
  errors: string[];
  overallHealth: ReportHealthStatus;
}

export interface ReportSummary {
  totalExecutions: number;
  successful: number;
  failed: number;
  partial: number;
  cancelled: number;
  successRate: number;
  totalFilesRemoved: number;
  totalSpaceRecovered: number;
  averageDurationMs: number;
}

export interface ReportTimelineEntry {
  executionId: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: ExecutionRecordStatus;
  source: ExecutionSource;
  filesRemoved: number;
  spaceRecovered: number;
}

export interface ReportTaskResult {
  taskId: string;
  taskName: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  totalFilesRemoved: number;
  totalSpaceRecovered: number;
  averageDurationMs: number;
}

export interface ReportPerformanceMetrics {
  averageDurationMs: number;
  longestRunMs: number;
  longestRunExecutionId: string | null;
  shortestRunMs: number;
  shortestRunExecutionId: string | null;
  averageSpacePerExecution: number;
}

export interface ReportRecoveredSpace {
  totalBytes: number;
  totalFiles: number;
  totalFolders: number;
  totalRegistryEntries: number;
  totalRecycleBinItems: number;
  totalTempFiles: number;
  totalBrowserData: number;
  largestSingleCleanup: number;
  largestSingleCleanupExecutionId: string | null;
}

export type ReportHealthStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

// ── Retention ─────────────────────────────────────────────────

export interface RetentionPolicy {
  maxRecords: number;
  /** Whether to archive old records instead of deleting them. */
  archiveInsteadOfDelete: boolean;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  maxRecords: 500,
  archiveInsteadOfDelete: false,
};

// ── History Events ────────────────────────────────────────────

export type HistoryEventType =
  | 'execution_logged'
  | 'history_updated'
  | 'statistics_updated'
  | 'report_generated';

export interface HistoryEventPayloads {
  execution_logged: { record: ExecutionRecord };
  history_updated: { totalRecords: number };
  statistics_updated: { statistics: ExecutionStatistics };
  report_generated: { report: ExecutionReport };
}

export type HistoryEventListener = (payload: unknown) => void;

// ── Conversion Helper ─────────────────────────────────────────

/**
 * Convert an ExecutionResult from the engine into a permanent ExecutionRecord.
 * Extracts per-category counts from task metadata.
 */
export function resultToRecord(
  result: ExecutionResult,
  jobId: string,
  appVersion: string,
): ExecutionRecord {
  const taskResults = result.taskResults;
  const hasFailures = taskResults.some((t) => t.status === 'failed');
  const allFailed = taskResults.length > 0 && taskResults.every((t) => t.status === 'failed');

  let status: ExecutionRecordStatus;
  if (allFailed) {
    status = 'failed';
  } else if (hasFailures) {
    status = 'partially_completed';
  } else {
    status = 'succeeded';
  }

  // Extract per-category counts from task metadata
  let foldersRemoved = 0;
  let registryEntriesRemoved = 0;
  let recycleBinItemsRemoved = 0;
  let temporaryFilesRemoved = 0;
  let browserDataRemoved = 0;

  for (const task of taskResults) {
    const meta = task.metadata ?? {};
    foldersRemoved += (meta.foldersRemoved as number) ?? 0;
    registryEntriesRemoved += (meta.registryEntriesRemoved as number) ?? 0;
    recycleBinItemsRemoved += (meta.recycleBinItemsRemoved as number) ?? 0;
    temporaryFilesRemoved += (meta.temporaryFilesRemoved as number) ?? 0;
    browserDataRemoved += (meta.browserDataRemoved as number) ?? 0;
  }

  return {
    id: result.executionId,
    scheduleId: result.scheduleId,
    jobId,
    source: result.jobSource as ExecutionSource,
    startTime: result.startTime,
    endTime: result.endTime,
    durationMs: result.durationMs,
    status,
    taskResults,
    filesRemoved: result.totalFilesCleaned,
    foldersRemoved,
    registryEntriesRemoved,
    recycleBinItemsRemoved,
    temporaryFilesRemoved,
    browserDataRemoved,
    totalSpaceRecovered: result.totalBytesRecovered,
    warnings: [...result.warnings],
    errors: [...result.errors],
    appVersion,
    loggedAt: new Date().toISOString(),
  };
}
