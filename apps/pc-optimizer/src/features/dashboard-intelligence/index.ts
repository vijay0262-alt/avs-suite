/**
 * Intelligent Dashboard Platform — Barrel Export.
 *
 * Core architectural principle:
 *   "The dashboard is a consumer of the AI Intelligence Platform.
 *    Widgets receive data through providers, never directly from
 *    internal services."
 *
 * Components:
 *   - DashboardManager          — public API facade
 *   - DashboardEngine           — core engine, parallel provider loading
 *   - DashboardRegistry         — provider registration and management
 *   - DashboardLayoutManager    — configuration-driven layouts
 *   - DashboardWidgetRegistry   — widget registration and management
 *   - DashboardDataProvider     — provider framework interface
 *   - DashboardRefreshManager   — refresh policy management
 *   - DashboardStateManager     — widget and dashboard state
 *   - DashboardValidator        — validation of widgets, providers, layouts, permissions
 *   - DashboardEvents           — typed event emitter (8 events)
 *   - DashboardConfiguration    — default config and factory
 */

// Types
export type {
  WidgetType,
  WidgetCategory,
  WidgetSize,
  WidgetPriority,
  RefreshPolicyType,
  WidgetStateType,
  WidgetDefinition,
  WidgetPermissions,
  WidgetInstance,
  WidgetState,
  LayoutType,
  LayoutDefinition,
  DashboardLayout,
  DashboardDataProvider,
  ProviderContext,
  DashboardState,
  DashboardStatistics,
  DashboardValidationIssue,
  DashboardValidationResult,
  DashboardEventType,
  DashboardEventListener,
  RefreshRules,
  PermissionRules,
  ProviderRules,
  FeatureFlags,
  DashboardConfiguration,
  DashboardDataBundle,
  AIContext,
  KnowledgeObject,
  RecommendationList,
  InsightList,
  PredictionList,
  DeviceProfile,
} from './types';

export {
  generateWidgetId,
  generateDashboardId,
  getWidgetTypeLabel,
  getLayoutTypeLabel,
  getWidgetStateLabel,
  createWidgetState,
} from './types';

export { DashboardEventEmitter, dashboardEvents } from './dashboardEvents';
export {
  DEFAULT_DASHBOARD_CONFIG,
  DEFAULT_WIDGET_DEFINITIONS,
  DEFAULT_LAYOUT_DEFINITIONS,
  createDashboardConfig,
} from './dashboardConfiguration';
export type { DeepPartial as DashboardDeepPartial } from './dashboardConfiguration';
export { DashboardWidgetRegistry } from './dashboardWidgetRegistry';
export { DashboardRegistry } from './dashboardRegistry';
export { DashboardLayoutManager } from './dashboardLayoutManager';
export { DashboardStateManager } from './dashboardStateManager';
export { DashboardRefreshManager } from './dashboardRefreshManager';
export { DashboardValidator } from './dashboardValidator';
export { DashboardEngine } from './dashboardEngine';
export { DashboardManager } from './dashboardManager';
