/**
 * Widget Lifecycle Manager — manages widget lifecycle states.
 *
 * Lifecycle:
 *   Registered → Initialized → Loading → Loaded → Refreshing →
 *   Suspended → Unavailable → Disposed → Error
 */
import type { WidgetLifecycleState } from './types';

export class WidgetLifecycleManager {
  private _lifecycle: Map<string, WidgetLifecycleState> = new Map();
  private _history: Map<string, WidgetLifecycleState[]> = new Map();

  initWidget(widgetId: string): void {
    this._lifecycle.set(widgetId, 'registered');
    this._history.set(widgetId, ['registered']);
  }

  transition(widgetId: string, to: WidgetLifecycleState): boolean {
    const current = this._lifecycle.get(widgetId);
    if (!current) return false;
    if (!this._isValidTransition(current, to)) return false;
    this._lifecycle.set(widgetId, to);
    const hist = this._history.get(widgetId);
    if (hist) hist.push(to);
    return true;
  }

  getLifecycle(widgetId: string): WidgetLifecycleState | undefined {
    return this._lifecycle.get(widgetId);
  }

  getHistory(widgetId: string): WidgetLifecycleState[] {
    return this._history.get(widgetId) ?? [];
  }

  isAlive(widgetId: string): boolean {
    const state = this._lifecycle.get(widgetId);
    return state !== undefined && state !== 'disposed';
  }

  isDisposed(widgetId: string): boolean {
    return this._lifecycle.get(widgetId) === 'disposed';
  }

  removeWidget(widgetId: string): void {
    this._lifecycle.delete(widgetId);
    this._history.delete(widgetId);
  }

  get count(): number {
    return this._lifecycle.size;
  }

  clear(): void {
    this._lifecycle.clear();
    this._history.clear();
  }

  private _isValidTransition(from: WidgetLifecycleState, to: WidgetLifecycleState): boolean {
    const valid: Record<WidgetLifecycleState, WidgetLifecycleState[]> = {
      registered: ['initialized', 'disposed', 'unavailable'],
      initialized: ['loading', 'suspended', 'disposed', 'unavailable', 'error'],
      loading: ['loaded', 'error', 'unavailable', 'disposed'],
      loaded: ['refreshing', 'suspended', 'disposed', 'unavailable', 'error'],
      refreshing: ['loaded', 'error', 'unavailable', 'disposed'],
      suspended: ['loading', 'refreshing', 'disposed', 'unavailable'],
      unavailable: ['initialized', 'disposed'],
      disposed: [],
      error: ['loading', 'refreshing', 'disposed', 'unavailable'],
    };
    return valid[from]?.includes(to) ?? false;
  }
}
