/**
 * AI Tool Framework — Events
 *
 * EPIC 5 PHASE A PART 2
 */
import type { ToolEvent, ToolEventListener, ToolEventType } from './types';

export class ToolEvents {
  private _listeners: Map<ToolEventType, Set<ToolEventListener>> = new Map();

  on(type: ToolEventType, listener: ToolEventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  off(type: ToolEventType, listener: ToolEventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: ToolEvent): void {
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

  listenerCount(type?: ToolEventType): number {
    if (type) return this._listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}

export const toolEvents = new ToolEvents();
