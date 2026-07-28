/**
 * Health Widget Registry — pluggable widget system for the dashboard.
 *
 * Widgets register themselves and the dashboard renders them dynamically.
 * Future modules (GPU Health, Battery Health, Driver Health, Network Health,
 * Cloud Backup) can register without changing dashboard architecture.
 *
 * Built-in widgets:
 *   • health-score — Overall health score panel
 *   • category-cards — Category card grid
 *   • real-time-status — Live system metrics
 *   • timeline — Health timeline
 *   • alerts — Active alerts
 *   • quick-actions — Quick action buttons
 */
import type { WidgetDefinition } from './types';

const BUILTIN_WIDGETS: WidgetDefinition[] = [
  { id: 'health-score', title: 'Health Score', category: 'health_score', component: 'HealthScorePanel', order: 10, enabled: true },
  { id: 'category-cards', title: 'Category Cards', category: 'category_card', component: 'CategoryCardGrid', order: 20, enabled: true },
  { id: 'real-time-status', title: 'Real-Time Status', category: 'real_time', component: 'RealTimeStatusPanel', order: 30, enabled: true },
  { id: 'timeline', title: 'Health Timeline', category: 'timeline', component: 'HealthTimelineView', order: 40, enabled: true },
  { id: 'alerts', title: 'Alerts', category: 'alert', component: 'AlertList', order: 50, enabled: true },
  { id: 'quick-actions', title: 'Quick Actions', category: 'quick_action', component: 'QuickActions', order: 60, enabled: true },
];

export class HealthWidgetRegistry {
  private _widgets: Map<string, WidgetDefinition> = new Map();
  private _listeners: Set<(widget: WidgetDefinition) => void> = new Set();
  private _unregisterListeners: Set<(widgetId: string) => void> = new Set();

  constructor() {
    // Register built-in widgets
    for (const widget of BUILTIN_WIDGETS) {
      this._widgets.set(widget.id, widget);
    }
  }

  /**
   * Register a new widget.
   */
  register(widget: WidgetDefinition): void {
    this._widgets.set(widget.id, widget);
    for (const listener of this._listeners) {
      try {
        listener(widget);
      } catch (err) {
        console.error('[WidgetRegistry] Listener error:', err);
      }
    }
  }

  /**
   * Unregister a widget.
   */
  unregister(widgetId: string): boolean {
    const deleted = this._widgets.delete(widgetId);
    if (deleted) {
      for (const listener of this._unregisterListeners) {
        try {
          listener(widgetId);
        } catch (err) {
          console.error('[WidgetRegistry] Unregister listener error:', err);
        }
      }
    }
    return deleted;
  }

  /**
   * Get a widget by ID.
   */
  getById(widgetId: string): WidgetDefinition | null {
    return this._widgets.get(widgetId) ?? null;
  }

  /**
   * Get all registered widgets, sorted by order.
   */
  getAll(): WidgetDefinition[] {
    return Array.from(this._widgets.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * Get all enabled widgets, sorted by order.
   */
  getEnabled(): WidgetDefinition[] {
    return this.getAll().filter((w) => w.enabled);
  }

  /**
   * Enable a widget.
   */
  enable(widgetId: string): boolean {
    const widget = this._widgets.get(widgetId);
    if (!widget) return false;
    this._widgets.set(widgetId, { ...widget, enabled: true });
    return true;
  }

  /**
   * Disable a widget.
   */
  disable(widgetId: string): boolean {
    const widget = this._widgets.get(widgetId);
    if (!widget) return false;
    this._widgets.set(widgetId, { ...widget, enabled: false });
    return true;
  }

  /**
   * Reorder a widget.
   */
  setOrder(widgetId: string, order: number): boolean {
    const widget = this._widgets.get(widgetId);
    if (!widget) return false;
    this._widgets.set(widgetId, { ...widget, order });
    return true;
  }

  /**
   * Update widget config.
   */
  setConfig(widgetId: string, config: Record<string, unknown>): boolean {
    const widget = this._widgets.get(widgetId);
    if (!widget) return false;
    this._widgets.set(widgetId, { ...widget, config });
    return true;
  }

  /**
   * Get the number of registered widgets.
   */
  count(): number {
    return this._widgets.size;
  }

  /**
   * Subscribe to widget registration events.
   */
  onRegister(listener: (widget: WidgetDefinition) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Subscribe to widget unregistration events.
   */
  onUnregister(listener: (widgetId: string) => void): () => void {
    this._unregisterListeners.add(listener);
    return () => this._unregisterListeners.delete(listener);
  }

  /**
   * Check if a widget is registered.
   */
  isRegistered(widgetId: string): boolean {
    return this._widgets.has(widgetId);
  }
}

/**
 * Default singleton instance.
 */
export const healthWidgetRegistry = new HealthWidgetRegistry();
