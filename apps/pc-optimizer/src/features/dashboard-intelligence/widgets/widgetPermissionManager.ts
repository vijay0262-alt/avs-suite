/**
 * Widget Permission Manager — checks widget permissions.
 *
 * Supports:
 *   Subscription, Capabilities, Quota, Feature Flags,
 *   Enterprise Policies, Device Policies.
 */
import type {
  WidgetDefinitionEx,
  WidgetValidationResult,
  WidgetValidationIssue,
  WidgetFrameworkConfiguration,
} from './types';

export class WidgetPermissionManager {
  private _config: WidgetFrameworkConfiguration;

  constructor(config: WidgetFrameworkConfiguration) {
    this._config = config;
  }

  updateConfig(config: WidgetFrameworkConfiguration): void {
    this._config = config;
  }

  checkPermissions(
    def: WidgetDefinitionEx,
    userPlan: string,
    userFeatures: string[],
    hasQuota: boolean,
  ): WidgetValidationResult {
    const issues: WidgetValidationIssue[] = [];

    // Subscription check
    const planOrder = ['FREE', 'PRO', 'ENTERPRISE', 'FUTURE'];
    const userPlanIdx = planOrder.indexOf(userPlan as 'FREE' | 'PRO' | 'ENTERPRISE' | 'FUTURE');
    const requiredPlanIdx = planOrder.indexOf(def.permissions.minPlan);

    if (userPlanIdx < requiredPlanIdx) {
      issues.push({
        level: 'error',
        code: 'PERMISSION_PLAN_INSUFFICIENT',
        message: `Widget requires ${def.permissions.minPlan} plan, user has ${userPlan}`,
      });
    }

    // Capabilities check
    for (const cap of def.capabilities) {
      if (!userFeatures.includes(cap)) {
        issues.push({
          level: 'error',
          code: 'PERMISSION_CAPABILITY_MISSING',
          message: `Missing required capability: ${cap}`,
        });
      }
    }

    // Feature flags check
    for (const feature of def.permissions.requiredFeatures) {
      if (this._config.featureFlags[feature] === false) {
        issues.push({
          level: 'error',
          code: 'PERMISSION_FEATURE_DISABLED',
          message: `Feature disabled: ${feature}`,
        });
      }
    }

    // Quota check
    if (def.permissions.requiresQuota && !hasQuota) {
      issues.push({
        level: 'error',
        code: 'PERMISSION_NO_QUOTA',
        message: 'Widget requires quota but none available',
      });
    }

    // Enterprise policies
    if (this._config.permissionRules.strictMode) {
      for (const [key, value] of Object.entries(this._config.permissionRules.enterprisePolicies)) {
        if (value === false && def.permissions.futurePolicies[key] === true) {
          issues.push({
            level: 'error',
            code: 'PERMISSION_ENTERPRISE_POLICY',
            message: `Enterprise policy denies access: ${key}`,
          });
        }
      }
    }

    // Device policies
    for (const [key, value] of Object.entries(this._config.permissionRules.devicePolicies)) {
      if (value === false && def.futureMetadata[key] === true) {
        issues.push({
          level: 'warning',
          code: 'PERMISSION_DEVICE_POLICY',
          message: `Device policy may restrict: ${key}`,
        });
      }
    }

    return {
      valid: !issues.some((i) => i.level === 'error'),
      issues,
    };
  }

  canAccess(
    def: WidgetDefinitionEx,
    userPlan: string,
    userFeatures: string[],
    hasQuota: boolean,
  ): boolean {
    return this.checkPermissions(def, userPlan, userFeatures, hasQuota).valid;
  }
}
