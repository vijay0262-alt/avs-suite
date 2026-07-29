/**
 * Automation Rule Registry — manages automation rules.
 *
 * Each rule contains: id, name, description, enabled, priority, trigger,
 * conditions, actions, approvalPolicy, cooldown, executionPolicy,
 * riskLevel, futureMetadata.
 */
import type { AutomationRule, AutomationConfiguration } from './types';

export class AutomationRuleRegistry {
  private _config: AutomationConfiguration;
  private _rules: Map<string, AutomationRule> = new Map();

  constructor(config: AutomationConfiguration) {
    this._config = config;
  }

  register(rule: AutomationRule): boolean {
    if (this._rules.has(rule.id)) return false;
    this._rules.set(rule.id, rule);
    return true;
  }

  unregister(id: string): boolean {
    return this._rules.delete(id);
  }

  get(id: string): AutomationRule | undefined {
    return this._rules.get(id);
  }

  getAll(): AutomationRule[] {
    return Array.from(this._rules.values());
  }

  getEnabled(): AutomationRule[] {
    return this.getAll()
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  update(id: string, updates: Partial<AutomationRule>): boolean {
    const rule = this._rules.get(id);
    if (!rule) return false;
    this._rules.set(id, { ...rule, ...updates });
    return true;
  }

  enable(id: string): boolean {
    return this.update(id, { enabled: true });
  }

  disable(id: string): boolean {
    return this.update(id, { enabled: false });
  }

  count(): number {
    return this._rules.size;
  }

  clear(): void {
    this._rules.clear();
  }
}
