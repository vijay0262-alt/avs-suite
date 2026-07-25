/**
 * FeatureEngine — the single authority for feature availability.
 *
 * Every UI component and module must query this engine to determine
 * whether a feature is enabled. No component should directly check
 * the license edition.
 *
 * Architecture:
 *   UI → FeatureStore → FeatureEngine → License Store → License
 *
 * The engine reads the current edition from the license store, resolves
 * it to a FeatureEdition, and uses the data-driven EDITION_MAPPINGS to
 * determine which features are enabled.
 *
 * When the license changes, call refresh() to recalculate.
 * Subscribers are notified via the subscription mechanism.
 */
import { type Feature, ALL_FEATURES } from './features';
import {
  type FeatureEdition,
  resolveEdition,
  getFeaturesForEdition,
  getRequiredEdition,
  EDITION_LABELS,
} from './editionMappings';

export type FeatureChangeListener = () => void;

export interface FeatureEngineState {
  edition: FeatureEdition;
  enabledFeatures: Set<Feature>;
  disabledFeatures: Set<Feature>;
}

/**
 * Get the current edition from the license store.
 * Returns the raw edition string from the license, or null if no license.
 */
export type EditionProvider = () => string | null;

export class FeatureEngine {
  private _edition: FeatureEdition = 'FREE';
  private _enabledFeatures: Set<Feature> = new Set();
  private _disabledFeatures: Set<Feature> = new Set(ALL_FEATURES);
  private _listeners: Set<FeatureChangeListener> = new Set();
  private _editionProvider: EditionProvider;

  constructor(editionProvider: EditionProvider) {
    this._editionProvider = editionProvider;
    // Initialize from current state
    this.refresh();
  }

  /**
   * Recalculate the feature set from the current license state.
   * Reads the edition from the edition provider, resolves it, and
   * updates the enabled/disabled feature sets.
   *
   * Notifies all subscribers if the state has changed.
   */
  refresh(): void {
    const rawEdition = this._editionProvider();
    const newEdition = resolveEdition(rawEdition);
    const newEnabled = getFeaturesForEdition(newEdition);
    const newDisabled = new Set(ALL_FEATURES);
    for (const f of newEnabled) {
      newDisabled.delete(f);
    }

    const changed =
      newEdition !== this._edition ||
      !setsEqual(newEnabled, this._enabledFeatures);

    this._edition = newEdition;
    this._enabledFeatures = newEnabled;
    this._disabledFeatures = newDisabled;

    if (changed) {
      this._notifyListeners();
    }
  }

  /**
   * Check if a feature is enabled in the current edition.
   */
  isEnabled(feature: Feature): boolean {
    return this._enabledFeatures.has(feature);
  }

  /**
   * Get all enabled features for the current edition.
   */
  getEnabledFeatures(): Feature[] {
    return Array.from(this._enabledFeatures);
  }

  /**
   * Get all disabled features for the current edition.
   */
  getDisabledFeatures(): Feature[] {
    return Array.from(this._disabledFeatures);
  }

  /**
   * Get the minimum edition required to enable a feature.
   * Returns the edition label string, or null if the feature
   * is not in any tier.
   */
  requiresEdition(feature: Feature): string | null {
    const required = getRequiredEdition(feature);
    if (!required) return null;
    return EDITION_LABELS[required];
  }

  /**
   * Get the current resolved edition.
   */
  getEdition(): FeatureEdition {
    return this._edition;
  }

  /**
   * Get the current edition's display label.
   */
  getEditionLabel(): string {
    return EDITION_LABELS[this._edition];
  }

  /**
   * Get a snapshot of the current engine state.
   */
  getState(): FeatureEngineState {
    return {
      edition: this._edition,
      enabledFeatures: new Set(this._enabledFeatures),
      disabledFeatures: new Set(this._disabledFeatures),
    };
  }

  /**
   * Subscribe to feature changes. Returns an unsubscribe function.
   */
  subscribe(listener: FeatureChangeListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Get the count of enabled features.
   */
  getEnabledCount(): number {
    return this._enabledFeatures.size;
  }

  /**
   * Get the count of disabled features.
   */
  getDisabledCount(): number {
    return this._disabledFeatures.size;
  }

  private _notifyListeners(): void {
    for (const listener of this._listeners) {
      try {
        listener();
      } catch {
        // Listener errors should not break other listeners
      }
    }
  }
}

/** Helper: compare two Sets for equality. */
function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
