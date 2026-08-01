/**
 * OptimizationExecutionCoordinator — coordinates execution of approved
 * optimization actions.
 *
 * Integrates with existing execution infrastructure. Never bypasses safety
 * checks. Never duplicates rollback logic. Reuses existing pipeline.
 *
 * This coordinator manages the approval gate, execution order, progress
 * tracking, and report generation. Actual optimization work is delegated
 * to existing modules via the execution handler interface.
 */
import type {
  OptimizationPlan,
  OptimizationAction,
  ExecutionResult,
  OptimizationReport,
  OptimizationSummary,
  BeforeAfterComparison,
  SystemStateSnapshot,
  OptimizationConfiguration,
} from './types';
import { optimizationEventBus } from './OptimizationEvents';
import { OptimizationApprovalManager } from './OptimizationApprovalManager';
import { OptimizationRollbackPlanner } from './OptimizationRollbackPlanner';
import type { OptimizationHistory } from './OptimizationHistory';

export interface ExecutionHandler {
  executeAction(action: OptimizationAction): Promise<ExecutionResult>;
  rollbackAction(action: OptimizationAction): Promise<boolean>;
}

export class OptimizationExecutionCoordinator {
  private approvalManager: OptimizationApprovalManager;
  private rollbackPlanner: OptimizationRollbackPlanner;
  private currentExecution: Map<string, ExecutionState> = new Map();

  constructor(
    private config: OptimizationConfiguration,
    private history: OptimizationHistory,
    private handler?: ExecutionHandler,
  ) {
    this.approvalManager = new OptimizationApprovalManager(config.autoApproveLowRisk);
    this.rollbackPlanner = new OptimizationRollbackPlanner();
  }

  setHandler(handler: ExecutionHandler): void {
    this.handler = handler;
  }

  async executePlan(plan: OptimizationPlan): Promise<OptimizationReport> {
    if (!this.handler) {
      throw new Error('No execution handler set');
    }

    optimizationEventBus.emitExecutionStarted(plan.id);

    // Request approvals
    const approvalRequests = this.approvalManager.requestApprovals(plan);
    if (approvalRequests.length > 0) {
      // In a real UI, this would wait for user input
      // For now, only auto-approved actions proceed
    }

    const results: ExecutionResult[] = [];
    const executedAt = Date.now();

    for (const actionId of plan.executionOrder) {
      const action = plan.actions.find((a) => a.id === actionId);
      if (!action) continue;

      if (this.approvalManager.isRejected(actionId)) {
        results.push(this.createSkippedResult(action, 'Action was rejected by user'));
        continue;
      }

      if (!this.approvalManager.isApproved(actionId)) {
        results.push(this.createSkippedResult(action, 'Action was not approved'));
        continue;
      }

      optimizationEventBus.emitActionExecuting(actionId, plan.id);

      try {
        const result = await this.handler.executeAction(action);
        results.push(result);

        if (result.status === 'completed') {
          optimizationEventBus.emitActionCompleted(actionId, plan.id, result.durationMs);
        } else if (result.status === 'failed') {
          optimizationEventBus.emitActionFailed(actionId, plan.id, result.error ?? 'Unknown error');
        }
      } catch (error) {
        const failedResult: ExecutionResult = {
          actionId,
          actionTitle: action.title,
          status: 'failed',
          startedAt: Date.now(),
          completedAt: Date.now(),
          durationMs: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
          warnings: [],
          rollbackAvailable: action.rollbackAvailable,
          rollbackExecuted: false,
          output: {},
        };
        results.push(failedResult);
        optimizationEventBus.emitActionFailed(actionId, plan.id, failedResult.error ?? 'Unknown error');
      }
    }

    const completedAt = Date.now();
    const successCount = results.filter((r) => r.status === 'completed').length;
    const failureCount = results.filter((r) => r.status === 'failed').length;
    const skippedCount = results.filter((r) => r.status === 'skipped').length;

    optimizationEventBus.emitExecutionCompleted(plan.id, successCount, failureCount);

    const summary = this.buildSummary(plan, results, successCount, failureCount, skippedCount);
    const beforeAfter = this.buildBeforeAfter(plan, results);

    const report: OptimizationReport = {
      planId: plan.id,
      executedAt,
      completedAt,
      totalDurationMs: completedAt - executedAt,
      results,
      summary,
      beforeAfter,
      rollbackAvailable: plan.rollbackAvailable,
      successCount,
      failureCount,
      skippedCount,
    };

    this.history.addReport(report);
    return report;
  }

  async rollbackAction(action: OptimizationAction, planId: string): Promise<boolean> {
    if (!this.handler || !action.rollbackAvailable) return false;

    optimizationEventBus.emitRollbackStarted(action.id, planId);
    const success = await this.handler.rollbackAction(action);

    if (success) {
      optimizationEventBus.emitRollbackCompleted(action.id, planId);
    }
    return success;
  }

  getApprovalManager(): OptimizationApprovalManager {
    return this.approvalManager;
  }

  private createSkippedResult(action: OptimizationAction, reason: string): ExecutionResult {
    return {
      actionId: action.id,
      actionTitle: action.title,
      status: 'skipped',
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 0,
      error: null,
      warnings: [reason],
      rollbackAvailable: false,
      rollbackExecuted: false,
      output: {},
    };
  }

  private buildSummary(
    plan: OptimizationPlan,
    results: ExecutionResult[],
    successCount: number,
    failureCount: number,
    skippedCount: number,
  ): OptimizationSummary {
    const completedActions = results.filter((r) => r.status === 'completed');
    const storageRecovered = completedActions.reduce((sum, r) => {
      const storageVal = r.output?.storageRecoveredMB;
      return sum + (typeof storageVal === 'number' ? storageVal : 0);
    }, 0);
    const ramRecovered = completedActions.reduce((sum, r) => {
      const ramVal = r.output?.ramRecoveredMB;
      return sum + (typeof ramVal === 'number' ? ramVal : 0);
    }, 0);

    return {
      headline: `${successCount} of ${results.length} actions completed successfully.`,
      actionsPerformed: successCount,
      actionsFailed: failureCount,
      actionsSkipped: skippedCount,
      healthScoreBefore: plan.currentHealthScore,
      healthScoreAfter: plan.predictedHealthScore,
      healthScoreChange: plan.estimatedHealthScoreGain,
      storageRecoveredMB: storageRecovered,
      ramRecoveredMB: ramRecovered,
      startupImprovementMs: plan.totalBenefits.startupImprovementMs,
      browserImprovement: plan.totalBenefits.performanceImprovement,
      privacyImprovement: plan.totalBenefits.privacyImprovement,
      rollbackAvailable: plan.rollbackAvailable,
      nextRecommendedAction: failureCount > 0 ? 'Review failed actions and retry' : null,
    };
  }

  private buildBeforeAfter(plan: OptimizationPlan, _results: ExecutionResult[]): BeforeAfterComparison {
    const before: SystemStateSnapshot = {
      healthScore: plan.currentHealthScore,
      cpuUsagePercent: 0,
      memoryUsageMB: 0,
      diskFreeSpaceMB: 0,
      startupTimeSeconds: 0,
      browserResponsiveness: 0,
      privacyScore: 0,
      thermalScore: 0,
      batteryEstimateHours: 0,
      stabilityScore: 0,
      timestamp: plan.generatedAt,
    };

    const after: SystemStateSnapshot = {
      ...before,
      healthScore: plan.predictedHealthScore,
      diskFreeSpaceMB: plan.totalBenefits.storageRecoveryMB,
      memoryUsageMB: -plan.totalBenefits.ramRecoveryMB,
      startupTimeSeconds: -plan.totalBenefits.startupImprovementMs / 1000,
      privacyScore: plan.totalBenefits.privacyImprovement,
      timestamp: Date.now(),
    };

    return this.history.createBeforeAfter(before, after);
  }
}

type ExecutionState = 'pending' | 'running' | 'completed' | 'failed';
