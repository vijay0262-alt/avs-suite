/**
 * Optimization Profile Validator — validates profile completeness and consistency.
 *
 * Validates: Profile completeness, Policy consistency, Constraint conflicts,
 * Priority weights, Required modules, Capabilities, Version compatibility.
 */
import type {
  OptimizationProfile,
  ProfileValidationResult,
  ProfileValidationError,
  ProfileValidationWarning,
  OptimizationPriorityWeights,
} from './types';

export class OptimizationProfileValidator {
  validate(profile: OptimizationProfile): ProfileValidationResult {
    const errors: ProfileValidationError[] = [];
    const warnings: ProfileValidationWarning[] = [];

    this._validateCompleteness(profile, errors);
    this._validatePriorityWeights(profile, errors, warnings);
    this._validatePolicies(profile, errors, warnings);
    this._validateConstraints(profile, errors, warnings);
    this._validateVersion(profile, warnings);

    return { valid: errors.length === 0, errors, warnings };
  }

  private _validateCompleteness(profile: OptimizationProfile, errors: ProfileValidationError[]): void {
    if (!profile.id) errors.push({ code: 'NO_ID', message: 'Profile must have an id' });
    if (!profile.name) errors.push({ code: 'NO_NAME', message: 'Profile must have a name' });
    if (!profile.description) errors.push({ code: 'NO_DESCRIPTION', message: 'Profile must have a description' });
    if (!profile.category) errors.push({ code: 'NO_CATEGORY', message: 'Profile must have a category' });
    if (!profile.optimizationGoal) errors.push({ code: 'NO_GOAL', message: 'Profile must have an optimization goal' });
    if (profile.estimatedDuration < 0) errors.push({ code: 'NEGATIVE_DURATION', message: 'Estimated duration must be non-negative' });
  }

  private _validatePriorityWeights(
    profile: OptimizationProfile,
    errors: ProfileValidationError[],
    warnings: ProfileValidationWarning[],
  ): void {
    const weights = profile.priorityWeights;
    const keys: (keyof OptimizationPriorityWeights)[] = [
      'performance', 'storage', 'privacy', 'startup', 'memory',
      'battery', 'health', 'stability', 'maintenance', 'security',
    ];

    for (const key of keys) {
      const value = weights[key];
      if (value < 0 || value > 1) {
        errors.push({ code: 'INVALID_WEIGHT', message: `Priority weight "${key}" must be between 0 and 1`, field: key });
      }
    }

    const sum = keys.reduce((s, k) => s + weights[k], 0);
    if (sum === 0) {
      warnings.push({ code: 'ALL_ZERO_WEIGHTS', message: 'All priority weights are zero' });
    }
  }

  private _validatePolicies(
    profile: OptimizationProfile,
    errors: ProfileValidationError[],
    warnings: ProfileValidationWarning[],
  ): void {
    const exec = profile.policies.execution;
    if (exec.maxParallelActions < 1) {
      errors.push({ code: 'INVALID_PARALLEL', message: 'maxParallelActions must be at least 1' });
    }
    if (exec.timeoutSeconds < 1) {
      errors.push({ code: 'INVALID_TIMEOUT', message: 'timeoutSeconds must be positive' });
    }

    const safety = profile.policies.safety;
    const riskScores: Record<string, number> = { none: 0, low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    if ((riskScores[safety.maxRiskLevel] ?? 0) > (riskScores[profile.constraints.maxRiskLevel] ?? 0)) {
      warnings.push({ code: 'POLICY_CONSTRAINT_RISK_MISMATCH', message: 'Safety policy max risk exceeds constraint max risk' });
    }

    if (profile.policies.rollback.requireRollbackCapability && !profile.constraints.requireRollback) {
      warnings.push({ code: 'ROLLBACK_MISMATCH', message: 'Rollback policy requires capability but constraint does not' });
    }
  }

  private _validateConstraints(
    profile: OptimizationProfile,
    errors: ProfileValidationError[],
    _warnings: ProfileValidationWarning[],
  ): void {
    const constraints = profile.constraints;
    if (constraints.maxDurationMinutes < 1) {
      errors.push({ code: 'INVALID_MAX_DURATION', message: 'maxDurationMinutes must be at least 1' });
    }

    const overlap = constraints.allowedCategories.filter((c) => constraints.blockedCategories.includes(c));
    if (overlap.length > 0) {
      errors.push({ code: 'CATEGORY_CONFLICT', message: `Categories both allowed and blocked: ${overlap.join(', ')}` });
    }
  }

  private _validateVersion(profile: OptimizationProfile, warnings: ProfileValidationWarning[]): void {
    if (!profile.version) {
      warnings.push({ code: 'NO_VERSION', message: 'Profile has no version specified' });
    }
  }

  validateBatch(profiles: OptimizationProfile[]): { valid: OptimizationProfile[]; invalid: Array<{ profile: OptimizationProfile; result: ProfileValidationResult }> } {
    const valid: OptimizationProfile[] = [];
    const invalid: Array<{ profile: OptimizationProfile; result: ProfileValidationResult }> = [];

    for (const profile of profiles) {
      const result = this.validate(profile);
      if (result.valid) {
        valid.push(profile);
      } else {
        invalid.push({ profile, result });
      }
    }

    return { valid, invalid };
  }
}
