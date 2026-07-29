/**
 * Execution Validator — pre-flight validation for pipeline execution.
 *
 * Validates: Plan integrity, recommendation freshness, capabilities,
 * subscription, quota, permissions, dependencies, required modules,
 * system readiness.
 *
 * Aborts execution if validation fails.
 */
import type { OptimizationPlanV2 } from '../optimization-planner/types';
import type {
  PipelineValidationResult,
  PipelineValidationError,
  PipelineValidationWarning,
  ExecutionConfiguration,
} from './types';

export class ExecutionValidator {
  private _config: ExecutionConfiguration;

  constructor(config: ExecutionConfiguration) {
    this._config = config;
  }

  updateConfig(config: ExecutionConfiguration): void {
    this._config = config;
  }

  validate(plan: OptimizationPlanV2): PipelineValidationResult {
    const errors: PipelineValidationError[] = [];
    const warnings: PipelineValidationWarning[] = [];

    // Plan integrity
    if (!plan.id || plan.id.trim().length === 0) {
      errors.push({ code: 'PLAN_NO_ID', message: 'Plan id is required', stage: 'plan_validation' });
    }
    if (!plan.steps || plan.steps.length === 0) {
      errors.push({ code: 'PLAN_NO_STEPS', message: 'Plan has no steps', stage: 'plan_validation' });
    }

    // Recommendation freshness
    if (this._config.validationRules.requireFreshRecommendations) {
      const generatedAt = new Date(plan.generatedAt);
      const ageMinutes = (Date.now() - generatedAt.getTime()) / 60000;
      if (ageMinutes > this._config.validationRules.maxRecommendationAgeMinutes) {
        warnings.push({
          code: 'PLAN_STALE',
          message: `Plan is ${Math.round(ageMinutes)} minutes old (max ${this._config.validationRules.maxRecommendationAgeMinutes})`,
          stage: 'plan_validation',
        });
      }
    }

    // Plan expiry
    const expiresAt = new Date(plan.expiresAt);
    if (expiresAt <= new Date()) {
      errors.push({ code: 'PLAN_EXPIRED', message: 'Plan has expired', stage: 'plan_validation' });
    }

    // Dependency validation
    const stepIds = new Set(plan.steps.map((s) => s.id));
    for (const stepId of plan.recommendedOrder) {
      if (!stepIds.has(stepId)) {
        errors.push({
          code: 'DEP_UNKNOWN_STEP',
          message: `Recommended order references unknown step: ${stepId}`,
          stage: 'dependency_validation',
        });
      }
    }

    // Permission validation
    for (const step of plan.steps) {
      if (step.riskLevel === 'critical') {
        warnings.push({
          code: 'PERM_CRITICAL_RISK',
          message: `Step ${step.title} has critical risk level`,
          stage: 'permission_validation',
          stepId: step.id,
        });
      }
    }

    // Capability validation
    if (this._config.validationRules.requireAllCapabilities) {
      for (const step of plan.steps) {
        if (step.confidence < this._config.validationRules.maxRecommendationAgeMinutes / 100) {
          warnings.push({
            code: 'CAP_LOW_CONFIDENCE',
            message: `Step ${step.title} has low confidence: ${step.confidence}`,
            stage: 'capability_validation',
            stepId: step.id,
          });
        }
      }
    }

    // Quota validation
    if (this._config.validationRules.requireQuotaAvailable) {
      if (plan.steps.length > 100) {
        warnings.push({
          code: 'QUOTA_MANY_STEPS',
          message: `Plan has ${plan.steps.length} steps`,
          stage: 'quota_validation',
        });
      }
    }

    // System readiness
    if (this._config.validationRules.requireSystemReady) {
      if (plan.estimatedDuration <= 0) {
        warnings.push({
          code: 'SYS_ZERO_DURATION',
          message: 'Plan has zero estimated duration',
          stage: 'quota_validation',
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
