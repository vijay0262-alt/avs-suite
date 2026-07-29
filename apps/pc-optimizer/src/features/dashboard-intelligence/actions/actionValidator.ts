/**
 * Action Validator — validates action definitions and contexts.
 *
 * Ensures every action has required fields and valid configuration.
 */
import type {
  DashboardActionDefinition,
  ActionContext,
  ActionValidationResult,
  ActionConfiguration,
} from './types';

export class ActionValidator {
  private _config: ActionConfiguration;

  constructor(config: ActionConfiguration) {
    this._config = config;
  }

  updateConfig(config: ActionConfiguration): void {
    this._config = config;
  }

  validateDefinition(definition: DashboardActionDefinition): ActionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!definition.id || definition.id.trim().length === 0) {
      errors.push('Action id is required');
    }
    if (!definition.title || definition.title.trim().length === 0) {
      errors.push('Action title is required');
    }
    if (!definition.description || definition.description.trim().length === 0) {
      warnings.push('Action description is empty');
    }
    if (!definition.widgetId || definition.widgetId.trim().length === 0) {
      errors.push('Widget id is required');
    }
    if (!definition.actionType) {
      errors.push('Action type is required');
    }
    if (!definition.category) {
      errors.push('Action category is required');
    }
    if (definition.explanation) {
      if (definition.explanation.confidence < 0 || definition.explanation.confidence > 1) {
        warnings.push('Explanation confidence should be between 0 and 1');
      }
      if (definition.explanation.estimatedTime < 0) {
        warnings.push('Estimated time should be non-negative');
      }
    }

    const maxPerWidget = this._config.maxActionsPerWidget;
    void maxPerWidget; // Checked by registry during registration

    return { valid: errors.length === 0, errors, warnings };
  }

  validateContext(context: ActionContext): ActionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context.actionId) errors.push('Action id is required in context');
    if (!context.widgetId) errors.push('Widget id is required in context');
    if (!context.userPlan) errors.push('User plan is required in context');
    if (!context.options) errors.push('Options are required in context');

    return { valid: errors.length === 0, errors, warnings };
  }

  validateForExecution(
    definition: DashboardActionDefinition,
    context: ActionContext,
  ): ActionValidationResult {
    const defResult = this.validateDefinition(definition);
    const ctxResult = this.validateContext(context);
    const errors = [...defResult.errors, ...ctxResult.errors];
    const warnings = [...defResult.warnings, ...ctxResult.warnings];

    if (definition.widgetId !== context.widgetId) {
      errors.push('Action widget id does not match context widget id');
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
