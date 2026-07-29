/**
 * Automation Validator — validates automation rules, plans, and conditions.
 */
import type {
  AutomationRule,
  AutomationPlan,
  AutomationValidationResult,
  AutomationValidationError,
  AutomationValidationWarning,
  AutomationCondition,
} from './types';

export class AutomationValidator {
  validateRule(rule: AutomationRule): AutomationValidationResult {
    const errors: AutomationValidationError[] = [];
    const warnings: AutomationValidationWarning[] = [];

    if (!rule.id) errors.push({ code: 'MISSING_ID', message: 'Rule has no id' });
    if (!rule.name) errors.push({ code: 'MISSING_NAME', message: 'Rule has no name' });
    if (rule.actions.length === 0) warnings.push({ code: 'NO_ACTIONS', message: 'Rule has no actions' });
    if (rule.conditions.length === 0) warnings.push({ code: 'NO_CONDITIONS', message: 'Rule has no conditions' });
    if (rule.priority < 0) errors.push({ code: 'INVALID_PRIORITY', message: 'Priority must be >= 0', field: 'priority' });

    for (const cond of rule.conditions) {
      const condResult = this.validateCondition(cond);
      errors.push(...condResult.errors);
      warnings.push(...condResult.warnings);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateCondition(condition: AutomationCondition): AutomationValidationResult {
    const errors: AutomationValidationError[] = [];
    const warnings: AutomationValidationWarning[] = [];

    if (!condition.id) errors.push({ code: 'MISSING_CONDITION_ID', message: 'Condition has no id' });
    if (!condition.enabled) warnings.push({ code: 'CONDITION_DISABLED', message: 'Condition is disabled' });

    if ((condition.type === 'and' || condition.type === 'or' || condition.type === 'not' || condition.type === 'nested_group')
      && (!condition.children || condition.children.length === 0)) {
      warnings.push({ code: 'NO_CHILDREN', message: `${condition.type} condition has no children` });
    }

    if (condition.type === 'time_window' && (!condition.timeWindowStart || !condition.timeWindowEnd)) {
      errors.push({ code: 'MISSING_TIME_WINDOW', message: 'Time window condition missing start/end' });
    }

    if (condition.type === 'capability_check' && (!condition.requiredCapabilities || condition.requiredCapabilities.length === 0)) {
      warnings.push({ code: 'NO_REQUIRED_CAPS', message: 'Capability check has no required capabilities' });
    }

    if (condition.type === 'custom_condition' && !condition.customEvaluator) {
      errors.push({ code: 'NO_CUSTOM_EVALUATOR', message: 'Custom condition has no evaluator' });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validatePlan(plan: AutomationPlan): AutomationValidationResult {
    const errors: AutomationValidationError[] = [];
    const warnings: AutomationValidationWarning[] = [];

    if (!plan.id) errors.push({ code: 'MISSING_PLAN_ID', message: 'Plan has no id' });
    if (!plan.ruleId) errors.push({ code: 'MISSING_RULE_ID', message: 'Plan has no ruleId' });
    if (plan.actions.length === 0) errors.push({ code: 'EMPTY_PLAN', message: 'Plan has no actions' });
    if (plan.confidence < 0 || plan.confidence > 1) errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence out of range' });

    if (new Date(plan.expiresAt).getTime() <= new Date(plan.generatedAt).getTime()) {
      warnings.push({ code: 'ALREADY_EXPIRED', message: 'Plan has already expired' });
    }

    const unsafeResults = plan.safetyResults.filter((r) => !r.safe);
    if (unsafeResults.length > 0) {
      errors.push({ code: 'UNSAFE', message: unsafeResults.map((r) => r.reason).join('; ') });
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
