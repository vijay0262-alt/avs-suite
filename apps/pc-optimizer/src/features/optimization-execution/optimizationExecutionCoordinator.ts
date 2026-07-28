/**
 * Optimization Execution Coordinator — the main orchestrator that
 * coordinates between the Optimization Planner and the Execution Engine.
 *
 * Workflow:
 *   1. Validate the user's selections against the plan
 *   2. Build a MaintenanceJob from selected optimization items
 *   3. Submit the job to the Execution Engine (never bypasses it)
 *   4. Track progress via execution events
 *   5. Collect results and generate an OptimizationResult
 *   6. Log the session to history
 *
 * Safety:
 *   • Never bypasses the Execution Engine
 *   • Never bypasses capability checks
 *   • Never executes locked items
 *   • Respects scheduler state (checks if engine is running)
 *   • Respects execution concurrency protection
 *   • Supports cancellation before the next task begins
 */
import type {
  CoordinatorInput,
  OptimizationSession,
  OptimizationResult,
  ValidationResult,
  ValidationIssue,
} from './types';
import type { MaintenanceJob } from '../maintenance-engine/types';
import type { ExecutionRecord } from '../maintenance-history/types';
import type { CapabilityInfo } from '../config-sync/types';

import { executionEngine } from '../maintenance-engine/executionEngine';
import { jobBuilder } from '../maintenance-engine/jobBuilder';
import { isTaskRegistered } from '../maintenance-engine/tasks';
import { maintenanceHistoryService } from '../maintenance-history/maintenanceHistoryService';

import { sessionManager } from './optimizationSession';
import { progressTracker } from './optimizationProgressTracker';
import { resultBuilder } from './optimizationResultBuilder';
import { optimizationExecutionEvents } from './optimizationExecutionEvents';

export class OptimizationExecutionCoordinator {
  private _isExecuting: boolean = false;
  private _cancelRequested: boolean = false;

  /**
   * Validate the user's selections before execution.
   *
   * Checks:
   *   • Required capabilities are available
   *   • Dependencies are satisfied
   *   • Tasks are registered
   *   • No locked items are selected
   *   • Engine is not already running
   */
  validate(input: CoordinatorInput): ValidationResult {
    const issues: ValidationIssue[] = [];
    const { plan, capabilities, deselectedItemIds } = input;

    // Get selected items (active items not deselected)
    const activeItems = plan.items.filter(
      (i) => !i.isSkipped && !i.isLocked && !deselectedItemIds.includes(i.id),
    );

    if (activeItems.length === 0) {
      issues.push({
        itemId: null,
        severity: 'error',
        message: 'No optimization items selected. Select at least one item to optimize.',
        code: 'NO_ITEMS_SELECTED',
      });
      return { isValid: false, issues };
    }

    // Check each selected item
    for (const item of activeItems) {
      // Check capability
      if (item.requiredCapability) {
        const isAvailable = capabilities.available.some(
          (c: CapabilityInfo) => c.id === item.requiredCapability,
        );
        if (!isAvailable) {
          issues.push({
            itemId: item.id,
            severity: 'error',
            message: `Required capability "${item.requiredCapability}" is not available.`,
            code: 'CAPABILITY_UNAVAILABLE',
          });
        }
      }

      // Check task registration
      if (item.requiredTask && !isTaskRegistered(item.requiredTask)) {
        issues.push({
          itemId: item.id,
          severity: 'error',
          message: `Task "${item.requiredTask}" is not registered in the task registry.`,
          code: 'TASK_NOT_REGISTERED',
        });
      }

      // Check dependencies
      for (const depId of item.dependencies) {
        if (!deselectedItemIds.includes(depId)) {
          // Dependency is included — OK
          continue;
        }
        // Dependency was deselected
        issues.push({
          itemId: item.id,
          severity: 'warning',
          message: `Dependency "${depId}" was deselected. This item may not work correctly.`,
          code: 'DEPENDENCY_DESELECTED',
        });
      }
    }

    // Check if engine is already running
    if (executionEngine.isRunning) {
      issues.push({
        itemId: null,
        severity: 'error',
        message: 'Execution engine is already running. Wait for the current job to finish.',
        code: 'ENGINE_BUSY',
      });
    }

    // Check for locked items that were somehow selected
    const lockedSelected = plan.items.filter(
      (i) => i.isLocked && !deselectedItemIds.includes(i.id),
    );
    for (const item of lockedSelected) {
      issues.push({
        itemId: item.id,
        severity: 'error',
        message: `Cannot execute locked item: ${item.lockedReason ?? 'capability unavailable'}`,
        code: 'LOCKED_ITEM_SELECTED',
      });
    }

    const hasErrors = issues.some((i) => i.severity === 'error');
    return { isValid: !hasErrors, issues };
  }

  /**
   * Execute an optimization plan with user selections.
   *
   * This is the main entry point for one-click smart optimize.
   *
   * @param input - Plan, capabilities, deselected items, health report
   * @returns The optimization result
   */
  async execute(input: CoordinatorInput): Promise<OptimizationResult> {
    if (this._isExecuting) {
      throw new Error('An optimization is already in progress.');
    }

    this._isExecuting = true;
    this._cancelRequested = false;

    try {
      // 1. Validate
      const validation = this.validate(input);
      if (!validation.isValid) {
        const errorMessages = validation.issues
          .filter((i) => i.severity === 'error')
          .map((i) => i.message)
          .join('; ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }

      // 2. Get selected items
      const activeItems = input.plan.items.filter(
        (i) => !i.isSkipped && !i.isLocked && !input.deselectedItemIds.includes(i.id),
      );
      const selectedItemIds = activeItems.map((i) => i.id);
      const skippedItemIds = input.plan.items
        .filter((i) => input.deselectedItemIds.includes(i.id) || i.isSkipped)
        .map((i) => i.id);

      // 3. Create session
      const session = sessionManager.create(
        input.plan.planId,
        input.plan.sourceReportId,
        input.plan.currentHealthScore,
        selectedItemIds,
        input.deselectedItemIds,
      );
      sessionManager.setValidationIssues(validation.issues);
      sessionManager.setStatus('validating');

      // 4. Build task IDs from selected items
      const taskIds = activeItems
        .map((i) => i.requiredTask)
        .filter((t): t is string => t !== null);

      const taskNames = new Map<string, string>();
      for (const item of activeItems) {
        if (item.requiredTask) {
          taskNames.set(item.requiredTask, item.title);
        }
      }

      if (taskIds.length === 0) {
        throw new Error('No executable tasks found in selected items.');
      }

      // 5. Build MaintenanceJob via the existing job builder
      const job: MaintenanceJob = jobBuilder.fromManual(taskIds, 'ai_recommended', 'Smart Optimize');

      // 6. Submit to execution engine
      sessionManager.setStatus('running');

      // Start progress tracking
      progressTracker.start(session.sessionId, taskIds, taskNames);

      // Emit started event
      optimizationExecutionEvents.emit('optimization_started', {
        sessionId: session.sessionId,
        planId: input.plan.planId,
        taskIds,
      });

      const executionResult = await executionEngine.executeJob(job);

      // Stop progress tracking
      progressTracker.stop();

      // 7. Check for cancellation
      if (this._cancelRequested) {
        sessionManager.cancel('User cancelled the optimization.');
        optimizationExecutionEvents.emit('optimization_cancelled', {
          sessionId: session.sessionId,
          reason: 'User cancelled',
        });

        // Build a cancelled result
        const cancelledResult: OptimizationResult = {
          sessionId: session.sessionId,
          executionId: executionResult?.executionId ?? 'cancelled',
          previousHealthScore: input.plan.currentHealthScore,
          newHealthScore: null,
          healthImprovement: null,
          tasksCompleted: executionResult?.taskResults.length ?? 0,
          tasksSkipped: taskIds.length - (executionResult?.taskResults.length ?? 0),
          storageRecovered: executionResult?.totalBytesRecovered ?? 0,
          filesCleaned: executionResult?.totalFilesCleaned ?? 0,
          durationMs: executionResult?.durationMs ?? 0,
          warnings: executionResult?.warnings ?? [],
          errors: [],
          recommendations: ['Optimization was cancelled. You can restart it anytime.'],
          itemResults: [],
          executionRecord: null,
          status: 'cancelled',
        };
        sessionManager.complete(cancelledResult);
        return cancelledResult;
      }

      // 8. Check if engine rejected the job (already running, etc.)
      if (executionResult === null) {
        throw new Error('Execution engine rejected the job.');
      }

      // 9. Log to maintenance history
      let executionRecord: ExecutionRecord | null = null;
      try {
        executionRecord = maintenanceHistoryService.logExecution(executionResult, job.id);
      } catch {
        // History logging is non-fatal
      }

      // 10. Build optimization result
      const result = resultBuilder.build(
        session.sessionId,
        input.plan,
        executionResult,
        taskIds,
        skippedItemIds,
        false,
        executionRecord,
        null, // newHealthScore — caller can set this after re-analysis
      );

      sessionManager.complete(result);

      // Emit completion event
      if (result.status === 'failed') {
        optimizationExecutionEvents.emit('optimization_failed', {
          sessionId: session.sessionId,
          error: result.errors.join('; ') || 'Execution failed',
        });
      } else {
        optimizationExecutionEvents.emit('optimization_completed', {
          sessionId: session.sessionId,
          result,
        });
      }

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      sessionManager.fail(errorMsg);
      optimizationExecutionEvents.emit('optimization_failed', {
        sessionId: sessionManager.get()?.sessionId ?? 'unknown',
        error: errorMsg,
      });
      throw err;
    } finally {
      this._isExecuting = false;
      this._cancelRequested = false;
      progressTracker.stop();
    }
  }

  /**
   * Request cancellation of the current optimization.
   *
   * Cancellation takes effect before the next task begins.
   * The currently running task will complete before cancellation is applied.
   */
  cancel(): void {
    if (!this._isExecuting) return;
    this._cancelRequested = true;
    progressTracker.cancel();
  }

  /**
   * Check if an optimization is currently in progress.
   */
  get isExecuting(): boolean {
    return this._isExecuting;
  }

  /**
   * Get the current session.
   */
  getSession(): OptimizationSession | null {
    return sessionManager.get();
  }

  /**
   * Update the result with a new health score after re-analysis.
   *
   * @param result - The optimization result to update
   * @param newHealthScore - The new health score from re-analysis
   * @returns Updated result
   */
  updateHealthScore(result: OptimizationResult, newHealthScore: number): OptimizationResult {
    return {
      ...result,
      newHealthScore,
      healthImprovement: newHealthScore - result.previousHealthScore,
    };
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this._isExecuting = false;
    this._cancelRequested = false;
    sessionManager.clear();
    progressTracker.stop();
  }
}

/**
 * Default singleton instance.
 */
export const optimizationCoordinator = new OptimizationExecutionCoordinator();
