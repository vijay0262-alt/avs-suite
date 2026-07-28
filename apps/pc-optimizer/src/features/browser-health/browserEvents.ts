/**
 * Browser Events — typed event emitter for browser health lifecycle.
 */
import type { BrowserEventType, BrowserEventListener } from './types';

export class BrowserEventEmitter {
  private _listeners: Map<BrowserEventType, Set<BrowserEventListener>> = new Map();

  on(event: BrowserEventType, listener: BrowserEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: BrowserEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[BrowserEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: BrowserEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const browserEvents = new BrowserEventEmitter();
