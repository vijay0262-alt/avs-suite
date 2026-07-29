/**
 * Prediction Events — typed event emitter for the AI Prediction Engine.
 *
 * Emits:
 *   prediction_generated  — when predictions are generated
 *   prediction_updated    — when a prediction is updated
 *   prediction_expired    — when a prediction expires
 *   prediction_failed     — when prediction generation fails
 *   timeline_updated      — when the prediction timeline is updated
 */
import type { PredictionEventType, PredictionEventListener } from './types';

export class PredictionEventEmitter {
  private _listeners: Map<PredictionEventType, Set<PredictionEventListener>> = new Map();

  on(event: PredictionEventType, listener: PredictionEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: PredictionEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[PredictionEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: PredictionEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const predictionEvents = new PredictionEventEmitter();
