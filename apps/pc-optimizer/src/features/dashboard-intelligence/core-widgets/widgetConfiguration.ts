/**
 * Core Widget Configuration — defaults and factory.
 *
 * No hardcoded ordering. All rules are configurable.
 */
import type { CoreWidgetConfig, AccessibilityConfig } from './types';
import { createDefaultCoreWidgetConfig, createDefaultAccessibilityConfig } from './types';

export const DEFAULT_CORE_WIDGET_CONFIG: CoreWidgetConfig = createDefaultCoreWidgetConfig();
export const DEFAULT_ACCESSIBILITY_CONFIG: AccessibilityConfig = createDefaultAccessibilityConfig();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createCoreWidgetConfig(
  overrides?: DeepPartial<CoreWidgetConfig>,
): CoreWidgetConfig {
  if (!overrides) return { ...DEFAULT_CORE_WIDGET_CONFIG };
  const base = { ...DEFAULT_CORE_WIDGET_CONFIG };
  return {
    ...base,
    ...overrides,
    widgetOrder: (overrides.widgetOrder as CoreWidgetConfig['widgetOrder'] | undefined) ?? base.widgetOrder,
    defaultLayout: (overrides.defaultLayout as CoreWidgetConfig['defaultLayout'] | undefined) ?? base.defaultLayout,
    widgetVisibility: { ...base.widgetVisibility, ...overrides.widgetVisibility },
    refreshIntervalsMs: { ...base.refreshIntervalsMs, ...overrides.refreshIntervalsMs },
    priorityRules: { ...base.priorityRules, ...overrides.priorityRules },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}

export function createAccessibilityConfig(
  overrides?: DeepPartial<AccessibilityConfig>,
): AccessibilityConfig {
  if (!overrides) return { ...DEFAULT_ACCESSIBILITY_CONFIG };
  return { ...DEFAULT_ACCESSIBILITY_CONFIG, ...overrides };
}
