/**
 * Natural Language Action Engine — Configuration
 *
 * EPIC 5 PHASE A PART 4
 */
import type { ActionConfiguration, ActionFeatureFlags, ActionPerformanceTargets, IntentDefinition, EntityRule, ApprovalPolicy, SuggestionRule, ActionProviderSettings } from './types';
import { createDefaultActionConfiguration, createDefaultActionFeatureFlags, createDefaultActionPerformanceTargets } from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown>
    ? DeepPartial<T[P]>
    : T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[P];
};

export const DEFAULT_ACTION_CONFIGURATION: ActionConfiguration = createDefaultActionConfiguration();

export function createActionConfiguration(overrides?: DeepPartial<ActionConfiguration>): ActionConfiguration {
  if (!overrides) return structuredClone(DEFAULT_ACTION_CONFIGURATION);
  const base = DEFAULT_ACTION_CONFIGURATION;
  return {
    configVersion: overrides.configVersion ?? base.configVersion,
    intentDefinitions: (overrides.intentDefinitions as IntentDefinition[] | undefined) ?? base.intentDefinitions,
    entityRules: (overrides.entityRules as EntityRule[] | undefined) ?? base.entityRules,
    approvalPolicies: (overrides.approvalPolicies as ApprovalPolicy[] | undefined) ?? base.approvalPolicies,
    suggestionRules: (overrides.suggestionRules as SuggestionRule[] | undefined) ?? base.suggestionRules,
    featureFlags: overrides.featureFlags
      ? { ...base.featureFlags, ...overrides.featureFlags }
      : base.featureFlags,
    performanceTargets: overrides.performanceTargets
      ? { ...base.performanceTargets, ...overrides.performanceTargets }
      : base.performanceTargets,
    providerSettings: (overrides.providerSettings as ActionProviderSettings[] | undefined) ?? base.providerSettings,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

export function validateActionConfiguration(config: ActionConfiguration): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.configVersion) errors.push('configVersion is required');
  if (config.intentDefinitions.length === 0) errors.push('At least one intent definition is required');
  if (config.performanceTargets.intentClassificationTargetMs < 0) errors.push('intentClassificationTargetMs must be >= 0');
  if (config.performanceTargets.actionPlanningTargetMs < 0) errors.push('actionPlanningTargetMs must be >= 0');

  for (const def of config.intentDefinitions) {
    if (!def.actionType) errors.push('Intent definition missing actionType');
    if (def.keywords.length === 0 && def.phrases.length === 0) errors.push(`Intent "${def.actionType}" has no keywords or phrases`);
  }

  return { valid: errors.length === 0, errors };
}
