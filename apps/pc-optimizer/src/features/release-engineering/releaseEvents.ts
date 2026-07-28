/**
 * Release Events — typed event emitter for release engineering.
 */
import type { ReleaseEventType, ReleaseEventListener } from './types';

export class ReleaseEventEmitter {
  private _listeners: Map<ReleaseEventType, Set<ReleaseEventListener>> = new Map();

  on(event: ReleaseEventType, listener: ReleaseEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: ReleaseEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[ReleaseEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: ReleaseEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const releaseEvents = new ReleaseEventEmitter();
