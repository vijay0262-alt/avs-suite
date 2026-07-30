/**
 * AI Workspace Personalization Platform — Preference Importer
 *
 * EPIC 5 PHASE A PART 7
 *
 * Imports user preferences, profiles, and templates from a portable
 * format. Respects enterprise policies and validates data integrity.
 */
import type {
  PreferenceExportData,
  PreferenceImportResult,
  UserPreferences,
  WorkspaceProfile,
  WorkspaceTemplate,
  WorkspaceConfiguration,
} from './types';
import { WorkspaceValidator } from './workspaceValidator';

export class PreferenceImporter {
  private _config: WorkspaceConfiguration;
  private _validator: WorkspaceValidator;

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
    this._validator = new WorkspaceValidator(config);
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
    this._validator.updateConfig(config);
  }

  import(data: PreferenceExportData): PreferenceImportResult {
    if (this._config.enterprisePolicies.blockImportExport) {
      return {
        success: false,
        importedPreferences: null,
        importedProfile: null,
        importedTemplateCount: 0,
        errors: ['Import/export is blocked by enterprise policy'],
        warnings: [],
        futureMetadata: {},
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    const exportValidation = this._validator.validateExportData(data);
    if (!exportValidation.valid) {
      errors.push(...exportValidation.errors.map((e) => `${e.field}: ${e.message}`));
      return {
        success: false,
        importedPreferences: null,
        importedProfile: null,
        importedTemplateCount: 0,
        errors,
        warnings: exportValidation.warnings.map((w) => w.message),
        futureMetadata: {},
      };
    }

    let preferences: UserPreferences | null = null;
    if (data.preferences) {
      const prefValidation = this._validator.validatePreferences(data.preferences);
      if (!prefValidation.valid) {
        errors.push(...prefValidation.errors.map((e) => `${e.field}: ${e.message}`));
      } else {
        preferences = structuredClone(data.preferences);
        for (const w of prefValidation.warnings) {
          warnings.push(w.message);
        }
      }
    }

    let profile: WorkspaceProfile | null = null;
    if (data.profile) {
      const profileValidation = this._validator.validateProfile(data.profile);
      if (!profileValidation.valid) {
        warnings.push(...profileValidation.errors.map((e) => `Profile: ${e.message}`));
      } else {
        profile = structuredClone(data.profile);
      }
    }

    let validTemplates: WorkspaceTemplate[] = [];
    if (data.templates && data.templates.length > 0) {
      for (const template of data.templates) {
        const templateValidation = this._validator.validateTemplate(template);
        if (templateValidation.valid) {
          validTemplates.push(structuredClone(template));
        } else {
          warnings.push(`Template "${template.name}": ${templateValidation.errors.map((e) => e.message).join(', ')}`);
        }
      }
    }

    if (preferences && this._config.privacySettings.collectBehaviorData === false) {
      preferences.learnedPreferences = [];
      warnings.push('Behavior data collection is disabled; learned preferences were not imported.');
    }

    return {
      success: errors.length === 0,
      importedPreferences: preferences,
      importedProfile: profile,
      importedTemplateCount: validTemplates.length,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  importFromJson(json: string): PreferenceImportResult {
    let data: PreferenceExportData;
    try {
      data = JSON.parse(json) as PreferenceExportData;
    } catch {
      return {
        success: false,
        importedPreferences: null,
        importedProfile: null,
        importedTemplateCount: 0,
        errors: ['Invalid JSON format'],
        warnings: [],
        futureMetadata: {},
      };
    }
    return this.import(data);
  }
}
