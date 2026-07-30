/**
 * Unified Timeline & Activity Center — Validator
 *
 * Validates timeline items for completeness, correctness, and
 * explainability. Ensures every event has required fields.
 */
import type {
  TimelineItem,
  TimelineEventInput,
  TimelineValidationResult,
  TimelineValidationError,
  TimelineValidationWarning,
  TimelineConfiguration,
} from './types';

export class TimelineValidator {
  private _config: TimelineConfiguration;

  constructor(config: TimelineConfiguration) {
    this._config = config;
  }

  validateInput(input: TimelineEventInput): TimelineValidationResult {
    const errors: TimelineValidationError[] = [];
    const warnings: TimelineValidationWarning[] = [];

    if (!input.title || input.title.trim().length === 0) {
      errors.push({ code: 'MISSING_TITLE', message: 'Title is required', field: 'title' });
    }
    if (!input.summary || input.summary.trim().length === 0) {
      errors.push({ code: 'MISSING_SUMMARY', message: 'Summary is required', field: 'summary' });
    }
    if (!input.sourceModule || input.sourceModule.trim().length === 0) {
      errors.push({ code: 'MISSING_MODULE', message: 'Source module is required', field: 'sourceModule' });
    }
    if (!input.category) {
      errors.push({ code: 'MISSING_CATEGORY', message: 'Category is required', field: 'category' });
    }
    if (!input.eventType) {
      errors.push({ code: 'MISSING_EVENT_TYPE', message: 'Event type is required', field: 'eventType' });
    }
    if (input.confidence !== undefined && input.confidence !== null) {
      if (input.confidence < 0 || input.confidence > 1) {
        errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence must be between 0 and 1', field: 'confidence' });
      }
    }
    if (input.title && input.title.length > this._config.formattingRules.maxTitleLength) {
      warnings.push({ code: 'TITLE_TOO_LONG', message: 'Title exceeds max length and will be truncated', field: 'title' });
    }
    if (input.summary && input.summary.length > this._config.formattingRules.maxSummaryLength) {
      warnings.push({ code: 'SUMMARY_TOO_LONG', message: 'Summary exceeds max length and will be truncated', field: 'summary' });
    }
    if (this._config.featureFlags.enableValidation && (!input.evidence || input.evidence.length === 0)) {
      warnings.push({ code: 'NO_EVIDENCE', message: 'No evidence provided — explainability may be limited', field: 'evidence' });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateItem(item: TimelineItem): TimelineValidationResult {
    const errors: TimelineValidationError[] = [];
    const warnings: TimelineValidationWarning[] = [];

    if (!item.id) {
      errors.push({ code: 'MISSING_ID', message: 'Item ID is required', field: 'id' });
    }
    if (!item.timestamp) {
      errors.push({ code: 'MISSING_TIMESTAMP', message: 'Timestamp is required', field: 'timestamp' });
    }
    if (!item.title) {
      errors.push({ code: 'MISSING_TITLE', message: 'Title is required', field: 'title' });
    }
    if (!item.sourceModule) {
      errors.push({ code: 'MISSING_MODULE', message: 'Source module is required', field: 'sourceModule' });
    }
    if (item.confidence !== null && (item.confidence < 0 || item.confidence > 1)) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence must be between 0 and 1', field: 'confidence' });
    }
    if (item.evidence.length === 0) {
      warnings.push({ code: 'NO_EVIDENCE', message: 'No evidence provided', field: 'evidence' });
    }
    if (item.searchKeywords.length === 0) {
      warnings.push({ code: 'NO_KEYWORDS', message: 'No search keywords — item may not be discoverable', field: 'searchKeywords' });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateBatch(items: TimelineItem[]): TimelineValidationResult {
    const allErrors: TimelineValidationError[] = [];
    const allWarnings: TimelineValidationWarning[] = [];

    for (const item of items) {
      const result = this.validateItem(item);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    return { valid: allErrors.length === 0, errors: allErrors, warnings: allWarnings };
  }
}
