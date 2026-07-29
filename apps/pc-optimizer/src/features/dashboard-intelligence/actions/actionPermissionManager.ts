/**
 * Action Permission Manager — validates permissions before action execution.
 *
 * Validates: Subscription, Capabilities, Quota, Feature Flags,
 * Enterprise Policies, Device Policies, User Permissions.
 */
import type {
  DashboardActionDefinition,
  ActionContext,
  ActionPermissionResult,
  ActionConfiguration,
  ActionFeatureFlags,
} from './types';

const PLAN_HIERARCHY: Record<string, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };

export class ActionPermissionManager {
  private _config: ActionConfiguration;

  constructor(config: ActionConfiguration) {
    this._config = config;
  }

  updateConfig(config: ActionConfiguration): void {
    this._config = config;
  }

  check(definition: DashboardActionDefinition, context: ActionContext): ActionPermissionResult {
    const reasons: string[] = [];
    const missingCapabilities: string[] = [];
    const missingFeatures: string[] = [];
    let planRequired: string | null = null;
    let quotaExceeded = false;

    // Check feature flags
    if (!this._isFeatureEnabled(definition.actionType)) {
      reasons.push(`Action type '${definition.actionType}' is disabled by feature flag`);
      missingFeatures.push(definition.actionType);
    }

    // Check subscription
    if (definition.requiresSubscription) {
      const requiredPlan = definition.requiresSubscription;
      const userPlanLevel = PLAN_HIERARCHY[context.userPlan] ?? 0;
      const requiredPlanLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;
      if (userPlanLevel < requiredPlanLevel) {
        reasons.push(`Requires ${requiredPlan} subscription, user has ${context.userPlan}`);
        planRequired = requiredPlan;
      }
    }

    // Check default minimum plan
    const defaultMinLevel = PLAN_HIERARCHY[this._config.permissionRules.defaultMinPlan] ?? 0;
    const userPlanLevel = PLAN_HIERARCHY[context.userPlan] ?? 0;
    if (userPlanLevel < defaultMinLevel) {
      reasons.push(`Default minimum plan is ${this._config.permissionRules.defaultMinPlan}, user has ${context.userPlan}`);
      planRequired = planRequired ?? this._config.permissionRules.defaultMinPlan;
    }

    // Check capability
    if (definition.requiresCapability) {
      if (!context.userCapabilities.includes(definition.requiresCapability)) {
        reasons.push(`Missing capability: ${definition.requiresCapability}`);
        missingCapabilities.push(definition.requiresCapability);
      }
    }

    // Check quota
    if (definition.requiresQuota && !context.hasQuota) {
      reasons.push(`Quota exceeded for: ${definition.requiresQuota}`);
      quotaExceeded = true;
    }

    // Check enterprise policies
    if (this._config.permissionRules.strictMode && definition.requiresPermission) {
      const enterprisePolicy = this._config.permissionRules.enterprisePolicies[definition.actionType];
      if (enterprisePolicy === false) {
        reasons.push(`Action blocked by enterprise policy: ${definition.actionType}`);
      }
    }

    // Check device policies
    const devicePolicy = this._config.permissionRules.devicePolicies[definition.actionType];
    if (devicePolicy === false) {
      reasons.push(`Action blocked by device policy: ${definition.actionType}`);
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      missingCapabilities,
      missingFeatures,
      planRequired,
      quotaExceeded,
    };
  }

  private _isFeatureEnabled(actionType: string): boolean {
    const flags: ActionFeatureFlags = this._config.featureFlags;
    switch (actionType) {
      case 'optimize_now': return flags.enableOptimizeNow;
      case 'quick_optimize': return flags.enableQuickOptimize;
      case 'explain': return flags.enableExplain;
      case 'compare_before_after': return flags.enableCompare;
      case 'rollback': return flags.enableRollback;
      case 'share_report': return flags.enableShareReport;
      case 'export': return flags.enableExport;
      case 'schedule': return flags.enableScheduling;
      default: return true;
    }
  }
}
