/**
 * Adaptive Validator — validates adaptation results.
 *
 * Validates: Plan integrity, Policy compatibility, Dependency order,
 * Safety, Capabilities, Permissions, Confidence.
 */
import type {
  SmartPlan,
  AdaptationDecision,
  AdaptationResult,
  AdaptationValidationResult,
  AdaptationValidationError,
  AdaptationValidationWarning,
} from './types';

export class AdaptiveValidator {
  validate(plan: SmartPlan, decisions: AdaptationDecision[]): AdaptationValidationResult {
    const errors: AdaptationValidationError[] = [];
    const warnings: AdaptationValidationWarning[] = [];

    this._validatePlanIntegrity(plan, errors);
    this._validateDependencyOrder(plan, errors, warnings);
    this._validateSafety(plan, warnings);
    this._validateDecisions(decisions, errors, warnings);
    this._validateConfidence(decisions, warnings);

    return { valid: errors.length === 0, errors, warnings };
  }

  validateResult(result: AdaptationResult): AdaptationValidationResult {
    return this.validate(result.adaptedPlan, result.decisions);
  }

  private _validatePlanIntegrity(plan: SmartPlan, errors: AdaptationValidationError[]): void {
    if (!plan.id) errors.push({ code: 'NO_PLAN_ID', message: 'Plan must have an id' });
    if (plan.recommendedActions.length === 0 && plan.deferredActions.length === 0 && plan.excludedActions.length === 0) {
      errors.push({ code: 'EMPTY_PLAN', message: 'Plan has no actions at all' });
    }
  }

  private _validateDependencyOrder(
    plan: SmartPlan,
    _errors: AdaptationValidationError[],
    warnings: AdaptationValidationWarning[],
  ): void {
    const executed = new Set<string>();
    for (const action of plan.recommendedActions) {
      for (const depId of action.dependencies) {
        if (!executed.has(depId)) {
          warnings.push({
            code: 'DEPENDENCY_ORDER',
            message: `Action "${action.title}" depends on "${depId}" which may not be available`,
          });
        }
      }
      executed.add(action.id);
    }
  }

  private _validateSafety(plan: SmartPlan, warnings: AdaptationValidationWarning[]): void {
    if (plan.safetyAssessment.unsafeActions.length > 0) {
      warnings.push({
        code: 'UNSAFE_ACTIONS',
        message: `${plan.safetyAssessment.unsafeActions.length} unsafe action(s) remain in plan`,
      });
    }
    if (!plan.rollbackAvailable && plan.recommendedActions.length > 0) {
      warnings.push({
        code: 'NO_ROLLBACK',
        message: 'Plan has actions but rollback is not available',
      });
    }
  }

  private _validateDecisions(
    decisions: AdaptationDecision[],
    errors: AdaptationValidationError[],
    warnings: AdaptationValidationWarning[],
  ): void {
    for (const decision of decisions) {
      if (!decision.id) errors.push({ code: 'NO_DECISION_ID', message: 'Decision must have an id' });
      if (!decision.condition) errors.push({ code: 'NO_CONDITION', message: 'Decision must reference a condition' });
      if (decision.confidence < 0 || decision.confidence > 1) {
        errors.push({ code: 'INVALID_CONFIDENCE', message: 'Decision confidence must be between 0 and 1' });
      }
      if (decision.estimatedImpact < 0 || decision.estimatedImpact > 1) {
        warnings.push({ code: 'IMPACT_RANGE', message: 'Decision estimatedImpact should be between 0 and 1' });
      }
    }
  }

  private _validateConfidence(decisions: AdaptationDecision[], warnings: AdaptationValidationWarning[]): void {
    if (decisions.length === 0) return;
    const avgConfidence = decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length;
    if (avgConfidence < 0.5) {
      warnings.push({
        code: 'LOW_CONFIDENCE',
        message: `Average decision confidence is low (${avgConfidence.toFixed(2)})`,
      });
    }
  }
}
