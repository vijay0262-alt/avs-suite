/**
 * Automation Condition Engine — evaluates rule conditions.
 *
 * Supports: AND, OR, NOT, Nested Groups, Time Windows, Cooldown,
 * Priority Thresholds, Confidence Thresholds, Capability Checks,
 * Quota Checks, Subscription Checks, Custom Conditions.
 */
import type {
  AutomationCondition,
  AutomationConditionContext,
  ConditionEvaluationResult,
  AutomationConditionPlugin,
} from './types';
import { priorityToScore } from './types';

export class AutomationConditionEngine {
  private _plugins: AutomationConditionPlugin[] = [];

  registerPlugin(plugin: AutomationConditionPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  evaluateAll(conditions: AutomationCondition[], context: AutomationConditionContext): ConditionEvaluationResult[] {
    return conditions.map((c) => this.evaluate(c, context));
  }

  evaluate(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    if (!condition.enabled) {
      return { conditionId: condition.id, passed: false, reason: 'Condition disabled', details: {} };
    }

    // Check plugins first
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.getConditionType() === condition.type) {
        return plugin.evaluate(condition, context);
      }
    }

    return this._evaluateBuiltin(condition, context);
  }

  evaluateGroup(conditions: AutomationCondition[], context: AutomationConditionContext): boolean {
    if (conditions.length === 0) return true;
    return conditions.every((c) => this.evaluate(c, context).passed);
  }

  private _evaluateBuiltin(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    switch (condition.type) {
      case 'and':
        return this._evaluateAnd(condition, context);
      case 'or':
        return this._evaluateOr(condition, context);
      case 'not':
        return this._evaluateNot(condition, context);
      case 'nested_group':
        return this._evaluateNestedGroup(condition, context);
      case 'time_window':
        return this._evaluateTimeWindow(condition, context);
      case 'cooldown':
        return this._evaluateCooldown(condition, context);
      case 'priority_threshold':
        return this._evaluatePriorityThreshold(condition, context);
      case 'confidence_threshold':
        return this._evaluateConfidenceThreshold(condition, context);
      case 'capability_check':
        return this._evaluateCapabilityCheck(condition, context);
      case 'quota_check':
        return this._evaluateQuotaCheck(condition, context);
      case 'subscription_check':
        return this._evaluateSubscriptionCheck(condition, context);
      case 'custom_condition':
        return this._evaluateCustom(condition, context);
      default:
        return { conditionId: condition.id, passed: false, reason: `Unknown condition type: ${condition.type}`, details: {} };
    }
  }

  private _evaluateAnd(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    const children = condition.children ?? [];
    if (children.length === 0) {
      return { conditionId: condition.id, passed: true, reason: 'No children', details: {} };
    }
    const results = children.map((c) => this.evaluate(c, context));
    const allPassed = results.every((r) => r.passed);
    return {
      conditionId: condition.id,
      passed: allPassed,
      reason: allPassed ? 'All conditions passed' : 'One or more conditions failed',
      details: { childResults: results.map((r) => ({ id: r.conditionId, passed: r.passed })) },
    };
  }

  private _evaluateOr(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    const children = condition.children ?? [];
    if (children.length === 0) {
      return { conditionId: condition.id, passed: true, reason: 'No children', details: {} };
    }
    const results = children.map((c) => this.evaluate(c, context));
    const anyPassed = results.some((r) => r.passed);
    return {
      conditionId: condition.id,
      passed: anyPassed,
      reason: anyPassed ? 'At least one condition passed' : 'All conditions failed',
      details: { childResults: results.map((r) => ({ id: r.conditionId, passed: r.passed })) },
    };
  }

  private _evaluateNot(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    const children = condition.children ?? [];
    if (children.length === 0) {
      return { conditionId: condition.id, passed: false, reason: 'NOT requires a child', details: {} };
    }
    const childResult = this.evaluate(children[0]!, context);
    return {
      conditionId: condition.id,
      passed: !childResult.passed,
      reason: !childResult.passed ? 'Child condition negated (passed)' : 'Child condition negated (failed)',
      details: { childResult },
    };
  }

  private _evaluateNestedGroup(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    const children = condition.children ?? [];
    if (children.length === 0) {
      return { conditionId: condition.id, passed: true, reason: 'Empty group', details: {} };
    }
    const op = condition.operator ?? 'AND';
    const results = children.map((c) => this.evaluate(c, context));
    const passed = op === 'AND'
      ? results.every((r) => r.passed)
      : op === 'OR'
        ? results.some((r) => r.passed)
        : op === 'NOT'
          ? !results.every((r) => r.passed)
          : false;
    return {
      conditionId: condition.id,
      passed,
      reason: `Nested group (${op}) ${passed ? 'passed' : 'failed'}`,
      details: { operator: op, childResults: results.map((r) => ({ id: r.conditionId, passed: r.passed })) },
    };
  }

  private _evaluateTimeWindow(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    if (!condition.timeWindowStart || !condition.timeWindowEnd) {
      return { conditionId: condition.id, passed: false, reason: 'Missing time window bounds', details: {} };
    }
    const now = new Date(context.timestamp);
    const start = new Date(condition.timeWindowStart);
    const end = new Date(condition.timeWindowEnd);
    const passed = now >= start && now <= end;
    return {
      conditionId: condition.id,
      passed,
      reason: passed ? 'Within time window' : 'Outside time window',
      details: { now: now.toISOString(), start: start.toISOString(), end: end.toISOString() },
    };
  }

  private _evaluateCooldown(condition: AutomationCondition, _context: AutomationConditionContext): ConditionEvaluationResult {
    // Cooldown is checked by the CooldownManager; here we just return true
    // The actual cooldown check happens at the engine level
    return {
      conditionId: condition.id,
      passed: true,
      reason: 'Cooldown checked by CooldownManager',
      details: { cooldownMs: condition.cooldownMs },
    };
  }

  private _evaluatePriorityThreshold(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    const threshold = condition.threshold ?? 0;
    const score = priorityToScore(context.priority);
    const passed = score >= threshold;
    return {
      conditionId: condition.id,
      passed,
      reason: passed ? `Priority score ${score} >= ${threshold}` : `Priority score ${score} < ${threshold}`,
      details: { score, threshold },
    };
  }

  private _evaluateConfidenceThreshold(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    const threshold = condition.threshold ?? 0;
    const passed = context.confidence >= threshold;
    return {
      conditionId: condition.id,
      passed,
      reason: passed ? `Confidence ${context.confidence} >= ${threshold}` : `Confidence ${context.confidence} < ${threshold}`,
      details: { confidence: context.confidence, threshold },
    };
  }

  private _evaluateCapabilityCheck(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    const required = condition.requiredCapabilities ?? [];
    const missing = required.filter((c) => !context.availableCapabilities.includes(c));
    const passed = missing.length === 0;
    return {
      conditionId: condition.id,
      passed,
      reason: passed ? 'All capabilities available' : `Missing: ${missing.join(', ')}`,
      details: { required, missing },
    };
  }

  private _evaluateQuotaCheck(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    const required = condition.requiredQuota ?? 0;
    const passed = context.quotaRemaining >= required;
    return {
      conditionId: condition.id,
      passed,
      reason: passed ? `Quota ${context.quotaRemaining} >= ${required}` : `Quota ${context.quotaRemaining} < ${required}`,
      details: { remaining: context.quotaRemaining, required },
    };
  }

  private _evaluateSubscriptionCheck(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    const required = condition.requiredSubscription ?? null;
    if (!required) {
      return { conditionId: condition.id, passed: true, reason: 'No subscription required', details: {} };
    }
    const passed = context.subscriptionTier === required;
    return {
      conditionId: condition.id,
      passed,
      reason: passed ? `Subscription ${context.subscriptionTier} matches` : `Subscription ${context.subscriptionTier} != ${required}`,
      details: { current: context.subscriptionTier, required },
    };
  }

  private _evaluateCustom(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult {
    if (!condition.customEvaluator) {
      return { conditionId: condition.id, passed: false, reason: 'No custom evaluator', details: {} };
    }
    const passed = condition.customEvaluator(context);
    return {
      conditionId: condition.id,
      passed,
      reason: passed ? 'Custom condition passed' : 'Custom condition failed',
      details: {},
    };
  }
}
