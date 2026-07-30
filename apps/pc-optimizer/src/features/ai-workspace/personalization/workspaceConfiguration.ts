/**
 * AI Workspace Personalization Platform — Configuration
 *
 * EPIC 5 PHASE A PART 7
 *
 * Configuration-driven personalization with preference rules, template
 * definitions, feature flags, enterprise policies, privacy settings,
 * and performance targets. No hardcoded personalization.
 */
import type {
  WorkspaceConfiguration,
  PreferenceRules,
  TemplateDefinition,
  WorkspaceFeatureFlags,
  EnterprisePolicies,
  PrivacySettings,
  WorkspacePerformanceTargets,
  WorkspaceProfileType,
} from './types';
import {
  createDefaultWorkspaceConfiguration,
  createDefaultPreferenceRules,
  createDefaultTemplateDefinitions,
  createDefaultWorkspaceFeatureFlags,
  createDefaultEnterprisePolicies,
  createDefaultPrivacySettings,
  createDefaultWorkspacePerformanceTargets,
} from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

export const DEFAULT_WORKSPACE_CONFIGURATION: WorkspaceConfiguration = createDefaultWorkspaceConfiguration();

export function createWorkspaceConfiguration(
  overrides?: DeepPartial<WorkspaceConfiguration>,
): WorkspaceConfiguration {
  if (!overrides) return structuredClone(DEFAULT_WORKSPACE_CONFIGURATION);
  return mergeConfiguration(DEFAULT_WORKSPACE_CONFIGURATION, overrides);
}

function mergeConfiguration(
  base: WorkspaceConfiguration,
  overrides: DeepPartial<WorkspaceConfiguration>,
): WorkspaceConfiguration {
  return {
    configVersion: overrides.configVersion ?? base.configVersion,
    preferenceRules: overrides.preferenceRules
      ? mergePreferenceRules(base.preferenceRules, overrides.preferenceRules)
      : base.preferenceRules,
    templateDefinitions: (overrides.templateDefinitions as TemplateDefinition[] | undefined) ?? base.templateDefinitions,
    featureFlags: overrides.featureFlags
      ? {
          ...base.featureFlags,
          ...overrides.featureFlags,
          futureFlags: {
            ...base.featureFlags.futureFlags,
            ...Object.fromEntries(
              Object.entries(overrides.featureFlags.futureFlags ?? {}).filter(([, v]) => v !== undefined),
            ) as Record<string, boolean>,
          },
        }
      : base.featureFlags,
    enterprisePolicies: overrides.enterprisePolicies
      ? mergeEnterprisePolicies(base.enterprisePolicies, overrides.enterprisePolicies)
      : base.enterprisePolicies,
    privacySettings: overrides.privacySettings
      ? mergePrivacySettings(base.privacySettings, overrides.privacySettings)
      : base.privacySettings,
    performanceTargets: overrides.performanceTargets
      ? { ...base.performanceTargets, ...overrides.performanceTargets }
      : base.performanceTargets,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergePreferenceRules(
  base: PreferenceRules,
  overrides: DeepPartial<PreferenceRules>,
): PreferenceRules {
  return {
    minConfidenceThreshold: overrides.minConfidenceThreshold ?? base.minConfidenceThreshold,
    maxLearnedPreferences: overrides.maxLearnedPreferences ?? base.maxLearnedPreferences,
    behaviorAnalysisWindowDays: overrides.behaviorAnalysisWindowDays ?? base.behaviorAnalysisWindowDays,
    suggestionCooldownHours: overrides.suggestionCooldownHours ?? base.suggestionCooldownHours,
    maxSuggestionsPerSession: overrides.maxSuggestionsPerSession ?? base.maxSuggestionsPerSession,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergeEnterprisePolicies(
  base: EnterprisePolicies,
  overrides: DeepPartial<EnterprisePolicies>,
): EnterprisePolicies {
  return {
    enforceProfiles: overrides.enforceProfiles ?? base.enforceProfiles,
    allowedProfiles: (overrides.allowedProfiles as WorkspaceProfileType[] | undefined) ?? base.allowedProfiles,
    blockCustomProfiles: overrides.blockCustomProfiles ?? base.blockCustomProfiles,
    blockImportExport: overrides.blockImportExport ?? base.blockImportExport,
    requireApproval: overrides.requireApproval ?? base.requireApproval,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergePrivacySettings(
  base: PrivacySettings,
  overrides: DeepPartial<PrivacySettings>,
): PrivacySettings {
  return {
    collectBehaviorData: overrides.collectBehaviorData ?? base.collectBehaviorData,
    sharePreferencesAcrossDevices: overrides.sharePreferencesAcrossDevices ?? base.sharePreferencesAcrossDevices,
    anonymizeAnalytics: overrides.anonymizeAnalytics ?? base.anonymizeAnalytics,
    allowDataExport: overrides.allowDataExport ?? base.allowDataExport,
    retentionDays: overrides.retentionDays ?? base.retentionDays,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

export function validateWorkspaceConfiguration(
  config: WorkspaceConfiguration,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.configVersion) errors.push('configVersion is required');
  if (config.preferenceRules.minConfidenceThreshold < 0 || config.preferenceRules.minConfidenceThreshold > 1)
    errors.push('minConfidenceThreshold must be between 0 and 1');
  if (config.preferenceRules.maxLearnedPreferences < 0)
    errors.push('maxLearnedPreferences must be >= 0');
  if (config.preferenceRules.behaviorAnalysisWindowDays < 1)
    errors.push('behaviorAnalysisWindowDays must be >= 1');
  if (config.preferenceRules.suggestionCooldownHours < 0)
    errors.push('suggestionCooldownHours must be >= 0');
  if (config.preferenceRules.maxSuggestionsPerSession < 0)
    errors.push('maxSuggestionsPerSession must be >= 0');
  if (config.privacySettings.retentionDays < 0)
    errors.push('retentionDays must be >= 0');
  if (config.performanceTargets.workspaceLoadTargetMs < 0)
    errors.push('workspaceLoadTargetMs must be >= 0');
  if (config.performanceTargets.preferenceEvaluationTargetMs < 0)
    errors.push('preferenceEvaluationTargetMs must be >= 0');
  if (config.enterprisePolicies.allowedProfiles.length === 0)
    errors.push('allowedProfiles must not be empty');

  return { valid: errors.length === 0, errors };
}
