/**
 * AI Workspace Personalization Platform — Preference Exporter
 *
 * EPIC 5 PHASE A PART 7
 *
 * Exports user preferences, profiles, and templates to a portable
 * format. Respects enterprise policies and privacy settings.
 */
import type {
  UserPreferences,
  WorkspaceProfile,
  WorkspaceTemplate,
  PreferenceExportData,
  WorkspaceConfiguration,
} from './types';

export class PreferenceExporter {
  private _config: WorkspaceConfiguration;

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
  }

  export(
    userId: string,
    preferences: UserPreferences,
    profile: WorkspaceProfile | null,
    templates: WorkspaceTemplate[],
  ): PreferenceExportData {
    if (this._config.enterprisePolicies.blockImportExport) {
      throw new Error('Import/export is blocked by enterprise policy');
    }
    if (!this._config.privacySettings.allowDataExport) {
      throw new Error('Data export is disabled by privacy settings');
    }

    return {
      version: this._config.configVersion,
      exportedAt: new Date().toISOString(),
      userId,
      preferences: structuredClone(preferences),
      profile: profile ? structuredClone(profile) : null,
      templates: templates.map((t) => structuredClone(t)),
      futureMetadata: {},
    };
  }

  exportToJson(data: PreferenceExportData): string {
    return JSON.stringify(data, null, 2);
  }

  exportToFile(data: PreferenceExportData): { filename: string; content: string; mimeType: string } {
    const json = this.exportToJson(data);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `workspace-preferences-${data.userId}-${timestamp}.json`,
      content: json,
      mimeType: 'application/json',
    };
  }

  exportSummary(data: PreferenceExportData): {
    preferenceCount: number;
    hasProfile: boolean;
    templateCount: number;
    profileType: string;
    personalizationEnabled: boolean;
  } {
    return {
      preferenceCount: data.preferences.learnedPreferences.length,
      hasProfile: data.profile !== null,
      templateCount: data.templates.length,
      profileType: data.preferences.profileType,
      personalizationEnabled: data.preferences.personalizationEnabled,
    };
  }
}
