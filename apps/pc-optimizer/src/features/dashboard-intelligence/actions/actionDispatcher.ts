/**
 * Action Dispatcher — dispatches actions to their routed targets.
 *
 * No widget should directly invoke business logic.
 * All dispatching goes through this dispatcher.
 *
 * Future consumers: Execution Engine, Scheduler, AI Assistant,
 * Reports, Notifications.
 */
import type {
  DashboardActionDefinition,
  ActionContext,
  ActionResult,
  ActionRoute,
  ActionHandler,
  ActionRoutingRules,
} from './types';

export type RouteHandler = (definition: DashboardActionDefinition, context: ActionContext) => Promise<ActionResult>;

export class ActionDispatcher {
  private _routeHandlers: Map<ActionRoute, RouteHandler> = new Map();
  private _actionHandlers: Map<string, ActionHandler> = new Map();
  private _routingRules: ActionRoutingRules;

  constructor(routingRules: ActionRoutingRules) {
    this._routingRules = routingRules;
  }

  updateRules(routingRules: ActionRoutingRules): void {
    this._routingRules = routingRules;
  }

  registerRouteHandler(route: ActionRoute, handler: RouteHandler): void {
    this._routeHandlers.set(route, handler);
  }

  unregisterRouteHandler(route: ActionRoute): void {
    this._routeHandlers.delete(route);
  }

  registerActionHandler(actionId: string, handler: ActionHandler): void {
    this._actionHandlers.set(actionId, handler);
  }

  unregisterActionHandler(actionId: string): void {
    this._actionHandlers.delete(actionId);
  }

  async dispatch(
    definition: DashboardActionDefinition,
    context: ActionContext,
    route: ActionRoute,
  ): Promise<ActionResult> {
    const startTime = performance.now();

    try {
      // Check for action-specific handler first
      const actionHandler = this._actionHandlers.get(definition.id);
      if (actionHandler) {
        const result = await actionHandler(context);
        return {
          ...result,
          route,
          durationMs: performance.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      // Check for route handler
      const routeHandler = this._routeHandlers.get(route);
      if (routeHandler) {
        const result = await routeHandler(definition, context);
        return {
          ...result,
          route,
          durationMs: performance.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      // No handler — return a pending result (future consumers will handle)
      return {
        actionId: definition.id,
        success: true,
        route,
        data: { message: `Action routed to ${route}. No handler registered. Future consumer will process.` },
        error: null,
        durationMs: performance.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        actionId: definition.id,
        success: false,
        route,
        data: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  hasRouteHandler(route: ActionRoute): boolean {
    return this._routeHandlers.has(route);
  }

  hasActionHandler(actionId: string): boolean {
    return this._actionHandlers.has(actionId);
  }

  clear(): void {
    this._routeHandlers.clear();
    this._actionHandlers.clear();
  }
}
