/**
 * Automation Configuration — defaults and factory.
 */
import type {
  AutomationConfiguration,
  AutomationTriggerDefinition,
  ConditionDefinition,
  AutomationActionDefinition,
  ApprovalPolicyConfig,
  SafetyPolicyConfig,
  CooldownRule,
} from './types';
import { createDefaultAutomationConfiguration } from './types';

export const DEFAULT_AUTOMATION_CONFIGURATION: AutomationConfiguration = createDefaultAutomationConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createAutomationConfiguration(
  overrides?: DeepPartial<AutomationConfiguration>,
): AutomationConfiguration {
  if (!overrides) return { ...DEFAULT_AUTOMATION_CONFIGURATION };
  const base = { ...DEFAULT_AUTOMATION_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    triggerDefinitions: (overrides.triggerDefinitions as AutomationTriggerDefinition[] | undefined) ?? base.triggerDefinitions,
    conditionDefinitions: (overrides.conditionDefinitions as ConditionDefinition[] | undefined) ?? base.conditionDefinitions,
    actionDefinitions: (overrides.actionDefinitions as AutomationActionDefinition[] | undefined) ?? base.actionDefinitions,
    approvalPolicies: (overrides.approvalPolicies as ApprovalPolicyConfig[] | undefined) ?? base.approvalPolicies,
    safetyPolicies: (overrides.safetyPolicies as SafetyPolicyConfig[] | undefined) ?? base.safetyPolicies,
    cooldownRules: (overrides.cooldownRules as CooldownRule[] | undefined) ?? base.cooldownRules,
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}
