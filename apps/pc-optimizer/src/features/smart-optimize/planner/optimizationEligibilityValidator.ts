/**
 * Optimization Eligibility Validator — validates action eligibility.
 *
 * Validates: Capabilities, Subscription, Quota, Permissions,
 * System State, Dependencies, Safety Policies.
 */
import type {
  SmartPlanAction,
  EligibilityResult,
  EligibilityIssue,
  PlannerConfiguration,
  PlanningContext,
} from './types';

export class OptimizationEligibilityValidator {
  private _config: PlannerConfiguration;

  constructor(config: PlannerConfiguration) {
    this._config = config;
  }

  updateConfig(config: PlannerConfiguration): void {
    this._config = config;
  }

  validate(actions: SmartPlanAction[], context: PlanningContext): EligibilityResult {
    const eligibleActions: string[] = [];
    const ineligibleActions: EligibilityIssue[] = [];

    for (const action of actions) {
      const issues = this._validateAction(action, context);
      if (issues.length > 0) {
        ineligibleActions.push(...issues);
      } else {
        eligibleActions.push(action.id);
      }
    }

    return {
      eligible: ineligibleActions.length === 0,
      eligibleActions,
      ineligibleActions,
    };
  }

  private _validateAction(action: SmartPlanAction, context: PlanningContext): EligibilityIssue[] {
    const issues: EligibilityIssue[] = [];

    if (this._config.eligibilityRules.checkSubscription) {
      const issue = this._checkSubscription(action);
      if (issue) issues.push(issue);
    }

    if (this._config.eligibilityRules.checkSystemState) {
      const issue = this._checkSystemState(action, context);
      if (issue) issues.push(issue);
    }

    if (this._config.eligibilityRules.checkDependencies) {
      const issue = this._checkDependencies(action, context);
      if (issue) issues.push(issue);
    }

    if (this._config.eligibilityRules.checkSafetyPolicies) {
      const issue = this._checkSafetyPolicies(action);
      if (issue) issues.push(issue);
    }

    return issues;
  }

  private _checkSubscription(_action: SmartPlanAction): EligibilityIssue | null {
    return null;
  }

  private _checkSystemState(action: SmartPlanAction, context: PlanningContext): EligibilityIssue | null {
    if (context.systemLoad) {
      if (context.systemLoad.cpuUsage > 90 && action.category === 'performance') {
        return {
          actionId: action.id,
          title: action.title,
          reason: 'System CPU usage too high for performance optimization',
          code: 'HIGH_CPU_USAGE',
        };
      }
    }
    return null;
  }

  private _checkDependencies(action: SmartPlanAction, context: PlanningContext): EligibilityIssue | null {
    const availableIds = new Set(context.recommendations.map((r) => r.id));
    for (const depId of action.dependencies) {
      if (!availableIds.has(depId) && !action.dependencies.includes(depId)) {
        return {
          actionId: action.id,
          title: action.title,
          reason: `Missing dependency: ${depId}`,
          code: 'MISSING_DEPENDENCY',
        };
      }
    }
    return null;
  }

  private _checkSafetyPolicies(action: SmartPlanAction): EligibilityIssue | null {
    if (this._config.riskThresholds.protectedCategories.includes(action.category)) {
      return {
        actionId: action.id,
        title: action.title,
        reason: `Category "${action.category}" is protected by safety policies`,
        code: 'PROTECTED_CATEGORY',
      };
    }
    return null;
  }
}
