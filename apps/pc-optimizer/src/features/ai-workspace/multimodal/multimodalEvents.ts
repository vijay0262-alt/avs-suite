/**
 * Multimodal AI Interaction Platform — Events
 *
 * EPIC 5 PHASE A PART 6
 *
 * Typed event emitter for multimodal lifecycle events.
 */
import type { MultimodalEvent, MultimodalEventListener, MultimodalEventType } from './types';

export class MultimodalEvents {
  private _listeners: Map<MultimodalEventType, Set<MultimodalEventListener>> = new Map();

  on(type: MultimodalEventType, listener: MultimodalEventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  off(type: MultimodalEventType, listener: MultimodalEventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: MultimodalEvent): void {
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // listener errors should not propagate
        }
      }
    }
  }

  removeAllListeners(): void {
    this._listeners.clear();
  }

  removeListenersForType(type: MultimodalEventType): void {
    this._listeners.delete(type);
  }

  listenerCount(type?: MultimodalEventType): number {
    if (type) return this._listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}

export const multimodalEvents = new MultimodalEvents();
