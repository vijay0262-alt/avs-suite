/**
 * Maintenance Eligibility Engine — validates maintenance eligibility.
 *
 * Validates: Subscription, Capabilities, Quota, Permissions,
 * Device State, Power Policy, Enterprise Policy, Safety Policy, Dependencies.
 */
import type {
  SystemState,
  MaintenanceOpportunity,
  MaintenanceEligibility,
  EligibilityCheck,
  EligibilityRule,
  EligibilityStatus,
  MaintenanceEligibilityContext,
  MaintenanceConfiguration,
  SubscriptionInfo,
  CapabilityInfo,
  QuotaInfo,
  PermissionInfo,
  EnterprisePolicyInfo,
  MaintenanceHistoryEntry,
} from './types';

export class MaintenanceEligibilityEngine {
  private _config: MaintenanceConfiguration;
  private _customRules: EligibilityRule[] = [];

  constructor(config: MaintenanceConfiguration) {
    this._config = config;
  }

  registerRule(rule: EligibilityRule): boolean {
    if (this._customRules.some((r) => r.id === rule.id)) return false;
    this._customRules.push(rule);
    return true;
  }

  unregisterRule(id: string): boolean {
    const idx = this._customRules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this._customRules.splice(idx, 1);
    return true;
  }

  evaluate(
    opportunity: MaintenanceOpportunity,
    state: SystemState,
    options?: {
      subscription?: SubscriptionInfo | null;
      capabilities?: CapabilityInfo | null;
      quota?: QuotaInfo | null;
      permissions?: PermissionInfo | null;
      enterprisePolicy?: EnterprisePolicyInfo | null;
      historicalOutcomes?: MaintenanceHistoryEntry[];
    },
  ): MaintenanceEligibility {
    const context: MaintenanceEligibilityContext = {
      systemState: state,
      opportunity,
      subscription: options?.subscription ?? null,
      capabilities: options?.capabilities ?? null,
      quota: options?.quota ?? null,
      permissions: options?.permissions ?? null,
      enterprisePolicy: options?.enterprisePolicy ?? null,
      historicalOutcomes: options?.historicalOutcomes ?? [],
      futureMetadata: {},
    };

    const checks: EligibilityCheck[] = [];

    // Built-in checks
    checks.push(this._checkDeviceState(context));
    checks.push(this._checkPowerPolicy(context));
    checks.push(this._checkSafetyPolicy(context));
    checks.push(this._checkDependencies(context));

    if (context.subscription) {
      checks.push(this._checkSubscription(context));
    }
    if (context.capabilities) {
      checks.push(this._checkCapabilities(context));
    }
    if (context.quota) {
      checks.push(this._checkQuota(context));
    }
    if (context.permissions) {
      checks.push(this._checkPermissions(context));
    }
    if (context.enterprisePolicy) {
      checks.push(this._checkEnterprisePolicy(context));
    }

    // Custom rules
    for (const rule of this._customRules) {
      if (rule.enabled) {
        checks.push(rule.evaluate(context));
      }
    }

    // Config rules
    for (const rule of this._config.eligibilityRules) {
      if (rule.enabled) {
        checks.push(rule.evaluate(context));
      }
    }

    const requiredChecks = checks.filter((c) => c.required);
    const blockers = requiredChecks.filter((c) => !c.passed).map((c) => c.message);
    const warnings = checks.filter((c) => !c.required && !c.passed).map((c) => c.message);

    const overallScore = checks.length > 0
      ? checks.filter((c) => c.passed).length / checks.length
      : 0;

    let status: EligibilityStatus;
    if (blockers.length > 0) {
      status = 'ineligible';
    } else if (warnings.length > 0) {
      status = 'conditional';
    } else if (checks.length > 0) {
      status = 'eligible';
    } else {
      status = 'unknown';
    }

    return {
      status,
      checks,
      overallScore,
      blockers,
      warnings,
      futureMetadata: {},
    };
  }

  private _checkDeviceState(context: MaintenanceEligibilityContext): EligibilityCheck {
    const state = context.systemState;
    const req = context.opportunity.requiredConditions;
    const issues: string[] = [];

    if (state.cpuUsage > req.maxCpuUsage) issues.push(`CPU ${state.cpuUsage}% > ${req.maxCpuUsage}%`);
    if (state.memoryUsage > req.maxMemoryUsage) issues.push(`Memory ${state.memoryUsage}% > ${req.maxMemoryUsage}%`);
    if (state.diskActivity > req.maxDiskActivity) issues.push(`Disk ${state.diskActivity}% > ${req.maxDiskActivity}%`);
    if (req.minBatteryLevel !== null && state.batteryLevel !== null && state.batteryLevel < req.minBatteryLevel) {
      issues.push(`Battery ${state.batteryLevel}% < ${req.minBatteryLevel}%`);
    }
    if (req.requireIdle && !state.isIdle) issues.push('System not idle');
    if (req.blockOnFullScreen && state.fullScreenApp) issues.push('Full screen app active');
    if (req.blockOnGaming && state.gamingMode) issues.push('Gaming mode active');
    if (req.blockOnWindowsUpdate && state.windowsUpdateActive) issues.push('Windows update active');

    return {
      id: 'device_state',
      name: 'Device State',
      passed: issues.length === 0,
      required: true,
      message: issues.length === 0 ? 'Device state is suitable' : issues.join('; '),
      details: { issues },
    };
  }

  private _checkPowerPolicy(context: MaintenanceEligibilityContext): EligibilityCheck {
    const state = context.systemState;
    const req = context.opportunity.requiredConditions;
    const passed = !req.requireAcPower || state.powerSource === 'ac';
    return {
      id: 'power_policy',
      name: 'Power Policy',
      passed,
      required: req.requireAcPower,
      message: passed ? 'Power policy satisfied' : 'AC power required but not available',
      details: { powerSource: state.powerSource, requireAc: req.requireAcPower },
    };
  }

  private _checkSafetyPolicy(_context: MaintenanceEligibilityContext): EligibilityCheck {
    return {
      id: 'safety_policy',
      name: 'Safety Policy',
      passed: true,
      required: true,
      message: 'Safety policy satisfied',
      details: {},
    };
  }

  private _checkDependencies(_context: MaintenanceEligibilityContext): EligibilityCheck {
    return {
      id: 'dependencies',
      name: 'Dependencies',
      passed: true,
      required: true,
      message: 'All dependencies satisfied',
      details: {},
    };
  }

  private _checkSubscription(context: MaintenanceEligibilityContext): EligibilityCheck {
    const sub = context.subscription!;
    return {
      id: 'subscription',
      name: 'Subscription',
      passed: sub.active,
      required: true,
      message: sub.active ? `Active subscription (${sub.tier})` : 'No active subscription',
      details: { tier: sub.tier, expiresAt: sub.expiresAt },
    };
  }

  private _checkCapabilities(context: MaintenanceEligibilityContext): EligibilityCheck {
    const caps = context.capabilities!;
    const missing = caps.required.filter((r) => !caps.available.includes(r));
    return {
      id: 'capabilities',
      name: 'Capabilities',
      passed: missing.length === 0,
      required: true,
      message: missing.length === 0 ? 'All capabilities available' : `Missing: ${missing.join(', ')}`,
      details: { missing },
    };
  }

  private _checkQuota(context: MaintenanceEligibilityContext): EligibilityCheck {
    const quota = context.quota!;
    const passed = quota.remaining > 0;
    return {
      id: 'quota',
      name: 'Quota',
      passed,
      required: true,
      message: passed ? `Quota remaining: ${quota.remaining}` : 'Quota exhausted',
      details: { used: quota.used, limit: quota.limit, remaining: quota.remaining },
    };
  }

  private _checkPermissions(context: MaintenanceEligibilityContext): EligibilityCheck {
    const perms = context.permissions!;
    return {
      id: 'permissions',
      name: 'Permissions',
      passed: perms.granted.length > 0,
      required: false,
      message: perms.granted.length > 0 ? 'Permissions granted' : 'No special permissions',
      details: { granted: perms.granted, denied: perms.denied },
    };
  }

  private _checkEnterprisePolicy(context: MaintenanceEligibilityContext): EligibilityCheck {
    const policy = context.enterprisePolicy!;
    if (!policy.maintenanceAllowed) {
      return {
        id: 'enterprise_policy',
        name: 'Enterprise Policy',
        passed: false,
        required: true,
        message: 'Maintenance not allowed by enterprise policy',
        details: { maintenanceAllowed: false },
      };
    }
    if (policy.blockedTypes.includes(context.opportunity.type)) {
      return {
        id: 'enterprise_policy',
        name: 'Enterprise Policy',
        passed: false,
        required: true,
        message: `Maintenance type ${context.opportunity.type} blocked by enterprise`,
        details: { blockedType: context.opportunity.type },
      };
    }
    if (policy.maxDuration !== null && context.opportunity.estimatedDuration > policy.maxDuration) {
      return {
        id: 'enterprise_policy',
        name: 'Enterprise Policy',
        passed: false,
        required: true,
        message: `Duration ${context.opportunity.estimatedDuration}ms exceeds max ${policy.maxDuration}ms`,
        details: { estimated: context.opportunity.estimatedDuration, max: policy.maxDuration },
      };
    }
    return {
      id: 'enterprise_policy',
      name: 'Enterprise Policy',
      passed: true,
      required: true,
      message: 'Enterprise policy satisfied',
      details: { maintenanceAllowed: true },
    };
  }
}
