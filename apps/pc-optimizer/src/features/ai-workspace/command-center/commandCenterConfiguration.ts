/**
 * AI Command Center — Configuration
 *
 * EPIC 5 PHASE A PART 3
 */
import type { CommandCenterConfiguration, DashboardLayout, WidgetDefinition, RefreshPolicy } from './types';
import { createDefaultCommandCenterConfiguration } from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown>
    ? DeepPartial<T[P]>
    : T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[P];
};

export const DEFAULT_COMMAND_CENTER_CONFIGURATION: CommandCenterConfiguration = createDefaultCommandCenterConfiguration();

export function createCommandCenterConfiguration(overrides?: DeepPartial<CommandCenterConfiguration>): CommandCenterConfiguration {
  if (!overrides) return structuredClone(DEFAULT_COMMAND_CENTER_CONFIGURATION);
  const base = DEFAULT_COMMAND_CENTER_CONFIGURATION;
  return {
    configVersion: overrides.configVersion ?? base.configVersion,
    widgetDefinitions: (overrides.widgetDefinitions as WidgetDefinition[] | undefined) ?? base.widgetDefinitions,
    defaultLayout: (overrides.defaultLayout as DashboardLayout | undefined) ?? base.defaultLayout,
    savedLayouts: (overrides.savedLayouts as DashboardLayout[] | undefined) ?? base.savedLayouts,
    refreshPolicies: (overrides.refreshPolicies as Record<string, RefreshPolicy> | undefined) ?? base.refreshPolicies,
    featureFlags: overrides.featureFlags
      ? { ...base.featureFlags, ...overrides.featureFlags }
      : base.featureFlags,
    performanceTargets: overrides.performanceTargets
      ? { ...base.performanceTargets, ...overrides.performanceTargets }
      : base.performanceTargets,
    enterpriseLayouts: (overrides.enterpriseLayouts as DashboardLayout[] | undefined) ?? base.enterpriseLayouts,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

export function validateCommandCenterConfiguration(config: CommandCenterConfiguration): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.configVersion) errors.push('configVersion is required');
  if (config.widgetDefinitions.length === 0) errors.push('At least one widget definition is required');
  if (!config.defaultLayout) errors.push('defaultLayout is required');
  if (config.performanceTargets.dashboardLoadTargetMs < 0) errors.push('dashboardLoadTargetMs must be >= 0');
  if (config.performanceTargets.widgetRefreshTargetMs < 0) errors.push('widgetRefreshTargetMs must be >= 0');

  for (const def of config.widgetDefinitions) {
    if (!def.id) errors.push(`Widget definition missing ID`);
    if (!def.title) errors.push(`Widget "${def.id}" missing title`);
  }

  return { valid: errors.length === 0, errors };
}
