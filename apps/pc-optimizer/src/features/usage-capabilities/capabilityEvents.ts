/**
 * Capability Events — typed event emitter for the Usage Capability Framework.
 *
 * Emits:
 *   capability_loaded — when definitions are loaded into the registry
 *   capability_changed — when a capability's unlock state changes
 *   plan_changed — when the active plan changes
 */
import type {
  CapabilityEventType,
  CapabilityEventListener,
} from './types';

export class CapabilityEventEmitter {
  private _listeners: Map<CapabilityEventType, Set<CapabilityEventListener>> = new Map();

  on(event: CapabilityEventType, listener: CapabilityEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: CapabilityEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[CapabilityEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: CapabilityEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const capabilityEvents = new CapabilityEventEmitter();
