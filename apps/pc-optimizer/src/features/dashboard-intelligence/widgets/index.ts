/**
 * Dashboard Widget Framework — Barrel Export.
 *
 * Every widget is an independent micro-application with its own
 * lifecycle, provider, actions, permissions, telemetry, and refresh strategy.
 *
 * Components:
 *   - WidgetManager          — public API facade
 *   - WidgetFactory          — creates widget instances
 *   - WidgetRegistry         — widget definition registration
 *   - WidgetLifecycleManager — lifecycle state management (9 states)
 *   - WidgetStateManager     — runtime state management (8 states)
 *   - WidgetActionRegistry   — action registration and invocation
 *   - WidgetPermissionManager — permission checks
 *   - WidgetTelemetry        — performance and usage tracking
 *   - WidgetValidator        — validation of definitions and instances
 *   - WidgetEvents           — typed event emitter (8 events)
 *   - WidgetConfiguration    — default config and factory
 *   - BaseWidget             — base class for all widgets
 */

// Types
export type {
  WidgetLifecycleState,
  WidgetRuntimeState,
  RefreshStrategy,
  WidgetVisibility,
  WidgetActionType,
  WidgetAction,
  WidgetActionHandler,
  WidgetActionContext,
  WidgetProvider,
  WidgetProviderContext,
  WidgetProviderFactory,
  WidgetDefinitionEx,
  WidgetInstanceEx,
  WidgetTelemetryData,
  TelemetryRules,
  WidgetValidationIssue,
  WidgetValidationResult,
  WidgetEventType,
  WidgetEventListener,
  WidgetEventPayload,
  LifecycleRules,
  RefreshRules,
  PermissionRules,
  WidgetFrameworkConfiguration,
  WidgetStatistics,
  WidgetType,
  WidgetCategory,
  WidgetSize,
  WidgetPriority,
  WidgetPermissions,
} from './types';

export {
  generateWidgetInstanceId,
  getLifecycleStateLabel,
  getRuntimeStateLabel,
  getRefreshStrategyLabel,
  createAction,
  createTelemetryData,
} from './types';

export { WidgetEventEmitter } from './widgetEvents';
export {
  DEFAULT_WIDGET_FRAMEWORK_CONFIG,
  createWidgetFrameworkConfig,
} from './widgetConfiguration';
export type { DeepPartial as WidgetDeepPartial } from './widgetConfiguration';
export { WidgetRegistry } from './widgetRegistry';
export { WidgetActionRegistry } from './widgetActionRegistry';
export { WidgetPermissionManager } from './widgetPermissionManager';
export { WidgetTelemetry } from './widgetTelemetry';
export { WidgetStateManager } from './widgetStateManager';
export type { WidgetStateEntry } from './widgetStateManager';
export { WidgetLifecycleManager } from './widgetLifecycleManager';
export { WidgetValidator } from './widgetValidator';
export { BaseWidget } from './baseWidget';
export { WidgetFactory, GenericWidget } from './widgetFactory';
export type { WidgetConstructor } from './widgetFactory';
export { WidgetManager } from './widgetManager';
