/**
 * Dashboard Validator — validates dashboard integrity.
 *
 * Validates:
 *   Widgets, Providers, Layouts, Permissions, Feature Flags.
 */
import type {
  WidgetDefinition,
  LayoutDefinition,
  DashboardConfiguration,
  DashboardValidationResult,
  DashboardValidationIssue,
  WidgetInstance,
} from './types';

export class DashboardValidator {
  private _config: DashboardConfiguration;

  constructor(config: DashboardConfiguration) {
    this._config = config;
  }

  updateConfig(config: DashboardConfiguration): void {
    this._config = config;
  }

  validateWidget(def: WidgetDefinition): DashboardValidationResult {
    const issues: DashboardValidationIssue[] = [];

    if (!def.type) {
      issues.push({ level: 'error', code: 'WIDGET_NO_TYPE', message: 'Widget missing type' });
    }
    if (!def.title) {
      issues.push({ level: 'error', code: 'WIDGET_NO_TITLE', message: 'Widget missing title' });
    }
    if (!def.providerName) {
      issues.push({ level: 'error', code: 'WIDGET_NO_PROVIDER', message: 'Widget missing provider name' });
    }
    if (!def.permissions) {
      issues.push({ level: 'error', code: 'WIDGET_NO_PERMISSIONS', message: 'Widget missing permissions' });
    }

    // Check feature flags
    if (def.type === 'ai_morning_brief' && !this._config.featureFlags.enableMorningBrief) {
      issues.push({ level: 'warning', code: 'WIDGET_FEATURE_DISABLED', message: 'Morning brief feature is disabled' });
    }
    if (def.type === 'prediction_summary' && !this._config.featureFlags.enablePredictions) {
      issues.push({ level: 'warning', code: 'WIDGET_FEATURE_DISABLED', message: 'Predictions feature is disabled' });
    }
    if (def.type === 'device_profile' && !this._config.featureFlags.enableDeviceProfile) {
      issues.push({ level: 'warning', code: 'WIDGET_FEATURE_DISABLED', message: 'Device profile feature is disabled' });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateLayout(def: LayoutDefinition): DashboardValidationResult {
    const issues: DashboardValidationIssue[] = [];

    if (!def.type) {
      issues.push({ level: 'error', code: 'LAYOUT_NO_TYPE', message: 'Layout missing type' });
    }
    if (def.columns < 1) {
      issues.push({ level: 'error', code: 'LAYOUT_INVALID_COLUMNS', message: 'Layout must have at least 1 column' });
    }
    if (def.maxWidgets < 1) {
      issues.push({ level: 'error', code: 'LAYOUT_INVALID_MAX', message: 'Layout must allow at least 1 widget' });
    }
    if (def.widgetOrder.length === 0) {
      issues.push({ level: 'warning', code: 'LAYOUT_NO_WIDGETS', message: 'Layout has no widgets' });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validatePermissions(
    def: WidgetDefinition,
    userPlan: string,
    userFeatures: string[],
    hasQuota: boolean,
  ): DashboardValidationResult {
    const issues: DashboardValidationIssue[] = [];

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

    for (const feature of def.permissions.requiredFeatures) {
      if (!userFeatures.includes(feature)) {
        issues.push({
          level: 'error',
          code: 'PERMISSION_FEATURE_MISSING',
          message: `Missing required feature: ${feature}`,
        });
      }
    }

    if (def.permissions.requiresQuota && !hasQuota) {
      issues.push({
        level: 'error',
        code: 'PERMISSION_NO_QUOTA',
        message: 'Widget requires quota but none available',
      });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateWidgetInstance(widget: WidgetInstance): DashboardValidationResult {
    const issues: DashboardValidationIssue[] = [];

    if (!widget.id) {
      issues.push({ level: 'error', code: 'WIDGET_INSTANCE_NO_ID', message: 'Widget instance missing ID' });
    }
    if (!widget.definition) {
      issues.push({ level: 'error', code: 'WIDGET_INSTANCE_NO_DEF', message: 'Widget instance missing definition' });
    }
    if (!widget.state) {
      issues.push({ level: 'error', code: 'WIDGET_INSTANCE_NO_STATE', message: 'Widget instance missing state' });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateAll(): DashboardValidationResult {
    const allIssues: DashboardValidationIssue[] = [];

    for (const def of this._config.widgetDefinitions) {
      const result = this.validateWidget(def);
      allIssues.push(...result.issues);
    }

    for (const def of this._config.layoutDefinitions) {
      const result = this.validateLayout(def);
      allIssues.push(...result.issues);
    }

    return {
      valid: !allIssues.some((i) => i.level === 'error'),
      issues: allIssues,
    };
  }
}
