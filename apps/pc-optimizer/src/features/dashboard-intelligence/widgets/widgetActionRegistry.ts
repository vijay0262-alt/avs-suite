/**
 * Widget Action Registry — registers and invokes widget actions.
 *
 * Actions are configurable. Supports:
 *   Open Details, Run Action, View Report, View Recommendation,
 *   Refresh, Dismiss, Navigate, Future custom actions.
 */
import type { WidgetAction, WidgetActionContext, WidgetActionType } from './types';

export class WidgetActionRegistry {
  private _actions: Map<string, WidgetAction> = new Map();

  registerAction(action: WidgetAction): boolean {
    if (!action.id) return false;
    if (this._actions.has(action.id)) return false;
    this._actions.set(action.id, action);
    return true;
  }

  unregisterAction(id: string): boolean {
    return this._actions.delete(id);
  }

  getAction(id: string): WidgetAction | undefined {
    return this._actions.get(id);
  }

  getActions(): WidgetAction[] {
    return Array.from(this._actions.values());
  }

  getActionsByType(type: WidgetActionType): WidgetAction[] {
    return this.getActions().filter((a) => a.type === type);
  }

  invokeAction(id: string, context: WidgetActionContext): boolean {
    const action = this._actions.get(id);
    if (!action || !action.enabled || !action.handler) return false;
    try {
      action.handler(context);
      return true;
    } catch {
      return false;
    }
  }

  enableAction(id: string): boolean {
    const action = this._actions.get(id);
    if (!action) return false;
    action.enabled = true;
    return true;
  }

  disableAction(id: string): boolean {
    const action = this._actions.get(id);
    if (!action) return false;
    action.enabled = false;
    return true;
  }

  hasAction(id: string): boolean {
    return this._actions.has(id);
  }

  get count(): number {
    return this._actions.size;
  }

  clear(): void {
    this._actions.clear();
  }
}
