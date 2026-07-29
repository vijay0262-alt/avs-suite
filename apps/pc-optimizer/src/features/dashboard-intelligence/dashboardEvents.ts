/**
 * Dashboard Events — typed event emitter for the Intelligent Dashboard Platform.
 *
 * Emits:
 *   dashboard_loaded      — when dashboard finishes loading
 *   dashboard_refreshed   — when dashboard is refreshed
 *   widget_registered     — when a widget is registered
 *   widget_loaded         — when a widget finishes loading
 *   widget_updated        — when a widget's data is updated
 *   widget_removed        — when a widget is removed
 *   layout_changed        — when the layout changes
 *   provider_registered   — when a provider is registered
 */
import type { DashboardEventType, DashboardEventListener } from './types';

export class DashboardEventEmitter {
  private _listeners: Map<DashboardEventType, Set<DashboardEventListener>> = new Map();

  on(event: DashboardEventType, listener: DashboardEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: DashboardEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[DashboardEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: DashboardEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const dashboardEvents = new DashboardEventEmitter();
