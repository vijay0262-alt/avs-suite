/**
 * Natural Language Action Engine — Events
 *
 * EPIC 5 PHASE A PART 4
 */
import type { ActionEvent, ActionListener, ActionEventType } from './types';

export class ActionEvents {
  private _listeners: Map<ActionEventType, Set<ActionListener>> = new Map();

  on(type: ActionEventType, listener: ActionListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  off(type: ActionEventType, listener: ActionListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: ActionEvent): void {
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try { listener(event); } catch { /* swallow */ }
      }
    }
  }

  removeAllListeners(): void {
    this._listeners.clear();
  }

  listenerCount(type?: ActionEventType): number {
    if (type) return this._listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}

export const actionEvents = new ActionEvents();
