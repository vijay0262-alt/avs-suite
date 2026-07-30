/**
 * AI Command Center — Layout Engine
 *
 * EPIC 5 PHASE A PART 3
 *
 * Manages dashboard layouts: grid, resizable, collapsible,
 * pinned, hidden, multiple layouts, saved layouts.
 */
import type { DashboardLayout, LayoutWidgetEntry, WidgetStatus, WidgetInstance, LayoutType } from './types';
import { generateLayoutId } from './types';

export class CommandCenterLayoutEngine {
  private _currentLayout: DashboardLayout | null = null;
  private _savedLayouts: Map<string, DashboardLayout> = new Map();

  setDefaultLayout(layout: DashboardLayout): void {
    this._currentLayout = structuredClone(layout);
  }

  getCurrentLayout(): DashboardLayout | null {
    return this._currentLayout;
  }

  createLayout(name: string, type: LayoutType, widgetEntries: LayoutWidgetEntry[]): DashboardLayout {
    return {
      id: generateLayoutId(),
      name,
      type,
      widgets: widgetEntries,
      savedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  saveLayout(layout: DashboardLayout): string {
    const saved = structuredClone(layout);
    saved.savedAt = new Date().toISOString();
    this._savedLayouts.set(saved.id, saved);
    return saved.id;
  }

  loadLayout(layoutId: string): DashboardLayout | null {
    const layout = this._savedLayouts.get(layoutId);
    if (layout) {
      this._currentLayout = structuredClone(layout);
      return this._currentLayout;
    }
    return null;
  }

  getSavedLayouts(): DashboardLayout[] {
    return Array.from(this._savedLayouts.values());
  }

  deleteLayout(layoutId: string): boolean {
    return this._savedLayouts.delete(layoutId);
  }

  setWidgetStatus(widgetId: string, status: WidgetStatus): boolean {
    if (!this._currentLayout) return false;
    const entry = this._currentLayout.widgets.find((w) => w.widgetId === widgetId);
    if (!entry) return false;
    entry.status = status;
    return true;
  }

  reorderWidgets(orderedIds: string[]): boolean {
    if (!this._currentLayout) return false;
    for (let i = 0; i < orderedIds.length; i++) {
      const entry = this._currentLayout.widgets.find((w) => w.widgetId === orderedIds[i]);
      if (entry) entry.order = i;
    }
    return true;
  }

  resizeWidget(widgetId: string, columns: number, rows: number): boolean {
    if (!this._currentLayout) return false;
    const entry = this._currentLayout.widgets.find((w) => w.widgetId === widgetId);
    if (!entry) return false;
    entry.columns = columns;
    entry.rows = rows;
    return true;
  }

  applyWidgetInstances(instances: WidgetInstance[]): void {
    if (!this._currentLayout) return;
    for (const instance of instances) {
      const entry = this._currentLayout.widgets.find((w) => w.widgetId === instance.definition.id);
      if (entry) {
        entry.status = instance.status;
        entry.order = instance.definition.layout.order;
        entry.columns = instance.definition.layout.columns;
        entry.rows = instance.definition.layout.rows;
      }
    }
  }

  getVisibleWidgetIds(): string[] {
    if (!this._currentLayout) return [];
    return this._currentLayout.widgets
      .filter((w) => w.status !== 'hidden')
      .sort((a, b) => a.order - b.order)
      .map((w) => w.widgetId);
  }

  clearSavedLayouts(): void {
    this._savedLayouts.clear();
  }
}
