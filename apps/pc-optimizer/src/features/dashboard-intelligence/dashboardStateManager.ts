/**
 * Dashboard State Manager — manages widget and dashboard states.
 *
 * States:
 *   Loading, Ready, Refreshing, Error, Unavailable,
 *   Permission Denied, Empty.
 */
import type {
  WidgetInstance,
  WidgetStateType,
  DashboardState,
  LayoutType,
} from './types';
import { createWidgetState } from './types';

export class DashboardStateManager {
  private _widgets: Map<string, WidgetInstance> = new Map();
  private _isLoaded: boolean = false;
  private _isRefreshing: boolean = false;
  private _lastRefreshedAt: string | null = null;
  private _loadTimeMs: number = 0;
  private _currentLayout: LayoutType = 'default';

  setLayout(layout: LayoutType): void {
    this._currentLayout = layout;
  }

  registerWidget(widget: WidgetInstance): void {
    this._widgets.set(widget.id, widget);
  }

  removeWidget(id: string): boolean {
    return this._widgets.delete(id);
  }

  getWidget(id: string): WidgetInstance | undefined {
    return this._widgets.get(id);
  }

  getWidgets(): WidgetInstance[] {
    return Array.from(this._widgets.values());
  }

  setWidgetState(id: string, stateType: WidgetStateType, message?: string): void {
    const widget = this._widgets.get(id);
    if (!widget) return;
    widget.state = createWidgetState(stateType, message);
  }

  setWidgetData(id: string, data: unknown): void {
    const widget = this._widgets.get(id);
    if (!widget) return;
    widget.data = data;
    widget.lastUpdated = new Date().toISOString();
    widget.error = null;
    widget.state = createWidgetState('ready');
  }

  setWidgetError(id: string, error: string): void {
    const widget = this._widgets.get(id);
    if (!widget) return;
    widget.error = error;
    widget.state = createWidgetState('error', error);
  }

  markLoaded(loadTimeMs: number): void {
    this._isLoaded = true;
    this._loadTimeMs = loadTimeMs;
    this._lastRefreshedAt = new Date().toISOString();
  }

  markRefreshing(): void {
    this._isRefreshing = true;
  }

  markRefreshed(): void {
    this._isRefreshing = false;
    this._lastRefreshedAt = new Date().toISOString();
  }

  getDashboardState(): DashboardState {
    return {
      layout: this._currentLayout,
      widgets: new Map(this._widgets),
      isLoaded: this._isLoaded,
      isRefreshing: this._isRefreshing,
      lastRefreshedAt: this._lastRefreshedAt,
      loadTimeMs: this._loadTimeMs,
    };
  }

  getWidgetCount(): number {
    return this._widgets.size;
  }

  getWidgetsByState(stateType: WidgetStateType): WidgetInstance[] {
    return this.getWidgets().filter((w) => w.state.type === stateType);
  }

  clear(): void {
    this._widgets.clear();
    this._isLoaded = false;
    this._isRefreshing = false;
    this._lastRefreshedAt = null;
    this._loadTimeMs = 0;
  }
}
