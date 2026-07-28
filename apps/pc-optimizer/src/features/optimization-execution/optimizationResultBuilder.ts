/**
 * Optimization Result Builder — converts an ExecutionResult from
 * the execution engine into a user-facing OptimizationResult.
 *
 * The result builder:
 *   1. Maps task results back to optimization items
 *   2. Computes aggregate metrics (storage, files, duration)
 *   3. Generates recommendations for next steps
 *   4. Optionally links the execution record from history
 *
 * The result builder does NOT modify any engine or history state.
 */
import type {
  OptimizationResult,
  ItemResult,
} from './types';
import type { OptimizationPlan } from '../optimization-planner/types';
import type { ExecutionResult, TaskResult } from '../maintenance-engine/types';
import type { ExecutionRecord } from '../maintenance-history/types';

/**
 * Map task results to item results using the plan's item→task mapping.
 */
function mapItemResults(
  plan: OptimizationPlan,
  executedTaskIds: string[],
  taskResults: TaskResult[],
  skippedItemIds: string[],
): ItemResult[] {
  const results: ItemResult[] = [];

  // Map task results to items
  for (const item of plan.items) {
    if (!executedTaskIds.includes(item.requiredTask ?? '')) {
      // Check if this item was skipped
      if (skippedItemIds.includes(item.id)) {
        results.push({
          itemId: item.id,
          taskId: item.requiredTask ?? '',
          taskName: item.title,
          status: 'skipped',
          bytesRecovered: 0,
          filesCleaned: 0,
          durationMs: 0,
          warnings: [],
          errors: [],
        });
      }
      continue;
    }

    // Find the matching task result
    const taskResult = taskResults.find(
      (tr) => tr.taskId === item.requiredTask || tr.taskName.toLowerCase().includes(item.category),
    );

    if (taskResult) {
      results.push({
        itemId: item.id,
        taskId: taskResult.taskId,
        taskName: taskResult.taskName,
        status: taskResult.status === 'failed' ? 'failed' : 'completed',
        bytesRecovered: taskResult.bytesRecovered,
        filesCleaned: taskResult.filesCleaned,
        durationMs: taskResult.durationMs,
        warnings: [...taskResult.warnings],
        errors: [...taskResult.errors],
      });
    } else {
      results.push({
        itemId: item.id,
        taskId: item.requiredTask ?? '',
        taskName: item.title,
        status: 'skipped',
        bytesRecovered: 0,
        filesCleaned: 0,
        durationMs: 0,
        warnings: [],
        errors: ['Task was not found in execution results'],
      });
    }
  }

  return results;
}

/**
 * Generate recommendations based on the optimization result.
 */
function generateRecommendations(
  result: ExecutionResult,
  itemResults: ItemResult[],
  plan: OptimizationPlan,
): string[] {
  const recommendations: string[] = [];

  const failedItems = itemResults.filter((r) => r.status === 'failed');
  if (failedItems.length > 0) {
    recommendations.push(
      `${failedItems.length} task(s) failed. Consider retrying or checking system permissions.`,
    );
  }

  const skippedItems = itemResults.filter((r) => r.status === 'skipped');
  if (skippedItems.length > 0) {
    recommendations.push(
      `${skippedItems.length} optimization(s) were skipped. You can run them separately later.`,
    );
  }

  // Check if there are locked items that could improve score further
  const lockedItems = plan.items.filter((i) => i.isLocked);
  if (lockedItems.length > 0) {
    recommendations.push(
      `${lockedItems.length} optimization(s) are locked behind a premium capability. Upgrade to unlock them.`,
    );
  }

  // If storage recovery is significant, suggest regular cleanup
  if (result.totalBytesRecovered > 100 * 1024 * 1024) {
    recommendations.push(
      'Significant space recovered. Consider scheduling regular cleanups to maintain performance.',
    );
  }

  // If no failures and good recovery
  if (failedItems.length === 0 && result.totalBytesRecovered > 0) {
    recommendations.push('Optimization completed successfully. Your PC health should improve.');
  }

  // Suggest re-analysis
  recommendations.push('Run a new health analysis to see your updated health score.');

  return recommendations;
}

/**
 * Determine the overall status from the execution result.
 */
function determineStatus(
  result: ExecutionResult,
  wasCancelled: boolean,
): 'completed' | 'failed' | 'partial' | 'cancelled' {
  if (wasCancelled) return 'cancelled';

  const hasFailures = result.taskResults.some((r) => r.status === 'failed');
  const allFailed = result.taskResults.length > 0 && result.taskResults.every((r) => r.status === 'failed');

  if (allFailed) return 'failed';
  if (hasFailures) return 'partial';
  return 'completed';
}

// ── Result Builder ────────────────────────────────────────────

export const resultBuilder = {
  /**
   * Build an OptimizationResult from an ExecutionResult.
   *
   * @param session - The optimization session
   * @param plan - The source optimization plan
   * @param executionResult - The result from the execution engine
   * @param executedTaskIds - Task IDs that were submitted
   * @param skippedItemIds - Item IDs that were skipped/deselected
   * @param wasCancelled - Whether the session was cancelled
   * @param executionRecord - Optional execution record from history
   * @param newHealthScore - Optional new health score from re-analysis
   */
  build(
    sessionId: string,
    plan: OptimizationPlan,
    executionResult: ExecutionResult,
    executedTaskIds: string[],
    skippedItemIds: string[],
    wasCancelled: boolean,
    executionRecord: ExecutionRecord | null,
    newHealthScore: number | null,
  ): OptimizationResult {
    const itemResults = mapItemResults(
      plan,
      executedTaskIds,
      executionResult.taskResults,
      skippedItemIds,
    );

    const tasksCompleted = itemResults.filter((r) => r.status === 'completed').length;
    const tasksSkipped = itemResults.filter((r) => r.status === 'skipped').length;
    const status = determineStatus(executionResult, wasCancelled);

    const previousHealthScore = plan.currentHealthScore;
    const healthImprovement = newHealthScore !== null
      ? newHealthScore - previousHealthScore
      : null;

    return {
      sessionId,
      executionId: executionResult.executionId,
      previousHealthScore,
      newHealthScore,
      healthImprovement,
      tasksCompleted,
      tasksSkipped,
      storageRecovered: executionResult.totalBytesRecovered,
      filesCleaned: executionResult.totalFilesCleaned,
      durationMs: executionResult.durationMs,
      warnings: [...executionResult.warnings],
      errors: [...executionResult.errors],
      recommendations: generateRecommendations(executionResult, itemResults, plan),
      itemResults,
      executionRecord,
      status,
    };
  },
};
