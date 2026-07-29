/**
 * Action Events — typed event emitter for action lifecycle.
 *
 * Emits: action_registered, action_selected, action_validated,
 * action_dispatched, action_completed, action_cancelled, action_failed.
 */
import type { ActionEventType, ActionListener, ActionEvent } from './types';

export class ActionEvents {
  private _listeners: Map<ActionEventType, Set<ActionListener>> = new Map();

  on(event: ActionEventType, listener: ActionListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: ActionEventType, listener: ActionListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: ActionEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ActionEvents] Listener error:', err);
      }
    }
  }

  emitRegistered(actionId: string, widgetId: string, data?: unknown): void {
    this.emit({ type: 'action_registered', actionId, widgetId, timestamp: new Date().toISOString(), data });
  }

  emitSelected(actionId: string, widgetId: string, data?: unknown): void {
    this.emit({ type: 'action_selected', actionId, widgetId, timestamp: new Date().toISOString(), data });
  }

  emitValidated(actionId: string, widgetId: string, data?: unknown): void {
    this.emit({ type: 'action_validated', actionId, widgetId, timestamp: new Date().toISOString(), data });
  }

  emitDispatched(actionId: string, widgetId: string, data?: unknown): void {
    this.emit({ type: 'action_dispatched', actionId, widgetId, timestamp: new Date().toISOString(), data });
  }

  emitCompleted(actionId: string, widgetId: string, data?: unknown): void {
    this.emit({ type: 'action_completed', actionId, widgetId, timestamp: new Date().toISOString(), data });
  }

  emitCancelled(actionId: string, widgetId: string, data?: unknown): void {
    this.emit({ type: 'action_cancelled', actionId, widgetId, timestamp: new Date().toISOString(), data });
  }

  emitFailed(actionId: string, widgetId: string, data?: unknown): void {
    this.emit({ type: 'action_failed', actionId, widgetId, timestamp: new Date().toISOString(), data });
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: ActionEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
