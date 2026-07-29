/**
 * Automation Policy Registry — manages safety policies.
 *
 * Supports: Never During Full Screen, Never On Battery,
 * Never During Gaming, Business Hours Only, Idle Only,
 * Developer Safe, Enterprise Safe, Custom Policies.
 */
import type {
  SafetyPolicy,
  SafetyPolicyType,
  SafetyEvaluationContext,
  SafetyEvaluationResult,
  SafetyPolicyConfig,
  AutomationConfiguration,
} from './types';

export class AutomationPolicyRegistry {
  private _config: AutomationConfiguration;
  private _customPolicies: SafetyPolicy[] = [];

  constructor(config: AutomationConfiguration) {
    this._config = config;
  }

  register(policy: SafetyPolicy): boolean {
    if (this._customPolicies.some((p) => p.id === policy.id)) return false;
    this._customPolicies.push(policy);
    return true;
  }

  unregister(id: string): boolean {
    const idx = this._customPolicies.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this._customPolicies.splice(idx, 1);
    return true;
  }

  getEnabledPolicies(): SafetyPolicy[] {
    const builtIn = this._getBuiltinPolicies();
    const enabledConfigs = this._config.safetyPolicies.filter((c) => c.enabled);
    const enabled = builtIn.filter((p) => {
      const cfg = enabledConfigs.find((c) => c.type === p.type);
      return cfg ? p.enabled : false;
    });
    return [...enabled, ...this._customPolicies.filter((p) => p.enabled)]
      .sort((a, b) => a.priority - b.priority);
  }

  evaluateAll(context: SafetyEvaluationContext): SafetyEvaluationResult[] {
    const policies = this.getEnabledPolicies();
    return policies.map((p) => p.evaluate(context));
  }

  isSafe(context: SafetyEvaluationContext): boolean {
    const results = this.evaluateAll(context);
    return results.every((r) => r.safe);
  }

  getPolicy(id: string): SafetyPolicy | undefined {
    return this._customPolicies.find((p) => p.id === id)
      ?? this._getBuiltinPolicies().find((p) => p.id === id);
  }

  getByType(type: SafetyPolicyType): SafetyPolicy[] {
    return this.getEnabledPolicies().filter((p) => p.type === type);
  }

  getConfigs(): SafetyPolicyConfig[] {
    return this._config.safetyPolicies;
  }

  private _getBuiltinPolicies(): SafetyPolicy[] {
    const state = (ctx: SafetyEvaluationContext) => ctx.systemState;
    const mkResult = (id: string, safe: boolean, reason: string): SafetyEvaluationResult => ({
      safe, reason, policyId: id, futureMetadata: {},
    });

    return [
      {
        id: 'sp_fullscreen', type: 'never_full_screen', name: 'Never During Full Screen',
        description: 'Never automate during full screen apps', enabled: true, priority: 1,
        evaluate: (ctx) => mkResult('sp_fullscreen', !state(ctx).fullScreenApp,
          state(ctx).fullScreenApp ? 'Full screen app active' : 'No full screen app'),
        futureMetadata: {},
      },
      {
        id: 'sp_battery', type: 'never_on_battery', name: 'Never On Battery',
        description: 'Never automate on battery power', enabled: true, priority: 2,
        evaluate: (ctx) => mkResult('sp_battery', state(ctx).powerSource !== 'battery',
          state(ctx).powerSource === 'battery' ? 'On battery power' : 'Not on battery'),
        futureMetadata: {},
      },
      {
        id: 'sp_gaming', type: 'never_during_gaming', name: 'Never During Gaming',
        description: 'Never automate during gaming', enabled: true, priority: 3,
        evaluate: (ctx) => mkResult('sp_gaming', !state(ctx).gamingMode,
          state(ctx).gamingMode ? 'Gaming mode active' : 'Not gaming'),
        futureMetadata: {},
      },
      {
        id: 'sp_business', type: 'business_hours_only', name: 'Business Hours Only',
        description: 'Only automate during business hours', enabled: true, priority: 4,
        evaluate: (ctx) => {
          const hour = new Date(ctx.timestamp).getHours();
          const inHours = hour >= 9 && hour < 17;
          return mkResult('sp_business', inHours,
            inHours ? 'Within business hours' : 'Outside business hours');
        },
        futureMetadata: {},
      },
      {
        id: 'sp_idle', type: 'idle_only', name: 'Idle Only',
        description: 'Only automate when system is idle', enabled: true, priority: 5,
        evaluate: (ctx) => mkResult('sp_idle', state(ctx).isIdle,
          state(ctx).isIdle ? 'System is idle' : 'System is not idle'),
        futureMetadata: {},
      },
      {
        id: 'sp_dev', type: 'developer_safe', name: 'Developer Safe',
        description: 'Safe for developer workstations', enabled: true, priority: 6,
        evaluate: (ctx) => {
          const s = state(ctx);
          const safe = s.cpuUsage < 80 && !s.fullScreenApp;
          return mkResult('sp_dev', safe, safe ? 'Developer safe' : 'High resource usage — not developer safe');
        },
        futureMetadata: {},
      },
      {
        id: 'sp_enterprise', type: 'enterprise_safe', name: 'Enterprise Safe',
        description: 'Safe for enterprise environments', enabled: true, priority: 7,
        evaluate: (_ctx) => mkResult('sp_enterprise', true, 'Enterprise safe — no restrictions'),
        futureMetadata: {},
      },
    ];
  }
}
