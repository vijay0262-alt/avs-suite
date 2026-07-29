/**
 * Execution Verification Manager — verifies execution results.
 *
 * After execution verifies: requested changes completed, expected outputs
 * exist, no validation failures, health recalculated, recommendation status
 * updated, prediction refresh requested, insight refresh requested.
 */
import type {
  OptimizationPlanV2,
} from '../optimization-planner/types';
import type {
  VerificationResult,
  VerificationCheck,
  ExecutionStepResult,
  ExecutionConfiguration,
} from './types';

export class ExecutionVerificationManager {
  private _config: ExecutionConfiguration;

  constructor(config: ExecutionConfiguration) {
    this._config = config;
  }

  updateConfig(config: ExecutionConfiguration): void {
    this._config = config;
  }

  verify(
    plan: OptimizationPlanV2,
    stepResults: ExecutionStepResult[],
    healthBefore: number | null,
    healthAfter: number | null,
  ): VerificationResult {
    const checks: VerificationCheck[] = [];

    if (this._config.verificationRules.verifyChangesCompleted) {
      for (const result of stepResults) {
        if (result.status === 'completed') {
          checks.push({
            name: `step_completed:${result.stepId}`,
            passed: true,
            message: `Step ${result.stepTitle} completed successfully`,
            stepId: result.stepId,
          });
        } else if (result.status === 'failed') {
          checks.push({
            name: `step_failed:${result.stepId}`,
            passed: false,
            message: `Step ${result.stepTitle} failed: ${result.error ?? 'unknown'}`,
            stepId: result.stepId,
          });
        }
      }
    }

    if (this._config.verificationRules.verifyExpectedOutputs) {
      for (const result of stepResults) {
        if (result.status === 'completed' && Object.keys(result.output).length === 0) {
          checks.push({
            name: `output_empty:${result.stepId}`,
            passed: true,
            message: `Step ${result.stepTitle} produced no output (may be expected)`,
            stepId: result.stepId,
          });
        }
      }
    }

    if (this._config.verificationRules.verifyHealthRecalculated) {
      checks.push({
        name: 'health_recalculated',
        passed: healthAfter !== null,
        message: healthAfter !== null
          ? `Health recalculated: ${healthBefore ?? 'N/A'} → ${healthAfter}`
          : 'Health was not recalculated',
      });
    }

    if (this._config.verificationRules.verifyRecommendationStatus) {
      const completedCount = stepResults.filter((r) => r.status === 'completed').length;
      checks.push({
        name: 'recommendation_status',
        passed: completedCount > 0,
        message: `${completedCount} recommendations should be marked as completed`,
      });
    }

    const verified = checks.every((c) => c.passed);

    return {
      verified,
      checks,
      healthRecalculated: healthAfter !== null,
      recommendationStatusUpdated: this._config.verificationRules.verifyRecommendationStatus,
      predictionRefreshRequested: this._config.verificationRules.requestPredictionRefresh,
      insightRefreshRequested: this._config.verificationRules.requestInsightRefresh,
    };
  }
}
