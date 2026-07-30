/**
 * Goal Orchestration Engine — Policy Engine
 *
 * Manages orchestration policies: priority rules, conflict rules,
 * scheduling rules, resource policies, enterprise policies.
 * No hardcoded priorities — all policies are configuration-driven.
 */
import type {
  OrchestrationPolicy,
  OrchestrationPolicyRule,
  Goal,
  OrchestrationConfiguration,
} from './types';
import { generatePolicyId, generatePolicyRuleId } from './types';

export class GoalPolicyEngine {
  private _config: OrchestrationConfiguration;
  private _policies: OrchestrationPolicy[] = [];

  constructor(config: OrchestrationConfiguration) {
    this._config = config;
    this._registerBuiltinPolicies();
  }

  registerPolicy(policy: OrchestrationPolicy): boolean {
    if (this._policies.some((p) => p.id === policy.id || p.name === policy.name)) {
      return false;
    }
    this._policies.push(policy);
    this._policies.sort((a, b) => b.priority - a.priority);
    return true;
  }

  unregisterPolicy(policyId: string): boolean {
    const idx = this._policies.findIndex((p) => p.id === policyId);
    if (idx === -1) return false;
    this._policies.splice(idx, 1);
    return true;
  }

  getPolicies(): OrchestrationPolicy[] {
    return [...this._policies];
  }

  getEnabledPolicies(): OrchestrationPolicy[] {
    return this._policies.filter((p) => p.enabled);
  }

  evaluateGoal(goal: Goal): { allowed: boolean; policies: OrchestrationPolicy[]; reason: string } {
    const enabled = this.getEnabledPolicies();
    const blocking: OrchestrationPolicy[] = [];

    for (const policy of enabled) {
      if (this._evaluatePolicy(policy, goal)) {
        if (policy.type === 'enterprise' || policy.type === 'priority') {
          blocking.push(policy);
        }
      }
    }

    if (blocking.length > 0) {
      return {
        allowed: false,
        policies: blocking,
        reason: `Blocked by policies: ${blocking.map((p) => p.name).join(', ')}`,
      };
    }

    return { allowed: true, policies: [], reason: 'All policies satisfied' };
  }

  private _evaluatePolicy(policy: OrchestrationPolicy, goal: Goal): boolean {
    for (const rule of policy.rules) {
      if (!this._evaluateRule(rule, goal)) continue;
      // If action is 'block', the policy blocks this goal
      if (rule.action === 'block') return true;
    }
    return false;
  }

  private _evaluateRule(rule: OrchestrationPolicyRule, goal: Goal): boolean {
    const fieldValue = this._getFieldValue(rule.field, goal);
    if (fieldValue === undefined) return false;

    switch (rule.operator) {
      case 'eq': return fieldValue === rule.value;
      case 'neq': return fieldValue !== rule.value;
      case 'gt': return typeof fieldValue === 'number' && typeof rule.value === 'number' && fieldValue > rule.value;
      case 'gte': return typeof fieldValue === 'number' && typeof rule.value === 'number' && fieldValue >= rule.value;
      case 'lt': return typeof fieldValue === 'number' && typeof rule.value === 'number' && fieldValue < rule.value;
      case 'lte': return typeof fieldValue === 'number' && typeof rule.value === 'number' && fieldValue <= rule.value;
      case 'in': return Array.isArray(rule.value) && rule.value.includes(fieldValue);
      case 'not_in': return Array.isArray(rule.value) && !rule.value.includes(fieldValue);
      default: return false;
    }
  }

  private _getFieldValue(field: string, goal: Goal): unknown {
    switch (field) {
      case 'category': return goal.category;
      case 'priority': return goal.priority;
      case 'status': return goal.status;
      case 'progress': return goal.progress;
      case 'confidence': return goal.confidence;
      case 'targetMetric': return goal.targetMetric;
      default: return undefined;
    }
  }

  createPolicy(
    name: string,
    description: string,
    type: OrchestrationPolicy['type'],
    rules: Array<Omit<OrchestrationPolicyRule, 'id'>>,
    priority: number,
  ): OrchestrationPolicy {
    const policyRules: OrchestrationPolicyRule[] = rules.map((r) => ({ ...r, id: generatePolicyRuleId() }));
    return {
      id: generatePolicyId(),
      name,
      description,
      type,
      rules: policyRules,
      enabled: true,
      priority,
      futureMetadata: {},
    };
  }

  enablePolicy(policyId: string): boolean {
    const policy = this._policies.find((p) => p.id === policyId);
    if (!policy) return false;
    policy.enabled = true;
    return true;
  }

  disablePolicy(policyId: string): boolean {
    const policy = this._policies.find((p) => p.id === policyId);
    if (!policy) return false;
    policy.enabled = false;
    return true;
  }

  clear(): void {
    this._policies = [];
  }

  private _registerBuiltinPolicies(): void {
    // Enterprise policy for blocked goal types
    if (this._config.enterprisePolicies.blockedGoalTypes.length > 0) {
      this.registerPolicy({
        id: generatePolicyId(),
        name: 'Enterprise Blocked Goal Types',
        description: 'Blocks goals of types disallowed by enterprise policy',
        type: 'enterprise',
        rules: [{
          id: generatePolicyRuleId(),
          field: 'category',
          operator: 'in',
          value: this._config.enterprisePolicies.blockedGoalTypes,
          action: 'block',
          description: 'Block goals with disallowed categories',
          futureMetadata: {},
        }],
        enabled: this._config.enterprisePolicies.enforcePolicies,
        priority: 100,
        futureMetadata: {},
      });
    }

    // Priority policy for critical goals
    this.registerPolicy({
      id: generatePolicyId(),
      name: 'Critical Priority Policy',
      description: 'Ensures critical goals are always evaluated first',
      type: 'priority',
      rules: [{
        id: generatePolicyRuleId(),
        field: 'priority',
        operator: 'eq',
        value: 'critical',
        action: 'boost',
        description: 'Boost critical priority goals',
        futureMetadata: {},
      }],
      enabled: true,
      priority: 90,
      futureMetadata: {},
    });
  }
}
