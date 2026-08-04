/**
 * FeatureGate — lightweight, importable feature gate for modules.
 *
 * In the thin-client architecture, feature availability is determined
 * by the backend sync response. The gate reads the edition from the
 * syncStore (which mirrors GET /api/customer/sync) and uses the
 * shared feature flag registry for local UI gating decisions.
 *
 * Modules call:
 *   FeatureGate.canUse("junk.clean")
 *   FeatureGate.canUse("registry.fix")
 *
 * The gate is initialized at bootstrap with the current sync state
 * and updated when the sync data changes.
 */
import type { LicenseState } from '@avs/licensing';
import { stateToEdition } from '@avs/licensing';
import { isFeatureEnabled, shouldHideFeature, normalizeEdition, type FeatureKey, type Edition } from '@avs/shared/featureFlags';
import { FEATURE_MAP, type ManagedFeature } from '@avs/licensing';
import { useSyncStore, planToEdition } from '../sync/syncStore';

let _currentEdition: Edition = 'free';

/**
 * Initialize or update the FeatureGate from the sync store data.
 * Called at bootstrap and whenever the sync data changes.
 */
export function initFeatureGateFromSync(): void {
  const syncData = useSyncStore.getState().data;
  if (!syncData) {
    _currentEdition = 'free';
    return;
  }
  const planEdition = planToEdition(syncData.subscription.plan, syncData.license?.edition);
  _currentEdition = planEdition === 'PROFESSIONAL' ? 'professional' : 'free';
}

/**
 * Initialize or update the FeatureGate with a license state.
 * Kept for backward compatibility with legacy licensing components.
 */
export function initFeatureGate(state: LicenseState): void {
  _currentEdition = stateToEdition(state);
}

/**
 * Update the FeatureGate with a specific edition (e.g., from LicenseModel.edition).
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
