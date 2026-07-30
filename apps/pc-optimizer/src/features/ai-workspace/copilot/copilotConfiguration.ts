/**
 * AI Copilot Platform — Configuration
 *
 * EPIC 5 PHASE A PART 1
 *
 * Configuration-driven Copilot with intents, templates, rules,
 * permissions, feature flags, and provider config.
 */
import type {
  CopilotConfiguration,
  IntentDefinitions,
  ResponseTemplates,
  SuggestionRules,
  PermissionRules,
  CopilotFeatureFlags,
  ProviderConfiguration,
} from './types';
import {
  createDefaultIntentDefinitions,
  createDefaultResponseTemplates,
  createDefaultSuggestionRules,
  createDefaultPermissionRules,
  createDefaultCopilotFeatureFlags,
  createDefaultProviders,
} from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown>
    ? DeepPartial<T[P]>
    : T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[P];
};

export const DEFAULT_COPILOT_CONFIGURATION: CopilotConfiguration = {
  configVersion: '1.0.0',
  intentDefinitions: createDefaultIntentDefinitions(),
  responseTemplates: createDefaultResponseTemplates(),
  suggestionRules: createDefaultSuggestionRules(),
  permissionRules: createDefaultPermissionRules(),
  featureFlags: createDefaultCopilotFeatureFlags(),
  providers: createDefaultProviders(),
  performanceTargetMs: 500,
  intentResolutionTargetMs: 100,
  responseOrchestrationTargetMs: 300,
  maxConversations: 50,
  maxMessagesPerConversation: 100,
  enableEvents: true,
  futureMetadata: {},
};

export function createCopilotConfiguration(
  overrides?: DeepPartial<CopilotConfiguration>,
): CopilotConfiguration {
  if (!overrides) return structuredClone(DEFAULT_COPILOT_CONFIGURATION);

  return mergeConfiguration(DEFAULT_COPILOT_CONFIGURATION, overrides);
}

function mergeConfiguration(
  base: CopilotConfiguration,
  overrides: DeepPartial<CopilotConfiguration>,
): CopilotConfiguration {
  return {
    configVersion: overrides.configVersion ?? base.configVersion,
    intentDefinitions: overrides.intentDefinitions
      ? mergeIntentDefinitions(base.intentDefinitions, overrides.intentDefinitions)
      : base.intentDefinitions,
    responseTemplates: overrides.responseTemplates
      ? mergeResponseTemplates(base.responseTemplates, overrides.responseTemplates)
      : base.responseTemplates,
    suggestionRules: overrides.suggestionRules
      ? { ...base.suggestionRules, ...overrides.suggestionRules }
      : base.suggestionRules,
    permissionRules: overrides.permissionRules
      ? mergePermissionRules(base.permissionRules, overrides.permissionRules)
      : base.permissionRules,
    featureFlags: overrides.featureFlags
      ? { ...base.featureFlags, ...overrides.featureFlags }
      : base.featureFlags,
    providers: (overrides.providers as ProviderConfiguration[] | undefined) ?? base.providers,
    performanceTargetMs: overrides.performanceTargetMs ?? base.performanceTargetMs,
    intentResolutionTargetMs: overrides.intentResolutionTargetMs ?? base.intentResolutionTargetMs,
    responseOrchestrationTargetMs: overrides.responseOrchestrationTargetMs ?? base.responseOrchestrationTargetMs,
    maxConversations: overrides.maxConversations ?? base.maxConversations,
    maxMessagesPerConversation: overrides.maxMessagesPerConversation ?? base.maxMessagesPerConversation,
    enableEvents: overrides.enableEvents ?? base.enableEvents,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergeIntentDefinitions(
  base: IntentDefinitions,
  overrides: DeepPartial<IntentDefinitions>,
): IntentDefinitions {
  return {
    definitions: (overrides.definitions as IntentDefinitions['definitions'] | undefined) ?? base.definitions,
    minConfidenceThreshold: overrides.minConfidenceThreshold ?? base.minConfidenceThreshold,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergeResponseTemplates(
  base: ResponseTemplates,
  overrides: DeepPartial<ResponseTemplates>,
): ResponseTemplates {
  return {
    templates: (overrides.templates as ResponseTemplates['templates'] | undefined) ?? base.templates,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergePermissionRules(
  base: PermissionRules,
  overrides: DeepPartial<PermissionRules>,
): PermissionRules {
  return {
    rules: (overrides.rules as PermissionRules['rules'] | undefined) ?? base.rules,
    defaultLevel: overrides.defaultLevel ?? base.defaultLevel,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

export function validateConfiguration(
  config: CopilotConfiguration,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.configVersion) {
    errors.push('configVersion is required');
  }

  if (config.intentDefinitions.minConfidenceThreshold < 0 || config.intentDefinitions.minConfidenceThreshold > 1) {
    errors.push('intentDefinitions.minConfidenceThreshold must be between 0 and 1');
  }

  if (config.suggestionRules.maxSuggestions < 0) {
    errors.push('suggestionRules.maxSuggestions must be >= 0');
  }

  if (config.suggestionRules.minConfidence < 0 || config.suggestionRules.minConfidence > 1) {
    errors.push('suggestionRules.minConfidence must be between 0 and 1');
  }

  if (config.performanceTargetMs < 0) {
    errors.push('performanceTargetMs must be >= 0');
  }

  if (config.intentResolutionTargetMs < 0) {
    errors.push('intentResolutionTargetMs must be >= 0');
  }

  if (config.responseOrchestrationTargetMs < 0) {
    errors.push('responseOrchestrationTargetMs must be >= 0');
  }

  if (config.maxConversations < 1) {
    errors.push('maxConversations must be >= 1');
  }

  if (config.maxMessagesPerConversation < 1) {
    errors.push('maxMessagesPerConversation must be >= 1');
  }

  return { valid: errors.length === 0, errors };
}

export function getDefaultProviders(): ProviderConfiguration[] {
  return createDefaultProviders();
}

export function getDefaultFeatureFlags(): CopilotFeatureFlags {
  return createDefaultCopilotFeatureFlags();
}
