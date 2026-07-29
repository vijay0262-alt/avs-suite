/**
 * Adaptive Policy Engine — evaluates policies against conditions.
 *
 * Supports: Performance, Battery, Gaming, Developer, Business, Safety,
 * Thermal, Maintenance, Enterprise, Custom policies.
 */
import type {
  AdaptivePolicy,
  Condition,
  AdaptationAction,
  AdaptationRule,
  AdaptiveConfiguration,
  EvaluationContext,
} from './types';
import type { AdaptiveConditionRegistry } from './adaptiveConditionRegistry';

export class AdaptivePolicyEngine {
  private _registry: AdaptiveConditionRegistry;
  private _config: AdaptiveConfiguration;

  constructor(registry: AdaptiveConditionRegistry, config: AdaptiveConfiguration) {
    this._registry = registry;
    this._config = config;
  }

  evaluate(conditions: Condition[], context: EvaluationContext): PolicyEvaluationResult {
    const policies = this._registry.getEnabledPolicies();
    const actions: Array<{ policy: AdaptivePolicy; action: AdaptationAction; reason: string; confidence: number }> = [];

    for (const policy of policies) {
      const result = this._evaluatePolicy(policy, conditions, context);
      if (result) {
        actions.push(result);
      }
    }

    // Also evaluate condition rules' adaptation actions
    for (const condition of conditions) {
      const rules = this._registry.getRulesByConditionType(condition.type);
      for (const rule of rules) {
        if (rule.enabled) {
          actions.push({
            policy: { id: 'rule_based', type: 'custom', name: rule.name, description: rule.description, priority: 99, enabled: true, rules: [], futureMetadata: {} },
            action: rule.adaptationAction,
            reason: rule.description,
            confidence: this._severityToConfidence(condition.severity),
          });
        }
      }
    }

    // Sort by policy priority (lower number = higher priority)
    actions.sort((a, b) => a.policy.priority - b.policy.priority);

    if (actions.length === 0) {
      return { action: 'no_action', reason: 'No policy triggered', confidence: 1.0, policy: null };
    }

    const top = actions[0]!;
    return {
      action: top.action,
      reason: top.reason,
      confidence: top.confidence,
      policy: top.policy,
    };
  }

  private _evaluatePolicy(
    policy: AdaptivePolicy,
    conditions: Condition[],
    context: EvaluationContext,
  ): { policy: AdaptivePolicy; action: AdaptationAction; reason: string; confidence: number } | null {
    // Evaluate policy rules against conditions
    for (const rule of policy.rules) {
      for (const condition of conditions) {
        if (condition.type === rule.conditionType && this._evaluateOperator(rule, condition.value)) {
          return {
            policy,
            action: rule.action,
            reason: rule.reason,
            confidence: rule.confidence,
          };
        }
      }
    }

    // Evaluate built-in policy logic
    return this._evaluateBuiltinPolicy(policy, conditions, context);
  }

  private _evaluateBuiltinPolicy(
    policy: AdaptivePolicy,
    conditions: Condition[],
    context: EvaluationContext,
  ): { policy: AdaptivePolicy; action: AdaptationAction; reason: string; confidence: number } | null {
    const hasCondition = (type: string) => conditions.some((c) => c.type === type);
    const getCondition = (type: string) => conditions.find((c) => c.type === type);

    switch (policy.type) {
      case 'safety': {
        const critical = conditions.find((c) => c.severity === 'critical');
        if (critical) {
          return { policy, action: 'cancel_plan', reason: `Critical condition: ${critical.name}`, confidence: 0.95 };
        }
        break;
      }
      case 'battery': {
        const battery = getCondition('battery_level');
        if (battery && context.systemState.powerSource === 'battery') {
          if (battery.severity === 'critical') {
            return { policy, action: 'pause_plan', reason: 'Critical battery level', confidence: 0.9 };
          }
          return { policy, action: 'reduce_scope', reason: 'Running on battery', confidence: 0.8 };
        }
        break;
      }
      case 'gaming': {
        if (hasCondition('gaming_mode') || hasCondition('full_screen_app')) {
          return { policy, action: 'pause_plan', reason: 'Gaming or full screen active', confidence: 0.85 };
        }
        break;
      }
      case 'thermal': {
        const thermal = getCondition('thermal_state');
        if (thermal) {
          return { policy, action: 'reduce_scope', reason: `Thermal state: ${context.systemState.thermalState}`, confidence: 0.8 };
        }
        break;
      }
      case 'performance': {
        const cpu = getCondition('cpu_usage');
        if (cpu && cpu.severity === 'high') {
          return { policy, action: 'postpone_step', reason: 'High CPU usage', confidence: 0.8 };
        }
        break;
      }
      default:
        break;
    }

    return null;
  }

  private _evaluateOperator(rule: AdaptationRule, value: number): boolean {
    switch (rule.operator) {
      case '>': return value > rule.threshold;
      case '<': return value < rule.threshold;
      case '>=': return value >= rule.threshold;
      case '<=': return value <= rule.threshold;
      case '==': return value === rule.threshold;
      case '!=': return value !== rule.threshold;
      default: return false;
    }
  }

  private _severityToConfidence(severity: string): number {
    const confidences: Record<string, number> = { critical: 0.95, high: 0.85, medium: 0.7, low: 0.5, none: 0.3 };
    return confidences[severity] ?? 0.5;
  }
}

export interface PolicyEvaluationResult {
  action: AdaptationAction;
  reason: string;
  confidence: number;
  policy: AdaptivePolicy | null;
}
