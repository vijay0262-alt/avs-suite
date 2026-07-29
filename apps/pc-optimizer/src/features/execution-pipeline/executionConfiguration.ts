/**
 * Execution Configuration — defaults and factory.
 *
 * No hardcoded logic. All rules are configurable.
 */
import type { ExecutionConfiguration, PipelineStage } from './types';
import { createDefaultExecutionConfiguration } from './types';

export const DEFAULT_EXECUTION_CONFIGURATION: ExecutionConfiguration = createDefaultExecutionConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createExecutionConfiguration(
  overrides?: DeepPartial<ExecutionConfiguration>,
): ExecutionConfiguration {
  if (!overrides) return { ...DEFAULT_EXECUTION_CONFIGURATION };
  const base = { ...DEFAULT_EXECUTION_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    enabledStages: overrides.enabledStages
      ? (overrides.enabledStages as PipelineStage[])
      : base.enabledStages,
    validationRules: { ...base.validationRules, ...overrides.validationRules },
    timeoutRules: { ...base.timeoutRules, ...overrides.timeoutRules },
    retryRules: {
      maxRetries: overrides.retryRules?.maxRetries ?? base.retryRules.maxRetries,
      retryDelayMs: overrides.retryRules?.retryDelayMs ?? base.retryRules.retryDelayMs,
      retryableStages: overrides.retryRules?.retryableStages
        ? (overrides.retryRules.retryableStages as PipelineStage[])
        : base.retryRules.retryableStages,
    },
    verificationRules: { ...base.verificationRules, ...overrides.verificationRules },
    recoveryRules: { ...base.recoveryRules, ...overrides.recoveryRules },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}

export function isStageEnabled(config: ExecutionConfiguration, stage: PipelineStage): boolean {
  return config.enabledStages.includes(stage);
}
