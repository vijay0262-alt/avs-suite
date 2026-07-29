/**
 * Plan Validator — validates optimization plans.
 *
 * Validates: Recommendation consistency, benefit estimates, risk calculations,
 * step ordering, evidence availability, confidence, rollback support.
 */
import type {
  OptimizationPlanV2,
  PlanValidationResult,
  PlanConfiguration,
} from './types';

export class PlanValidator {
  private _config: PlanConfiguration;

  constructor(config: PlanConfiguration) {
    this._config = config;
  }

  updateConfig(config: PlanConfiguration): void {
    this._config = config;
  }

  validate(plan: OptimizationPlanV2): PlanValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!plan.id || plan.id.trim().length === 0) {
      errors.push('Plan id is required');
    }
    if (!plan.title || plan.title.trim().length === 0) {
      errors.push('Plan title is required');
    }
    if (!plan.description || plan.description.trim().length === 0) {
      warnings.push('Plan description is empty');
    }
    if (plan.steps.length === 0) {
      errors.push('Plan must have at least one step');
    }
    if (plan.steps.length > this._config.maxStepsPerPlan) {
      errors.push(`Plan exceeds max steps (${this._config.maxStepsPerPlan})`);
    }

    // Validate step ordering
    const stepIds = new Set(plan.steps.map((s) => s.id));
    for (const stepId of plan.recommendedOrder) {
      if (!stepIds.has(stepId)) {
        errors.push(`Recommended order references unknown step: ${stepId}`);
      }
    }
    for (const step of plan.steps) {
      if (!plan.recommendedOrder.includes(step.id)) {
        warnings.push(`Step ${step.id} not in recommended order`);
      }
    }

    // Validate confidence
    if (plan.confidenceScore < this._config.minConfidenceThreshold) {
      warnings.push(`Plan confidence ${plan.confidenceScore.toFixed(2)} below threshold ${this._config.minConfidenceThreshold}`);
    }

    // Validate benefit estimates
    if (plan.estimatedHealthGain < 0) {
      errors.push('Health gain cannot be negative');
    }
    if (plan.estimatedDuration < 0) {
      errors.push('Duration cannot be negative');
    }

    // Validate risk
    if (plan.estimatedRisk === 'critical') {
      warnings.push('Plan has critical risk level');
    }

    // Validate rollback
    if (!plan.rollbackAvailable && plan.steps.some((s) => !s.rollbackAvailable)) {
      warnings.push('Some steps do not support rollback');
    }

    // Validate expiry
    const now = new Date();
    const expires = new Date(plan.expiresAt);
    if (expires <= now) {
      warnings.push('Plan has expired');
    }

    // Validate steps
    for (const step of plan.steps) {
      if (!step.id || step.id.trim().length === 0) {
        errors.push('Step id is required');
      }
      if (!step.title || step.title.trim().length === 0) {
        errors.push(`Step title is required for step ${step.id}`);
      }
      if (step.confidence < 0 || step.confidence > 1) {
        warnings.push(`Step ${step.id} confidence out of range [0,1]`);
      }
      if (step.estimatedDuration < 0) {
        warnings.push(`Step ${step.id} has negative duration`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
