/**
 * Goal Orchestration Engine — Configuration
 */
import type { OrchestrationConfiguration } from './types';
import {
  createDefaultPriorityRules,
  createDefaultOrchestrationConflictRules,
  createDefaultSchedulingRules,
  createDefaultResourcePolicies,
  createDefaultEnterprisePolicies,
  createDefaultOrchestrationFeatureFlags,
} from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

export const DEFAULT_ORCHESTRATION_CONFIGURATION: OrchestrationConfiguration = {
  configVersion: '1.0.0',
  priorityRules: createDefaultPriorityRules(),
  conflictRules: createDefaultOrchestrationConflictRules(),
  schedulingRules: createDefaultSchedulingRules(),
  resourcePolicies: createDefaultResourcePolicies(),
  enterprisePolicies: createDefaultEnterprisePolicies(),
  featureFlags: createDefaultOrchestrationFeatureFlags(),
  enableEvents: true,
  maxOrchestrations: 100,
  maxHistoryEntries: 500,
  performanceTargetMs: 150,
  futureMetadata: {},
};

export function createOrchestrationConfiguration(
  overrides?: DeepPartial<OrchestrationConfiguration>,
): OrchestrationConfiguration {
  if (!overrides) return structuredClone(DEFAULT_ORCHESTRATION_CONFIGURATION);

  const base = structuredClone(DEFAULT_ORCHESTRATION_CONFIGURATION);

  if (overrides.configVersion !== undefined) base.configVersion = overrides.configVersion;
  if (overrides.enableEvents !== undefined) base.enableEvents = overrides.enableEvents;
  if (overrides.maxOrchestrations !== undefined) base.maxOrchestrations = overrides.maxOrchestrations;
  if (overrides.maxHistoryEntries !== undefined) base.maxHistoryEntries = overrides.maxHistoryEntries;
  if (overrides.performanceTargetMs !== undefined) base.performanceTargetMs = overrides.performanceTargetMs;
  if (overrides.futureMetadata !== undefined) base.futureMetadata = overrides.futureMetadata;

  if (overrides.priorityRules) Object.assign(base.priorityRules, overrides.priorityRules);
  if (overrides.conflictRules) Object.assign(base.conflictRules, overrides.conflictRules);
  if (overrides.schedulingRules) Object.assign(base.schedulingRules, overrides.schedulingRules);
  if (overrides.resourcePolicies) Object.assign(base.resourcePolicies, overrides.resourcePolicies);
  if (overrides.enterprisePolicies) Object.assign(base.enterprisePolicies, overrides.enterprisePolicies);
  if (overrides.featureFlags) {
    Object.assign(base.featureFlags, overrides.featureFlags);
    if (overrides.featureFlags.futureFlags) {
      Object.assign(base.featureFlags.futureFlags, overrides.featureFlags.futureFlags);
    }
  }

  return base;
}
