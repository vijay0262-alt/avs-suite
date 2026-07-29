/**
 * Dashboard Widget Registry — registers and manages widget definitions.
 *
 * Future widgets register themselves without modifying existing code.
 * No switch statements. Provider architecture only.
 */
import type { WidgetDefinition, WidgetType } from './types';

export class DashboardWidgetRegistry {
  private _widgets: Map<WidgetType, WidgetDefinition> = new Map();

  registerWidget(def: WidgetDefinition): boolean {
    if (!def.type) return false;
    if (this._widgets.has(def.type)) return false;
    this._widgets.set(def.type, def);
    return true;
  }

  unregisterWidget(type: WidgetType): boolean {
    return this._widgets.delete(type);
  }

  getWidget(type: WidgetType): WidgetDefinition | undefined {
    return this._widgets.get(type);
  }

  getWidgets(): WidgetDefinition[] {
    return Array.from(this._widgets.values());
  }

  hasWidget(type: WidgetType): boolean {
    return this._widgets.has(type);
  }

  get count(): number {
    return this._widgets.size;
  }

  clear(): void {
    this._widgets.clear();
  }

  getByCategory(category: WidgetDefinition['category']): WidgetDefinition[] {
    return this.getWidgets().filter((w) => w.category === category);
  }

  getByPriority(priority: WidgetDefinition['priority']): WidgetDefinition[] {
    return this.getWidgets().filter((w) => w.priority === priority);
  }
}
