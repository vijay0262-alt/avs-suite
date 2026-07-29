/**
 * Dashboard Action Platform — barrel export.
 *
 * Every dashboard widget can expose standardized actions.
 * Widgets never execute business logic directly.
 * All actions pass through the Dashboard Action Platform.
 */

// Types
export type {
  DashboardActionType,
  ActionCategory,
  ActionState,
  ActionPriority,
  DashboardActionDefinition,
  ActionExplanation,
  ActionRouting,
  ActionRoute,
  DashboardAction,
  ActionContext,
  ActionResult,
  ActionValidationResult,
  ActionPermissionResult,
  ActionHistoryEntry,
  ActionTelemetryData,
  ActionTelemetryStatistics,
  ActionEventType,
  ActionEvent,
  ActionListener,
  ActionPermissionRules,
  ActionConfirmationRules,
  ActionTelemetryRules,
  ActionRoutingRules,
  ActionFeatureFlags,
  ActionConfiguration,
  ActionHandler,
  ActionHandlerRegistration,
  ActionStatistics,
} from './types';

// Helpers
export {
  generateActionId,
  getActionTypeLabel,
  getActionStateLabel,
  getActionCategoryLabel,
  getActionRouteLabel,
  createActionDefinition,
  createDefaultActionConfiguration,
} from './types';

// Configuration
export {
  DEFAULT_ACTION_CONFIGURATION,
  createActionConfiguration,
  shouldConfirmAction,
} from './actionConfiguration';
export type { DeepPartial as ActionDeepPartial } from './actionConfiguration';

// Events
export { ActionEvents } from './actionEvents';

// Registry
export { ActionRegistry } from './actionRegistry';

// Validator
export { ActionValidator } from './actionValidator';

// Permission Manager
export { ActionPermissionManager } from './actionPermissionManager';

// Telemetry
export { ActionTelemetry } from './actionTelemetry';

// History
export { ActionHistory } from './actionHistory';

// Resolver
export { ActionResolver } from './actionResolver';

// Dispatcher
export { ActionDispatcher } from './actionDispatcher';
export type { RouteHandler } from './actionDispatcher';

// Base Action
export { BaseAction } from './baseAction';

// Factory
export { ActionFactory } from './actionFactory';

// Manager
export { ActionManager } from './actionManager';
