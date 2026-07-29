/**
 * Adaptive Configuration — defaults and factory.
 */
import type { AdaptiveConfiguration, ConditionRule, AdaptationRule, AdaptivePolicy } from './types';
import { createDefaultAdaptiveConfiguration } from './types';

export const DEFAULT_ADAPTIVE_CONFIGURATION: AdaptiveConfiguration = createDefaultAdaptiveConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createAdaptiveConfiguration(
  overrides?: DeepPartial<AdaptiveConfiguration>,
): AdaptiveConfiguration {
  if (!overrides) return { ...DEFAULT_ADAPTIVE_CONFIGURATION };
  const base = { ...DEFAULT_ADAPTIVE_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    conditionRules: (overrides.conditionRules as ConditionRule[] | undefined) ?? base.conditionRules,
    adaptationRules: (overrides.adaptationRules as AdaptationRule[] | undefined) ?? base.adaptationRules,
    policies: (overrides.policies as AdaptivePolicy[] | undefined) ?? base.policies,
    thresholds: { ...base.thresholds, ...overrides.thresholds },
    priorities: { ...base.priorities, ...overrides.priorities },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}
