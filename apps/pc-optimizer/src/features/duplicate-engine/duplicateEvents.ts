/**
 * Duplicate Events — typed event emitter for duplicate detection lifecycle.
 */
import type { DuplicateEventType, DuplicateEventListener } from './types';

export class DuplicateEventEmitter {
  private _listeners: Map<DuplicateEventType, Set<DuplicateEventListener>> = new Map();

  on(event: DuplicateEventType, listener: DuplicateEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: DuplicateEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[DuplicateEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: DuplicateEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const duplicateEvents = new DuplicateEventEmitter();
