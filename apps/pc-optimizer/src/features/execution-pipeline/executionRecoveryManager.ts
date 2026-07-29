/**
 * Execution Recovery Manager — handles failure recovery.
 *
 * Supports: graceful failure, resume, retry, rollback trigger,
 * partial completion, failure reports.
 */
import type {
  ExecutionStepResult,
  RecoveryResult,
  RecoveryAction,
  SystemSnapshot,
  ExecutionConfiguration,
} from './types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';
import type { ExecutionSnapshotManager } from './executionSnapshotManager';
import type { ExecutionCoordinator } from './executionCoordinator';

export class ExecutionRecoveryManager {
  private _config: ExecutionConfiguration;
  private _snapshotManager: ExecutionSnapshotManager | null = null;
  private _coordinator: ExecutionCoordinator | null = null;

  constructor(config: ExecutionConfiguration) {
    this._config = config;
  }

  updateConfig(config: ExecutionConfiguration): void {
    this._config = config;
  }

  setSnapshotManager(manager: ExecutionSnapshotManager): void {
    this._snapshotManager = manager;
  }

  setCoordinator(coordinator: ExecutionCoordinator): void {
    this._coordinator = coordinator;
  }

  determineAction(
    failedSteps: ExecutionStepResult[],
    completedSteps: ExecutionStepResult[],
  ): RecoveryAction {
    if (failedSteps.length === 0) return 'skip';

    if (this._config.recoveryRules.rollbackOnFailure && completedSteps.length > 0) {
      return 'rollback';
    }

    if (this._config.recoveryRules.allowPartialCompletion && completedSteps.length > 0) {
      return 'skip';
    }

    return 'abort';
  }

  async rollback(
    executionId: string,
    steps: ExecutionStepResult[],
    snapshot: SystemSnapshot | null,
  ): Promise<RecoveryResult> {
    if (!this._config.featureFlags.enableRollback) {
      return { action: 'rollback', success: false, recoveredSteps: 0, rolledBackSteps: 0, message: 'Rollback disabled' };
    }

    let rolledBack = 0;

    const rollbackable = steps.filter((s) => s.rollbackAvailable && s.status === 'completed');
    for (const step of rollbackable) {
      step.status = 'rolled_back';
      step.rollbackExecuted = true;
      rolledBack++;
    }

    if (snapshot && this._snapshotManager) {
      const restoreSuccess = await this._snapshotManager.restore(snapshot);
      if (!restoreSuccess) {
        return { action: 'rollback', success: false, recoveredSteps: 0, rolledBackSteps: rolledBack, message: 'Snapshot restore failed' };
      }
    }

    return {
      action: 'rollback',
      success: true,
      recoveredSteps: 0,
      rolledBackSteps: rolledBack,
      message: `Rolled back ${rolledBack} steps`,
    };
  }

  async retry(
    executionId: string,
    plan: OptimizationPlanV2,
    failedSteps: ExecutionStepResult[],
    snapshot: SystemSnapshot | null,
  ): Promise<RecoveryResult> {
    if (!this._coordinator) {
      return { action: 'retry', success: false, recoveredSteps: 0, rolledBackSteps: 0, message: 'No coordinator set' };
    }

    const failedStepIds = new Set(failedSteps.map((s) => s.stepId));
    const stepsToRetry = plan.steps.filter((s) => failedStepIds.has(s.id));
    let recovered = 0;

    for (const step of stepsToRetry) {
      try {
        const handler = this._coordinator;
        const result = await handler.executeSteps(executionId, { ...plan, steps: [step], recommendedOrder: [step.id] }, snapshot);
        if (result[0]?.status === 'completed') {
          recovered++;
        }
      } catch {
        // retry failed
      }
    }

    return {
      action: 'retry',
      success: recovered > 0,
      recoveredSteps: recovered,
      rolledBackSteps: 0,
      message: `Retried ${stepsToRetry.length} steps, ${recovered} recovered`,
    };
  }

  generateFailureReport(
    executionId: string,
    stepResults: ExecutionStepResult[],
    errors: string[],
  ): ExecutionFailureReport {
    const failed = stepResults.filter((s) => s.status === 'failed');
    const completed = stepResults.filter((s) => s.status === 'completed');
    const skipped = stepResults.filter((s) => s.status === 'skipped');

    return {
      executionId,
      failedSteps: failed,
      completedSteps: completed,
      skippedSteps: skipped,
      errors,
      totalSteps: stepResults.length,
      failureRate: stepResults.length > 0 ? failed.length / stepResults.length : 0,
      generatedAt: new Date().toISOString(),
    };
  }

  clear(): void {
    this._snapshotManager = null;
    this._coordinator = null;
  }
}

export interface ExecutionFailureReport {
  executionId: string;
  failedSteps: ExecutionStepResult[];
  completedSteps: ExecutionStepResult[];
  skippedSteps: ExecutionStepResult[];
  errors: string[];
  totalSteps: number;
  failureRate: number;
  generatedAt: string;
}
