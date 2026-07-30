/**
 * Goals & Objectives Engine — Configuration
 */
import type { GoalConfiguration } from './types';
import {
  createDefaultMeasurementRules,
  createDefaultStrategyRules,
  createDefaultConflictRules,
  createDefaultFeatureFlags,
} from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

export const DEFAULT_GOAL_CONFIGURATION: GoalConfiguration = {
  configVersion: '1.0.0',
  measurementRules: createDefaultMeasurementRules(),
  strategyRules: createDefaultStrategyRules(),
  conflictRules: createDefaultConflictRules(),
  featureFlags: createDefaultFeatureFlags(),
  enableEvents: true,
  maxGoals: 50,
  maxHistoryEntries: 200,
  performanceTargetMs: 100,
  futureMetadata: {},
};

export function createGoalConfiguration(
  overrides?: DeepPartial<GoalConfiguration>,
): GoalConfiguration {
  if (!overrides) return structuredClone(DEFAULT_GOAL_CONFIGURATION);

  const base = structuredClone(DEFAULT_GOAL_CONFIGURATION);

  if (overrides.configVersion !== undefined) base.configVersion = overrides.configVersion;
  if (overrides.enableEvents !== undefined) base.enableEvents = overrides.enableEvents;
  if (overrides.maxGoals !== undefined) base.maxGoals = overrides.maxGoals;
  if (overrides.maxHistoryEntries !== undefined) base.maxHistoryEntries = overrides.maxHistoryEntries;
  if (overrides.performanceTargetMs !== undefined) base.performanceTargetMs = overrides.performanceTargetMs;
  if (overrides.futureMetadata !== undefined) base.futureMetadata = overrides.futureMetadata;

  if (overrides.measurementRules) {
    Object.assign(base.measurementRules, overrides.measurementRules);
  }
  if (overrides.strategyRules) {
    Object.assign(base.strategyRules, overrides.strategyRules);
  }
  if (overrides.conflictRules) {
    Object.assign(base.conflictRules, overrides.conflictRules);
  }
  if (overrides.featureFlags) {
    Object.assign(base.featureFlags, overrides.featureFlags);
    if (overrides.featureFlags.futureFlags) {
      Object.assign(base.featureFlags.futureFlags, overrides.featureFlags.futureFlags);
    }
  }

  return base;
}
