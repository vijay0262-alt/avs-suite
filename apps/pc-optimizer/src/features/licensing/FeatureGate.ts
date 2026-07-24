/**
 * FeatureGate — lightweight, importable feature gate for modules.
 *
 * Modules call:
 *   FeatureGate.canUse("junk.clean")
 *   FeatureGate.canUse("registry.fix")
 *
 * This avoids importing React context in non-component code.
 * The gate is initialized at bootstrap with the current license state
 * and updated when the license state changes.
 */
import type { LicenseState } from '@avs/licensing';
import { stateToEdition } from '@avs/licensing';
import { isFeatureEnabled, shouldHideFeature, normalizeEdition, type FeatureKey, type Edition } from '@avs/shared/featureFlags';
import { FEATURE_MAP, type ManagedFeature } from '@avs/licensing';

let _currentEdition: Edition = 'free';

/**
 * Initialize or update the FeatureGate with a new license state.
 * Called at bootstrap and whenever the license state changes.
 */
export function initFeatureGate(state: LicenseState): void {
  _currentEdition = stateToEdition(state);
}

/**
 * Update the FeatureGate with a specific edition (e.g., from LicenseModel.edition).
 * This allows the gate to know about 'ultimate' even when stateToEdition
 * defaults to 'professional'.
 */
export function updateFeatureGateEdition(edition: string): void {
  _currentEdition = normalizeEdition(edition);
}

/**
 * Get the current edition.
 */
export function currentEdition(): Edition {
  return _currentEdition;
}

/**
 * Check if a feature action is available in the current edition.
 * Uses dot notation: canUse("junk.clean"), canUse("registry.fix"), etc.
 */
export function canUse(feature: ManagedFeature): boolean {
  const featureKey = FEATURE_MAP[feature];
  if (!featureKey) return false;
  return isFeatureEnabled(featureKey as FeatureKey, _currentEdition);
}

/**
 * Check if a feature should be hidden entirely (hard-gated).
 */
export function isHidden(feature: ManagedFeature): boolean {
  const featureKey = FEATURE_MAP[feature];
  if (!featureKey) return false;
  return shouldHideFeature(featureKey as FeatureKey, _currentEdition);
}

/**
 * Backward-compatible snake_case alias.
 */
export const can_use = canUse;

export const FeatureGate = {
  canUse,
  can_use,
  isHidden,
  currentEdition,
  initFeatureGate,
  updateFeatureGateEdition,
};
