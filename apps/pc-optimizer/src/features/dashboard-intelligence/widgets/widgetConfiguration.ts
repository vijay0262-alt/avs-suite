/**
 * Widget Configuration — default configuration and factory.
 *
 * No hardcoded values. All rules are configurable.
 */
import type { WidgetFrameworkConfiguration } from './types';

export const DEFAULT_WIDGET_FRAMEWORK_CONFIG: WidgetFrameworkConfiguration = {
  frameworkVersion: '1.0.0',
  lifecycleRules: {
    autoInitialize: true,
    autoDispose: true,
    maxConcurrentLoads: 5,
    loadTimeoutMs: 5000,
    retryOnFailure: true,
    maxRetries: 3,
    retryDelayMs: 500,
  },
  refreshRules: {
    defaultStrategy: 'on_visibility',
    defaultIntervalMs: 30000,
    backgroundIntervalMs: 60000,
    realTimeIntervalMs: 5000,
    visibilityDebounceMs: 1000,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
  permissionRules: {
    defaultMinPlan: 'FREE',
    strictMode: false,
    hideUnavailableWidgets: false,
    enterprisePolicies: {},
    devicePolicies: {},
  },
  telemetryRules: {
    enabled: true,
    trackLoadTime: true,
    trackRefreshTime: true,
    trackErrors: true,
    trackInteractions: true,
    trackActionUsage: true,
    trackVisibility: true,
    trackPerformance: true,
    flushIntervalMs: 30000,
  },
  featureFlags: {},
  maxWidgets: 20,
  enableEvents: true,
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createWidgetFrameworkConfig(
  overrides?: DeepPartial<WidgetFrameworkConfiguration>,
): WidgetFrameworkConfiguration {
  if (!overrides) return { ...DEFAULT_WIDGET_FRAMEWORK_CONFIG };
  return {
    ...DEFAULT_WIDGET_FRAMEWORK_CONFIG,
    ...overrides,
    lifecycleRules: { ...DEFAULT_WIDGET_FRAMEWORK_CONFIG.lifecycleRules, ...overrides.lifecycleRules },
    refreshRules: { ...DEFAULT_WIDGET_FRAMEWORK_CONFIG.refreshRules, ...overrides.refreshRules },
    permissionRules: { ...DEFAULT_WIDGET_FRAMEWORK_CONFIG.permissionRules, ...overrides.permissionRules },
    telemetryRules: { ...DEFAULT_WIDGET_FRAMEWORK_CONFIG.telemetryRules, ...overrides.telemetryRules },
    featureFlags: overrides.featureFlags
      ? (overrides.featureFlags as Record<string, boolean>)
      : DEFAULT_WIDGET_FRAMEWORK_CONFIG.featureFlags,
  };
}
