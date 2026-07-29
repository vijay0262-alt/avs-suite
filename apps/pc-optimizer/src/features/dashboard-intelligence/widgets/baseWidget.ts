/**
 * Base Widget — every widget extends this class.
 *
 * Provides common behavior:
 *   Lifecycle management, state transitions, provider integration,
 *   action handling, telemetry, events, permissions.
 *
 * No duplicated widget logic. Provider-based architecture only.
 */
import type {
  WidgetDefinitionEx,
  WidgetInstanceEx,
  WidgetLifecycleState,
  WidgetRuntimeState,
  WidgetProvider,
  WidgetProviderContext,
  WidgetActionContext,
  WidgetFrameworkConfiguration,
  WidgetEventPayload,
  WidgetTelemetryData,
} from './types';
import { generateWidgetInstanceId, createTelemetryData } from './types';
import type { WidgetLifecycleManager } from './widgetLifecycleManager';
import type { WidgetStateManager } from './widgetStateManager';
import type { WidgetTelemetry } from './widgetTelemetry';
import type { WidgetActionRegistry } from './widgetActionRegistry';
import type { WidgetEventEmitter } from './widgetEvents';

export abstract class BaseWidget {
  readonly id: string;
  readonly definition: WidgetDefinitionEx;
  protected _lifecycle: WidgetLifecycleManager;
  protected _stateManager: WidgetStateManager;
  protected _telemetry: WidgetTelemetry;
  protected _actionRegistry: WidgetActionRegistry;
  protected _events: WidgetEventEmitter;
  protected _config: WidgetFrameworkConfiguration;
  protected _provider: WidgetProvider | null = null;
  protected _data: unknown = null;
  protected _lastUpdated: string | null = null;
  protected _error: string | null = null;
  protected _telemetryData: WidgetTelemetryData;

  constructor(
    definition: WidgetDefinitionEx,
    lifecycle: WidgetLifecycleManager,
    stateManager: WidgetStateManager,
    telemetry: WidgetTelemetry,
    actionRegistry: WidgetActionRegistry,
    events: WidgetEventEmitter,
    config: WidgetFrameworkConfiguration,
  ) {
    this.id = generateWidgetInstanceId(definition.type);
    this.definition = definition;
    this._lifecycle = lifecycle;
    this._stateManager = stateManager;
    this._telemetry = telemetry;
    this._actionRegistry = actionRegistry;
    this._events = events;
    this._config = config;
    this._telemetryData = createTelemetryData();

    this._lifecycle.initWidget(this.id);
    this._stateManager.initWidget(this.id);
    this._telemetry.initWidget(this.id);

    // Register actions from definition
    for (const action of definition.actions) {
      this._actionRegistry.registerAction(action);
    }
  }

  async initialize(): Promise<void> {
    const start = performance.now();

    try {
      this._provider = this.definition.providerFactory();
      await this._provider.initialize();
      this._lifecycle.transition(this.id, 'initialized');
      this._emit('widget_initialized', { initialized: true });
      this._telemetry.recordLoad(this.id, performance.now() - start);
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this._lifecycle.transition(this.id, 'error');
      this._stateManager.setState(this.id, 'error', this._error ?? undefined);
      this._telemetry.recordError(this.id);
      this._emit('widget_error', { error: this._error });
    }
  }

  async load(context?: WidgetProviderContext): Promise<void> {
    if (!this._provider) {
      this._error = 'Provider not initialized';
      this._lifecycle.transition(this.id, 'error');
      this._stateManager.setState(this.id, 'error', this._error);
      this._emit('widget_error', { error: this._error });
      return;
    }

    const start = performance.now();
    this._lifecycle.transition(this.id, 'loading');
    this._stateManager.setState(this.id, 'loading');

    try {
      const ctx: WidgetProviderContext = context ?? { options: {}, cachedData: this._data };
      this._data = await this._provider.load(ctx);
      this._lastUpdated = new Date().toISOString();
      this._error = null;
      this._lifecycle.transition(this.id, 'loaded');
      this._stateManager.setState(this.id, this._isEmpty(this._data) ? 'empty' : 'ready');
      this._telemetry.recordLoad(this.id, performance.now() - start);
      this._emit('widget_loaded', { data: this._data });
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this._lifecycle.transition(this.id, 'error');
      this._stateManager.setState(this.id, 'error', this._error ?? undefined);
      this._telemetry.recordError(this.id);
      this._emit('widget_error', { error: this._error });
    }
  }

  async refresh(context?: WidgetProviderContext): Promise<void> {
    if (!this._provider) return;

    const start = performance.now();
    this._lifecycle.transition(this.id, 'refreshing');
    this._stateManager.setState(this.id, 'refreshing');

    try {
      const ctx: WidgetProviderContext = context ?? { options: {}, cachedData: this._data };
      this._data = await this._provider.refresh(ctx);
      this._lastUpdated = new Date().toISOString();
      this._error = null;
      this._lifecycle.transition(this.id, 'loaded');
      this._stateManager.setState(this.id, this._isEmpty(this._data) ? 'empty' : 'ready');
      this._telemetry.recordRefresh(this.id, performance.now() - start);
      this._emit('widget_refreshed', { data: this._data });
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this._lifecycle.transition(this.id, 'error');
      this._stateManager.setState(this.id, 'error', this._error ?? undefined);
      this._telemetry.recordError(this.id);
      this._emit('widget_error', { error: this._error });
    }
  }

  invokeAction(actionId: string, options?: Record<string, unknown>): boolean {
    const action = this._actionRegistry.getAction(actionId);
    if (!action || !action.enabled) return false;

    const ctx: WidgetActionContext = {
      widgetId: this.id,
      widgetType: this.definition.type,
      data: this._data,
      options: options ?? {},
    };

    const result = this._actionRegistry.invokeAction(actionId, ctx);
    if (result) {
      this._telemetry.recordInteraction(this.id);
      this._telemetry.recordActionUsage(this.id, actionId);
      this._emit('widget_action_invoked', { actionId });
    }
    return result;
  }

  hide(): void {
    this._telemetry.recordVisibilityChange(this.id, false);
    this._emit('widget_hidden', { hidden: true });
  }

  show(): void {
    this._telemetry.recordVisibilityChange(this.id, true);
  }

  suspend(): void {
    this._lifecycle.transition(this.id, 'suspended');
  }

  async dispose(): Promise<void> {
    if (this._provider) {
      await this._provider.dispose();
      this._provider = null;
    }
    this._lifecycle.transition(this.id, 'disposed');
    this._telemetry.removeWidget(this.id);
    this._emit('widget_disposed', { disposed: true });
  }

  getLifecycle(): WidgetLifecycleState | undefined {
    return this._lifecycle.getLifecycle(this.id);
  }

  getState(): WidgetRuntimeState | undefined {
    return this._stateManager.getState(this.id);
  }

  getTelemetry(): WidgetTelemetryData | undefined {
    return this._telemetry.getWidgetTelemetry(this.id);
  }

  getInstance(): WidgetInstanceEx {
    return {
      id: this.id,
      definition: this.definition,
      lifecycle: this._lifecycle.getLifecycle(this.id) ?? 'registered',
      state: this._stateManager.getState(this.id) ?? 'idle',
      data: this._data,
      lastUpdated: this._lastUpdated,
      error: this._error,
      provider: this._provider,
      telemetry: this._telemetry.getWidgetTelemetry(this.id) ?? createTelemetryData(),
      futureMetadata: this.definition.futureMetadata,
    };
  }

  protected _emit(eventType: string, data?: unknown): void {
    if (!this._config.enableEvents) return;
    const payload: WidgetEventPayload = {
      widgetId: this.id,
      widgetType: this.definition.type,
      eventType: eventType as WidgetEventPayload['eventType'],
      data,
      timestamp: new Date().toISOString(),
    };
    this._events.emit(eventType as WidgetEventPayload['eventType'], payload);
  }

  private _isEmpty(data: unknown): boolean {
    if (data === null || data === undefined) return true;
    if (Array.isArray(data)) return data.length === 0;
    if (typeof data === 'object') return Object.keys(data as object).length === 0;
    return false;
  }
}
