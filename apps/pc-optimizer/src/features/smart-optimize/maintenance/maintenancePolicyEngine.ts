/**
 * Maintenance Policy Engine — evaluates policies against maintenance context.
 *
 * Supports: Never Interrupt User, Battery Protection, Gaming Protection,
 * Business Hours, Developer Mode, Privacy Mode, Enterprise Rules, Custom.
 */
import type {
  SystemState,
  MaintenanceOpportunity,
  MaintenancePolicy,
  MaintenancePolicyAction,
  PolicyEvaluationResult,
  MaintenanceConfiguration,
  MaintenancePolicyType,
} from './types';

export class MaintenancePolicyEngine {
  private _config: MaintenanceConfiguration;
  private _customPolicies: MaintenancePolicy[] = [];

  constructor(config: MaintenanceConfiguration) {
    this._config = config;
  }

  registerPolicy(policy: MaintenancePolicy): boolean {
    if (this._customPolicies.some((p) => p.id === policy.id)) return false;
    this._customPolicies.push(policy);
    return true;
  }

  unregisterPolicy(id: string): boolean {
    const idx = this._customPolicies.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this._customPolicies.splice(idx, 1);
    return true;
  }

  evaluate(
    opportunity: MaintenanceOpportunity,
    state: SystemState,
  ): PolicyEvaluationResult {
    const policies = this._getEnabledPolicies();
    const matched: MaintenancePolicy[] = [];
    let action: MaintenancePolicyAction = 'allow';
    let reason = 'No policies matched — maintenance allowed';
    let confidence = 1.0;

    for (const policy of policies) {
      const result = this._evaluatePolicy(policy, opportunity, state);
      if (result.matched) {
        matched.push(policy);
        if (this._isMoreRestrictive(result.action, action)) {
          action = result.action;
          reason = result.reason;
          confidence = result.confidence;
        }
      }
    }

    return { action, matchedPolicies: matched, reason, confidence };
  }

  private _getEnabledPolicies(): MaintenancePolicy[] {
    const all = [...this._config.policies, ...this._customPolicies];
    return all
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  private _evaluatePolicy(
    policy: MaintenancePolicy,
    opportunity: MaintenanceOpportunity,
    state: SystemState,
  ): { matched: boolean; action: MaintenancePolicyAction; reason: string; confidence: number } {
    switch (policy.type) {
      case 'never_interrupt_user': {
        const matched = state.userActive && !state.isIdle;
        return {
          matched,
          action: 'defer',
          reason: 'User is active — deferring maintenance',
          confidence: 0.9,
        };
      }
      case 'battery_protection': {
        const matched = state.powerSource === 'battery' && (state.batteryLevel ?? 100) < 30;
        return {
          matched,
          action: 'defer',
          reason: 'Low battery — deferring heavy maintenance',
          confidence: 0.85,
        };
      }
      case 'gaming_protection': {
        const matched = state.gamingMode;
        return {
          matched,
          action: 'block',
          reason: 'Gaming session active — maintenance blocked',
          confidence: 0.95,
        };
      }
      case 'business_hours': {
        const hour = new Date().getHours();
        const matched = hour >= 9 && hour < 17 && state.userActive;
        return {
          matched,
          action: 'defer',
          reason: 'Business hours — deferring maintenance',
          confidence: 0.7,
        };
      }
      case 'developer_mode': {
        const matched = state.cpuUsage > 50 && state.diskActivity > 40;
        return {
          matched,
          action: 'defer',
          reason: 'High resource usage — possible development session',
          confidence: 0.6,
        };
      }
      case 'privacy_mode': {
        const matched = opportunity.type === 'privacy_maintenance';
        return {
          matched,
          action: 'require_confirmation',
          reason: 'Privacy maintenance requires confirmation',
          confidence: 0.8,
        };
      }
      case 'enterprise_rules': {
        return {
          matched: false,
          action: 'allow',
          reason: 'Enterprise rules — no restrictions',
          confidence: 0.5,
        };
      }
      default: {
        return {
          matched: false,
          action: 'allow',
          reason: 'No policy restrictions',
          confidence: 0.5,
        };
      }
    }
  }

  private _isMoreRestrictive(
    newAction: MaintenancePolicyAction,
    currentAction: MaintenancePolicyAction,
  ): boolean {
    const restrictiveness: Record<MaintenancePolicyAction, number> = {
      allow: 0,
      require_confirmation: 1,
      defer: 2,
      block: 3,
      future_action: 0,
    };
    return restrictiveness[newAction] > restrictiveness[currentAction];
  }

  getPolicy(id: string): MaintenancePolicy | undefined {
    return this._config.policies.find((p) => p.id === id)
      ?? this._customPolicies.find((p) => p.id === id);
  }

  getPoliciesByType(type: MaintenancePolicyType): MaintenancePolicy[] {
    return this._getEnabledPolicies().filter((p) => p.type === type);
  }
}
