/**
 * Goals & Objectives Engine — Validator
 */
import type {
  Goal,
  GoalValidationResult,
  GoalValidationError,
  GoalValidationWarning,
  GoalConfiguration,
} from './types';

export class GoalValidator {
  private _config: GoalConfiguration;

  constructor(config: GoalConfiguration) {
    this._config = config;
  }

  validate(goal: Goal): GoalValidationResult {
    const errors: GoalValidationError[] = [];
    const warnings: GoalValidationWarning[] = [];

    if (!goal.name || goal.name.trim().length === 0) {
      errors.push({ code: 'MISSING_NAME', message: 'Goal name is required', field: 'name' });
    }
    if (!goal.description || goal.description.trim().length === 0) {
      errors.push({ code: 'MISSING_DESCRIPTION', message: 'Goal description is required', field: 'description' });
    }
    if (!goal.category) {
      errors.push({ code: 'MISSING_CATEGORY', message: 'Goal category is required', field: 'category' });
    }
    if (!goal.targetMetric) {
      errors.push({ code: 'MISSING_TARGET_METRIC', message: 'Target metric is required', field: 'targetMetric' });
    }
    if (goal.targetValue === undefined || goal.targetValue === null) {
      errors.push({ code: 'MISSING_TARGET_VALUE', message: 'Target value is required', field: 'targetValue' });
    }
    if (goal.confidence < 0 || goal.confidence > 1) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence must be between 0 and 1', field: 'confidence' });
    }
    if (goal.progress < 0 || goal.progress > 1) {
      errors.push({ code: 'INVALID_PROGRESS', message: 'Progress must be between 0 and 1', field: 'progress' });
    }
    if (this._config.strategyRules.minStrategyConfidence > 0 && goal.strategy.confidence < this._config.strategyRules.minStrategyConfidence) {
      warnings.push({ code: 'LOW_STRATEGY_CONFIDENCE', message: 'Strategy confidence is below minimum threshold', field: 'strategy.confidence' });
    }
    if (goal.strategy.steps.length === 0) {
      warnings.push({ code: 'NO_STRATEGY_STEPS', message: 'Strategy has no steps — generate a strategy before starting', field: 'strategy.steps' });
    }
    if (this._config.measurementRules.requireEvidence && goal.evidence.length === 0) {
      warnings.push({ code: 'NO_EVIDENCE', message: 'No evidence provided — measurements may not be explainable', field: 'evidence' });
    }
    if (goal.dependencies.some((d) => d.required && d.type === 'blocking')) {
      warnings.push({ code: 'HAS_BLOCKING_DEPENDENCY', message: 'Goal has blocking dependencies — it may not be startable', field: 'dependencies' });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateBatch(goals: Goal[]): GoalValidationResult {
    const allErrors: GoalValidationError[] = [];
    const allWarnings: GoalValidationWarning[] = [];
    for (const goal of goals) {
      const r = this.validate(goal);
      allErrors.push(...r.errors);
      allWarnings.push(...r.warnings);
    }
    return { valid: allErrors.length === 0, errors: allErrors, warnings: allWarnings };
  }
}
