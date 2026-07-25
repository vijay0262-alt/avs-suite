/**
 * Feature Engine — public API.
 *
 * Import from this barrel:
 *   import { Feature, useFeatureStore, useFeatureEnabled } from '../features/feature-engine';
 */
export { Feature, ALL_FEATURES, FEATURE_LABELS } from './features';
export {
  type FeatureEdition,
  EDITION_TIERS,
  EDITION_LABELS,
  EDITION_MAPPINGS,
  resolveEdition,
  getFeaturesForEdition,
  getRequiredEdition,
} from './editionMappings';
export { FeatureEngine, type FeatureChangeListener, type FeatureEngineState } from './featureEngine';
export {
  useFeatureStore,
  useFeatures,
  useFeatureEnabled,
  type FeatureStoreState,
} from './featureStore';
