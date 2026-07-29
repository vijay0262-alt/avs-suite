/**
 * Prediction Delta Analyzer — analyzes prediction changes after optimization.
 *
 * Determines which predictions were updated, refreshed, or stabilized.
 */
import type {
  PredictionDelta,
} from './types';
import type { PipelineExecution } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';

export class PredictionDeltaAnalyzer {
  analyze(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
    healthDelta: number | null,
  ): PredictionDelta[] {
    const predictions: PredictionDelta[] = [];

    if (healthDelta !== null && healthDelta > 0) {
      predictions.push({
        prediction: 'System Health Forecast',
        status: 'improved',
        detail: `Health trend improved by ${healthDelta} points, stabilizing overall system trajectory`,
        before: execution.healthBefore,
        after: execution.healthAfter,
      });
    }

    if (plan.estimatedStorageRecovery > 0) {
      predictions.push({
        prediction: 'Storage Growth Forecast',
        status: 'stabilized',
        detail: 'Storage growth rate reduced due to cleanup actions',
        before: null,
        after: plan.estimatedStorageRecovery,
      });
    }

    if (plan.estimatedStartupGain > 0) {
      predictions.push({
        prediction: 'Startup Performance Forecast',
        status: 'updated',
        detail: `Startup time projected to decrease by approximately ${plan.estimatedStartupGain} seconds`,
        before: null,
        after: plan.estimatedStartupGain,
      });
    }

    if (plan.estimatedPerformanceGain > 0) {
      predictions.push({
        prediction: 'Performance Forecast',
        status: 'updated',
        detail: `System performance expected to improve by ${plan.estimatedPerformanceGain} points`,
        before: null,
        after: plan.estimatedPerformanceGain,
      });
    }

    if (plan.estimatedPrivacyGain > 0) {
      predictions.push({
        prediction: 'Privacy Forecast',
        status: 'refreshed',
        detail: `Privacy posture improved by ${plan.estimatedPrivacyGain} points`,
        before: null,
        after: plan.estimatedPrivacyGain,
      });
    }

    return predictions;
  }
}
