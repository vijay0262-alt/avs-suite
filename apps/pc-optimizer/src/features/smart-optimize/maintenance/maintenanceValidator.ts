/**
 * Maintenance Validator — validates maintenance plans and opportunities.
 *
 * Validates: Plan integrity, opportunity validity, eligibility,
 * confidence, safety, dependencies.
 */
import type {
  MaintenancePlan,
  MaintenanceOpportunity,
  MaintenanceValidationResult,
  MaintenanceValidationError,
  MaintenanceValidationWarning,
  MaintenanceEligibility,
} from './types';

export class MaintenanceValidator {
  validatePlan(plan: MaintenancePlan): MaintenanceValidationResult {
    const errors: MaintenanceValidationError[] = [];
    const warnings: MaintenanceValidationWarning[] = [];

    if (plan.opportunities.length === 0) {
      errors.push({ code: 'EMPTY_PLAN', message: 'Maintenance plan has no opportunities' });
    }

    if (plan.totalEstimatedDuration <= 0 && plan.opportunities.length > 0) {
      warnings.push({ code: 'ZERO_DURATION', message: 'Total estimated duration is zero' });
    }

    if (plan.confidence < 0 || plan.confidence > 1) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Plan confidence out of range', field: 'confidence' });
    }

    if (new Date(plan.expiresAt).getTime() <= new Date(plan.generatedAt).getTime()) {
      warnings.push({ code: 'ALREADY_EXPIRED', message: 'Plan has already expired' });
    }

    for (const opp of plan.opportunities) {
      const oppResult = this.validateOpportunity(opp);
      errors.push(...oppResult.errors);
      warnings.push(...oppResult.warnings);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateOpportunity(opportunity: MaintenanceOpportunity): MaintenanceValidationResult {
    const errors: MaintenanceValidationError[] = [];
    const warnings: MaintenanceValidationWarning[] = [];

    if (!opportunity.id) {
      errors.push({ code: 'MISSING_ID', message: 'Opportunity has no id' });
    }

    if (opportunity.estimatedDuration <= 0) {
      warnings.push({ code: 'ZERO_DURATION', message: 'Estimated duration is zero', field: 'estimatedDuration' });
    }

    if (opportunity.confidence < 0 || opportunity.confidence > 1) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence out of range', field: 'confidence' });
    }

    if (opportunity.expectedBenefit < 0) {
      warnings.push({ code: 'NEGATIVE_BENEFIT', message: 'Expected benefit is negative', field: 'expectedBenefit' });
    }

    if (opportunity.recommendedActions.length === 0 && opportunity.deferredActions.length === 0) {
      warnings.push({ code: 'NO_ACTIONS', message: 'Opportunity has no actions' });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateEligibility(eligibility: MaintenanceEligibility): MaintenanceValidationResult {
    const errors: MaintenanceValidationError[] = [];
    const warnings: MaintenanceValidationWarning[] = [];

    if (eligibility.status === 'ineligible') {
      for (const blocker of eligibility.blockers) {
        errors.push({ code: 'BLOCKED', message: blocker });
      }
    }

    if (eligibility.overallScore < 0 || eligibility.overallScore > 1) {
      errors.push({ code: 'INVALID_SCORE', message: 'Eligibility score out of range', field: 'overallScore' });
    }

    for (const warning of eligibility.warnings) {
      warnings.push({ code: 'ELIGIBILITY_WARNING', message: warning });
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
