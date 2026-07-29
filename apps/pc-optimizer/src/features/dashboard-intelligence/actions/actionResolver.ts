/**
 * Action Resolver — resolves action routing and determines target.
 *
 * Actions are routed to: Execution Engine, Scheduler, Reports,
 * History, AI Assistant, Navigation, Internal Dashboard.
 *
 * Routing under 10ms target.
 */
import type {
  DashboardActionDefinition,
  ActionRoute,
  ActionRoutingRules,
  ActionContext,
} from './types';

export class ActionResolver {
  private _routingRules: ActionRoutingRules;

  constructor(routingRules: ActionRoutingRules) {
    this._routingRules = routingRules;
  }

  updateRules(routingRules: ActionRoutingRules): void {
    this._routingRules = routingRules;
  }

  resolve(definition: DashboardActionDefinition, _context: ActionContext): ActionRoute {
    if (definition.routing?.route) {
      return definition.routing.route;
    }
    const override = this._routingRules.routeOverrides[definition.actionType];
    if (override) return override;
    return this._routingRules.defaultRoute;
  }

  resolvePayload(definition: DashboardActionDefinition, context: ActionContext): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      actionId: definition.id,
      actionType: definition.actionType,
      widgetId: definition.widgetId,
      widgetType: definition.widgetType,
      userId: context.userId,
      options: context.options,
    };
    if (definition.routing?.payload) {
      Object.assign(payload, definition.routing.payload);
    }
    return payload;
  }

  resolveTarget(definition: DashboardActionDefinition): string | undefined {
    return definition.routing?.target;
  }
}
