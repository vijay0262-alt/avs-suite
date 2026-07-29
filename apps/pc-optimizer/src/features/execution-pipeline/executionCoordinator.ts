/**
 * Execution Coordinator — coordinates execution of plan steps.
 *
 * Coordinates existing modules. Does NOT duplicate optimization logic.
 * Supports: sequential execution, parallel execution (where safe),
 * conditional steps, skipped steps, retry, timeout, cancellation.
 */
import type {
  OptimizationPlanV2,
  PlanStep,
} from '../optimization-planner/types';
import type {
  ExecutionStepResult,
  StepHandler,
  StepContext,
  ExecutionConfiguration,
  StepExecutionStatus,
} from './types';

export class ExecutionCoordinator {
  private _stepHandlers: Map<string, StepHandler> = new Map();
  private _config: ExecutionConfiguration;
  private _cancelled: Set<string> = new Set();
  private _paused: Set<string> = new Set();

  constructor(config: ExecutionConfiguration) {
    this._config = config;
  }

  updateConfig(config: ExecutionConfiguration): void {
    this._config = config;
  }

  registerStepHandler(handler: StepHandler): boolean {
    if (this._stepHandlers.has(handler.stepId)) return false;
    this._stepHandlers.set(handler.stepId, handler);
    return true;
  }

  unregisterStepHandler(stepId: string): boolean {
    return this._stepHandlers.delete(stepId);
  }

  cancel(executionId: string): void {
    this._cancelled.add(executionId);
  }

  isCancelled(executionId: string): boolean {
    return this._cancelled.has(executionId);
  }

  pause(executionId: string): void {
    this._paused.add(executionId);
  }

  isPaused(executionId: string): boolean {
    return this._paused.has(executionId);
  }

  resume(executionId: string): void {
    this._paused.delete(executionId);
  }

  clearCancellation(executionId: string): void {
    this._cancelled.delete(executionId);
    this._paused.delete(executionId);
  }

  async executeSteps(
    executionId: string,
    plan: OptimizationPlanV2,
    snapshot: StepContext['snapshot'] | null,
    onStepComplete?: (result: ExecutionStepResult) => void,
  ): Promise<ExecutionStepResult[]> {
    const results: ExecutionStepResult[] = [];
    const orderedSteps = this._getOrderedSteps(plan);

    for (let i = 0; i < orderedSteps.length; i++) {
      if (this.isCancelled(executionId)) {
        for (let j = i; j < orderedSteps.length; j++) {
          results.push(this._createStepResult(orderedSteps[j]!, 'skipped'));
        }
        break;
      }

      while (this.isPaused(executionId)) {
        await this._sleep(100);
        if (this.isCancelled(executionId)) break;
      }

      const step = orderedSteps[i]!;
      const context: StepContext = {
        executionId,
        config: this._config,
        snapshot,
      };

      const result = await this._executeStepWithRetry(step, context);
      results.push(result);
      onStepComplete?.(result);

      if (result.status === 'failed' && !this._config.recoveryRules.allowPartialCompletion) {
        for (let j = i + 1; j < orderedSteps.length; j++) {
          results.push(this._createStepResult(orderedSteps[j]!, 'skipped'));
        }
        break;
      }
    }

    return results;
  }

  async executeParallel(
    executionId: string,
    plan: OptimizationPlanV2,
    snapshot: StepContext['snapshot'] | null,
    onStepComplete?: (result: ExecutionStepResult) => void,
  ): Promise<ExecutionStepResult[]> {
    if (!this._config.featureFlags.enableParallelExecution) {
      return this.executeSteps(executionId, plan, snapshot, onStepComplete);
    }

    const orderedSteps = this._getOrderedSteps(plan);
    const context: StepContext = { executionId, config: this._config, snapshot };

    const promises = orderedSteps.map((step) =>
      this._executeStepWithRetry(step, context).then((result) => {
        onStepComplete?.(result);
        return result;
      }),
    );

    return Promise.all(promises);
  }

  private _getOrderedSteps(plan: OptimizationPlanV2): PlanStep[] {
    const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
    return plan.recommendedOrder
      .map((id) => stepMap.get(id))
      .filter((s): s is PlanStep => s !== undefined);
  }

  private async _executeStepWithRetry(
    step: PlanStep,
    context: StepContext,
  ): Promise<ExecutionStepResult> {
    const maxRetries = this._config.retryRules.maxRetries;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startedAt = new Date().toISOString();
      const startMs = Date.now();

      try {
        const handler = this._stepHandlers.get(step.id);
        if (!handler) {
          return this._createStepResult(step, 'skipped', startedAt, startedAt, 0, `No handler for step ${step.id}`);
        }

        const result = await this._withTimeout(
          handler.execute(step, context),
          this._config.timeoutRules.perStepTimeoutMs,
        );

        return {
          stepId: step.id,
          stepTitle: step.title,
          status: result.success ? 'completed' : 'failed',
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startMs,
          error: result.error ?? null,
          warnings: result.warnings ?? [],
          rollbackAvailable: step.rollbackAvailable,
          rollbackExecuted: false,
          output: result.output,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < maxRetries) {
          await this._sleep(this._config.retryRules.retryDelayMs);
        }
      }
    }

    return this._createStepResult(step, 'failed', new Date().toISOString(), new Date().toISOString(), 0, lastError ?? 'Unknown error');
  }

  private async _withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Step timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  private _createStepResult(
    step: PlanStep,
    status: StepExecutionStatus,
    startedAt: string | null = null,
    completedAt: string | null = null,
    durationMs: number = 0,
    error: string | null = null,
  ): ExecutionStepResult {
    return {
      stepId: step.id,
      stepTitle: step.title,
      status,
      startedAt,
      completedAt,
      durationMs,
      error,
      warnings: [],
      rollbackAvailable: step.rollbackAvailable,
      rollbackExecuted: false,
      output: {},
    };
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  clear(): void {
    this._stepHandlers.clear();
    this._cancelled.clear();
    this._paused.clear();
  }
}
