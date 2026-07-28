/**
 * Execution Statistics Service — computes aggregate statistics from execution records.
 *
 * Calculates:
 *   Total Executions, Successful, Failed, Partial, Cancelled
 *   Success Rate
 *   Average Duration, Average Space Recovered
 *   Largest Cleanup, Most Frequently Executed Task
 *   Last Run, Longest Run
 *   Total Files Removed, Total Space Recovered
 */
import type { ExecutionRecord, ExecutionStatistics } from './types';

class ExecutionStatisticsServiceImpl {
  /**
   * Compute statistics from a list of execution records.
   */
  compute(records: ExecutionRecord[]): ExecutionStatistics {
    const totalExecutions = records.length;

    if (totalExecutions === 0) {
      return this._emptyStatistics();
    }

    let successfulExecutions = 0;
    let failedExecutions = 0;
    let partialExecutions = 0;
    let cancelledExecutions = 0;
    let totalDurationMs = 0;
    let totalSpaceRecovered = 0;
    let totalFilesRemoved = 0;
    let largestCleanupBytes = 0;
    let largestCleanupExecutionId: string | null = null;
    let longestRunMs = 0;
    let longestRunExecutionId: string | null = null;
    let lastRunAt: string | null = null;
    let lastRunTime = 0;

    // Task frequency tracking
    const taskCounts = new Map<string, { name: string; count: number }>();

    for (const record of records) {
      switch (record.status) {
        case 'succeeded':
          successfulExecutions++;
          break;
        case 'failed':
          failedExecutions++;
          break;
        case 'partially_completed':
          partialExecutions++;
          break;
        case 'cancelled':
          cancelledExecutions++;
          break;
      }

      totalDurationMs += record.durationMs;
      totalSpaceRecovered += record.totalSpaceRecovered;
      totalFilesRemoved += record.filesRemoved;

      if (record.totalSpaceRecovered > largestCleanupBytes) {
        largestCleanupBytes = record.totalSpaceRecovered;
        largestCleanupExecutionId = record.id;
      }

      if (record.durationMs > longestRunMs) {
        longestRunMs = record.durationMs;
        longestRunExecutionId = record.id;
      }

      const recordTime = new Date(record.startTime).getTime();
      if (recordTime > lastRunTime) {
        lastRunTime = recordTime;
        lastRunAt = record.startTime;
      }

      // Track task frequency
      for (const task of record.taskResults) {
        const existing = taskCounts.get(task.taskId);
        if (existing) {
          existing.count++;
        } else {
          taskCounts.set(task.taskId, { name: task.taskName, count: 1 });
        }
      }
    }

    // Find most frequent task
    let mostFrequentTaskId: string | null = null;
    let mostFrequentTaskName: string | null = null;
    let mostFrequentTaskCount = 0;
    for (const [taskId, info] of taskCounts) {
      if (info.count > mostFrequentTaskCount) {
        mostFrequentTaskId = taskId;
        mostFrequentTaskName = info.name;
        mostFrequentTaskCount = info.count;
      }
    }

    const successRate = totalExecutions > 0
      ? (successfulExecutions / totalExecutions) * 100
      : 0;

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      partialExecutions,
      cancelledExecutions,
      successRate,
      averageDurationMs: totalExecutions > 0 ? Math.round(totalDurationMs / totalExecutions) : 0,
      averageSpaceRecovered: totalExecutions > 0 ? Math.round(totalSpaceRecovered / totalExecutions) : 0,
      largestCleanupBytes,
      largestCleanupExecutionId,
      mostFrequentTaskId,
      mostFrequentTaskName,
      mostFrequentTaskCount,
      lastRunAt,
      longestRunMs,
      longestRunExecutionId,
      totalFilesRemoved,
      totalSpaceRecovered,
    };
  }

  private _emptyStatistics(): ExecutionStatistics {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      partialExecutions: 0,
      cancelledExecutions: 0,
      successRate: 0,
      averageDurationMs: 0,
      averageSpaceRecovered: 0,
      largestCleanupBytes: 0,
      largestCleanupExecutionId: null,
      mostFrequentTaskId: null,
      mostFrequentTaskName: null,
      mostFrequentTaskCount: 0,
      lastRunAt: null,
      longestRunMs: 0,
      longestRunExecutionId: null,
      totalFilesRemoved: 0,
      totalSpaceRecovered: 0,
    };
  }
}

export const executionStatisticsService = new ExecutionStatisticsServiceImpl();
