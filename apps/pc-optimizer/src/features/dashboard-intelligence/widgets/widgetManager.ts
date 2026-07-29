/**
 * Widget Manager — public API facade for the Widget Framework.
 *
 * Public APIs:
 *   registerWidget()
 *   createWidget()
 *   initializeWidget()
 *   refreshWidget()
 *   disposeWidget()
 *   getWidgetState()
 *   getWidgetStatistics()
 */
import type {
  WidgetDefinitionEx,
  WidgetType,
  WidgetFrameworkConfiguration,
  WidgetRuntimeState,
  WidgetStatistics,
  WidgetLifecycleState,
  WidgetValidationResult,
} from './types';
import { WidgetRegistry } from './widgetRegistry';
import { WidgetLifecycleManager } from './widgetLifecycleManager';
import { WidgetStateManager } from './widgetStateManager';
import { WidgetTelemetry } from './widgetTelemetry';
import { WidgetActionRegistry } from './widgetActionRegistry';
import { WidgetPermissionManager } from './widgetPermissionManager';
import { WidgetValidator } from './widgetValidator';
import { WidgetEventEmitter } from './widgetEvents';
import { WidgetFactory, type WidgetConstructor, type BaseWidget } from './widgetFactory';
import { DEFAULT_WIDGET_FRAMEWORK_CONFIG, createWidgetFrameworkConfig } from './widgetConfiguration';

export class WidgetManager {
  private _config: WidgetFrameworkConfiguration;
  private _registry: WidgetRegistry;
  private _lifecycle: WidgetLifecycleManager;
  private _stateManager: WidgetStateManager;
  private _telemetry: WidgetTelemetry;
  private _actionRegistry: WidgetActionRegistry;
  private _permissionManager: WidgetPermissionManager;
  private _validator: WidgetValidator;
  private _events: WidgetEventEmitter;
  private _factory: WidgetFactory;
  private _instances: Map<string, BaseWidget> = new Map();

  constructor(config?: WidgetFrameworkConfiguration) {
    this._config = config ?? { ...DEFAULT_WIDGET_FRAMEWORK_CONFIG };
    this._registry = new WidgetRegistry();
    this._lifecycle = new WidgetLifecycleManager();
    this._stateManager = new WidgetStateManager();
    this._telemetry = new WidgetTelemetry(this._config);
    this._actionRegistry = new WidgetActionRegistry();
    this._permissionManager = new WidgetPermissionManager(this._config);
    this._validator = new WidgetValidator(this._config);
    this._events = new WidgetEventEmitter();
    this._factory = new WidgetFactory(
      this._registry,
      this._lifecycle,
      this._stateManager,
      this._telemetry,
      this._actionRegistry,
      this._events,
      this._config,
    );
  }

  registerWidget(def: WidgetDefinitionEx): boolean {
    const result = this._registry.register(def);
    if (result) {
      this._events.emit('widget_registered', {
        widgetId: '',
        widgetType: def.type,
        eventType: 'widget_registered',
        data: { type: def.type },
        timestamp: new Date().toISOString(),
      });
    }
    return result;
  }

  unregisterWidget(type: WidgetType): boolean {
    return this._registry.unregister(type);
  }

  registerConstructor(type: WidgetType, ctor: WidgetConstructor): boolean {
    return this._factory.registerConstructor(type, ctor);
  }

  createWidget(type: WidgetType): BaseWidget | null {
    const widget = this._factory.createWidget(type);
    if (widget) {
      this._instances.set(widget.id, widget);
    }
    return widget;
  }

  async initializeWidget(widgetId: string): Promise<boolean> {
    const widget = this._instances.get(widgetId);
    if (!widget) return false;
    await widget.initialize();
    return true;
  }

  async refreshWidget(widgetId: string): Promise<boolean> {
    const widget = this._instances.get(widgetId);
    if (!widget) return false;
    await widget.refresh();
    return true;
  }

  async disposeWidget(widgetId: string): Promise<boolean> {
    const widget = this._instances.get(widgetId);
    if (!widget) return false;
    await widget.dispose();
    this._instances.delete(widgetId);
    return true;
  }

  getWidget(widgetId: string): BaseWidget | undefined {
    return this._instances.get(widgetId);
  }

  getWidgets(): BaseWidget[] {
    return Array.from(this._instances.values());
  }

  getWidgetState(widgetId: string): WidgetRuntimeState | undefined {
    return this._stateManager.getState(widgetId);
  }

  getWidgetLifecycle(widgetId: string): WidgetLifecycleState | undefined {
    return this._lifecycle.getLifecycle(widgetId);
  }

  getWidgetStatistics(): WidgetStatistics {
    const widgets = this.getWidgets();
    const byLifecycle = {} as Record<WidgetLifecycleState, number>;
    const byState = {} as Record<WidgetRuntimeState, number>;

    for (const w of widgets) {
      const lc: WidgetLifecycleState = w.getLifecycle() ?? 'registered';
      const st: WidgetRuntimeState = w.getState() ?? 'idle';
      byLifecycle[lc] = (byLifecycle[lc] ?? 0) + 1;
      byState[st] = (byState[st] ?? 0) + 1;
    }

    return {
      totalWidgets: widgets.length,
      byLifecycle,
      byState,
      averageLoadTimeMs: this._telemetry.averageLoadTimeMs,
      averageRefreshTimeMs: this._telemetry.averageRefreshTimeMs,
      totalErrors: this._telemetry.totalErrors,
      totalInteractions: this._telemetry.totalInteractions,
      totalRefreshes: this._telemetry.totalRefreshes,
    };
  }

  checkPermissions(
    type: WidgetType,
    userPlan: string,
    userFeatures: string[],
    hasQuota: boolean,
  ): WidgetValidationResult {
    const def = this._registry.get(type);
    if (!def) {
      return { valid: false, issues: [{ level: 'error', code: 'WIDGET_NOT_FOUND', message: `Widget not found: ${type}` }] };
    }
    return this._permissionManager.checkPermissions(def, userPlan, userFeatures, hasQuota);
  }

  validateWidget(def: WidgetDefinitionEx): WidgetValidationResult {
    return this._validator.validateDefinition(def);
  }

  updateConfig(overrides: Partial<WidgetFrameworkConfiguration>): void {
    this._config = createWidgetFrameworkConfig(overrides);
    this._telemetry.updateConfig(this._config);
    this._permissionManager.updateConfig(this._config);
    this._validator.updateConfig(this._config);
  }

  get config(): WidgetFrameworkConfiguration {
    return this._config;
  }

  get events(): WidgetEventEmitter {
    return this._events;
  }

  get registry(): WidgetRegistry {
    return this._registry;
  }

  get actionRegistry(): WidgetActionRegistry {
    return this._actionRegistry;
  }

  get lifecycle(): WidgetLifecycleManager {
    return this._lifecycle;
  }

  get stateManager(): WidgetStateManager {
    return this._stateManager;
  }

  get telemetry(): WidgetTelemetry {
    return this._telemetry;
  }

  get validator(): WidgetValidator {
    return this._validator;
  }

  clear(): void {
    this._instances.clear();
    this._lifecycle.clear();
    this._stateManager.clear();
    this._telemetry.clear();
    this._actionRegistry.clear();
    this._events.clear();
  }
}
