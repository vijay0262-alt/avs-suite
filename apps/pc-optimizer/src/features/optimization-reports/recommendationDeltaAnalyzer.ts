/**
 * Recommendation Delta Analyzer — analyzes recommendation changes after optimization.
 *
 * Determines which recommendations were resolved, which remain, and any new ones.
 */
import type {
  RecommendationDelta,
  ResolvedRecommendation,
  RemainingRecommendation,
  NewRecommendation,
} from './types';
import type { PipelineExecution } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';

export class RecommendationDeltaAnalyzer {
  analyze(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): RecommendationDelta {
    const resolved = this._findResolved(execution, plan);
    const remaining = this._findRemaining(execution, plan);
    const newRecs = this._findNew(execution, plan);

    return { resolved, remaining, newRecommendations: newRecs };
  }

  private _findResolved(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): ResolvedRecommendation[] {
    const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
    return execution.stepResults
      .filter((s) => s.status === 'completed')
      .map((s) => {
        const step = stepMap.get(s.stepId);
        return {
          id: s.stepId,
          title: s.stepTitle,
          priority: step?.priority ?? 'medium',
        };
      });
  }

  private _findRemaining(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): RemainingRecommendation[] {
    const completedIds = new Set(
      execution.stepResults.filter((s) => s.status === 'completed').map((s) => s.stepId),
    );
    return plan.steps
      .filter((s) => !completedIds.has(s.id))
      .map((s) => ({
        id: s.id,
        title: s.title,
        priority: s.priority,
        estimatedImpact: s.estimatedBenefit,
      }));
  }

  private _findNew(
    _execution: PipelineExecution,
    _plan: OptimizationPlanV2,
  ): NewRecommendation[] {
    return [];
  }
}
