/**
 * Action Manager — top-level orchestrator for the Dashboard Action Platform.
 *
 * Public APIs:
 *   registerAction()
 *   executeAction()
 *   validateAction()
 *   getAvailableActions()
 *   getActionHistory()
 *   getActionStatistics()
 *
 * Architecture:
 *   Dashboard Widget → Action Registry → Action Resolver →
 *   Permission Validation → Action Dispatcher → Future Consumers
 */
import type {
  DashboardActionDefinition,
  ActionContext,
  ActionResult,
  ActionValidationResult,
  ActionPermissionResult,
  ActionHistoryEntry,
  ActionStatistics,
  ActionConfiguration,
  ActionState,
  ActionEventType,
  ActionListener,
  ActionRoute,
  ActionHandler,
} from './types';
import { ActionRegistry } from './actionRegistry';
import { ActionValidator } from './actionValidator';
import { ActionPermissionManager } from './actionPermissionManager';
import { ActionTelemetry } from './actionTelemetry';
import { ActionHistory } from './actionHistory';
import { ActionResolver } from './actionResolver';
import { ActionDispatcher } from './actionDispatcher';
import type { RouteHandler } from './actionDispatcher';
import { ActionEvents } from './actionEvents';
import { createActionConfiguration, type DeepPartial } from './actionConfiguration';

export class ActionManager {
  private _config: ActionConfiguration;
  private _registry: ActionRegistry;
  private _validator: ActionValidator;
  private _permissionManager: ActionPermissionManager;
  private _telemetry: ActionTelemetry;
  private _history: ActionHistory;
  private _resolver: ActionResolver;
  private _dispatcher: ActionDispatcher;
  private _events: ActionEvents;
  private _actionStates: Map<string, ActionState> = new Map();

  constructor(config?: ActionConfiguration | DeepPartial<ActionConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as ActionConfiguration;
    } else {
      this._config = createActionConfiguration(config as DeepPartial<ActionConfiguration>);
    }

    this._registry = new ActionRegistry();
    this._validator = new ActionValidator(this._config);
    this._permissionManager = new ActionPermissionManager(this._config);
    this._telemetry = new ActionTelemetry(this._config.telemetryRules);
    this._history = new ActionHistory();
    this._resolver = new ActionResolver(this._config.routingRules);
    this._dispatcher = new ActionDispatcher(this._config.routingRules);
    this._events = new ActionEvents();
  }

  // ── Public APIs ─────────────────────────────────────────────

  registerAction(definition: DashboardActionDefinition): boolean {
    const validation = this._validator.validateDefinition(definition);
    if (!validation.valid) {
      console.error('[ActionManager] Invalid action definition:', validation.errors);
      return false;
    }

    const widgetActionCount = this._registry.getWidgetActionCount(definition.widgetId);
    if (widgetActionCount >= this._config.maxActionsPerWidget) {
      console.error(`[ActionManager] Max actions per widget (${this._config.maxActionsPerWidget}) reached for widget ${definition.widgetId}`);
      return false;
    }

    const registered = this._registry.register(definition);
    if (registered) {
      this._actionStates.set(definition.id, 'available');
      if (this._config.enableEvents) {
        this._events.emitRegistered(definition.id, definition.widgetId, { definition });
      }
    }
    return registered;
  }

  unregisterAction(actionId: string): boolean {
    const unregistered = this._registry.unregister(actionId);
    if (unregistered) {
      this._actionStates.delete(actionId);
    }
    return unregistered;
  }

  async executeAction(actionId: string, context: ActionContext): Promise<ActionResult> {
    const definition = this._registry.get(actionId);
    if (!definition) {
      return {
        actionId,
        success: false,
        route: 'internal_dashboard',
        data: null,
        error: `Action not found: ${actionId}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    }

    if (this._config.enableEvents) {
      this._events.emitSelected(actionId, definition.widgetId, { context });
    }

    // Validate
    const validation = this.validateAction(actionId, context);
    if (!validation.valid) {
      if (this._config.enableEvents) {
        this._events.emitFailed(actionId, definition.widgetId, { validation });
      }
      this._history.record(
        actionId, definition.actionType, definition.widgetId, definition.widgetType,
        'failed', 0, validation.errors.join('; '), null, context.userId,
      );
      return {
        actionId,
        success: false,
        route: 'internal_dashboard',
        data: null,
        error: `Validation failed: ${validation.errors.join('; ')}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // Check permissions
    const permissionResult = this._permissionManager.check(definition, context);
    if (!permissionResult.allowed) {
      if (this._config.enableEvents) {
        this._events.emitFailed(actionId, definition.widgetId, { permissionResult });
      }
      this._history.record(
        actionId, definition.actionType, definition.widgetId, definition.widgetType,
        'failed', 0, permissionResult.reasons.join('; '), null, context.userId,
      );
      return {
        actionId,
        success: false,
        route: 'internal_dashboard',
        data: null,
        error: `Permission denied: ${permissionResult.reasons.join('; ')}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    }

    if (this._config.enableEvents) {
      this._events.emitValidated(actionId, definition.widgetId, { permissionResult });
    }

    // Resolve route
    const route = this._resolver.resolve(definition, context);

    // Set executing state
    this._actionStates.set(actionId, 'executing');

    // Telemetry: record invocation
    this._telemetry.recordInvocation(actionId, definition.actionType, definition.widgetId);

    if (this._config.enableEvents) {
      this._events.emitDispatched(actionId, definition.widgetId, { route });
    }

    // Dispatch
    const result = await this._dispatcher.dispatch(definition, context, route);

    // Update state
    const finalState: ActionState = result.success ? 'completed' : 'failed';
    this._actionStates.set(actionId, finalState);

    // Telemetry: record completion
    this._telemetry.recordCompletion(actionId, result.durationMs, result.success, result.error, route);

    // History
    this._history.record(
      actionId, definition.actionType, definition.widgetId, definition.widgetType,
      finalState, result.durationMs, result.error, route, context.userId,
    );

    // Events
    if (this._config.enableEvents) {
      if (result.success) {
        this._events.emitCompleted(actionId, definition.widgetId, { result });
      } else {
        this._events.emitFailed(actionId, definition.widgetId, { result });
      }
    }

    return result;
  }

  validateAction(actionId: string, context: ActionContext): ActionValidationResult {
    const definition = this._registry.get(actionId);
    if (!definition) {
      return { valid: false, errors: [`Action not found: ${actionId}`], warnings: [] };
    }
    return this._validator.validateForExecution(definition, context);
  }

  checkPermissions(actionId: string, context: ActionContext): ActionPermissionResult {
    const definition = this._registry.get(actionId);
    if (!definition) {
      return {
        allowed: false,
        reasons: [`Action not found: ${actionId}`],
        missingCapabilities: [],
        missingFeatures: [],
        planRequired: null,
        quotaExceeded: false,
      };
    }
    return this._permissionManager.check(definition, context);
  }

  getAvailableActions(widgetId?: string): DashboardActionDefinition[] {
    if (widgetId) {
      return this._registry.getByWidget(widgetId).filter((d) => {
        const state = this._actionStates.get(d.id);
        return state === 'available' || state === undefined;
      });
    }
    return this._registry.getAll().filter((d) => {
      const state = this._actionStates.get(d.id);
      return state === 'available' || state === undefined;
    });
  }

  getActionHistory(widgetId?: string): ActionHistoryEntry[] {
    if (widgetId) return this._history.getByWidget(widgetId);
    return this._history.getAll();
  }

  getActionStatistics(): ActionStatistics {
    const all = this._registry.getAll();
    const byState: Record<ActionState, number> = {
      available: 0, unavailable: 0, disabled: 0, hidden: 0,
      pending: 0, executing: 0, completed: 0, cancelled: 0, failed: 0,
    };
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byWidget: Record<string, number> = {};

    for (const def of all) {
      const state = this._actionStates.get(def.id) ?? 'available';
      byState[state]++;
      byType[def.actionType] = (byType[def.actionType] ?? 0) + 1;
      byCategory[def.category] = (byCategory[def.category] ?? 0) + 1;
      byWidget[def.widgetId] = (byWidget[def.widgetId] ?? 0) + 1;
    }

    const recentHistory = this._history.getRecent(50);
    const failedExecutions = this._history.getFailed().length;

    return {
      totalActions: all.length,
      byState,
      byType,
      byCategory,
      byWidget,
      recentExecutions: recentHistory.length,
      failedExecutions,
    };
  }

  getActionState(actionId: string): ActionState | undefined {
    return this._actionStates.get(actionId);
  }

  getActionDefinition(actionId: string): DashboardActionDefinition | undefined {
    return this._registry.get(actionId);
  }

  getTelemetryStatistics() {
    return this._telemetry.getStatistics();
  }

  // ── Events ──────────────────────────────────────────────────

  on(event: ActionEventType, listener: ActionListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: ActionEventType, listener: ActionListener): void {
    this._events.off(event, listener);
  }

  // ── Configuration ───────────────────────────────────────────

  get config(): ActionConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<ActionConfiguration>): void {
    this._config = createActionConfiguration(overrides);
    this._validator.updateConfig(this._config);
    this._permissionManager.updateConfig(this._config);
    this._telemetry.updateRules(this._config.telemetryRules);
    this._resolver.updateRules(this._config.routingRules);
    this._dispatcher.updateRules(this._config.routingRules);
  }

  // ── Dispatcher Registration ─────────────────────────────────

  registerRouteHandler(route: ActionRoute, handler: RouteHandler): void {
    this._dispatcher.registerRouteHandler(route, handler);
  }

  registerActionHandler(actionId: string, handler: ActionHandler): void {
    this._dispatcher.registerActionHandler(actionId, handler);
  }

  // ── Utility ─────────────────────────────────────────────────

  get registry(): ActionRegistry {
    return this._registry;
  }

  get dispatcher(): ActionDispatcher {
    return this._dispatcher;
  }

  get resolver(): ActionResolver {
    return this._resolver;
  }

  clear(): void {
    this._registry.clear();
    this._history.clear();
    this._telemetry.clear();
    this._events.clear();
    this._dispatcher.clear();
    this._actionStates.clear();
  }
}
