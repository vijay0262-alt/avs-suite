/**
 * Widget Events — typed event emitter for the Widget Framework.
 *
 * Emits:
 *   widget_registered     — when a widget definition is registered
 *   widget_initialized    — when a widget instance is initialized
 *   widget_loaded         — when a widget finishes loading data
 *   widget_refreshed      — when a widget finishes refreshing
 *   widget_action_invoked — when a widget action is triggered
 *   widget_hidden         — when a widget is hidden
 *   widget_disposed       — when a widget is disposed
 *   widget_error          — when a widget encounters an error
 */
import type { WidgetEventType, WidgetEventListener, WidgetEventPayload } from './types';

export class WidgetEventEmitter {
  private _listeners: Map<WidgetEventType, Set<WidgetEventListener>> = new Map();

  on(event: WidgetEventType, listener: WidgetEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: WidgetEventType, payload: WidgetEventPayload): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[WidgetEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: WidgetEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}
