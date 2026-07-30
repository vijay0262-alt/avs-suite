/**
 * AI Command Center — Widget Manager
 *
 * EPIC 5 PHASE A PART 3
 *
 * Manages widget instances, their lifecycle, and data fetching.
 */
import type { WidgetInstance, WidgetDefinition, WidgetData, CopilotContext, WidgetStatus } from './types';
import type { CommandCenterWidgetRegistry } from './commandCenterWidgetRegistry';

export class CommandCenterWidgetManager {
  private _registry: CommandCenterWidgetRegistry;
  private _instances: Map<string, WidgetInstance> = new Map();

  constructor(registry: CommandCenterWidgetRegistry) {
    this._registry = registry;
  }

  initializeWidgets(definitions: WidgetDefinition[]): void {
    for (const def of definitions) {
      this._instances.set(def.id, {
        definition: def,
        status: 'visible',
        data: null,
        lastRefreshedAt: null,
        error: null,
        futureMetadata: {},
      });
    }
  }

  getInstance(widgetId: string): WidgetInstance | null {
    return this._instances.get(widgetId) ?? null;
  }

  getAllInstances(): WidgetInstance[] {
    return Array.from(this._instances.values());
  }

  setWidgetStatus(widgetId: string, status: WidgetStatus): boolean {
    const instance = this._instances.get(widgetId);
    if (!instance) return false;
    instance.status = status;
    return true;
  }

  async refreshWidget(widgetId: string, context: CopilotContext): Promise<WidgetData | null> {
    const instance = this._instances.get(widgetId);
    if (!instance) return null;

    const provider = this._registry.getProvider(widgetId);
    if (!provider) {
      instance.status = 'error';
      instance.error = `No data provider for widget "${widgetId}"`;
      return null;
    }

    instance.status = 'loading';
    instance.error = null;

    try {
      const data = await provider.fetchData(context);
      instance.data = data;
      instance.lastRefreshedAt = new Date().toISOString();
      instance.status = 'visible';
      instance.error = null;
      return data;
    } catch (err) {
      instance.status = 'error';
      instance.error = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  async refreshAll(context: CopilotContext): Promise<Map<string, WidgetData | null>> {
    const results = new Map<string, WidgetData | null>();
    for (const instance of this._instances.values()) {
      if (instance.status === 'hidden') continue;
      const data = await this.refreshWidget(instance.definition.id, context);
      results.set(instance.definition.id, data);
    }
    return results;
  }

  getVisibleWidgets(): WidgetInstance[] {
    return this.getAllInstances().filter((w) => w.status !== 'hidden');
  }

  getPinnedWidgets(): WidgetInstance[] {
    return this.getAllInstances().filter((w) => w.status === 'pinned');
  }

  reorderWidgets(orderedIds: string[]): void {
    for (let i = 0; i < orderedIds.length; i++) {
      const instance = this._instances.get(orderedIds[i]!);
      if (instance) {
        instance.definition.layout.order = i;
      }
    }
  }

  clear(): void {
    this._instances.clear();
  }
}
