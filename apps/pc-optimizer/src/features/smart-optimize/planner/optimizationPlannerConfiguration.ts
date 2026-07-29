/**
 * Optimization Planner Configuration — defaults and factory.
 */
import type { PlannerConfiguration, OptimizationStrategy } from './types';
import { createDefaultPlannerConfiguration } from './types';

export const DEFAULT_PLANNER_CONFIGURATION: PlannerConfiguration = createDefaultPlannerConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createPlannerConfiguration(
  overrides?: DeepPartial<PlannerConfiguration>,
): PlannerConfiguration {
  if (!overrides) return { ...DEFAULT_PLANNER_CONFIGURATION };
  const base = { ...DEFAULT_PLANNER_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    strategyRules: {
      ...base.strategyRules,
      ...overrides.strategyRules,
    } as PlannerConfiguration['strategyRules'],
    planningRules: { ...base.planningRules, ...overrides.planningRules },
    priorityWeights: { ...base.priorityWeights, ...overrides.priorityWeights },
    riskThresholds: { ...base.riskThresholds, ...overrides.riskThresholds } as PlannerConfiguration['riskThresholds'],
    eligibilityRules: { ...base.eligibilityRules, ...overrides.eligibilityRules },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}

export function getStrategyRule(config: PlannerConfiguration, strategy: OptimizationStrategy) {
  return config.strategyRules[strategy] ?? config.strategyRules.balanced;
}
