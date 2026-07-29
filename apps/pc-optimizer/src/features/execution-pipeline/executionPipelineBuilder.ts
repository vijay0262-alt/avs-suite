/**
 * Execution Pipeline Builder — creates pipeline execution objects from plans.
 *
 * Converts an OptimizationPlanV2 into a PipelineExecution ready for the
 * pipeline to process.
 */
import type { OptimizationPlanV2 } from '../optimization-planner/types';
import type {
  PipelineExecution,
  ExecutionConfiguration,
} from './types';
import { generateExecutionId } from './types';

export class ExecutionPipelineBuilder {
  private _config: ExecutionConfiguration;

  constructor(config: ExecutionConfiguration) {
    this._config = config;
  }

  updateConfig(config: ExecutionConfiguration): void {
    this._config = config;
  }

  build(plan: OptimizationPlanV2): PipelineExecution {
    const now = new Date().toISOString();
    return {
      id: generateExecutionId(),
      planId: plan.id,
      status: 'pending',
      startedAt: now,
      completedAt: null,
      currentStage: null,
      completedStages: [],
      failedStages: [],
      progress: 0,
      estimatedRemainingTime: plan.estimatedDuration,
      rollbackAvailable: plan.rollbackAvailable,
      verificationStatus: 'pending',
      healthBefore: null,
      healthAfter: null,
      stepResults: [],
      errors: [],
      warnings: [],
      executionMetadata: {
        planType: plan.planType,
        planTitle: plan.title,
        stepCount: plan.steps.length,
      },
      futureMetadata: {},
    };
  }

  buildFromPlan(plan: OptimizationPlanV2, healthBefore: number | null = null): PipelineExecution {
    const execution = this.build(plan);
    execution.healthBefore = healthBefore;
    return execution;
  }
}
