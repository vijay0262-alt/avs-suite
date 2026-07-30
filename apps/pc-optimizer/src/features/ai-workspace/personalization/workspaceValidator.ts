/**
 * AI Workspace Personalization Platform — Validator
 *
 * EPIC 5 PHASE A PART 7
 *
 * Validates user preferences, workspace profiles, templates, and
 * behavior events against configuration rules.
 */
import type {
  UserPreferences,
  WorkspaceProfile,
  WorkspaceTemplate,
  BehaviorEvent,
  WorkspaceConfiguration,
  WorkspaceValidationResult,
  WorkspaceValidationError,
  WorkspaceValidationWarning,
  PersonalizationSuggestion,
  PreferenceExportData,
  PreferenceImportResult,
} from './types';

export class WorkspaceValidator {
  private _config: WorkspaceConfiguration;

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
  }

  validatePreferences(prefs: UserPreferences): WorkspaceValidationResult {
    const errors: WorkspaceValidationError[] = [];
    const warnings: WorkspaceValidationWarning[] = [];

    if (!prefs.userId) {
      errors.push({ code: 'MISSING_USER_ID', message: 'User ID is required', field: 'userId' });
    }
    if (!prefs.profileType) {
      errors.push({ code: 'MISSING_PROFILE_TYPE', message: 'Profile type is required', field: 'profileType' });
    }
    if (this._config.enterprisePolicies.enforceProfiles &&
        !this._config.enterprisePolicies.allowedProfiles.includes(prefs.profileType) &&
        prefs.profileType !== 'future_profile') {
      errors.push({
        code: 'PROFILE_NOT_ALLOWED',
        message: `Profile type ${prefs.profileType} is not allowed by enterprise policy`,
        field: 'profileType',
      });
    }
    if (prefs.profileType === 'custom' && this._config.enterprisePolicies.blockCustomProfiles) {
      errors.push({
        code: 'CUSTOM_PROFILE_BLOCKED',
        message: 'Custom profiles are blocked by enterprise policy',
        field: 'profileType',
      });
    }
    if (prefs.learnedPreferences.length > this._config.preferenceRules.maxLearnedPreferences) {
      warnings.push({
        code: 'TOO_MANY_LEARNED_PREFS',
        message: `Learned preferences (${prefs.learnedPreferences.length}) exceed max (${this._config.preferenceRules.maxLearnedPreferences})`,
        field: 'learnedPreferences',
      });
    }
    for (const pref of prefs.learnedPreferences) {
      if (pref.confidence < 0 || pref.confidence > 1) {
        errors.push({
          code: 'INVALID_CONFIDENCE',
          message: `Learned preference ${pref.key} has confidence outside [0, 1]`,
          field: `learnedPreferences.${pref.key}.confidence`,
        });
      }
      if (pref.confidence < this._config.preferenceRules.minConfidenceThreshold) {
        warnings.push({
          code: 'LOW_CONFIDENCE',
          message: `Learned preference ${pref.key} confidence below threshold`,
          field: `learnedPreferences.${pref.key}.confidence`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateProfile(profile: WorkspaceProfile): WorkspaceValidationResult {
    const errors: WorkspaceValidationError[] = [];
    const warnings: WorkspaceValidationWarning[] = [];

    if (!profile.id) {
      errors.push({ code: 'MISSING_ID', message: 'Profile ID is required', field: 'id' });
    }
    if (!profile.type) {
      errors.push({ code: 'MISSING_TYPE', message: 'Profile type is required', field: 'type' });
    }
    if (!profile.label) {
      errors.push({ code: 'MISSING_LABEL', message: 'Profile label is required', field: 'label' });
    }
    if (this._config.enterprisePolicies.enforceProfiles &&
        !this._config.enterprisePolicies.allowedProfiles.includes(profile.type) &&
        profile.type !== 'future_profile') {
      errors.push({
        code: 'PROFILE_TYPE_NOT_ALLOWED',
        message: `Profile type ${profile.type} is not allowed by enterprise policy`,
        field: 'type',
      });
    }
    if (profile.layout.widgets.length === 0) {
      warnings.push({ code: 'NO_WIDGETS', message: 'Profile has no widgets', field: 'layout.widgets' });
    }
    if (profile.layout.columns < 1) {
      errors.push({ code: 'INVALID_COLUMNS', message: 'Layout columns must be >= 1', field: 'layout.columns' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateTemplate(template: WorkspaceTemplate): WorkspaceValidationResult {
    const errors: WorkspaceValidationError[] = [];
    const warnings: WorkspaceValidationWarning[] = [];

    if (!template.id) {
      errors.push({ code: 'MISSING_ID', message: 'Template ID is required', field: 'id' });
    }
    if (!template.name) {
      errors.push({ code: 'MISSING_NAME', message: 'Template name is required', field: 'name' });
    }
    if (!template.profileType) {
      errors.push({ code: 'MISSING_PROFILE_TYPE', message: 'Template profile type is required', field: 'profileType' });
    }
    if (template.layout.widgets.length === 0) {
      warnings.push({ code: 'NO_WIDGETS', message: 'Template has no widgets', field: 'layout.widgets' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateBehaviorEvent(event: BehaviorEvent): WorkspaceValidationResult {
    const errors: WorkspaceValidationError[] = [];
    const warnings: WorkspaceValidationWarning[] = [];

    if (!event.id) {
      errors.push({ code: 'MISSING_ID', message: 'Event ID is required', field: 'id' });
    }
    if (!event.type) {
      errors.push({ code: 'MISSING_TYPE', message: 'Event type is required', field: 'type' });
    }
    if (!event.userId) {
      errors.push({ code: 'MISSING_USER_ID', message: 'User ID is required', field: 'userId' });
    }
    if (!event.timestamp) {
      errors.push({ code: 'MISSING_TIMESTAMP', message: 'Timestamp is required', field: 'timestamp' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateSuggestion(suggestion: PersonalizationSuggestion): WorkspaceValidationResult {
    const errors: WorkspaceValidationError[] = [];
    const warnings: WorkspaceValidationWarning[] = [];

    if (!suggestion.id) {
      errors.push({ code: 'MISSING_ID', message: 'Suggestion ID is required', field: 'id' });
    }
    if (!suggestion.type) {
      errors.push({ code: 'MISSING_TYPE', message: 'Suggestion type is required', field: 'type' });
    }
    if (suggestion.confidence < 0 || suggestion.confidence > 1) {
      errors.push({
        code: 'INVALID_CONFIDENCE',
        message: 'Confidence must be between 0 and 1',
        field: 'confidence',
      });
    }
    if (suggestion.confidence < this._config.preferenceRules.minConfidenceThreshold) {
      warnings.push({
        code: 'LOW_CONFIDENCE',
        message: `Confidence ${suggestion.confidence} below threshold ${this._config.preferenceRules.minConfidenceThreshold}`,
        field: 'confidence',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateExportData(data: PreferenceExportData): WorkspaceValidationResult {
    const errors: WorkspaceValidationError[] = [];
    const warnings: WorkspaceValidationWarning[] = [];

    if (!data.version) {
      errors.push({ code: 'MISSING_VERSION', message: 'Export version is required', field: 'version' });
    }
    if (!data.exportedAt) {
      errors.push({ code: 'MISSING_EXPORTED_AT', message: 'Export timestamp is required', field: 'exportedAt' });
    }
    if (!data.userId) {
      errors.push({ code: 'MISSING_USER_ID', message: 'User ID is required', field: 'userId' });
    }
    if (!data.preferences) {
      errors.push({ code: 'MISSING_PREFERENCES', message: 'Preferences data is required', field: 'preferences' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  validateImportResult(result: PreferenceImportResult): WorkspaceValidationResult {
    const errors: WorkspaceValidationError[] = [];
    const warnings: WorkspaceValidationWarning[] = [];

    if (!result.success && result.errors.length === 0) {
      warnings.push({ code: 'FAILED_NO_ERRORS', message: 'Import failed but no errors reported', field: 'success' });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }
}
