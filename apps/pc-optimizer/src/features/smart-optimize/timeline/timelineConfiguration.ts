/**
 * Unified Timeline & Activity Center — Configuration
 *
 * Provides default configuration and factory function with deep merge.
 * No hardcoded behavior — all driven by configuration.
 */
import type { TimelineConfiguration } from './types';
import {
  createDefaultRetentionRules,
  createDefaultFormattingRules,
  createDefaultGroupingRules,
  createDefaultFilterRules,
  createDefaultFeatureFlags,
} from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

export const DEFAULT_TIMELINE_CONFIGURATION: TimelineConfiguration = {
  configVersion: '1.0.0',
  retentionRules: createDefaultRetentionRules(),
  formattingRules: createDefaultFormattingRules(),
  groupingRules: createDefaultGroupingRules(),
  filterRules: createDefaultFilterRules(),
  featureFlags: createDefaultFeatureFlags(),
  enableEvents: true,
  maxItems: 10000,
  performanceTargetRecordMs: 10,
  performanceTargetSearchMs: 100,
  performanceTargetFilterMs: 50,
  futureMetadata: {},
};

export function createTimelineConfiguration(
  overrides?: DeepPartial<TimelineConfiguration>,
): TimelineConfiguration {
  if (!overrides) return structuredClone(DEFAULT_TIMELINE_CONFIGURATION);

  const base = structuredClone(DEFAULT_TIMELINE_CONFIGURATION);

  if (overrides.configVersion !== undefined) base.configVersion = overrides.configVersion;
  if (overrides.enableEvents !== undefined) base.enableEvents = overrides.enableEvents;
  if (overrides.maxItems !== undefined) base.maxItems = overrides.maxItems;
  if (overrides.performanceTargetRecordMs !== undefined) base.performanceTargetRecordMs = overrides.performanceTargetRecordMs;
  if (overrides.performanceTargetSearchMs !== undefined) base.performanceTargetSearchMs = overrides.performanceTargetSearchMs;
  if (overrides.performanceTargetFilterMs !== undefined) base.performanceTargetFilterMs = overrides.performanceTargetFilterMs;
  if (overrides.futureMetadata !== undefined) base.futureMetadata = overrides.futureMetadata;

  if (overrides.retentionRules) {
    Object.assign(base.retentionRules, overrides.retentionRules);
  }
  if (overrides.formattingRules) {
    Object.assign(base.formattingRules, overrides.formattingRules);
    if (overrides.formattingRules.futureRules) {
      Object.assign(base.formattingRules.futureRules, overrides.formattingRules.futureRules);
    }
  }
  if (overrides.groupingRules) {
    Object.assign(base.groupingRules, overrides.groupingRules);
    if (overrides.groupingRules.futureRules) {
      Object.assign(base.groupingRules.futureRules, overrides.groupingRules.futureRules);
    }
  }
  if (overrides.filterRules) {
    Object.assign(base.filterRules, overrides.filterRules);
    if (overrides.filterRules.futureRules) {
      Object.assign(base.filterRules.futureRules, overrides.filterRules.futureRules);
    }
  }
  if (overrides.featureFlags) {
    Object.assign(base.featureFlags, overrides.featureFlags);
    if (overrides.featureFlags.futureFlags) {
      Object.assign(base.featureFlags.futureFlags, overrides.featureFlags.futureFlags);
    }
  }

  return base;
}
