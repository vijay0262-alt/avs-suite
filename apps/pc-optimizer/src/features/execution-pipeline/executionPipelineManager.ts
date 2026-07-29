/**
 * Execution Pipeline Manager — top-level orchestrator.
 *
 * Public APIs:
 *   executePlan()
 *   pauseExecution()
 *   resumeExecution()
 *   cancelExecution()
 *   rollbackExecution()
 *   getExecution()
 *   getExecutionHistory()
 *   getExecutionStatistics()
 *
 * Architecture:
 *   Plan → Validation → Snapshot → Confirmation → Coordination →
 *   Verification → Health Refresh → Completion → Report
 */
import type { OptimizationPlanV2 } from '../optimization-planner/types';
import type {
  PipelineExecution,
  ExecutionReport,
  ExecutionStatistics,
  ExecutionConfiguration,
  ExecutionEventType,
  ExecutionEventListener,
  SystemSnapshot,
  StepHandler,
  SnapshotProvider,
  StageHandler,
  ExecutionEvidence,
} from './types';
import { ExecutionEvents } from './executionEvents';
import { ExecutionHistory } from './executionHistory';
import { ExecutionValidator } from './executionValidator';
import { ExecutionSnapshotManager } from './executionSnapshotManager';
import { ExecutionStageManager } from './executionStageManager';
import { ExecutionProgressManager } from './executionProgressManager';
import { ExecutionCoordinator } from './executionCoordinator';
import { ExecutionVerificationManager } from './executionVerificationManager';
import { ExecutionRecoveryManager } from './executionRecoveryManager';
import { ExecutionPipelineBuilder } from './executionPipelineBuilder';
import { createExecutionConfiguration, type DeepPartial, isStageEnabled } from './executionConfiguration';

export class ExecutionPipelineManager {
  private _config: ExecutionConfiguration;
  private _executions: Map<string, PipelineExecution> = new Map();
  private _events: ExecutionEvents;
  private _history: ExecutionHistory;
  private _validator: ExecutionValidator;
  private _snapshotManager: ExecutionSnapshotManager;
  private _stageManager: ExecutionStageManager;
  private _progressManager: ExecutionProgressManager;
  private _coordinator: ExecutionCoordinator;
  private _verificationManager: ExecutionVerificationManager;
  private _recoveryManager: ExecutionRecoveryManager;
  private _builder: ExecutionPipelineBuilder;

  constructor(config?: ExecutionConfiguration | DeepPartial<ExecutionConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as ExecutionConfiguration;
    } else {
      this._config = createExecutionConfiguration(config as DeepPartial<ExecutionConfiguration>);
    }

    this._events = new ExecutionEvents();
    this._history = new ExecutionHistory();
    this._validator = new ExecutionValidator(this._config);
    this._snapshotManager = new ExecutionSnapshotManager(this._config);
    this._stageManager = new ExecutionStageManager(this._config);
    this._progressManager = new ExecutionProgressManager();
    this._coordinator = new ExecutionCoordinator(this._config);
    this._verificationManager = new ExecutionVerificationManager(this._config);
    this._recoveryManager = new ExecutionRecoveryManager(this._config);
    this._builder = new ExecutionPipelineBuilder(this._config);

    this._recoveryManager.setSnapshotManager(this._snapshotManager);
    this._recoveryManager.setCoordinator(this._coordinator);
  }

  // ── Public APIs ─────────────────────────────────────────────

  async executePlan(
    plan: OptimizationPlanV2,
    options?: {
      healthBefore?: number | null;
      skipConfirmation?: boolean;
    },
  ): Promise<PipelineExecution> {
    const execution = this._builder.buildFromPlan(plan, options?.healthBefore ?? null);
    this._executions.set(execution.id, execution);

    if (this._config.enableEvents) {
      this._events.emitStarted(execution.id, { planId: plan.id });
    }
    this._history.record(execution.id, 'started', null, { planId: plan.id });

    // Stage: Plan Validation
    if (isStageEnabled(this._config, 'plan_validation')) {
      execution.status = 'preparing';
      execution.currentStage = 'plan_validation';
      const validation = this._validator.validate(plan);

      if (this._config.enableEvents) {
        this._events.emitValidationCompleted(execution.id, { valid: validation.valid, errors: validation.errors.length });
      }
      this._history.record(execution.id, 'validation_completed', 'plan_validation', { valid: validation.valid });

      if (!validation.valid && this._config.validationRules.abortOnError) {
        execution.status = 'failed';
        execution.failedStages.push('plan_validation');
        execution.errors.push(...validation.errors.map((e) => e.message));
        if (this._config.enableEvents) {
          this._events.emitFailed(execution.id, { errors: execution.errors });
        }
        this._history.record(execution.id, 'failed', 'plan_validation');
        return execution;
      }

      execution.warnings.push(...validation.warnings.map((w) => w.message));
      execution.completedStages.push('plan_validation');
    }

    // Stage: System Snapshot
    let snapshot: SystemSnapshot | null = null;
    if (isStageEnabled(this._config, 'system_snapshot') && this._config.featureFlags.enableSnapshots) {
      execution.currentStage = 'system_snapshot';
      snapshot = await this._snapshotManager.capture(execution.id);
      if (this._config.enableEvents) {
        this._events.emitSnapshotCreated(execution.id, { snapshotId: snapshot.id });
      }
      this._history.record(execution.id, 'snapshot_created', 'system_snapshot', { snapshotId: snapshot.id });
      execution.completedStages.push('system_snapshot');
    }

    // Stage: User Confirmation
    if (isStageEnabled(this._config, 'user_confirmation') && !options?.skipConfirmation && plan.requiresConfirmation) {
      execution.status = 'waiting_for_confirmation';
      execution.currentStage = 'user_confirmation';
      if (this._config.enableEvents) {
        this._events.emitConfirmationRequested(execution.id, { planId: plan.id });
      }
      this._history.record(execution.id, 'confirmation_requested', 'user_confirmation');
    }

    // Stage: Execution Coordination
    if (isStageEnabled(this._config, 'execution_coordination')) {
      execution.status = 'running';
      execution.currentStage = 'execution_coordination';

      this._progressManager.init(execution.id, plan.steps.length);

      const stepResults = await this._coordinator.executeSteps(
        execution.id,
        plan,
        snapshot,
        (result) => {
          if (this._config.enableEvents) {
            this._events.emitStepCompleted(execution.id, { stepId: result.stepId, status: result.status });
          }
          this._history.record(execution.id, 'step_completed', 'execution_coordination', { stepId: result.stepId, status: result.status });
        },
      );

      execution.stepResults = stepResults;
      execution.completedStages.push('execution_coordination');

      // Update progress
      const progress = this._progressManager.getProgress(execution.id);
      if (progress) {
        execution.progress = progress.overallProgress;
        execution.estimatedRemainingTime = progress.estimatedRemainingTime;
        if (this._config.enableEvents) {
          this._events.emitProgress(execution.id, { progress: progress.overallProgress });
        }
      }
    }

    // Stage: Verification
    if (isStageEnabled(this._config, 'verification') && this._config.featureFlags.enableVerification) {
      execution.currentStage = 'verification';
      const verification = this._verificationManager.verify(
        plan,
        execution.stepResults,
        execution.healthBefore,
        execution.healthAfter,
      );
      execution.verificationStatus = verification.verified ? 'verified' : 'failed';

      if (this._config.enableEvents) {
        this._events.emitVerificationCompleted(execution.id, { verified: verification.verified });
      }
      this._history.record(execution.id, 'verification_completed', 'verification', { verified: verification.verified });
      execution.completedStages.push('verification');
    }

    // Stage: Completion
    const hasFailures = execution.stepResults.some((s) => s.status === 'failed');
    if (hasFailures && !this._config.recoveryRules.allowPartialCompletion) {
      execution.status = 'failed';
      execution.failedStages.push('completion');
      if (this._config.enableEvents) {
        this._events.emitFailed(execution.id, { errors: execution.errors });
      }
      this._history.record(execution.id, 'failed', 'completion');
    } else {
      execution.status = hasFailures ? 'recovered' : 'completed';
      execution.completedStages.push('completion');
      if (this._config.enableEvents) {
        this._events.emitCompleted(execution.id, { status: execution.status });
      }
      this._history.record(execution.id, 'completed', 'completion', { status: execution.status });
    }

    execution.completedAt = new Date().toISOString();
    execution.currentStage = null;
    return execution;
  }

  pauseExecution(executionId: string): boolean {
    const execution = this._executions.get(executionId);
    if (!execution) return false;
    if (execution.status !== 'running') return false;
    this._coordinator.pause(executionId);
    execution.status = 'paused';
    this._history.record(executionId, 'paused');
    return true;
  }

  resumeExecution(executionId: string): boolean {
    const execution = this._executions.get(executionId);
    if (!execution) return false;
    if (execution.status !== 'paused') return false;
    this._coordinator.resume(executionId);
    execution.status = 'running';
    this._history.record(executionId, 'resumed');
    return true;
  }

  cancelExecution(executionId: string): boolean {
    const execution = this._executions.get(executionId);
    if (!execution) return false;
    this._coordinator.cancel(executionId);
    execution.status = 'cancelled';
    execution.completedAt = new Date().toISOString();
    this._history.record(executionId, 'cancelled');
    if (this._config.enableEvents) {
      this._events.emitFailed(executionId, { reason: 'cancelled' });
    }
    return true;
  }

  async rollbackExecution(executionId: string): Promise<boolean> {
    const execution = this._executions.get(executionId);
    if (!execution) return false;
    if (!execution.rollbackAvailable) return false;

    execution.status = 'rolling_back';
    if (this._config.enableEvents) {
      this._events.emitRollbackStarted(executionId);
    }
    this._history.record(executionId, 'rollback_started');

    const snapshot = this._snapshotManager.getSnapshotByExecution(executionId) ?? null;
    const result = await this._recoveryManager.rollback(executionId, execution.stepResults, snapshot);

    if (result.success) {
      execution.status = 'recovered';
      if (this._config.enableEvents) {
        this._events.emitRollbackCompleted(executionId, { rolledBackSteps: result.rolledBackSteps });
      }
      this._history.record(executionId, 'rollback_completed', null, { rolledBackSteps: result.rolledBackSteps });
      return true;
    }

    execution.status = 'failed';
    execution.errors.push(result.message);
    if (this._config.enableEvents) {
      this._events.emitRollbackCompleted(executionId, { success: false });
    }
    this._history.record(executionId, 'rollback_completed', null, { success: false });
    return false;
  }

  getExecution(executionId: string): PipelineExecution | undefined {
    return this._executions.get(executionId);
  }

  getExecutionHistory(executionId?: string) {
    if (executionId) return this._history.getByExecution(executionId);
    return this._history.getAll();
  }

  getExecutionStatistics(): ExecutionStatistics {
    const all = Array.from(this._executions.values());
    const byStatus: Record<string, number> = {};
    const byStage: Record<string, number> = {};
    let totalDurationMs = 0;
    let totalProgress = 0;
    let totalCompletedSteps = 0;
    let totalFailedSteps = 0;
    let totalRollbacks = 0;
    let completed = 0;

    for (const exec of all) {
      byStatus[exec.status] = (byStatus[exec.status] ?? 0) + 1;
      for (const stage of exec.completedStages) {
        byStage[stage] = (byStage[stage] ?? 0) + 1;
      }
      totalProgress += exec.progress;
      totalCompletedSteps += exec.stepResults.filter((s) => s.status === 'completed').length;
      totalFailedSteps += exec.stepResults.filter((s) => s.status === 'failed').length;
      totalRollbacks += exec.stepResults.filter((s) => s.rollbackExecuted).length;
      if (exec.status === 'completed' || exec.status === 'recovered') completed++;
      if (exec.startedAt && exec.completedAt) {
        totalDurationMs += new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime();
      }
    }

    const count = all.length || 1;

    return {
      totalExecutions: all.length,
      byStatus,
      byStage,
      averageDurationMs: totalDurationMs / count,
      averageProgress: totalProgress / count,
      totalCompletedSteps,
      totalFailedSteps,
      totalRollbacks,
      successRate: all.length > 0 ? completed / all.length : 0,
    };
  }

  generateReport(executionId: string): ExecutionReport | null {
    const exec = this._executions.get(executionId);
    if (!exec) return null;

    const completed = exec.stepResults.filter((s) => s.status === 'completed');
    const skipped = exec.stepResults.filter((s) => s.status === 'skipped');
    const failed = exec.stepResults.filter((s) => s.status === 'failed');

    const totalDurationMs = exec.stepResults.reduce((sum, s) => sum + s.durationMs, 0);
    const healthDelta = exec.healthBefore !== null && exec.healthAfter !== null
      ? exec.healthAfter - exec.healthBefore
      : null;

    const evidence: ExecutionEvidence[] = completed.map((s) => ({
      source: 'execution_pipeline',
      metric: 'step_completed',
      value: s.stepTitle,
      timestamp: s.completedAt ?? new Date().toISOString(),
    }));

    return {
      executionId: exec.id,
      planId: exec.planId,
      summary: `Execution ${exec.status}: ${completed.length} completed, ${failed.length} failed, ${skipped.length} skipped`,
      completedSteps: completed,
      skippedSteps: skipped,
      failedSteps: failed,
      totalDurationMs,
      healthBefore: exec.healthBefore,
      healthAfter: exec.healthAfter,
      healthDelta,
      storageRecovered: 0,
      performanceImprovement: 0,
      warnings: exec.warnings,
      errors: exec.errors,
      rollbackAvailable: exec.rollbackAvailable,
      evidence,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Registration ────────────────────────────────────────────

  registerStepHandler(handler: StepHandler): boolean {
    return this._coordinator.registerStepHandler(handler);
  }

  registerSnapshotProvider(provider: SnapshotProvider): boolean {
    return this._snapshotManager.registerProvider(provider);
  }

  registerStageHandler(handler: StageHandler): boolean {
    return this._stageManager.registerHandler(handler);
  }

  // ── Events ──────────────────────────────────────────────────

  on(event: ExecutionEventType, listener: ExecutionEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: ExecutionEventType, listener: ExecutionEventListener): void {
    this._events.off(event, listener);
  }

  // ── Configuration ───────────────────────────────────────────

  get config(): ExecutionConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<ExecutionConfiguration>): void {
    this._config = createExecutionConfiguration(overrides);
    this._validator.updateConfig(this._config);
    this._snapshotManager.updateConfig(this._config);
    this._stageManager.updateConfig(this._config);
    this._coordinator.updateConfig(this._config);
    this._verificationManager.updateConfig(this._config);
    this._recoveryManager.updateConfig(this._config);
    this._builder.updateConfig(this._config);
  }

  // ── Utility ─────────────────────────────────────────────────

  get history(): ExecutionHistory {
    return this._history;
  }

  get snapshotManager(): ExecutionSnapshotManager {
    return this._snapshotManager;
  }

  get stageManager(): ExecutionStageManager {
    return this._stageManager;
  }

  get coordinator(): ExecutionCoordinator {
    return this._coordinator;
  }

  clear(): void {
    this._executions.clear();
    this._history.clear();
    this._events.clear();
    this._progressManager.clear();
    this._coordinator.clear();
    this._snapshotManager.clear();
    this._stageManager.clear();
    this._recoveryManager.clear();
  }
}
