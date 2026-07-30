/**
 * Natural Language Action Engine — Action Validator
 *
 * EPIC 5 PHASE A PART 4
 *
 * Validates action plans: capabilities, permissions, subscription,
 * quota, safety policies, tool availability, execution readiness.
 */
import type {
  ActionPlan,
  ActionValidationResult,
  ActionValidationError,
  ActionValidationWarning,
  CopilotContext,
  PermissionLevel,
} from './types';

export class ActionValidator {
  private _permissionOrder: PermissionLevel[] = ['free', 'pro', 'enterprise'];

  validate(plan: ActionPlan, context: CopilotContext, userPermission: PermissionLevel, userCapabilities: string[]): ActionValidationResult {
    const errors: ActionValidationError[] = [];
    const warnings: ActionValidationWarning[] = [];

    // Validate permissions
    this._validatePermissions(plan, userPermission, errors);

    // Validate capabilities
    this._validateCapabilities(plan, userCapabilities, errors);

    // Validate tool availability
    this._validateToolAvailability(plan, errors);

    // Validate safety policies
    this._validateSafetyPolicies(plan, warnings);

    // Validate execution readiness
    this._validateExecutionReadiness(plan, context, warnings);

    // Validate quota (simplified)
    this._validateQuota(plan, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  private _validatePermissions(plan: ActionPlan, userPermission: PermissionLevel, errors: ActionValidationError[]): void {
    const userLevel = this._permissionOrder.indexOf(userPermission);
    for (const tool of plan.selectedTools) {
      const requiredLevel = this._permissionOrder.indexOf(tool.requiredPermissions);
      if (userLevel < requiredLevel) {
        errors.push({
          code: 'PERMISSION_DENIED',
          message: `Tool "${tool.name}" requires ${tool.requiredPermissions} permission`,
          field: 'permissions',
        });
      }
    }
  }

  private _validateCapabilities(plan: ActionPlan, userCapabilities: string[], errors: ActionValidationError[]): void {
    for (const cap of plan.requiredCapabilities) {
      if (!userCapabilities.includes(cap)) {
        errors.push({
          code: 'MISSING_CAPABILITY',
          message: `Missing required capability: ${cap}`,
          field: 'capabilities',
        });
      }
    }
  }

  private _validateToolAvailability(plan: ActionPlan, errors: ActionValidationError[]): void {
    if (plan.selectedTools.length === 0 && plan.steps.length > 0) {
      errors.push({
        code: 'NO_TOOLS_AVAILABLE',
        message: 'Action plan has steps but no tools are available',
        field: 'tools',
      });
    }
  }

  private _validateSafetyPolicies(plan: ActionPlan, warnings: ActionValidationWarning[]): void {
    if (plan.estimatedRisk === 'high' || plan.estimatedRisk === 'critical') {
      if (!plan.rollbackAvailable) {
        warnings.push({
          code: 'NO_ROLLBACK',
          message: 'High-risk action without rollback capability',
          field: 'risk',
        });
      }
    }

    if (plan.estimatedRisk === 'critical') {
      warnings.push({
        code: 'CRITICAL_RISK',
        message: 'Critical risk action — proceed with extreme caution',
        field: 'risk',
      });
    }
  }

  private _validateExecutionReadiness(plan: ActionPlan, context: CopilotContext, warnings: ActionValidationWarning[]): void {
    if (context.healthScore === null && plan.intent === 'optimization') {
      warnings.push({
        code: 'NO_HEALTH_SCORE',
        message: 'No health score available — optimization results may be less accurate',
        field: 'context',
      });
    }

    if (context.recoveryHistory.length === 0 && plan.intent === 'recovery') {
      warnings.push({
        code: 'NO_RECOVERY_HISTORY',
        message: 'No recovery history available',
        field: 'context',
      });
    }
  }

  private _validateQuota(plan: ActionPlan, warnings: ActionValidationWarning[]): void {
    // Placeholder for quota validation — would check user's remaining quota
    if (plan.steps.length > 5) {
      warnings.push({
        code: 'MANY_STEPS',
        message: 'Action plan has many steps — may take longer than expected',
        field: 'quota',
      });
    }
  }
}
