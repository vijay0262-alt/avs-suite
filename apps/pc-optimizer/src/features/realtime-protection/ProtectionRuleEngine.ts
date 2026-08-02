/**
 * ProtectionRuleEngine — evaluates protection rules against system events.
 *
 * Rules are evaluated in priority order. First match wins.
 * If no rule matches, the default action is 'monitor'.
 */
import type { ProtectionRule, RuleMatchResult, SystemEvent, RuleConditionSpec } from './types';

export class ProtectionRuleEngine {
  private rules: ProtectionRule[] = [];

  constructor(rules: ProtectionRule[] = []) {
    this.rules = [...rules].sort((a, b) => b.priority - a.priority);
  }

  setRules(rules: ProtectionRule[]): void {
    this.rules = [...rules].sort((a, b) => b.priority - a.priority);
  }

  addRule(rule: ProtectionRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  getRules(): ProtectionRule[] {
    return [...this.rules];
  }

  evaluate(event: SystemEvent, mode: SystemEvent['category'] extends never ? never : string): RuleMatchResult {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.mode !== 'all' && rule.mode !== mode) continue;

      if (this.matchesAllConditions(event, rule.conditions)) {
        return {
          matched: true,
          ruleId: rule.id,
          action: rule.action,
          reason: `Rule "${rule.name}" matched`,
        };
      }
    }

    return {
      matched: false,
      ruleId: null,
      action: 'monitor',
      reason: 'No rule matched — default action: monitor',
    };
  }

  private matchesAllConditions(event: SystemEvent, conditions: RuleConditionSpec[]): boolean {
    return conditions.every((cond) => this.matchesCondition(event, cond));
  }

  private matchesCondition(event: SystemEvent, cond: RuleConditionSpec): boolean {
    let result: boolean;

    switch (cond.type) {
      case 'path_matches':
        result = this.matchGlob(event.target.path, cond.value);
        break;

      case 'name_matches':
        result = this.matchGlob(event.target.name, cond.value);
        break;

      case 'hash_matches':
        result = event.target.hash === cond.value;
        break;

      case 'publisher_matches':
        result = event.target.publisher?.toLowerCase() === cond.value.toLowerCase();
        break;

      case 'category_matches':
        result = event.category === cond.value;
        break;

      case 'severity_above': {
        const order = ['info', 'low', 'medium', 'high', 'critical'];
        result = order.indexOf(event.severity) >= order.indexOf(cond.value as never);
        break;
      }

      case 'signature_unsigned':
        result = event.target.signatureStatus === 'unsigned' || event.target.signatureStatus === 'unknown';
        break;

      case 'process_suspicious':
        result = event.category === 'process' && event.severity !== 'info';
        break;

      case 'file_in_temp':
        result = event.target.path.toLowerCase().includes('temp') || event.target.path.toLowerCase().includes('\\tmp\\');
        break;

      case 'file_in_download':
        result = event.target.path.toLowerCase().includes('downloads');
        break;

      case 'file_in_desktop':
        result = event.target.path.toLowerCase().includes('desktop');
        break;

      case 'file_in_documents':
        result = event.target.path.toLowerCase().includes('documents');
        break;

      case 'usb_auto_run':
        result = event.type === 'usb_inserted';
        break;

      case 'network_external':
        result = event.category === 'network';
        break;

      default:
        result = false;
    }

    return cond.negate ? !result : result;
  }

  private matchGlob(path: string, pattern: string): boolean {
    const normalizedPath = path.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();

    if (normalizedPattern.includes('*')) {
      const regex = normalizedPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(regex).test(normalizedPath);
    }

    return normalizedPath.includes(normalizedPattern);
  }

  clear(): void {
    this.rules = [];
  }
}
