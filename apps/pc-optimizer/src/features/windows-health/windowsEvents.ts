/**
 * Windows Events — typed event emitter for Windows health lifecycle.
 */
import type { WindowsEventType, WindowsEventListener } from './types';

export class WindowsEventEmitter {
  private _listeners: Map<WindowsEventType, Set<WindowsEventListener>> = new Map();

  on(event: WindowsEventType, listener: WindowsEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: WindowsEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[WindowsEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: WindowsEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const windowsEvents = new WindowsEventEmitter();
