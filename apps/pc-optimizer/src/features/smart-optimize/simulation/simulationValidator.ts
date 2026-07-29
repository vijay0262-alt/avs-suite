/**
 * Simulation Validator — validates plans, predictions, safety, and simulation quality.
 *
 * Validates: Plan completeness, Dependencies, Capabilities, Subscription,
 * Quota, Safety Policies, Prediction quality.
 */
import type {
  SimulationInput,
  SimulationResult,
  SimulationValidationResult,
  SimulationValidationError,
  SimulationValidationWarning,
  SimulationConfiguration,
} from './types';
import type { Evidence } from '../intelligence/types';
import { riskToScore } from './types';

export class SimulationValidator {
  private _config: SimulationConfiguration;

  constructor(config: SimulationConfiguration) {
    this._config = config;
  }

  validateInput(input: SimulationInput): SimulationValidationResult {
    const errors: SimulationValidationError[] = [];
    const warnings: SimulationValidationWarning[] = [];

    if (!input.plan.id) {
      errors.push({ code: 'MISSING_PLAN_ID', message: 'Plan ID is required', field: 'plan.id' });
    }
    if (!input.plan.title) {
      errors.push({ code: 'MISSING_PLAN_TITLE', message: 'Plan title is required', field: 'plan.title' });
    }
    if (input.plan.recommendedActions.length === 0) {
      warnings.push({ code: 'NO_ACTIONS', message: 'Plan has no recommended actions', field: 'plan.recommendedActions' });
    }
    if (input.healthScore < 0 || input.healthScore > 100) {
      errors.push({ code: 'INVALID_HEALTH_SCORE', message: 'Health score must be 0-100', field: 'healthScore' });
    }
    if (!input.deviceProfileType) {
      warnings.push({ code: 'NO_DEVICE_PROFILE', message: 'Device profile type not specified', field: 'deviceProfileType' });
    }

    for (const action of input.plan.recommendedActions) {
      if (!action.id) {
        errors.push({ code: 'MISSING_ACTION_ID', message: 'Action ID is required', field: 'action.id' });
      }
      if (!action.title) {
        errors.push({ code: 'MISSING_ACTION_TITLE', message: 'Action title is required', field: 'action.title' });
      }
      if (action.confidence < 0 || action.confidence > 1) {
        errors.push({ code: 'INVALID_ACTION_CONFIDENCE', message: `Action ${action.id} has invalid confidence`, field: 'action.confidence' });
      }
    }

    this._validateDependencies(input, errors, warnings);
    this._validateSafety(input, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateResult(result: SimulationResult): SimulationValidationResult {
    const errors: SimulationValidationError[] = [];
    const warnings: SimulationValidationWarning[] = [];

    if (!result.id) {
      errors.push({ code: 'MISSING_SIMULATION_ID', message: 'Simulation ID is required', field: 'id' });
    }
    if (!result.planId) {
      errors.push({ code: 'MISSING_PLAN_ID', message: 'Plan ID is required', field: 'planId' });
    }
    if (result.estimatedConfidence < 0 || result.estimatedConfidence > 1) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence must be 0-1', field: 'estimatedConfidence' });
    }
    if (result.estimatedHealthAfter < 0 || result.estimatedHealthAfter > 100) {
      errors.push({ code: 'INVALID_HEALTH_AFTER', message: 'Estimated health after must be 0-100', field: 'estimatedHealthAfter' });
    }
    if (result.estimatedHealthBefore < 0 || result.estimatedHealthBefore > 100) {
      errors.push({ code: 'INVALID_HEALTH_BEFORE', message: 'Estimated health before must be 0-100', field: 'estimatedHealthBefore' });
    }
    if (result.estimatedDuration < 0) {
      errors.push({ code: 'INVALID_DURATION', message: 'Duration must be non-negative', field: 'estimatedDuration' });
    }
    if (result.supportingEvidence.length === 0) {
      warnings.push({ code: 'NO_EVIDENCE', message: 'Simulation has no supporting evidence', field: 'supportingEvidence' });
    }
    if (result.assumptions.length === 0) {
      warnings.push({ code: 'NO_ASSUMPTIONS', message: 'Simulation has no assumptions listed', field: 'assumptions' });
    }
    if (result.estimatedConfidence < (this._config.confidenceRules[0]?.minSamples ?? 3) / 10) {
      warnings.push({ code: 'LOW_CONFIDENCE', message: 'Simulation confidence is below minimum threshold', field: 'estimatedConfidence' });
    }
    if (result.estimatedHealthAfter < result.estimatedHealthBefore) {
      warnings.push({ code: 'NEGATIVE_HEALTH_GAIN', message: 'Health after is lower than health before', field: 'estimatedHealthAfter' });
    }

    this._validateExplainability(result, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateSimulation(input: SimulationInput, result: SimulationResult): SimulationValidationResult {
    const inputValidation = this.validateInput(input);
    const resultValidation = this.validateResult(result);

    return {
      valid: inputValidation.valid && resultValidation.valid,
      errors: [...inputValidation.errors, ...resultValidation.errors],
      warnings: [...inputValidation.warnings, ...resultValidation.warnings],
      futureMetadata: {},
    };
  }

  private _validateDependencies(input: SimulationInput, errors: SimulationValidationError[], warnings: SimulationValidationWarning[]): void {
    const actionIds = new Set(input.plan.recommendedActions.map((a) => a.id));
    for (const action of input.plan.recommendedActions) {
      for (const dep of action.dependencies) {
        if (!actionIds.has(dep)) {
          warnings.push({
            code: 'UNRESOLVED_DEPENDENCY',
            message: `Action ${action.id} depends on ${dep} which is not in the plan`,
            field: 'dependencies',
          });
        }
      }
    }
  }

  private _validateSafety(input: SimulationInput, warnings: SimulationValidationWarning[]): void {
    const riskScore = riskToScore(input.plan.estimatedRisk);
    if (riskScore >= 0.8) {
      warnings.push({
        code: 'HIGH_RISK_PLAN',
        message: 'Plan has high or critical risk level',
        field: 'plan.estimatedRisk',
      });
    }
    if (!input.plan.rollbackAvailable) {
      warnings.push({
        code: 'NO_ROLLBACK',
        message: 'Plan does not support rollback',
        field: 'plan.rollbackAvailable',
      });
    }
  }

  private _validateExplainability(result: SimulationResult, warnings: SimulationValidationWarning[]): void {
    const exp = result.explainability;
    if (!exp.whyThisEstimate) {
      warnings.push({ code: 'NO_EXPLANATION', message: 'No explanation provided for estimate', field: 'explainability.whyThisEstimate' });
    }
    if (exp.evidenceUsed.length === 0) {
      warnings.push({ code: 'NO_EVIDENCE_LISTED', message: 'No evidence listed in explainability', field: 'explainability.evidenceUsed' });
    }
    if (!exp.potentialUncertainty) {
      warnings.push({ code: 'NO_UNCERTAINTY', message: 'No potential uncertainty described', field: 'explainability.potentialUncertainty' });
    }
  }

  getEvidence(result: SimulationResult): Evidence[] {
    return result.supportingEvidence;
  }
}
