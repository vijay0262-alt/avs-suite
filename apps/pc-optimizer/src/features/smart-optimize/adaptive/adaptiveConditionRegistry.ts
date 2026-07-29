/**
 * Adaptive Condition Registry — registers and manages conditions and policies.
 *
 * Built-in conditions are registered at construction.
 * Custom conditions and provider plugins register through the registry.
 * No switch statements — provider architecture only.
 */
import type {
  ConditionRule,
  ConditionProviderPlugin,
  PolicyProviderPlugin,
  AdaptivePolicy,
  AdaptiveConfiguration,
  ConditionType,
} from './types';

export class AdaptiveConditionRegistry {
  private _conditionRules: Map<string, ConditionRule> = new Map();
  private _policies: Map<string, AdaptivePolicy> = new Map();
  private _conditionPlugins: ConditionProviderPlugin[] = [];
  private _policyPlugins: PolicyProviderPlugin[] = [];
  private _config: AdaptiveConfiguration;

  constructor(config: AdaptiveConfiguration) {
    this._config = config;
    this._registerBuiltIns();
  }

  private _registerBuiltIns(): void {
    for (const rule of this._config.conditionRules) {
      this._conditionRules.set(rule.id, rule);
    }
    for (const policy of this._config.policies) {
      this._policies.set(policy.id, policy);
    }
  }

  registerConditionRule(rule: ConditionRule): boolean {
    if (this._conditionRules.has(rule.id)) return false;
    this._conditionRules.set(rule.id, rule);
    return true;
  }

  unregisterConditionRule(ruleId: string): boolean {
    return this._conditionRules.delete(ruleId);
  }

  getConditionRule(ruleId: string): ConditionRule | undefined {
    return this._conditionRules.get(ruleId);
  }

  getConditionRules(): ConditionRule[] {
    return Array.from(this._conditionRules.values());
  }

  getEnabledConditionRules(): ConditionRule[] {
    return this.getConditionRules().filter((r) => r.enabled);
  }

  getRulesByConditionType(type: ConditionType): ConditionRule[] {
    return this.getConditionRules().filter((r) => r.conditionType === type);
  }

  registerPolicy(policy: AdaptivePolicy): boolean {
    if (this._policies.has(policy.id)) return false;
    this._policies.set(policy.id, policy);
    return true;
  }

  unregisterPolicy(policyId: string): boolean {
    return this._policies.delete(policyId);
  }

  getPolicy(policyId: string): AdaptivePolicy | undefined {
    return this._policies.get(policyId);
  }

  getPolicies(): AdaptivePolicy[] {
    return Array.from(this._policies.values());
  }

  getEnabledPolicies(): AdaptivePolicy[] {
    return this.getPolicies().filter((p) => p.enabled).sort((a, b) => a.priority - b.priority);
  }

  registerConditionPlugin(plugin: ConditionProviderPlugin): void {
    this._conditionPlugins.push(plugin);
    this._conditionPlugins.sort((a, b) => b.getPriority() - a.getPriority());
  }

  registerPolicyPlugin(plugin: PolicyProviderPlugin): void {
    this._policyPlugins.push(plugin);
    this._policyPlugins.sort((a, b) => b.getPriority() - a.getPriority());
  }

  loadPlugins(): void {
    for (const plugin of this._conditionPlugins) {
      if (plugin.isAvailable()) {
        // Plugins are evaluated on demand by the evaluator
      }
    }
    for (const plugin of this._policyPlugins) {
      if (plugin.isAvailable()) {
        const policy = plugin.getPolicy();
        if (!this._policies.has(policy.id)) {
          this._policies.set(policy.id, policy);
        }
      }
    }
  }

  getConditionPlugins(): ConditionProviderPlugin[] {
    return [...this._conditionPlugins];
  }

  getPolicyPlugins(): PolicyProviderPlugin[] {
    return [...this._policyPlugins];
  }

  conditionRuleCount(): number {
    return this._conditionRules.size;
  }

  policyCount(): number {
    return this._policies.size;
  }
}
