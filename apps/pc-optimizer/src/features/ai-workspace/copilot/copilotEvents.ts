/**
 * AI Copilot Platform — Events
 *
 * EPIC 5 PHASE A PART 1
 *
 * Typed event emitter for Copilot lifecycle events.
 */
import type { CopilotEvent, CopilotEventListener, CopilotEventType } from './types';

export class CopilotEvents {
  private _listeners: Map<CopilotEventType, Set<CopilotEventListener>> = new Map();

  on(type: CopilotEventType, listener: CopilotEventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  off(type: CopilotEventType, listener: CopilotEventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: CopilotEvent): void {
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

  removeListenersForType(type: CopilotEventType): void {
    this._listeners.delete(type);
  }

  listenerCount(type?: CopilotEventType): number {
    if (type) {
      return this._listeners.get(type)?.size ?? 0;
    }
    let total = 0;
    for (const set of this._listeners.values()) {
      total += set.size;
    }
    return total;
  }
}

export const copilotEvents = new CopilotEvents();
