/**
 * Dashboard Action Platform — Type Definitions.
 *
 * Every dashboard widget can expose standardized actions.
 * Widgets never execute business logic directly.
 * All actions pass through the Dashboard Action Platform.
 *
 * Pipeline:
 *   Dashboard Widget → Action Registry → Action Resolver →
 *   Permission Validation → Action Dispatcher → Future Consumers
 *   (Execution Engine, Scheduler, AI Assistant, Reports, Notifications)
 */
import type { WidgetType } from '../types';

// Re-export for convenience
export type { WidgetType } from '../types';

// ── Action Types ─────────────────────────────────────────────

export type DashboardActionType =
  | 'optimize_now'
  | 'quick_optimize'
  | 'explain'
  | 'view_details'
  | 'view_history'
  | 'schedule'
  | 'compare_before_after'
  | 'rollback'
  | 'dismiss'
  | 'pin'
  | 'favorite'
  | 'refresh'
  | 'share_report'
  | 'export'
  | 'future_custom';

export type ActionCategory =
  | 'optimization'
  | 'information'
  | 'navigation'
  | 'management'
  | 'social'
  | 'system'
  | 'future';

// ── Action States ────────────────────────────────────────────

export type ActionState =
  | 'available'
  | 'unavailable'
  | 'disabled'
  | 'hidden'
  | 'pending'
  | 'executing'
  | 'completed'
  | 'cancelled'
  | 'failed';

// ── Action Priority ──────────────────────────────────────────

export type ActionPriority =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational';

// ── Action Definition ────────────────────────────────────────

export interface DashboardActionDefinition {
  id: string;
  title: string;
  description: string;
  category: ActionCategory;
  actionType: DashboardActionType;
  icon: string;
  priority: ActionPriority;
  requiresConfirmation: boolean;
  requiresPermission: boolean;
  requiresCapability: string | null;
  requiresSubscription: 'FREE' | 'PRO' | 'ENTERPRISE' | null;
  requiresQuota: string | null;
  telemetryEnabled: boolean;
  widgetId: string;
  widgetType: WidgetType;
  explanation?: ActionExplanation;
  routing?: ActionRouting;
  futureMetadata: Record<string, unknown>;
}

// ── Action Explanation ───────────────────────────────────────

export interface ActionExplanation {
  whyExists: string;
  expectedBenefits: string;
  estimatedTime: number;
  estimatedImpact: string;
  confidence: number;
  rollbackAvailable: boolean;
  relatedRecommendations: string[];
  relatedPredictions: string[];
}

// ── Action Routing ───────────────────────────────────────────

export type ActionRoute =
  | 'execution_engine'
  | 'scheduler'
  | 'reports'
  | 'history'
  | 'ai_assistant'
  | 'navigation'
  | 'internal_dashboard'
  | 'future';

export interface ActionRouting {
  route: ActionRoute;
  target?: string;
  payload?: Record<string, unknown>;
}

// ── Action Instance ──────────────────────────────────────────

export interface DashboardAction {
  definition: DashboardActionDefinition;
  state: ActionState;
  createdAt: string;
  lastStateChange: string;
  error: string | null;
}

// ── Action Context ───────────────────────────────────────────

export interface ActionContext {
  actionId: string;
  widgetId: string;
  widgetType: WidgetType;
  userId: string | null;
  userPlan: string;
  userFeatures: string[];
  userCapabilities: string[];
  hasQuota: boolean;
  options: Record<string, unknown>;
}

// ── Action Result ────────────────────────────────────────────

export interface ActionResult {
  actionId: string;
  success: boolean;
  route: ActionRoute;
  data: unknown;
  error: string | null;
  durationMs: number;
  timestamp: string;
}

// ── Action Validation ────────────────────────────────────────

export interface ActionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Permission Check ─────────────────────────────────────────

export interface ActionPermissionResult {
  allowed: boolean;
  reasons: string[];
  missingCapabilities: string[];
  missingFeatures: string[];
  planRequired: string | null;
  quotaExceeded: boolean;
}

// ── Action History Entry ─────────────────────────────────────

export interface ActionHistoryEntry {
  id: string;
  actionId: string;
  actionType: DashboardActionType;
  widgetId: string;
  widgetType: WidgetType;
  state: ActionState;
  timestamp: string;
  durationMs: number;
  error: string | null;
  route: ActionRoute | null;
  userId: string | null;
  metadata: Record<string, unknown>;
}

// ── Action Telemetry ─────────────────────────────────────────

export interface ActionTelemetryData {
  actionId: string;
  actionType: DashboardActionType;
  widgetId: string;
  invokedAt: string;
  completedAt: string | null;
  durationMs: number;
  success: boolean;
  error: string | null;
  route: ActionRoute | null;
}

export interface ActionTelemetryStatistics {
  totalInvocations: number;
  totalCompletions: number;
  totalFailures: number;
  totalCancellations: number;
  averageDurationMs: number;
  successRate: number;
  byActionType: Record<string, number>;
  byWidget: Record<string, number>;
  popularActions: { actionId: string; count: number }[];
}

// ── Action Events ────────────────────────────────────────────

export type ActionEventType =
  | 'action_registered'
  | 'action_selected'
  | 'action_validated'
  | 'action_dispatched'
  | 'action_completed'
  | 'action_cancelled'
  | 'action_failed';

export interface ActionEvent {
  type: ActionEventType;
  actionId: string;
  widgetId: string;
  timestamp: string;
  data: unknown;
}

export type ActionListener = (event: ActionEvent) => void;

// ── Configuration ────────────────────────────────────────────

export interface ActionPermissionRules {
  defaultMinPlan: 'FREE' | 'PRO' | 'ENTERPRISE';
  strictMode: boolean;
  hideUnavailableActions: boolean;
  enterprisePolicies: Record<string, unknown>;
  devicePolicies: Record<string, unknown>;
}

export interface ActionConfirmationRules {
  alwaysConfirm: boolean;
  confirmHighImpact: boolean;
  confirmIrreversible: boolean;
  skipForSafeActions: boolean;
  highImpactThreshold: number;
}

export interface ActionTelemetryRules {
  enabled: boolean;
  trackUsage: boolean;
  trackLatency: boolean;
  trackErrors: boolean;
  trackSuccessRate: boolean;
  trackPopularActions: boolean;
  trackUserInteraction: boolean;
}

export interface ActionRoutingRules {
  defaultRoute: ActionRoute;
  routeOverrides: Record<string, ActionRoute>;
  timeoutMs: number;
  failOnError: boolean;
}

export interface ActionFeatureFlags {
  enableOptimizeNow: boolean;
  enableQuickOptimize: boolean;
  enableExplain: boolean;
  enableCompare: boolean;
  enableRollback: boolean;
  enableShareReport: boolean;
  enableExport: boolean;
  enableScheduling: boolean;
  futureFlags: Record<string, boolean>;
}

export interface ActionConfiguration {
  configVersion: string;
  permissionRules: ActionPermissionRules;
  confirmationRules: ActionConfirmationRules;
  telemetryRules: ActionTelemetryRules;
  routingRules: ActionRoutingRules;
  featureFlags: ActionFeatureFlags;
  enableEvents: boolean;
  maxActionsPerWidget: number;
}

// ── Action Handler ───────────────────────────────────────────

export type ActionHandler = (context: ActionContext) => Promise<ActionResult>;

export interface ActionHandlerRegistration {
  actionType: DashboardActionType;
  handler: ActionHandler;
}

// ── Action Statistics ────────────────────────────────────────

export interface ActionStatistics {
  totalActions: number;
  byState: Record<ActionState, number>;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  byWidget: Record<string, number>;
  recentExecutions: number;
  failedExecutions: number;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateActionId(actionType: DashboardActionType, widgetId: string): string {
  return `action_${actionType}_${widgetId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function getActionTypeLabel(type: DashboardActionType): string {
  const labels: Record<DashboardActionType, string> = {
    optimize_now: 'Optimize Now',
    quick_optimize: 'Quick Optimize',
    explain: 'Explain',
    view_details: 'View Details',
    view_history: 'View History',
    schedule: 'Schedule',
    compare_before_after: 'Compare Before/After',
    rollback: 'Rollback',
    dismiss: 'Dismiss',
    pin: 'Pin',
    favorite: 'Favorite',
    refresh: 'Refresh',
    share_report: 'Share Report',
    export: 'Export',
    future_custom: 'Custom Action',
  };
  return labels[type] ?? 'Unknown Action';
}

export function getActionStateLabel(state: ActionState): string {
  const labels: Record<ActionState, string> = {
    available: 'Available',
    unavailable: 'Unavailable',
    disabled: 'Disabled',
    hidden: 'Hidden',
    pending: 'Pending',
    executing: 'Executing',
    completed: 'Completed',
    cancelled: 'Cancelled',
    failed: 'Failed',
  };
  return labels[state] ?? 'Unknown';
}

export function getActionCategoryLabel(category: ActionCategory): string {
  const labels: Record<ActionCategory, string> = {
    optimization: 'Optimization',
    information: 'Information',
    navigation: 'Navigation',
    management: 'Management',
    social: 'Social',
    system: 'System',
    future: 'Future',
  };
  return labels[category] ?? 'Unknown';
}

export function getActionRouteLabel(route: ActionRoute): string {
  const labels: Record<ActionRoute, string> = {
    execution_engine: 'Execution Engine',
    scheduler: 'Scheduler',
    reports: 'Reports',
    history: 'History',
    ai_assistant: 'AI Assistant',
    navigation: 'Navigation',
    internal_dashboard: 'Internal Dashboard',
    future: 'Future',
  };
  return labels[route] ?? 'Unknown';
}

export function createActionDefinition(
  partial: Partial<DashboardActionDefinition> & Pick<DashboardActionDefinition, 'id' | 'actionType' | 'widgetId' | 'widgetType'>,
): DashboardActionDefinition {
  return {
    id: partial.id,
    title: partial.title ?? getActionTypeLabel(partial.actionType),
    description: partial.description ?? '',
    category: partial.category ?? 'system',
    actionType: partial.actionType,
    icon: partial.icon ?? 'default',
    priority: partial.priority ?? 'medium',
    requiresConfirmation: partial.requiresConfirmation ?? false,
    requiresPermission: partial.requiresPermission ?? false,
    requiresCapability: partial.requiresCapability ?? null,
    requiresSubscription: partial.requiresSubscription ?? null,
    requiresQuota: partial.requiresQuota ?? null,
    telemetryEnabled: partial.telemetryEnabled ?? true,
    widgetId: partial.widgetId,
    widgetType: partial.widgetType,
    explanation: partial.explanation,
    routing: partial.routing,
    futureMetadata: partial.futureMetadata ?? {},
  };
}

export function createDefaultActionConfiguration(): ActionConfiguration {
  return {
    configVersion: '1.0.0',
    permissionRules: {
      defaultMinPlan: 'FREE',
      strictMode: false,
      hideUnavailableActions: false,
      enterprisePolicies: {},
      devicePolicies: {},
    },
    confirmationRules: {
      alwaysConfirm: false,
      confirmHighImpact: true,
      confirmIrreversible: true,
      skipForSafeActions: true,
      highImpactThreshold: 0.7,
    },
    telemetryRules: {
      enabled: true,
      trackUsage: true,
      trackLatency: true,
      trackErrors: true,
      trackSuccessRate: true,
      trackPopularActions: true,
      trackUserInteraction: true,
    },
    routingRules: {
      defaultRoute: 'internal_dashboard',
      routeOverrides: {},
      timeoutMs: 30000,
      failOnError: false,
    },
    featureFlags: {
      enableOptimizeNow: true,
      enableQuickOptimize: true,
      enableExplain: true,
      enableCompare: true,
      enableRollback: true,
      enableShareReport: true,
      enableExport: true,
      enableScheduling: true,
      futureFlags: {},
    },
    enableEvents: true,
    maxActionsPerWidget: 20,
  };
}
