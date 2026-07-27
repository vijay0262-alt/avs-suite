/**
 * Feature store — Zustand store that wraps the FeatureEngine.
 *
 * In the thin-client architecture, the edition is derived from the
 * syncStore (GET /api/customer/sync subscription plan), not from
 * local license state. The FeatureEngine reads the edition from
 * the syncStore and resolves features accordingly.
 *
 * Architecture:
 *   UI → useFeatureStore → FeatureEngine → syncStore → Backend
 */
import { create } from 'zustand';
import { FeatureEngine, type FeatureChangeListener } from './featureEngine';
import { type Feature, ALL_FEATURES, FEATURE_LABELS } from './features';
import { type FeatureEdition, EDITION_LABELS } from './editionMappings';
import { useSyncStore, planToEdition } from '../sync/syncStore';

export interface FeatureStoreState {
  /** The FeatureEngine instance (singleton). */
  engine: FeatureEngine | null;
  /** Current resolved edition. */
  edition: FeatureEdition;
  /** Edition display label. */
  editionLabel: string;
  /** List of enabled features. */
  enabledFeatures: Feature[];
  /** List of disabled features. */
  disabledFeatures: Feature[];
  /** Count of enabled features. */
  enabledCount: number;
  /** Count of disabled features. */
  disabledCount: number;
  /** Whether the engine has been initialized. */
  initialized: boolean;

  /** Initialize the engine and subscribe to license changes. */
  init: () => void;
  /** Refresh the feature set from the current license state. */
  refresh: () => void;
  /** Check if a feature is enabled. */
  isEnabled: (feature: Feature) => boolean;
  /** Get the required edition for a feature. */
  requiresEdition: (feature: Feature) => string | null;
  /** Get the label for a feature. */
  getFeatureLabel: (feature: Feature) => string;
  /** Tear down the engine (e.g. on logout). */
  destroy: () => void;
}

// Singleton engine instance
let _engine: FeatureEngine | null = null;
let _unsubscribeLicense: (() => void) | null = null;
let _unsubscribeEngine: (() => void) | null = null;

function createEngine(): FeatureEngine {
  if (_engine) return _engine;
  _engine = new FeatureEngine(() => {
    const syncData = useSyncStore.getState().data;
    if (!syncData) return null;
    return planToEdition(syncData.subscription.plan);
  });
  return _engine;
}

function syncFromEngine(engine: FeatureEngine) {
  const state = engine.getState();
  useFeatureStore.setState({
    edition: state.edition,
    editionLabel: EDITION_LABELS[state.edition],
    enabledFeatures: Array.from(state.enabledFeatures),
    disabledFeatures: Array.from(state.disabledFeatures),
    enabledCount: state.enabledFeatures.size,
    disabledCount: state.disabledFeatures.size,
  });
}

export const useFeatureStore = create<FeatureStoreState>((set, get) => ({
  engine: null,
  edition: 'FREE',
  editionLabel: EDITION_LABELS.FREE,
  enabledFeatures: [],
  disabledFeatures: Array.from(ALL_FEATURES),
  enabledCount: 0,
  disabledCount: ALL_FEATURES.length,
  initialized: false,

  init: () => {
    if (get().initialized) return;

    const engine = createEngine();

    // Subscribe to engine changes
    const listener: FeatureChangeListener = () => {
      syncFromEngine(engine);
    };
    _unsubscribeEngine = engine.subscribe(listener);

    // Subscribe to sync store changes — when sync data changes, refresh engine
    _unsubscribeLicense = useSyncStore.subscribe(() => {
      engine.refresh();
    });

    // Initial sync
    engine.refresh();
    syncFromEngine(engine);

    set({ engine, initialized: true });
  },

  refresh: () => {
    const engine = get().engine;
    if (!engine) return;
    engine.refresh();
    syncFromEngine(engine);
  },

  isEnabled: (feature: Feature) => {
    const engine = get().engine;
    if (!engine) return false;
    return engine.isEnabled(feature);
  },

  requiresEdition: (feature: Feature) => {
    const engine = get().engine;
    if (!engine) return null;
    return engine.requiresEdition(feature);
  },

  getFeatureLabel: (feature: Feature) => {
    return FEATURE_LABELS[feature] ?? feature;
  },

  destroy: () => {
    _unsubscribeLicense?.();
    _unsubscribeEngine?.();
    _unsubscribeLicense = null;
    _unsubscribeEngine = null;
    _engine = null;
    set({
      engine: null,
      edition: 'FREE',
      editionLabel: EDITION_LABELS.FREE,
      enabledFeatures: [],
      disabledFeatures: Array.from(ALL_FEATURES),
      enabledCount: 0,
      disabledCount: ALL_FEATURES.length,
      initialized: false,
    });
  },
}));

/**
 * Convenience hook for components that need feature status.
 */
export function useFeatures(): FeatureStoreState {
  return useFeatureStore();
}

/**
 * Convenience hook to check a single feature.
 */
export function useFeatureEnabled(feature: Feature): boolean {
  return useFeatureStore((s) => s.isEnabled(feature));
}
