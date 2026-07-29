/**
 * Knowledge Events — typed event emitter for the AI Knowledge Engine.
 *
 * Emits:
 *   knowledge_build_started    — when a knowledge build begins
 *   knowledge_build_completed  — when a knowledge build finishes
 *   knowledge_updated          — when knowledge is updated
 *   knowledge_validated        — when validation completes
 *   relationship_created       — when a relationship is created
 *   trend_detected             — when a trend is detected
 *   change_detected            — when a change is detected
 *   knowledge_failed           — when a knowledge build fails
 */
import type { KnowledgeEventType, KnowledgeEventListener } from './types';

export class KnowledgeEventEmitter {
  private _listeners: Map<KnowledgeEventType, Set<KnowledgeEventListener>> = new Map();

  on(event: KnowledgeEventType, listener: KnowledgeEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: KnowledgeEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[KnowledgeEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: KnowledgeEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const knowledgeEvents = new KnowledgeEventEmitter();
