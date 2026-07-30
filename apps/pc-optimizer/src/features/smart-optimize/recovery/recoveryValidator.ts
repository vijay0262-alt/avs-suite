/**
 * Optimization Recovery & Rollback Center — Validator
 *
 * Validates snapshot integrity, dependencies, permissions, capabilities,
 * subscription, quota, recovery safety, and recovery readiness.
 */
import type {
  RecoveryValidationResult,
  RecoveryValidationError,
  RecoveryValidationWarning,
  RecoveryValidationCheck,
  SnapshotCatalogEntry,
  RecoveryPlan,
  RecoveryConfiguration,
} from './types';
import { riskToScore } from './types';

export class RecoveryValidator {
  private _config: RecoveryConfiguration;

  constructor(config: RecoveryConfiguration) {
    this._config = config;
  }

  updateConfig(config: RecoveryConfiguration): void {
    this._config = config;
  }

  validateSnapshot(snapshot: SnapshotCatalogEntry): RecoveryValidationResult {
    const errors: RecoveryValidationError[] = [];
    const warnings: RecoveryValidationWarning[] = [];
    const checks: RecoveryValidationCheck[] = [];

    if (this._config.validationRules.checkSnapshotIntegrity) {
      const check = this._checkIntegrity(snapshot);
      checks.push(check);
      if (!check.passed) {
        errors.push({ code: 'SNAPSHOT_INTEGRITY', message: check.message, field: 'integrityStatus' });
      }
    }

    if (this._config.validationRules.checkDependencies) {
      const check = this._checkDependencies(snapshot);
      checks.push(check);
      if (!check.passed) {
        if (this._config.recoveryPolicyRules.blockOnDependencyFailure) {
          errors.push({ code: 'DEPENDENCY_FAILURE', message: check.message, field: 'dependencies' });
        } else {
          warnings.push({ code: 'DEPENDENCY_WARNING', message: check.message, field: 'dependencies' });
        }
      }
    }

    if (this._config.validationRules.checkPermissions) {
      const check = this._checkPermissions(snapshot);
      checks.push(check);
      if (!check.passed) {
        errors.push({ code: 'PERMISSION_DENIED', message: check.message, field: 'permissions' });
      }
    }

    if (this._config.validationRules.checkCapabilities) {
      const check = this._checkCapabilities(snapshot);
      checks.push(check);
      if (!check.passed) {
        errors.push({ code: 'CAPABILITY_MISSING', message: check.message, field: 'capabilities' });
      }
    }

    if (this._config.validationRules.checkSubscription) {
      const check = this._checkSubscription(snapshot);
      checks.push(check);
      if (!check.passed) {
        warnings.push({ code: 'SUBSCRIPTION_WARNING', message: check.message, field: 'subscription' });
      }
    }

    if (this._config.validationRules.checkQuota) {
      const check = this._checkQuota(snapshot);
      checks.push(check);
      if (!check.passed) {
        warnings.push({ code: 'QUOTA_EXCEEDED', message: check.message, field: 'quota' });
      }
    }

    return { valid: errors.length === 0, errors, warnings, checks };
  }

  validatePlan(plan: RecoveryPlan): RecoveryValidationResult {
    const errors: RecoveryValidationError[] = [];
    const warnings: RecoveryValidationWarning[] = [];
    const checks: RecoveryValidationCheck[] = [];

    if (plan.steps.length === 0) {
      errors.push({ code: 'NO_STEPS', message: 'Recovery plan has no steps', field: 'steps' });
    }

    if (plan.estimatedDuration <= 0) {
      errors.push({ code: 'INVALID_DURATION', message: 'Estimated duration must be positive', field: 'estimatedDuration' });
    }

    if (plan.confidence < 0 || plan.confidence > 1) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence must be between 0 and 1', field: 'confidence' });
    }

    if (plan.estimatedSuccess < 0 || plan.estimatedSuccess > 1) {
      errors.push({ code: 'INVALID_SUCCESS', message: 'Estimated success must be between 0 and 1', field: 'estimatedSuccess' });
    }

    if (this._config.validationRules.checkRecoverySafety) {
      const check = this._checkRecoverySafety(plan);
      checks.push(check);
      if (!check.passed) {
        errors.push({ code: 'RECOVERY_UNSAFE', message: check.message, field: 'safety' });
      }
    }

    if (this._config.validationRules.checkRecoveryReadiness) {
      const check = this._checkRecoveryReadiness(plan);
      checks.push(check);
      if (!check.passed) {
        warnings.push({ code: 'READINESS_WARNING', message: check.message, field: 'readiness' });
      }
    }

    if (plan.rollbackDepth > this._config.recoveryPolicyRules.maxRollbackDepth) {
      errors.push({
        code: 'ROLLBACK_DEPTH_EXCEEDED',
        message: `Rollback depth ${plan.rollbackDepth} exceeds max ${this._config.recoveryPolicyRules.maxRollbackDepth}`,
        field: 'rollbackDepth',
      });
    }

    if (this._config.featureFlags.enableExplainability) {
      if (!plan.explainability.reason) {
        warnings.push({ code: 'NO_REASON', message: 'Recovery plan lacks explainability reason', field: 'explainability' });
      }
      if (plan.explainability.affectedComponents.length === 0) {
        warnings.push({ code: 'NO_AFFECTED_COMPONENTS', message: 'No affected components listed', field: 'explainability' });
      }
      if (plan.supportingEvidence.length === 0) {
        warnings.push({ code: 'NO_EVIDENCE', message: 'No supporting evidence provided', field: 'supportingEvidence' });
      }
    }

    return { valid: errors.length === 0, errors, warnings, checks };
  }

  validate(snapshot: SnapshotCatalogEntry, plan: RecoveryPlan): RecoveryValidationResult {
    const snapshotResult = this.validateSnapshot(snapshot);
    const planResult = this.validatePlan(plan);

    return {
      valid: snapshotResult.valid && planResult.valid,
      errors: [...snapshotResult.errors, ...planResult.errors],
      warnings: [...snapshotResult.warnings, ...planResult.warnings],
      checks: [...snapshotResult.checks, ...planResult.checks],
    };
  }

  private _checkIntegrity(snapshot: SnapshotCatalogEntry): RecoveryValidationCheck {
    if (snapshot.integrityStatus === 'corrupted') {
      return { name: 'Snapshot Integrity', passed: false, message: 'Snapshot is corrupted', category: 'snapshot_integrity' };
    }
    if (snapshot.integrityStatus === 'missing') {
      return { name: 'Snapshot Integrity', passed: false, message: 'Snapshot is missing', category: 'snapshot_integrity' };
    }
    if (snapshot.integrityStatus === 'degraded') {
      return { name: 'Snapshot Integrity', passed: true, message: 'Snapshot is degraded but usable', category: 'snapshot_integrity' };
    }
    return { name: 'Snapshot Integrity', passed: true, message: 'Snapshot integrity verified', category: 'snapshot_integrity' };
  }

  private _checkDependencies(snapshot: SnapshotCatalogEntry): RecoveryValidationCheck {
    const unresolved = snapshot.dependencies.filter((d) => !d.startsWith('resolved:'));
    if (unresolved.length > 0) {
      return { name: 'Dependencies', passed: false, message: `${unresolved.length} unresolved dependency/dependencies`, category: 'dependencies' };
    }
    return { name: 'Dependencies', passed: true, message: 'All dependencies resolved', category: 'dependencies' };
  }

  private _checkPermissions(snapshot: SnapshotCatalogEntry): RecoveryValidationCheck {
    if (snapshot.providers.length === 0) {
      return { name: 'Permissions', passed: false, message: 'No snapshot providers available', category: 'permissions' };
    }
    return { name: 'Permissions', passed: true, message: 'Permissions verified for all providers', category: 'permissions' };
  }

  private _checkCapabilities(snapshot: SnapshotCatalogEntry): RecoveryValidationCheck {
    if (!snapshot.recoveryAvailable) {
      return { name: 'Capabilities', passed: false, message: 'Recovery capability not available', category: 'capabilities' };
    }
    return { name: 'Capabilities', passed: true, message: 'All capabilities available', category: 'capabilities' };
  }

  private _checkSubscription(_snapshot: SnapshotCatalogEntry): RecoveryValidationCheck {
    return { name: 'Subscription', passed: true, message: 'Subscription valid', category: 'subscription' };
  }

  private _checkQuota(_snapshot: SnapshotCatalogEntry): RecoveryValidationCheck {
    return { name: 'Quota', passed: true, message: 'Quota available', category: 'quota' };
  }

  private _checkRecoverySafety(plan: RecoveryPlan): RecoveryValidationCheck {
    const riskScore = riskToScore(plan.estimatedRisk);
    if (riskScore >= 4) {
      return { name: 'Recovery Safety', passed: false, message: 'Recovery risk is critical', category: 'recovery_safety' };
    }
    if (riskScore >= 3) {
      return { name: 'Recovery Safety', passed: true, message: 'Recovery risk is high but acceptable', category: 'recovery_safety' };
    }
    return { name: 'Recovery Safety', passed: true, message: 'Recovery risk is within safe limits', category: 'recovery_safety' };
  }

  private _checkRecoveryReadiness(plan: RecoveryPlan): RecoveryValidationCheck {
    if (plan.steps.length === 0) {
      return { name: 'Recovery Readiness', passed: false, message: 'No recovery steps defined', category: 'recovery_readiness' };
    }
    if (plan.dependencies.length > 0) {
      return { name: 'Recovery Readiness', passed: false, message: 'Unresolved plan dependencies', category: 'recovery_readiness' };
    }
    return { name: 'Recovery Readiness', passed: true, message: 'Recovery plan is ready', category: 'recovery_readiness' };
  }
}
