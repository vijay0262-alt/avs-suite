/**
 * Optimization Profile Configuration — defaults and factory.
 */
import type { ProfileConfiguration } from './types';
import { createDefaultProfileConfiguration } from './types';

export const DEFAULT_PROFILE_CONFIGURATION: ProfileConfiguration = createDefaultProfileConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createProfileConfiguration(
  overrides?: DeepPartial<ProfileConfiguration>,
): ProfileConfiguration {
  if (!overrides) return { ...DEFAULT_PROFILE_CONFIGURATION };
  const base = { ...DEFAULT_PROFILE_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    defaultPriorityWeights: { ...base.defaultPriorityWeights, ...overrides.defaultPriorityWeights },
    defaultPolicies: { ...base.defaultPolicies, ...overrides.defaultPolicies } as ProfileConfiguration['defaultPolicies'],
    defaultConstraints: { ...base.defaultConstraints, ...overrides.defaultConstraints } as ProfileConfiguration['defaultConstraints'],
    resolutionRules: { ...base.resolutionRules, ...overrides.resolutionRules },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}
