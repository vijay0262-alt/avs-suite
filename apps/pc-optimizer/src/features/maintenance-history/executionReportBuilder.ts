/**
 * Execution Report Builder — generates structured reports from execution records.
 *
 * Each report includes:
 *   Summary, Timeline, Task Results, Performance Metrics,
 *   Recovered Space, Warnings, Errors, Overall Health
 *
 * Reports are exportable later (only the data model is created now).
 */
import type {
  ExecutionRecord,
  ExecutionReport,
  ReportSummary,
  ReportTimelineEntry,
  ReportTaskResult,
  ReportPerformanceMetrics,
  ReportRecoveredSpace,
  ReportHealthStatus,
} from './types';

let _reportCounter = 0;

function generateReportId(): string {
  _reportCounter += 1;
  return `report-${Date.now().toString(36)}-${_reportCounter}`;
}

class ExecutionReportBuilderImpl {
  /**
   * Build a report from a list of execution records.
   *
   * @param records - The records to include in the report
   * @param periodStart - Optional start of the reporting period
   * @param periodEnd - Optional end of the reporting period
   */
  build(
    records: ExecutionRecord[],
    periodStart: string | null = null,
    periodEnd: string | null = null,
  ): ExecutionReport {
    const summary = this._buildSummary(records);
    const timeline = this._buildTimeline(records);
    const taskResults = this._buildTaskResults(records);
    const performanceMetrics = this._buildPerformanceMetrics(records);
    const recoveredSpace = this._buildRecoveredSpace(records);
    const allWarnings = this._collectWarnings(records);
    const allErrors = this._collectErrors(records);
    const overallHealth = this._determineHealth(summary);

    return {
      reportId: generateReportId(),
      generatedAt: new Date().toISOString(),
      periodStart,
      periodEnd,
      summary,
      timeline,
      taskResults,
      performanceMetrics,
      recoveredSpace,
      warnings: allWarnings,
      errors: allErrors,
      overallHealth,
    };
  }

  private _buildSummary(records: ExecutionRecord[]): ReportSummary {
    const total = records.length;
    let successful = 0;
    let failed = 0;
    let partial = 0;
    let cancelled = 0;
    let totalFilesRemoved = 0;
    let totalSpaceRecovered = 0;
    let totalDurationMs = 0;

    for (const r of records) {
      switch (r.status) {
        case 'succeeded': successful++; break;
        case 'failed': failed++; break;
        case 'partially_completed': partial++; break;
        case 'cancelled': cancelled++; break;
      }
      totalFilesRemoved += r.filesRemoved;
      totalSpaceRecovered += r.totalSpaceRecovered;
      totalDurationMs += r.durationMs;
    }

    return {
      totalExecutions: total,
      successful,
      failed,
      partial,
      cancelled,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      totalFilesRemoved,
      totalSpaceRecovered,
      averageDurationMs: total > 0 ? Math.round(totalDurationMs / total) : 0,
    };
  }

  private _buildTimeline(records: ExecutionRecord[]): ReportTimelineEntry[] {
    return records.map((r) => ({
      executionId: r.id,
      startTime: r.startTime,
      endTime: r.endTime,
      durationMs: r.durationMs,
      status: r.status,
      source: r.source,
      filesRemoved: r.filesRemoved,
      spaceRecovered: r.totalSpaceRecovered,
    }));
  }

  private _buildTaskResults(records: ExecutionRecord[]): ReportTaskResult[] {
    const taskMap = new Map<string, {
      taskName: string;
      executionCount: number;
      successCount: number;
      failureCount: number;
      totalFilesRemoved: number;
      totalSpaceRecovered: number;
      totalDurationMs: number;
    }>();

    for (const record of records) {
      for (const task of record.taskResults) {
        const existing = taskMap.get(task.taskId);
        if (existing) {
          existing.executionCount++;
          if (task.status === 'completed') existing.successCount++;
          if (task.status === 'failed') existing.failureCount++;
          existing.totalFilesRemoved += task.filesCleaned;
          existing.totalSpaceRecovered += task.bytesRecovered;
          existing.totalDurationMs += task.durationMs;
        } else {
          taskMap.set(task.taskId, {
            taskName: task.taskName,
            executionCount: 1,
            successCount: task.status === 'completed' ? 1 : 0,
            failureCount: task.status === 'failed' ? 1 : 0,
            totalFilesRemoved: task.filesCleaned,
            totalSpaceRecovered: task.bytesRecovered,
            totalDurationMs: task.durationMs,
          });
        }
      }
    }

    return Array.from(taskMap.entries()).map(([taskId, info]) => ({
      taskId,
      taskName: info.taskName,
      executionCount: info.executionCount,
      successCount: info.successCount,
      failureCount: info.failureCount,
      totalFilesRemoved: info.totalFilesRemoved,
      totalSpaceRecovered: info.totalSpaceRecovered,
      averageDurationMs: info.executionCount > 0
        ? Math.round(info.totalDurationMs / info.executionCount)
        : 0,
    }));
  }

  private _buildPerformanceMetrics(records: ExecutionRecord[]): ReportPerformanceMetrics {
    if (records.length === 0) {
      return {
        averageDurationMs: 0,
        longestRunMs: 0,
        longestRunExecutionId: null,
        shortestRunMs: 0,
        shortestRunExecutionId: null,
        averageSpacePerExecution: 0,
      };
    }

    let totalDurationMs = 0;
    let totalSpace = 0;
    let longestRunMs = 0;
    let longestRunId: string | null = null;
    let shortestRunMs = Infinity;
    let shortestRunId: string | null = null;

    for (const r of records) {
      totalDurationMs += r.durationMs;
      totalSpace += r.totalSpaceRecovered;

      if (r.durationMs > longestRunMs) {
        longestRunMs = r.durationMs;
        longestRunId = r.id;
      }
      if (r.durationMs < shortestRunMs) {
        shortestRunMs = r.durationMs;
        shortestRunId = r.id;
      }
    }

    return {
      averageDurationMs: Math.round(totalDurationMs / records.length),
      longestRunMs,
      longestRunExecutionId: longestRunId,
      shortestRunMs: shortestRunMs === Infinity ? 0 : shortestRunMs,
      shortestRunExecutionId: shortestRunId,
      averageSpacePerExecution: Math.round(totalSpace / records.length),
    };
  }

  private _buildRecoveredSpace(records: ExecutionRecord[]): ReportRecoveredSpace {
    let totalBytes = 0;
    let totalFiles = 0;
    let totalFolders = 0;
    let totalRegistryEntries = 0;
    let totalRecycleBinItems = 0;
    let totalTempFiles = 0;
    let totalBrowserData = 0;
    let largestSingleCleanup = 0;
    let largestSingleCleanupId: string | null = null;

    for (const r of records) {
      totalBytes += r.totalSpaceRecovered;
      totalFiles += r.filesRemoved;
      totalFolders += r.foldersRemoved;
      totalRegistryEntries += r.registryEntriesRemoved;
      totalRecycleBinItems += r.recycleBinItemsRemoved;
      totalTempFiles += r.temporaryFilesRemoved;
      totalBrowserData += r.browserDataRemoved;

      if (r.totalSpaceRecovered > largestSingleCleanup) {
        largestSingleCleanup = r.totalSpaceRecovered;
        largestSingleCleanupId = r.id;
      }
    }

    return {
      totalBytes,
      totalFiles,
      totalFolders,
      totalRegistryEntries,
      totalRecycleBinItems,
      totalTempFiles,
      totalBrowserData,
      largestSingleCleanup,
      largestSingleCleanupExecutionId: largestSingleCleanupId,
    };
  }

  private _collectWarnings(records: ExecutionRecord[]): string[] {
    const warnings: string[] = [];
    for (const r of records) {
      warnings.push(...r.warnings);
    }
    return warnings;
  }

  private _collectErrors(records: ExecutionRecord[]): string[] {
    const errors: string[] = [];
    for (const r of records) {
      errors.push(...r.errors);
    }
    return errors;
  }

  private _determineHealth(summary: ReportSummary): ReportHealthStatus {
    if (summary.totalExecutions === 0) return 'unknown';

    const successRate = summary.successRate;
    if (successRate >= 95) return 'excellent';
    if (successRate >= 80) return 'good';
    if (successRate >= 60) return 'fair';
    return 'poor';
  }
}

export const executionReportBuilder = new ExecutionReportBuilderImpl();
