/**
 * Recommendation Events — typed event emitter for the AI Recommendation Engine.
 *
 * Emits:
 *   recommendations_generated  — when recommendations are generated
 *   recommendation_added       — when a recommendation is added
 *   recommendation_updated     — when a recommendation is updated
 *   recommendation_removed     — when a recommendation is removed
 *   recommendation_ranked      — when recommendations are ranked
 *   recommendation_filtered    — when recommendations are filtered
 *   recommendation_selected    — when a recommendation is selected
 *   recommendation_expired     — when a recommendation expires
 */
import type { RecommendationEventType, RecommendationEventListener } from './types';

export class RecommendationEventEmitter {
  private _listeners: Map<RecommendationEventType, Set<RecommendationEventListener>> = new Map();

  on(event: RecommendationEventType, listener: RecommendationEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: RecommendationEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[RecommendationEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: RecommendationEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const recommendationEvents = new RecommendationEventEmitter();
