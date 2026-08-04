/**
 * AVS AI Assistant Platform — Validator
 *
 * EPIC 5 PHASE A PART 1
 *
 * Validates AIAssistant conversations, responses, suggestions, and action plans.
 * Ensures structural integrity and evidence-based requirements.
 */
import type {
  AIAssistantValidationResult,
  AIAssistantValidationError,
  AIAssistantValidationWarning,
  AIAssistantConversation,
  AIAssistantResponse,
  AIAssistantSuggestion,
  AIAssistantActionPlan,
  AIAssistantContext,
  AIAssistantPromptInput,
} from './types';
import { clampConfidence } from './types';

export class AIAssistantValidator {
  validatePrompt(input: AIAssistantPromptInput): AIAssistantValidationResult {
    const errors: AIAssistantValidationError[] = [];
    const warnings: AIAssistantValidationWarning[] = [];

    if (!input.prompt || input.prompt.trim().length === 0) {
      errors.push({ code: 'EMPTY_PROMPT', message: 'Prompt cannot be empty', field: 'prompt' });
    }

    if (input.prompt && input.prompt.length > 5000) {
      warnings.push({ code: 'LONG_PROMPT', message: 'Prompt is very long, processing may be slower', field: 'prompt' });
    }

    if (!input.userPermissionLevel) {
      errors.push({ code: 'NO_PERMISSION_LEVEL', message: 'User permission level is required', field: 'userPermissionLevel' });
    }

    return { valid: errors.length === 0, errors, warnings, futureMetadata: {} };
  }

  validateConversation(conversation: AIAssistantConversation): AIAssistantValidationResult {
    const errors: AIAssistantValidationError[] = [];
    const warnings: AIAssistantValidationWarning[] = [];

    if (!conversation.id) {
      errors.push({ code: 'NO_ID', message: 'Conversation ID is required', field: 'id' });
    }

    if (!conversation.createdAt) {
      errors.push({ code: 'NO_CREATED_AT', message: 'createdAt is required', field: 'createdAt' });
    }

    if (conversation.confidence < 0 || conversation.confidence > 1) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence must be between 0 and 1', field: 'confidence' });
    }

    if (conversation.messages.length === 0) {
      warnings.push({ code: 'NO_MESSAGES', message: 'Conversation has no messages', field: 'messages' });
    }

    if (conversation.context.sources.length === 0) {
      warnings.push({ code: 'NO_CONTEXT_SOURCES', message: 'Conversation has no context sources', field: 'context' });
    }

    return { valid: errors.length === 0, errors, warnings, futureMetadata: {} };
  }

  validateResponse(response: AIAssistantResponse): AIAssistantValidationResult {
    const errors: AIAssistantValidationError[] = [];
    const warnings: AIAssistantValidationWarning[] = [];

    if (!response.id) {
      errors.push({ code: 'NO_ID', message: 'Response ID is required', field: 'id' });
    }

    if (!response.answer || response.answer.trim().length === 0) {
      errors.push({ code: 'EMPTY_ANSWER', message: 'Response answer cannot be empty', field: 'answer' });
    }

    if (response.confidence < 0 || response.confidence > 1) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence must be between 0 and 1', field: 'confidence' });
    }

    if (response.supportingEvidence.length === 0) {
      warnings.push({ code: 'NO_EVIDENCE', message: 'Response has no supporting evidence', field: 'supportingEvidence' });
    }

    if (!response.generatedAt) {
      errors.push({ code: 'NO_TIMESTAMP', message: 'generatedAt is required', field: 'generatedAt' });
    }

    return { valid: errors.length === 0, errors, warnings, futureMetadata: {} };
  }

  validateSuggestion(suggestion: AIAssistantSuggestion): AIAssistantValidationResult {
    const errors: AIAssistantValidationError[] = [];
    const warnings: AIAssistantValidationWarning[] = [];

    if (!suggestion.id) {
      errors.push({ code: 'NO_ID', message: 'Suggestion ID is required', field: 'id' });
    }

    if (!suggestion.title || suggestion.title.trim().length === 0) {
      errors.push({ code: 'EMPTY_TITLE', message: 'Suggestion title cannot be empty', field: 'title' });
    }

    if (suggestion.confidence < 0 || suggestion.confidence > 1) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence must be between 0 and 1', field: 'confidence' });
    }

    if (suggestion.evidence.length === 0) {
      warnings.push({ code: 'NO_EVIDENCE', message: 'Suggestion has no supporting evidence', field: 'evidence' });
    }

    return { valid: errors.length === 0, errors, warnings, futureMetadata: {} };
  }

  validateActionPlan(plan: AIAssistantActionPlan): AIAssistantValidationResult {
    const errors: AIAssistantValidationError[] = [];
    const warnings: AIAssistantValidationWarning[] = [];

    if (!plan.id) {
      errors.push({ code: 'NO_ID', message: 'Action plan ID is required', field: 'id' });
    }

    if (!plan.title || plan.title.trim().length === 0) {
      errors.push({ code: 'EMPTY_TITLE', message: 'Action plan title cannot be empty', field: 'title' });
    }

    if (!plan.description || plan.description.trim().length === 0) {
      errors.push({ code: 'EMPTY_DESCRIPTION', message: 'Action plan description cannot be empty', field: 'description' });
    }

    if (plan.evidence.length === 0) {
      warnings.push({ code: 'NO_EVIDENCE', message: 'Action plan has no supporting evidence', field: 'evidence' });
    }

    return { valid: errors.length === 0, errors, warnings, futureMetadata: {} };
  }

  validateContext(context: AIAssistantContext): AIAssistantValidationResult {
    const errors: AIAssistantValidationError[] = [];
    const warnings: AIAssistantValidationWarning[] = [];

    for (const source of context.sources) {
      if (source.confidence < 0 || source.confidence > 1) {
        errors.push({
          code: 'INVALID_SOURCE_CONFIDENCE',
          message: `Source ${source.type} has invalid confidence: ${source.confidence}`,
          field: `sources.${source.type}.confidence`,
        });
      }

      if (source.available && source.confidence < 0.5) {
        warnings.push({
          code: 'LOW_CONFIDENCE_SOURCE',
          message: `Source ${source.type} has low confidence: ${source.confidence}`,
          field: `sources.${source.type}.confidence`,
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings, futureMetadata: {} };
  }

  sanitizeConfidence(value: number): number {
    return clampConfidence(value);
  }
}
