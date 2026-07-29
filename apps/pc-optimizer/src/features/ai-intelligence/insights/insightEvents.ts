/**
 * Insight Events — typed event emitter for the AI Insight Engine.
 *
 * Emits:
 *   insight_generated      — when insights are generated
 *   insight_expired        — when an insight expires
 *   insight_viewed         — when an insight is viewed
 *   insight_archived       — when an insight is archived
 *   achievement_unlocked   — when an achievement is unlocked
 *   milestone_reached      — when a milestone is reached
 *   timeline_updated       — when the timeline is updated
 */
import type { InsightEventType, InsightEventListener } from './types';

export class InsightEventEmitter {
  private _listeners: Map<InsightEventType, Set<InsightEventListener>> = new Map();

  on(event: InsightEventType, listener: InsightEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: InsightEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[InsightEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: InsightEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const insightEvents = new InsightEventEmitter();
