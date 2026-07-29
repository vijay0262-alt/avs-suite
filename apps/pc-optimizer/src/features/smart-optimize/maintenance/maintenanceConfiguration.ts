/**
 * Maintenance Configuration — defaults and factory.
 */
import type { MaintenanceConfiguration, WindowRule, MaintenancePolicy, PriorityRule, EligibilityRule } from './types';
import { createDefaultMaintenanceConfiguration } from './types';

export const DEFAULT_MAINTENANCE_CONFIGURATION: MaintenanceConfiguration = createDefaultMaintenanceConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createMaintenanceConfiguration(
  overrides?: DeepPartial<MaintenanceConfiguration>,
): MaintenanceConfiguration {
  if (!overrides) return { ...DEFAULT_MAINTENANCE_CONFIGURATION };
  const base = { ...DEFAULT_MAINTENANCE_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    windowRules: (overrides.windowRules as WindowRule[] | undefined) ?? base.windowRules,
    policies: (overrides.policies as MaintenancePolicy[] | undefined) ?? base.policies,
    priorityRules: (overrides.priorityRules as PriorityRule[] | undefined) ?? base.priorityRules,
    eligibilityRules: (overrides.eligibilityRules as EligibilityRule[] | undefined) ?? base.eligibilityRules,
    thresholds: {
      ...base.thresholds,
      ...overrides.thresholds,
      futureThresholds: overrides.thresholds?.futureThresholds
        ? (overrides.thresholds.futureThresholds as Record<string, number>)
        : base.thresholds.futureThresholds,
    },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}
