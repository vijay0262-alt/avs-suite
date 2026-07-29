/**
 * Quota Events — typed event emitter for the Usage Quota Engine.
 *
 * Emits:
 *   quota_initialized  — when quotas are loaded into the registry
 *   quota_consumed     — when usage is consumed
 *   quota_restored     — when usage is restored
 *   quota_reset        — when a quota is reset
 *   quota_exceeded     — when a quota limit is exceeded
 *   quota_updated      — when quota state changes
 *   statistics_updated — when statistics are recalculated
 */
import type { QuotaEventType, QuotaEventListener } from './types';

export class QuotaEventEmitter {
  private _listeners: Map<QuotaEventType, Set<QuotaEventListener>> = new Map();

  on(event: QuotaEventType, listener: QuotaEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: QuotaEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[QuotaEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: QuotaEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const quotaEvents = new QuotaEventEmitter();
