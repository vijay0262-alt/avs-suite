/**
 * Widget Validator — validates widget definitions and instances.
 *
 * Validates:
 *   Widget definitions, providers, actions, permissions, configuration.
 */
import type {
  WidgetDefinitionEx,
  WidgetValidationResult,
  WidgetValidationIssue,
  WidgetInstanceEx,
  WidgetFrameworkConfiguration,
} from './types';

export class WidgetValidator {
  private _config: WidgetFrameworkConfiguration;

  constructor(config: WidgetFrameworkConfiguration) {
    this._config = config;
  }

  updateConfig(config: WidgetFrameworkConfiguration): void {
    this._config = config;
  }

  validateDefinition(def: WidgetDefinitionEx): WidgetValidationResult {
    const issues: WidgetValidationIssue[] = [];

    if (!def.type) {
      issues.push({ level: 'error', code: 'WIDGET_NO_TYPE', message: 'Widget missing type' });
    }
    if (!def.title) {
      issues.push({ level: 'error', code: 'WIDGET_NO_TITLE', message: 'Widget missing title' });
    }
    if (!def.providerFactory) {
      issues.push({ level: 'error', code: 'WIDGET_NO_PROVIDER', message: 'Widget missing provider factory' });
    }
    if (!def.permissions) {
      issues.push({ level: 'error', code: 'WIDGET_NO_PERMISSIONS', message: 'Widget missing permissions' });
    }
    if (def.refreshIntervalMs < 0) {
      issues.push({ level: 'error', code: 'WIDGET_INVALID_REFRESH_INTERVAL', message: 'Refresh interval cannot be negative' });
    }
    if (def.actions) {
      for (const action of def.actions) {
        if (!action.id) {
          issues.push({ level: 'error', code: 'ACTION_NO_ID', message: 'Action missing ID' });
        }
        if (!action.label) {
          issues.push({ level: 'warning', code: 'ACTION_NO_LABEL', message: 'Action missing label' });
        }
      }
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateInstance(instance: WidgetInstanceEx): WidgetValidationResult {
    const issues: WidgetValidationIssue[] = [];

    if (!instance.id) {
      issues.push({ level: 'error', code: 'INSTANCE_NO_ID', message: 'Widget instance missing ID' });
    }
    if (!instance.definition) {
      issues.push({ level: 'error', code: 'INSTANCE_NO_DEF', message: 'Widget instance missing definition' });
    }
    if (!instance.lifecycle) {
      issues.push({ level: 'error', code: 'INSTANCE_NO_LIFECYCLE', message: 'Widget instance missing lifecycle state' });
    }
    if (!instance.state) {
      issues.push({ level: 'error', code: 'INSTANCE_NO_STATE', message: 'Widget instance missing runtime state' });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateProvider(provider: { validate(): boolean }): WidgetValidationResult {
    const issues: WidgetValidationIssue[] = [];

    if (!provider.validate()) {
      issues.push({ level: 'error', code: 'PROVIDER_INVALID', message: 'Provider validation failed' });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateConfig(): WidgetValidationResult {
    const issues: WidgetValidationIssue[] = [];

    if (this._config.lifecycleRules.maxConcurrentLoads < 1) {
      issues.push({ level: 'error', code: 'CONFIG_INVALID_CONCURRENT', message: 'Max concurrent loads must be at least 1' });
    }
    if (this._config.lifecycleRules.loadTimeoutMs < 100) {
      issues.push({ level: 'warning', code: 'CONFIG_LOW_TIMEOUT', message: 'Load timeout is very low' });
    }
    if (this._config.maxWidgets < 1) {
      issues.push({ level: 'error', code: 'CONFIG_INVALID_MAX_WIDGETS', message: 'Max widgets must be at least 1' });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }
}
