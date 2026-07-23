/**
 * FeatureGate — the single entry point for feature access checks.
 *
 * Modules call FeatureGate.can_use("registry_cleaner") to determine
 * if a feature is available in the current license state.
 *
 * FeatureGate delegates to the @avs/licensing FeatureManager which
 * maps license state → edition → feature availability.
 *
 * Usage:
 *   import { FeatureGate } from './features/licensing/FeatureGate';
 *   if (FeatureGate.can_use('registry_cleaner')) { ... }
 */
import { createFeatureManager, type IFeatureManager, type ManagedFeature } from '@avs/licensing';
import type { LicenseState } from '@avs/licensing';

let featureManager: IFeatureManager | null = null;
let currentState: LicenseState = 'free';

/**
 * Initialize the FeatureGate with the current license state.
 * Called when the LicenseManager state changes.
 */
export function initFeatureGate(state: LicenseState): void {
  currentState = state;
  featureManager = createFeatureManager({ getState: () => currentState });
}

/**
 * Update the license state (called on license events).
 */
export function updateLicenseState(state: LicenseState): void {
  currentState = state;
}

/**
 * Check if a feature can be used in the current license state.
 */
export function can_use(feature: ManagedFeature): boolean {
  if (!featureManager) {
    featureManager = createFeatureManager({ getState: () => currentState });
  }
  return featureManager.has(feature);
}

/**
 * Check if a feature should be hidden entirely (hard-gated).
 */
export function is_hidden(feature: ManagedFeature): boolean {
  if (!featureManager) {
    featureManager = createFeatureManager({ getState: () => currentState });
  }
  return featureManager.isHidden(feature);
}

/**
 * Get the current edition.
 */
export function current_edition(): 'free' | 'pro' | 'enterprise' | 'trial' {
  if (!featureManager) {
    featureManager = createFeatureManager({ getState: () => currentState });
  }
  return featureManager.currentEdition();
}

/**
 * Get the current license state.
 */
export function current_state(): LicenseState {
  return currentState;
}

/**
 * Convenience object for modules that prefer an object-style API.
 */
export const FeatureGate = {
  can_use,
  is_hidden,
  current_edition,
  current_state,
  init: initFeatureGate,
  updateState: updateLicenseState,
};
