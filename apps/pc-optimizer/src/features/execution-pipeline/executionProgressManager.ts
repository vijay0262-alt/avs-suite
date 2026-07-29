/**
 * Execution Progress Manager — tracks execution progress.
 *
 * Tracks: overall progress, current step, completed steps,
 * estimated remaining time, errors, warnings, skipped tasks,
 * rollback availability.
 */
import type {
  ExecutionProgress,
  ExecutionStepResult,
  PipelineExecution,
} from './types';
import type { PlanStep } from '../optimization-planner/types';

export class ExecutionProgressManager {
  private _progress: Map<string, ExecutionProgress> = new Map();

  init(executionId: string, totalSteps: number): ExecutionProgress {
    const progress: ExecutionProgress = {
      executionId,
      overallProgress: 0,
      currentStepId: null,
      currentStepTitle: null,
      completedSteps: 0,
      totalSteps,
      failedSteps: 0,
      skippedSteps: 0,
      estimatedRemainingTime: 0,
      errors: [],
      warnings: [],
      rollbackAvailable: true,
      updatedAt: new Date().toISOString(),
    };
    this._progress.set(executionId, progress);
    return progress;
  }

  updateStep(
    executionId: string,
    step: PlanStep,
    stepResult: ExecutionStepResult,
    remainingSteps: PlanStep[],
  ): ExecutionProgress | null {
    const progress = this._progress.get(executionId);
    if (!progress) return null;

    if (stepResult.status === 'completed') {
      progress.completedSteps++;
    } else if (stepResult.status === 'failed') {
      progress.failedSteps++;
      if (stepResult.error) progress.errors.push(stepResult.error);
    } else if (stepResult.status === 'skipped') {
      progress.skippedSteps++;
    }

    if (!stepResult.rollbackAvailable) {
      progress.rollbackAvailable = false;
    }

    for (const w of stepResult.warnings) {
      progress.warnings.push(w);
    }

    progress.overallProgress = Math.round(
      ((progress.completedSteps + progress.failedSteps + progress.skippedSteps) / progress.totalSteps) * 100,
    );

    progress.estimatedRemainingTime = remainingSteps.reduce((sum, s) => sum + s.estimatedDuration, 0);

    progress.updatedAt = new Date().toISOString();
    return progress;
  }

  setCurrentStep(executionId: string, step: PlanStep): void {
    const progress = this._progress.get(executionId);
    if (progress) {
      progress.currentStepId = step.id;
      progress.currentStepTitle = step.title;
      progress.updatedAt = new Date().toISOString();
    }
  }

  getProgress(executionId: string): ExecutionProgress | null {
    return this._progress.get(executionId) ?? null;
  }

  remove(executionId: string): void {
    this._progress.delete(executionId);
  }

  clear(): void {
    this._progress.clear();
  }

  static computeOverallProgress(execution: PipelineExecution): number {
    if (execution.stepResults.length === 0) return 0;
    const total = execution.stepResults.length;
    const done = execution.stepResults.filter(
      (s) => s.status === 'completed' || s.status === 'failed' || s.status === 'skipped',
    ).length;
    return Math.round((done / total) * 100);
  }
}
