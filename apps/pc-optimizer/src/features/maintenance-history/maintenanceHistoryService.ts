/**
 * Maintenance History Service — service layer that orchestrates the repository,
 * statistics, reports, and event integration.
 *
 * Listens to execution events from the execution engine and automatically
 * logs completed/failed executions to the repository.
 *
 * Emits history events:
 *   execution_logged    — after a record is stored
 *   history_updated     — after any repository change
 *   statistics_updated  — after statistics are recalculated
 *   report_generated    — after a report is built
 *
 * This service is read-only with respect to the execution engine.
 * It never modifies engine behavior.
 */
import { executionEvents } from '../maintenance-engine/executionEvents';
import { executionHistoryRepository } from './executionHistoryRepository';
import { executionStatisticsService } from './executionStatisticsService';
import { executionReportBuilder } from './executionReportBuilder';
import { historyEvents } from './historyEvents';
import { resultToRecord } from './types';
import type {
  ExecutionRecord,
  ExecutionFilter,
  ExecutionStatistics,
  ExecutionReport,
  RetentionPolicy,
} from './types';
import type { ExecutionResult } from '../maintenance-engine/types';

// ── App version detection ─────────────────────────────────────

/**
 * Synchronously get the app version.
 * The actual version is async via window.avs.app.getVersion(),
 * but we need it synchronously when logging. We use a cached value
 * if available, otherwise fall back to 'unknown'.
 */
let _cachedAppVersion: string | null = null;

async function refreshAppVersion(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.avs?.app) {
      _cachedAppVersion = await window.avs.app.getVersion();
    }
  } catch {
    // non-fatal
  }
}

function getAppVersion(): string {
  return _cachedAppVersion ?? 'unknown';
}

// ── Service ───────────────────────────────────────────────────

class MaintenanceHistoryServiceImpl {
  private _initialized = false;
  private _unsubExecutionCompleted: (() => void) | null = null;
  private _unsubExecutionFailed: (() => void) | null = null;
  private _cachedStatistics: ExecutionStatistics | null = null;

  /**
   * Initialize the service. Loads records from storage and subscribes
   * to execution engine events.
   */
  init(): void {
    if (this._initialized) return;

    executionHistoryRepository.load();
    void refreshAppVersion();

    this._unsubExecutionCompleted = executionEvents.on('execution_completed', (payload) => {
      const p = payload as { executionId: string; result: ExecutionResult };
      this.logExecution(p.result);
    });

    this._unsubExecutionFailed = executionEvents.on('execution_failed', (payload) => {
      const p = payload as { executionId: string; error: string; partialResult?: ExecutionResult };
      if (p.partialResult) {
        this.logExecution(p.partialResult);
      }
    });

    this._initialized = true;
    this._recalculateStatistics();
    console.info('[MaintenanceHistory] Initialized');
  }

  /**
   * Shut down the service and unsubscribe from events.
   */
  shutdown(): void {
    this._unsubExecutionCompleted?.();
    this._unsubExecutionFailed?.();
    this._unsubExecutionCompleted = null;
    this._unsubExecutionFailed = null;
    this._initialized = false;
  }

  // ── Logging ─────────────────────────────────────────────────

  /**
   * Log an execution result to the repository.
   * Converts the ExecutionResult to a permanent ExecutionRecord,
   * stores it, and emits events.
   */
  logExecution(result: ExecutionResult, jobId?: string): ExecutionRecord {
    const record = resultToRecord(result, jobId ?? 'unknown', getAppVersion());
    executionHistoryRepository.insert(record);

    historyEvents.emit('execution_logged', { record });
    historyEvents.emit('history_updated', { totalRecords: executionHistoryRepository.count() });

    this._recalculateStatistics();

    console.info(
      `[MaintenanceHistory] Execution logged: ${record.id} — status=${record.status}, files=${record.filesRemoved}, bytes=${record.totalSpaceRecovered}`,
    );

    return record;
  }

  // ── Querying ────────────────────────────────────────────────

  /**
   * Get all execution records (newest first).
   */
  getAllRecords(): ExecutionRecord[] {
    return executionHistoryRepository.getAll();
  }

  /**
   * Get a single record by ID.
   */
  getRecordById(id: string): ExecutionRecord | null {
    return executionHistoryRepository.getById(id);
  }

  /**
   * Query records with filtering.
   */
  query(filter: ExecutionFilter = {}): ExecutionRecord[] {
    return executionHistoryRepository.query(filter);
  }

  /**
   * Get the total record count.
   */
  getRecordCount(): number {
    return executionHistoryRepository.count();
  }

  // ── Statistics ──────────────────────────────────────────────

  /**
   * Get current statistics (cached).
   */
  getStatistics(): ExecutionStatistics {
    if (!this._cachedStatistics) {
      this._recalculateStatistics();
    }
    return this._cachedStatistics!;
  }

  /**
   * Recalculate statistics from all records and emit event.
   */
  private _recalculateStatistics(): void {
    const records = executionHistoryRepository.getAll();
    this._cachedStatistics = executionStatisticsService.compute(records);
    historyEvents.emit('statistics_updated', { statistics: this._cachedStatistics });
  }

  // ── Reports ─────────────────────────────────────────────────

  /**
   * Generate a report from all records.
   */
  generateReport(): ExecutionReport {
    const records = executionHistoryRepository.getAll();
    const report = executionReportBuilder.build(records);
    historyEvents.emit('report_generated', { report });
    return report;
  }

  /**
   * Generate a report for a specific date range.
   */
  generateReportForRange(dateFrom: string, dateTo: string): ExecutionReport {
    const records = executionHistoryRepository.query({ dateFrom, dateTo });
    const report = executionReportBuilder.build(records, dateFrom, dateTo);
    historyEvents.emit('report_generated', { report });
    return report;
  }

  /**
   * Generate a report for a specific schedule.
   */
  generateReportForSchedule(scheduleId: string): ExecutionReport {
    const records = executionHistoryRepository.query({ scheduleId });
    const report = executionReportBuilder.build(records);
    historyEvents.emit('report_generated', { report });
    return report;
  }

  // ── Retention ───────────────────────────────────────────────

  /**
   * Get the current retention policy.
   */
  getRetentionPolicy(): RetentionPolicy {
    return executionHistoryRepository.getRetentionPolicy();
  }

  /**
   * Set the retention policy.
   */
  setRetentionPolicy(policy: Partial<RetentionPolicy>): void {
    executionHistoryRepository.setRetentionPolicy(policy);
    historyEvents.emit('history_updated', { totalRecords: executionHistoryRepository.count() });
    this._recalculateStatistics();
  }

  // ── Cleanup ─────────────────────────────────────────────────

  /**
   * Delete a record by ID.
   */
  deleteRecord(id: string): boolean {
    const deleted = executionHistoryRepository.delete(id);
    if (deleted) {
      historyEvents.emit('history_updated', { totalRecords: executionHistoryRepository.count() });
      this._recalculateStatistics();
    }
    return deleted;
  }

  /**
   * Clear all history.
   */
  clearAll(): void {
    executionHistoryRepository.clear();
    this._cachedStatistics = null;
    historyEvents.emit('history_updated', { totalRecords: 0 });
    this._recalculateStatistics();
  }

  /**
   * Clear all state (e.g. on logout).
   */
  destroy(): void {
    this.shutdown();
    executionHistoryRepository.clear();
    this._cachedStatistics = null;
    historyEvents.clear();
  }
}

export const maintenanceHistoryService = new MaintenanceHistoryServiceImpl();
