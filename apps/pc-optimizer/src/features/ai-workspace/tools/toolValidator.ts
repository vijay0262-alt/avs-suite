/**
 * AI Tool Framework — Validator
 *
 * EPIC 5 PHASE A PART 2
 */
import type { ToolValidationResult, ToolDefinition, ToolInput, Tool } from './types';

export class ToolValidator {
  validateDefinition(def: ToolDefinition): ToolValidationResult {
    const errors: { code: string; message: string; field?: string }[] = [];
    const warnings: { code: string; message: string; field?: string }[] = [];

    if (!def.id) errors.push({ code: 'NO_ID', message: 'Tool ID is required', field: 'id' });
    if (!def.name) errors.push({ code: 'NO_NAME', message: 'Tool name is required', field: 'name' });
    if (!def.description) errors.push({ code: 'NO_DESCRIPTION', message: 'Tool description is required', field: 'description' });
    if (def.supportedIntents.length === 0) errors.push({ code: 'NO_INTENTS', message: 'Tool must support at least one intent', field: 'supportedIntents' });
    if (def.estimatedDuration < 0) errors.push({ code: 'NEGATIVE_DURATION', message: 'estimatedDuration must be >= 0', field: 'estimatedDuration' });

    if (def.requiredContext.length === 0) {
      warnings.push({ code: 'NO_REQUIRED_CONTEXT', message: 'Tool has no required context — it may produce low-quality results', field: 'requiredContext' });
    }

    return { valid: errors.length === 0, errors, warnings, futureMetadata: {} };
  }

  validateTool(tool: Tool): ToolValidationResult {
    return this.validateDefinition(tool.definition);
  }

  validateInput(input: ToolInput, tool: Tool | null): ToolValidationResult {
    const errors: { code: string; message: string; field?: string }[] = [];
    const warnings: { code: string; message: string; field?: string }[] = [];

    if (!input.toolId) errors.push({ code: 'NO_TOOL_ID', message: 'toolId is required', field: 'toolId' });
    if (!input.context) errors.push({ code: 'NO_CONTEXT', message: 'context is required', field: 'context' });
    if (!input.userPermissionLevel) errors.push({ code: 'NO_PERMISSION', message: 'userPermissionLevel is required', field: 'userPermissionLevel' });

    if (tool) {
      for (const reqCtx of tool.definition.requiredContext) {
        const source = input.context.sources.find((s) => s.type === reqCtx);
        if (!source || !source.available) {
          errors.push({
            code: 'MISSING_CONTEXT',
            message: `Required context "${reqCtx}" is not available`,
            field: `context.${reqCtx}`,
          });
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings, futureMetadata: {} };
  }
}
