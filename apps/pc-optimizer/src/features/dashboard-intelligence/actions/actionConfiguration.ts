/**
 * Action Configuration — defaults and factory.
 *
 * No hardcoded logic. All rules are configurable.
 */
import type { ActionConfiguration, ActionRoute } from './types';
import { createDefaultActionConfiguration } from './types';

export const DEFAULT_ACTION_CONFIGURATION: ActionConfiguration = createDefaultActionConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createActionConfiguration(
  overrides?: DeepPartial<ActionConfiguration>,
): ActionConfiguration {
  if (!overrides) return { ...DEFAULT_ACTION_CONFIGURATION };
  const base = { ...DEFAULT_ACTION_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    permissionRules: { ...base.permissionRules, ...overrides.permissionRules },
    confirmationRules: { ...base.confirmationRules, ...overrides.confirmationRules },
    telemetryRules: { ...base.telemetryRules, ...overrides.telemetryRules },
    routingRules: {
      defaultRoute: overrides.routingRules?.defaultRoute ?? base.routingRules.defaultRoute,
      routeOverrides: overrides.routingRules?.routeOverrides
        ? (overrides.routingRules.routeOverrides as Record<string, ActionRoute>)
        : base.routingRules.routeOverrides,
      timeoutMs: overrides.routingRules?.timeoutMs ?? base.routingRules.timeoutMs,
      failOnError: overrides.routingRules?.failOnError ?? base.routingRules.failOnError,
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

export function shouldConfirmAction(
  config: ActionConfiguration,
  requiresConfirmation: boolean,
  impactScore: number,
  irreversible: boolean,
): boolean {
  const rules = config.confirmationRules;
  if (rules.alwaysConfirm) return true;
  if (rules.skipForSafeActions && !requiresConfirmation && !irreversible && impactScore < rules.highImpactThreshold) return false;
  if (rules.confirmIrreversible && irreversible) return true;
  if (rules.confirmHighImpact && impactScore >= rules.highImpactThreshold) return true;
  return requiresConfirmation;
}
