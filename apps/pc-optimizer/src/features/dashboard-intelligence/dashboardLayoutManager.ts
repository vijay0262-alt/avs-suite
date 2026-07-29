/**
 * Dashboard Layout Manager — manages dashboard layouts.
 *
 * Layout is configuration-driven. Supports:
 *   Default, Compact, Detailed, Beginner, Advanced, Custom, Future.
 */
import type {
  LayoutType,
  LayoutDefinition,
  DashboardLayout,
  WidgetInstance,
  WidgetDefinition,
  WidgetType,
  DashboardConfiguration,
} from './types';

export class DashboardLayoutManager {
  private _config: DashboardConfiguration;
  private _currentLayout: LayoutType;

  constructor(config: DashboardConfiguration) {
    this._config = config;
    this._currentLayout = config.defaultLayout;
  }

  updateConfig(config: DashboardConfiguration): void {
    this._config = config;
  }

  getLayoutDefinition(type: LayoutType): LayoutDefinition | undefined {
    return this._config.layoutDefinitions.find((l) => l.type === type);
  }

  getLayouts(): LayoutDefinition[] {
    return this._config.layoutDefinitions;
  }

  getCurrentLayout(): LayoutType {
    return this._currentLayout;
  }

  setLayout(type: LayoutType): boolean {
    const def = this.getLayoutDefinition(type);
    if (!def) return false;
    this._currentLayout = type;
    return true;
  }

  buildLayout(widgets: WidgetInstance[]): DashboardLayout {
    const def = this.getLayoutDefinition(this._currentLayout);
    const columns = def?.columns ?? 3;
    const maxWidgets = def?.maxWidgets ?? this._config.maxWidgets;

    // Sort widgets by layout order
    const order = def?.widgetOrder ?? [];
    const sorted = [...widgets].sort((a, b) => {
      const aIdx = order.indexOf(a.definition.type);
      const bIdx = order.indexOf(b.definition.type);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    return {
      type: this._currentLayout,
      widgets: sorted.slice(0, maxWidgets),
      columns,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  getWidgetOrder(): WidgetType[] {
    const def = this.getLayoutDefinition(this._currentLayout);
    return def?.widgetOrder ?? [];
  }

  filterWidgetsForLayout(widgets: WidgetDefinition[]): WidgetDefinition[] {
    const def = this.getLayoutDefinition(this._currentLayout);
    if (!def) return widgets;
    const order = def.widgetOrder;
    const max = def.maxWidgets;
    return widgets
      .filter((w) => order.includes(w.type))
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
      .slice(0, max);
  }
}
