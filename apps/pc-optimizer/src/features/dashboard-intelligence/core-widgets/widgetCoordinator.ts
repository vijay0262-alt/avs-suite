/**
 * Widget Coordinator — manages inter-widget communication.
 *
 * Supports:
 *   Refresh notifications, selection events, shared filters,
 *   Global refresh, dashboard state updates, future interactions.
 */
import type {
  CoreWidgetId,
  InterWidgetMessage,
  SharedFilter,
  CoreWidgetEvent,
  CoreWidgetEventListener,
  CoreWidgetState,
  WidgetLoadState,
} from './types';

type MessageHandler = (message: InterWidgetMessage) => void;

export class WidgetCoordinator {
  private _widgetStates: Map<CoreWidgetId, CoreWidgetState> = new Map();
  private _sharedFilters: Map<string, SharedFilter> = new Map();
  private _messageHandlers: Map<CoreWidgetId, MessageHandler[]> = new Map();
  private _globalHandlers: MessageHandler[] = [];
  private _eventListeners: Map<CoreWidgetEvent, Set<CoreWidgetEventListener>> = new Map();
  private _selectedWidget: CoreWidgetId | null = null;
  private _isRefreshing: boolean = false;

  initWidget(id: CoreWidgetId): void {
    this._widgetStates.set(id, {
      id,
      state: 'loading',
      lastUpdated: null,
      error: null,
    });
  }

  setWidgetState(id: CoreWidgetId, state: WidgetLoadState, error?: string): void {
    const existing = this._widgetStates.get(id);
    if (!existing) return;
    existing.state = state;
    existing.error = error ?? null;
    if (state === 'ready' || state === 'empty') {
      existing.lastUpdated = new Date().toISOString();
    }
  }

  getWidgetState(id: CoreWidgetId): CoreWidgetState | undefined {
    return this._widgetStates.get(id);
  }

  getAllWidgetStates(): CoreWidgetState[] {
    return Array.from(this._widgetStates.values());
  }

  selectWidget(id: CoreWidgetId): void {
    this._selectedWidget = id;
    this._emitEvent('widget_selected', { widgetId: id });
  }

  getSelectedWidget(): CoreWidgetId | null {
    return this._selectedWidget;
  }

  sendMessage(message: InterWidgetMessage): void {
    if (message.to !== 'all') {
      const handlers = this._messageHandlers.get(message.to);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message);
          } catch (err) {
            console.error('[WidgetCoordinator] Message handler error:', err);
          }
        }
      }
    }
    for (const handler of this._globalHandlers) {
      try {
        handler(message);
      } catch (err) {
        console.error('[WidgetCoordinator] Global handler error:', err);
      }
    }
  }

  broadcastRefresh(from: CoreWidgetId): void {
    this.sendMessage({
      from,
      to: 'all',
      type: 'refresh',
      data: { source: from },
      timestamp: new Date().toISOString(),
    });
  }

  onMessage(widgetId: CoreWidgetId, handler: MessageHandler): () => void {
    let handlers = this._messageHandlers.get(widgetId);
    if (!handlers) {
      handlers = [];
      this._messageHandlers.set(widgetId, handlers);
    }
    handlers.push(handler);
    return () => {
      const arr = this._messageHandlers.get(widgetId);
      if (arr) {
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  onGlobalMessage(handler: MessageHandler): () => void {
    this._globalHandlers.push(handler);
    return () => {
      const idx = this._globalHandlers.indexOf(handler);
      if (idx >= 0) this._globalHandlers.splice(idx, 1);
    };
  }

  setSharedFilter(filter: SharedFilter): void {
    this._sharedFilters.set(filter.key, filter);
    this.sendMessage({
      from: filter.appliedBy,
      to: 'all',
      type: 'filter',
      data: filter,
      timestamp: new Date().toISOString(),
    });
  }

  getSharedFilter(key: string): SharedFilter | undefined {
    return this._sharedFilters.get(key);
  }

  getAllSharedFilters(): SharedFilter[] {
    return Array.from(this._sharedFilters.values());
  }

  removeSharedFilter(key: string): void {
    this._sharedFilters.delete(key);
  }

  startGlobalRefresh(): void {
    this._isRefreshing = true;
    for (const [id] of this._widgetStates) {
      this.setWidgetState(id, 'refreshing');
    }
  }

  finishGlobalRefresh(): void {
    this._isRefreshing = false;
    this._emitEvent('dashboard_refreshed', {});
  }

  isRefreshing(): boolean {
    return this._isRefreshing;
  }

  isDashboardReady(): boolean {
    for (const state of this._widgetStates.values()) {
      if (state.state === 'loading' || state.state === 'refreshing') return false;
    }
    return true;
  }

  on(event: CoreWidgetEvent, listener: CoreWidgetEventListener): () => void {
    let set = this._eventListeners.get(event);
    if (!set) {
      set = new Set();
      this._eventListeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  private _emitEvent(eventType: CoreWidgetEvent, data: unknown): void {
    const set = this._eventListeners.get(eventType);
    if (!set) return;
    const payload = {
      eventType,
      data,
      timestamp: new Date().toISOString(),
    };
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[WidgetCoordinator] Event listener error:', err);
      }
    }
  }

  emitWidgetLoaded(widgetId: CoreWidgetId): void {
    this._emitEvent('widget_loaded', { widgetId });
  }

  emitWidgetUpdated(widgetId: CoreWidgetId): void {
    this._emitEvent('widget_updated', { widgetId });
  }

  emitDashboardReady(): void {
    this._emitEvent('dashboard_ready', {});
  }

  emitDashboardError(error: string): void {
    this._emitEvent('dashboard_error', { error });
  }

  clear(): void {
    this._widgetStates.clear();
    this._sharedFilters.clear();
    this._messageHandlers.clear();
    this._globalHandlers = [];
    this._eventListeners.clear();
    this._selectedWidget = null;
    this._isRefreshing = false;
  }
}
