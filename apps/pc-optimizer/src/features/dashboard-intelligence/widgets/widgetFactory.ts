/**
 * Widget Factory — creates widget instances from definitions.
 *
 * Uses the registry to look up definitions and instantiates
 * the appropriate widget class.
 */
import type {
  WidgetDefinitionEx,
  WidgetType,
  WidgetFrameworkConfiguration,
} from './types';
import type { WidgetRegistry } from './widgetRegistry';
import type { WidgetLifecycleManager } from './widgetLifecycleManager';
import type { WidgetStateManager } from './widgetStateManager';
import type { WidgetTelemetry } from './widgetTelemetry';
import type { WidgetActionRegistry } from './widgetActionRegistry';
import type { WidgetEventEmitter } from './widgetEvents';
import { BaseWidget } from './baseWidget';
export { BaseWidget } from './baseWidget';

export type WidgetConstructor = new (
  definition: WidgetDefinitionEx,
  lifecycle: WidgetLifecycleManager,
  stateManager: WidgetStateManager,
  telemetry: WidgetTelemetry,
  actionRegistry: WidgetActionRegistry,
  events: WidgetEventEmitter,
  config: WidgetFrameworkConfiguration,
) => BaseWidget;

export class WidgetFactory {
  private _registry: WidgetRegistry;
  private _lifecycle: WidgetLifecycleManager;
  private _stateManager: WidgetStateManager;
  private _telemetry: WidgetTelemetry;
  private _actionRegistry: WidgetActionRegistry;
  private _events: WidgetEventEmitter;
  private _config: WidgetFrameworkConfiguration;
  private _constructors: Map<WidgetType, WidgetConstructor> = new Map();

  constructor(
    registry: WidgetRegistry,
    lifecycle: WidgetLifecycleManager,
    stateManager: WidgetStateManager,
    telemetry: WidgetTelemetry,
    actionRegistry: WidgetActionRegistry,
    events: WidgetEventEmitter,
    config: WidgetFrameworkConfiguration,
  ) {
    this._registry = registry;
    this._lifecycle = lifecycle;
    this._stateManager = stateManager;
    this._telemetry = telemetry;
    this._actionRegistry = actionRegistry;
    this._events = events;
    this._config = config;
  }

  registerConstructor(type: WidgetType, constructor: WidgetConstructor): boolean {
    if (this._constructors.has(type)) return false;
    this._constructors.set(type, constructor);
    return true;
  }

  unregisterConstructor(type: WidgetType): boolean {
    return this._constructors.delete(type);
  }

  createWidget(type: WidgetType): BaseWidget | null {
    const def = this._registry.get(type);
    if (!def) return null;

    const ctor = this._constructors.get(type);
    if (ctor) {
      return new ctor(
        def,
        this._lifecycle,
        this._stateManager,
        this._telemetry,
        this._actionRegistry,
        this._events,
        this._config,
      );
    }

    // Default: use GenericWidget
    return new GenericWidget(
      def,
      this._lifecycle,
      this._stateManager,
      this._telemetry,
      this._actionRegistry,
      this._events,
      this._config,
    );
  }

  createWidgets(types: WidgetType[]): BaseWidget[] {
    const widgets: BaseWidget[] = [];
    for (const type of types) {
      const widget = this.createWidget(type);
      if (widget) widgets.push(widget);
    }
    return widgets;
  }
}

/**
 * GenericWidget — default widget implementation for definitions
 * that don't have a custom constructor registered.
 */
export class GenericWidget extends BaseWidget {}
