/**
 * Plan Configuration — defaults and factory for Part 5 Plan Engine.
 *
 * No hardcoded logic. All rules are configurable.
 */
import type { PlanConfiguration } from './types';
import { createDefaultPlanConfiguration } from './types';

export const DEFAULT_PLAN_CONFIGURATION: PlanConfiguration = createDefaultPlanConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createPlanConfiguration(
  overrides?: DeepPartial<PlanConfiguration>,
): PlanConfiguration {
  if (!overrides) return { ...DEFAULT_PLAN_CONFIGURATION };
  const base = { ...DEFAULT_PLAN_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    benefitRules: { ...base.benefitRules, ...overrides.benefitRules },
    riskRules: { ...base.riskRules, ...overrides.riskRules },
    orderingRules: { ...base.orderingRules, ...overrides.orderingRules },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}

export function isPlanTypeEnabled(config: PlanConfiguration, planType: string): boolean {
  const flags = config.featureFlags;
  switch (planType) {
    case 'quick_optimize': return flags.enableQuickOptimize;
    case 'performance_boost': return flags.enablePerformanceBoost;
    case 'storage_recovery': return flags.enableStorageRecovery;
    case 'privacy_cleanup': return flags.enablePrivacyCleanup;
    case 'startup_optimization': return flags.enableStartupOptimization;
    case 'maintenance': return flags.enableMaintenance;
    case 'health_recovery': return flags.enableHealthRecovery;
    case 'deep_optimization': return flags.enableDeepOptimization;
    case 'custom_plan': return flags.enableCustomPlan;
    default: return true;
  }
}
