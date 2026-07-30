/**
 * AI Tool Framework — Configuration
 *
 * EPIC 5 PHASE A PART 2
 */
import type { ToolConfiguration, ToolPermissionRules, ToolExecutionPolicies, ToolFeatureFlags, ToolProviderSettings, ToolPerformanceTargets } from './types';
import { createDefaultToolConfiguration, createDefaultToolPermissionRules, createDefaultToolExecutionPolicies, createDefaultToolFeatureFlags, createDefaultToolProviderSettings, createDefaultToolPerformanceTargets } from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown>
    ? DeepPartial<T[P]>
    : T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[P];
};

export const DEFAULT_TOOL_CONFIGURATION: ToolConfiguration = createDefaultToolConfiguration();

export function createToolConfiguration(overrides?: DeepPartial<ToolConfiguration>): ToolConfiguration {
  if (!overrides) return structuredClone(DEFAULT_TOOL_CONFIGURATION);
  return mergeToolConfiguration(DEFAULT_TOOL_CONFIGURATION, overrides);
}

function mergeToolConfiguration(base: ToolConfiguration, overrides: DeepPartial<ToolConfiguration>): ToolConfiguration {
  return {
    configVersion: overrides.configVersion ?? base.configVersion,
    permissionRules: overrides.permissionRules
      ? mergePermissionRules(base.permissionRules, overrides.permissionRules)
      : base.permissionRules,
    executionPolicies: overrides.executionPolicies
      ? { ...base.executionPolicies, ...overrides.executionPolicies }
      : base.executionPolicies,
    featureFlags: overrides.featureFlags
      ? { ...base.featureFlags, ...overrides.featureFlags }
      : base.featureFlags,
    providerSettings: (overrides.providerSettings as ToolProviderSettings[] | undefined) ?? base.providerSettings,
    performanceTargets: overrides.performanceTargets
      ? { ...base.performanceTargets, ...overrides.performanceTargets }
      : base.performanceTargets,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergePermissionRules(base: ToolPermissionRules, overrides: DeepPartial<ToolPermissionRules>): ToolPermissionRules {
  return {
    rules: (overrides.rules as ToolPermissionRules['rules'] | undefined) ?? base.rules,
    defaultLevel: overrides.defaultLevel ?? base.defaultLevel,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

export function validateToolConfiguration(config: ToolConfiguration): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.configVersion) errors.push('configVersion is required');
  if (config.executionPolicies.maxConcurrentExecutions < 1) errors.push('maxConcurrentExecutions must be >= 1');
  if (config.executionPolicies.defaultTimeoutMs < 100) errors.push('defaultTimeoutMs must be >= 100');
  if (config.executionPolicies.maxRetries < 0) errors.push('maxRetries must be >= 0');
  if (config.performanceTargets.discoveryTargetMs < 0) errors.push('discoveryTargetMs must be >= 0');
  if (config.performanceTargets.executionOverheadTargetMs < 0) errors.push('executionOverheadTargetMs must be >= 0');

  return { valid: errors.length === 0, errors };
}
