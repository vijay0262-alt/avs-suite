/**
 * Storage Events — typed event emitter for storage intelligence lifecycle.
 */
import type { StorageEventType, StorageEventListener } from './types';

export class StorageEventEmitter {
  private _listeners: Map<StorageEventType, Set<StorageEventListener>> = new Map();

  on(event: StorageEventType, listener: StorageEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: StorageEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[StorageEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: StorageEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const storageEvents = new StorageEventEmitter();
