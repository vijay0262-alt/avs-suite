/**
 * Action Registry — register/unregister action definitions.
 *
 * Provider/plugin architecture only. No switch statements.
 * Future actions register through this registry.
 */
import type { DashboardActionDefinition, DashboardActionType, ActionCategory } from './types';

export class ActionRegistry {
  private _actions: Map<string, DashboardActionDefinition> = new Map();
  private _byWidget: Map<string, Set<string>> = new Map();
  private _byType: Map<DashboardActionType, Set<string>> = new Map();

  register(definition: DashboardActionDefinition): boolean {
    if (this._actions.has(definition.id)) return false;
    this._actions.set(definition.id, definition);

    let widgetSet = this._byWidget.get(definition.widgetId);
    if (!widgetSet) {
      widgetSet = new Set();
      this._byWidget.set(definition.widgetId, widgetSet);
    }
    widgetSet.add(definition.id);

    let typeSet = this._byType.get(definition.actionType);
    if (!typeSet) {
      typeSet = new Set();
      this._byType.set(definition.actionType, typeSet);
    }
    typeSet.add(definition.id);

    return true;
  }

  unregister(actionId: string): boolean {
    const def = this._actions.get(actionId);
    if (!def) return false;
    this._actions.delete(actionId);
    const widgetSet = this._byWidget.get(def.widgetId);
    widgetSet?.delete(actionId);
    const typeSet = this._byType.get(def.actionType);
    typeSet?.delete(actionId);
    return true;
  }

  get(actionId: string): DashboardActionDefinition | undefined {
    return this._actions.get(actionId);
  }

  has(actionId: string): boolean {
    return this._actions.has(actionId);
  }

  getAll(): DashboardActionDefinition[] {
    return Array.from(this._actions.values());
  }

  getByWidget(widgetId: string): DashboardActionDefinition[] {
    const ids = this._byWidget.get(widgetId);
    if (!ids) return [];
    return Array.from(ids).map((id) => this._actions.get(id)).filter((d): d is DashboardActionDefinition => d !== undefined);
  }

  getByType(actionType: DashboardActionType): DashboardActionDefinition[] {
    const ids = this._byType.get(actionType);
    if (!ids) return [];
    return Array.from(ids).map((id) => this._actions.get(id)).filter((d): d is DashboardActionDefinition => d !== undefined);
  }

  getByCategory(category: ActionCategory): DashboardActionDefinition[] {
    return this.getAll().filter((d) => d.category === category);
  }

  clear(): void {
    this._actions.clear();
    this._byWidget.clear();
    this._byType.clear();
  }

  get count(): number {
    return this._actions.size;
  }

  getWidgetActionCount(widgetId: string): number {
    return this._byWidget.get(widgetId)?.size ?? 0;
  }
}
