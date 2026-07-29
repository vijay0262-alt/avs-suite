/**
 * AI Context Events — typed event emitter for the AI Context Engine.
 *
 * Emits:
 *   context_build_started     — when a context build begins
 *   context_build_completed   — when a context build finishes
 *   context_provider_loaded   — when a provider is successfully loaded
 *   context_provider_failed   — when a provider fails
 *   context_cache_hit         — when cache is hit
 *   context_cache_miss        — when cache is missed
 *   context_refreshed         — when context is refreshed
 */
import type { AIContextEventType, AIContextEventListener } from './types';

export class AIContextEventEmitter {
  private _listeners: Map<AIContextEventType, Set<AIContextEventListener>> = new Map();

  on(event: AIContextEventType, listener: AIContextEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: AIContextEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[AIContextEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: AIContextEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const aiContextEvents = new AIContextEventEmitter();
