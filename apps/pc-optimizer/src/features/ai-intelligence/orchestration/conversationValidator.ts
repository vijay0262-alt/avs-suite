/**
 * Conversation Validator — validates conversation integrity.
 *
 * Validates:
 *   Intent, Evidence, Confidence, Referenced Objects,
 *   Context Completeness, Tool Availability.
 */
import type {
  ConversationResponse,
  ConversationValidationResult,
  ConversationValidationIssue,
  ConversationContext,
  IntentResolutionResult,
  TaskPlan,
  ConversationConfiguration,
} from './types';

export class ConversationValidator {
  private _config: ConversationConfiguration;

  constructor(config: ConversationConfiguration) {
    this._config = config;
  }

  updateConfig(config: ConversationConfiguration): void {
    this._config = config;
  }

  validateIntent(resolution: IntentResolutionResult): ConversationValidationResult {
    const issues: ConversationValidationIssue[] = [];

    if (resolution.intent === 'unknown') {
      issues.push({ level: 'error', code: 'INTENT_UNKNOWN', message: 'Intent could not be resolved' });
    }

    if (resolution.confidence < this._config.intentRules.minConfidence) {
      issues.push({
        level: 'warning',
        code: 'INTENT_LOW_CONFIDENCE',
        message: `Intent confidence (${resolution.confidence.toFixed(2)}) below threshold (${this._config.intentRules.minConfidence})`,
      });
    }

    const validIntents = this._config.intentDefinitions.map((d) => d.type);
    if (!validIntents.includes(resolution.intent)) {
      issues.push({ level: 'error', code: 'INTENT_INVALID', message: `Unknown intent type: ${resolution.intent}` });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateContext(context: ConversationContext): ConversationValidationResult {
    const issues: ConversationValidationIssue[] = [];

    if (!context.contextId) {
      issues.push({ level: 'error', code: 'CONTEXT_NO_ID', message: 'Context missing ID' });
    }

    if (context.metadata.evidenceCount === 0) {
      issues.push({ level: 'warning', code: 'CONTEXT_NO_EVIDENCE', message: 'Context has no evidence' });
    }

    if (context.metadata.modulesUsed.length === 0) {
      issues.push({ level: 'warning', code: 'CONTEXT_NO_MODULES', message: 'No modules used in context' });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateTaskPlan(plan: TaskPlan): ConversationValidationResult {
    const issues: ConversationValidationIssue[] = [];

    if (!plan.id) {
      issues.push({ level: 'error', code: 'PLAN_NO_ID', message: 'Task plan missing ID' });
    }

    if (plan.steps.length === 0) {
      issues.push({ level: 'error', code: 'PLAN_NO_STEPS', message: 'Task plan has no steps' });
    }

    if (plan.steps.length > this._config.plannerRules.maxSteps) {
      issues.push({ level: 'warning', code: 'PLAN_TOO_MANY_STEPS', message: `Plan exceeds max steps (${this._config.plannerRules.maxSteps})` });
    }

    const validIntents = this._config.intentDefinitions.map((d) => d.type);
    if (!validIntents.includes(plan.intent)) {
      issues.push({ level: 'error', code: 'PLAN_INVALID_INTENT', message: `Unknown intent in plan: ${plan.intent}` });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateResponse(response: ConversationResponse): ConversationValidationResult {
    const issues: ConversationValidationIssue[] = [];

    if (!response.id) {
      issues.push({ level: 'error', code: 'RESPONSE_NO_ID', message: 'Response missing ID' });
    }

    if (!response.summary) {
      issues.push({ level: 'error', code: 'RESPONSE_NO_SUMMARY', message: 'Response missing summary' });
    }

    if (response.confidence < this._config.minConfidenceThreshold) {
      issues.push({
        level: 'warning',
        code: 'RESPONSE_LOW_CONFIDENCE',
        message: `Response confidence (${response.confidence.toFixed(2)}) below threshold (${this._config.minConfidenceThreshold})`,
      });
    }

    if (response.supportingEvidence.length === 0) {
      issues.push({ level: 'warning', code: 'RESPONSE_NO_EVIDENCE', message: 'Response has no supporting evidence' });
    }

    if (!response.explanation) {
      issues.push({ level: 'warning', code: 'RESPONSE_NO_EXPLANATION', message: 'Response missing explanation' });
    }

    if (response.explanation && response.explanation.assumptions.length === 0) {
      issues.push({ level: 'warning', code: 'RESPONSE_NO_ASSUMPTIONS', message: 'Explanation has no assumptions' });
    }

    return { valid: !issues.some((i) => i.level === 'error'), issues };
  }

  validateToolAvailability(toolNames: string[], availableTools: string[]): ConversationValidationResult {
    const issues: ConversationValidationIssue[] = [];

    for (const name of toolNames) {
      if (!availableTools.includes(name)) {
        issues.push({ level: 'warning', code: 'TOOL_UNAVAILABLE', message: `Tool not available: ${name}` });
      }
    }

    return { valid: true, issues };
  }

  validateAll(
    intent: IntentResolutionResult,
    context: ConversationContext,
    plan: TaskPlan,
    response: ConversationResponse,
  ): ConversationValidationResult {
    const results = [
      this.validateIntent(intent),
      this.validateContext(context),
      this.validateTaskPlan(plan),
      this.validateResponse(response),
    ];

    const allIssues = results.flatMap((r) => r.issues);
    return {
      valid: !allIssues.some((i) => i.level === 'error'),
      issues: allIssues,
    };
  }
}
