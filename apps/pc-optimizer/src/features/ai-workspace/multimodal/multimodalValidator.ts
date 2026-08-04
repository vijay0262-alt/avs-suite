/**
 * Multimodal AI Interaction Platform — Validator
 *
 * EPIC 5 PHASE A PART 6
 *
 * Validates multimodal inputs, normalized inputs, and processing results
 * against configuration rules.
 */
import type {
  MultimodalInput,
  NormalizedInput,
  ProcessingResult,
  MultimodalConfiguration,
  MultimodalValidationResult,
  MultimodalValidationError,
  MultimodalValidationWarning,
  EnrichedContext,
} from './types';

export class MultimodalValidator {
  private _config: MultimodalConfiguration;

  constructor(config: MultimodalConfiguration) {
    this._config = config;
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  validateInput(input: MultimodalInput): MultimodalValidationResult {
    const errors: MultimodalValidationError[] = [];
    const warnings: MultimodalValidationWarning[] = [];

    if (!input.id) {
      errors.push({ code: 'MISSING_ID', message: 'Input id is required', field: 'id' });
    }
    if (!input.timestamp) {
      errors.push({ code: 'MISSING_TIMESTAMP', message: 'Timestamp is required', field: 'timestamp' });
    }
    if (!input.contentReference) {
      errors.push({ code: 'MISSING_CONTENT', message: 'Content reference is required', field: 'contentReference' });
    }
    if (input.metadata.sizeBytes > this._config.validationRules.maxInputSizeBytes) {
      errors.push({
        code: 'INPUT_TOO_LARGE',
        message: `Input size ${input.metadata.sizeBytes} exceeds max ${this._config.validationRules.maxInputSizeBytes}`,
        field: 'metadata.sizeBytes',
      });
    }
    if (!this._config.supportedModalities.includes(input.modality) && input.modality !== 'future_modality') {
      warnings.push({
        code: 'UNSUPPORTED_MODALITY',
        message: `Modality ${input.modality} is not in supported list`,
        field: 'modality',
      });
    }
    if (input.metadata.confidence < 0 || input.metadata.confidence > 1) {
      errors.push({
        code: 'INVALID_CONFIDENCE',
        message: 'Confidence must be between 0 and 1',
        field: 'metadata.confidence',
      });
    }
    if (this._config.validationRules.allowedLanguages.length > 0 &&
        !this._config.validationRules.allowedLanguages.includes(input.language)) {
      warnings.push({
        code: 'LANGUAGE_NOT_ALLOWED',
        message: `Language ${input.language} not in allowed list`,
        field: 'language',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateNormalized(normalized: NormalizedInput): MultimodalValidationResult {
    const errors: MultimodalValidationError[] = [];
    const warnings: MultimodalValidationWarning[] = [];

    if (!normalized.id) {
      errors.push({ code: 'MISSING_ID', message: 'Normalized input id is required', field: 'id' });
    }
    if (!normalized.inputId) {
      errors.push({ code: 'MISSING_INPUT_ID', message: 'Source input id is required', field: 'inputId' });
    }
    if (normalized.text.length === 0) {
      warnings.push({ code: 'EMPTY_TEXT', message: 'Normalized text is empty', field: 'text' });
    }
    if (normalized.confidence < this._config.validationRules.minConfidenceThreshold) {
      warnings.push({
        code: 'LOW_CONFIDENCE',
        message: `Confidence ${normalized.confidence} below threshold ${this._config.validationRules.minConfidenceThreshold}`,
        field: 'confidence',
      });
    }
    for (const w of normalized.warnings) {
      warnings.push({ code: w.code, message: w.message, field: w.field });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateEnrichedContext(enriched: EnrichedContext): MultimodalValidationResult {
    const errors: MultimodalValidationError[] = [];
    const warnings: MultimodalValidationWarning[] = [];

    if (!enriched.inputId) {
      errors.push({ code: 'MISSING_INPUT_ID', message: 'Input id is required', field: 'inputId' });
    }
    if (!enriched.aiAssistantContext) {
      errors.push({ code: 'MISSING_AI_ASSISTANT_CONTEXT', message: 'AI Assistant context is required', field: 'aiAssistantContext' });
    }
    if (enriched.aiAssistantContext.sources.length === 0) {
      warnings.push({ code: 'NO_CONTEXT_SOURCES', message: 'No context sources available', field: 'aiAssistantContext.sources' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateProcessingResult(result: ProcessingResult): MultimodalValidationResult {
    const errors: MultimodalValidationError[] = [];
    const warnings: MultimodalValidationWarning[] = [];

    if (!result.inputId) {
      errors.push({ code: 'MISSING_INPUT_ID', message: 'Input id is required', field: 'inputId' });
    }
    if (result.status === 'failed') {
      errors.push({ code: 'PROCESSING_FAILED', message: 'Processing failed', field: 'status' });
    }
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        if (!err.recoverable) {
          errors.push({ code: err.code, message: err.message, field: err.phase });
        } else {
          warnings.push({ code: err.code, message: err.message, field: err.phase });
        }
      }
    }
    if (result.processingTimeMs > this._config.performanceTargets.routingTargetMs +
        this._config.performanceTargets.normalizationTargetMs +
        this._config.performanceTargets.contextEnrichmentTargetMs) {
      warnings.push({
        code: 'SLOW_PROCESSING',
        message: `Processing time ${result.processingTimeMs}ms exceeds target`,
        field: 'processingTimeMs',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }
}
