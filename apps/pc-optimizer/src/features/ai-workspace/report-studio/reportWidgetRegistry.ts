/**
 * AI Report Studio — Widget Registry
 *
 * EPIC 5 PHASE A PART 5
 *
 * Central registry for report widget definitions. Supports plugin architecture.
 */
import type { ReportWidgetDefinition, WidgetType, ReportPlugin } from './types';
import { createDefaultWidgetDefinitions } from './types';

export class ReportWidgetRegistry {
  private _widgets: Map<string, ReportWidgetDefinition> = new Map();

  constructor(widgets?: ReportWidgetDefinition[]) {
    const initial = widgets ?? createDefaultWidgetDefinitions();
    for (const w of initial) {
      this._widgets.set(w.id, w);
    }
  }

  register(widget: ReportWidgetDefinition): boolean {
    if (this._widgets.has(widget.id)) return false;
    this._widgets.set(widget.id, widget);
    return true;
  }

  unregister(id: string): boolean {
    return this._widgets.delete(id);
  }

  get(id: string): ReportWidgetDefinition | null {
    return this._widgets.get(id) ?? null;
  }

  getAll(): ReportWidgetDefinition[] {
    return Array.from(this._widgets.values());
  }

  getByType(type: WidgetType): ReportWidgetDefinition[] {
    return this.getAll().filter((w) => w.type === type);
  }

  getByCategory(category: string): ReportWidgetDefinition[] {
    return this.getAll().filter((w) => w.category === category);
  }

  has(id: string): boolean {
    return this._widgets.has(id);
  }

  count(): number {
    return this._widgets.size;
  }

  registerPlugin(plugin: ReportPlugin): void {
    const widgets = plugin.getWidgetDefinitions();
    for (const w of widgets) {
      this.register(w);
    }
  }
}
