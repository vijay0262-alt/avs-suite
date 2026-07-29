/**
 * Widget Registry — registers and manages widget definitions.
 *
 * Future widgets register themselves without modifying existing code.
 */
import type { WidgetDefinitionEx, WidgetType } from './types';

export class WidgetRegistry {
  private _definitions: Map<WidgetType, WidgetDefinitionEx> = new Map();

  register(def: WidgetDefinitionEx): boolean {
    if (!def.type) return false;
    if (this._definitions.has(def.type)) return false;
    this._definitions.set(def.type, def);
    return true;
  }

  unregister(type: WidgetType): boolean {
    return this._definitions.delete(type);
  }

  get(type: WidgetType): WidgetDefinitionEx | undefined {
    return this._definitions.get(type);
  }

  getAll(): WidgetDefinitionEx[] {
    return Array.from(this._definitions.values());
  }

  has(type: WidgetType): boolean {
    return this._definitions.has(type);
  }

  get count(): number {
    return this._definitions.size;
  }

  clear(): void {
    this._definitions.clear();
  }

  getByCategory(category: WidgetDefinitionEx['category']): WidgetDefinitionEx[] {
    return this.getAll().filter((w) => w.category === category);
  }

  getByPriority(priority: WidgetDefinitionEx['priority']): WidgetDefinitionEx[] {
    return this.getAll().filter((w) => w.priority === priority);
  }
}
