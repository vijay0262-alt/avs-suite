/**
 * AI Command Center — Widget Registry
 *
 * EPIC 5 PHASE A PART 3
 *
 * Central registry for widget definitions and data providers.
 * Supports plugin architecture for extensibility.
 */
import type { WidgetDefinition, WidgetDataProvider, WidgetPlugin, WidgetCategory } from './types';

export class CommandCenterWidgetRegistry {
  private _definitions: Map<string, WidgetDefinition> = new Map();
  private _providers: Map<string, WidgetDataProvider> = new Map();
  private _plugins: Map<string, { plugin: WidgetPlugin; definitions: WidgetDefinition[] }> = new Map();

  register(definition: WidgetDefinition): boolean {
    if (this._definitions.has(definition.id)) return false;
    this._definitions.set(definition.id, definition);
    return true;
  }

  unregister(widgetId: string): boolean {
    this._providers.delete(widgetId);
    return this._definitions.delete(widgetId);
  }

  getDefinition(widgetId: string): WidgetDefinition | null {
    return this._definitions.get(widgetId) ?? null;
  }

  getAllDefinitions(): WidgetDefinition[] {
    return Array.from(this._definitions.values());
  }

  hasWidget(widgetId: string): boolean {
    return this._definitions.has(widgetId);
  }

  count(): number {
    return this._definitions.size;
  }

  registerProvider(widgetId: string, provider: WidgetDataProvider): void {
    this._providers.set(widgetId, provider);
  }

  getProvider(widgetId: string): WidgetDataProvider | null {
    return this._providers.get(widgetId) ?? null;
  }

  getByCategory(category: WidgetCategory): WidgetDefinition[] {
    return this.getAllDefinitions().filter((d) => d.category === category);
  }

  search(query: string): WidgetDefinition[] {
    const q = query.toLowerCase();
    return this.getAllDefinitions().filter(
      (d) => d.title.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.category.toLowerCase().includes(q),
    );
  }

  registerPlugin(plugin: WidgetPlugin): boolean {
    if (this._plugins.has(plugin.getPluginName())) return false;
    const defs = plugin.getWidgetDefinitions();
    for (const def of defs) {
      this.register(def);
    }
    const provider = plugin.getDataProvider();
    if (provider) {
      for (const def of defs) {
        this.registerProvider(def.id, provider);
      }
    }
    this._plugins.set(plugin.getPluginName(), { plugin, definitions: defs });
    return true;
  }

  unregisterPlugin(pluginName: string): boolean {
    const entry = this._plugins.get(pluginName);
    if (!entry) return false;
    for (const def of entry.definitions) {
      this.unregister(def.id);
    }
    this._plugins.delete(pluginName);
    return true;
  }

  clear(): void {
    this._definitions.clear();
    this._providers.clear();
    this._plugins.clear();
  }
}
