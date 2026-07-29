/**
 * Dashboard Widget Framework — Type Definitions.
 *
 * Every widget is an independent micro-application with its own
 * lifecycle, provider, actions, permissions, telemetry, and refresh strategy.
 *
 * Pipeline:
 *   Dashboard Engine → Widget Registry → Widget Factory →
 *   Widget Lifecycle → Widget Providers → Widget State → Widget UI
 */
import type {
  WidgetType,
  WidgetCategory,
  WidgetSize,
  WidgetPriority,
  WidgetPermissions,
} from '../types';

// Re-export Part 1 types for convenience
export type {
  WidgetType,
  WidgetCategory,
  WidgetSize,
  WidgetPriority,
  WidgetPermissions,
} from '../types';

// ── Widget Lifecycle ─────────────────────────────────────────

export type WidgetLifecycleState =
  | 'registered'
  | 'initialized'
  | 'loading'
  | 'loaded'
  | 'refreshing'
  | 'suspended'
  | 'unavailable'
  | 'disposed'
  | 'error';

// ── Widget State ─────────────────────────────────────────────

export type WidgetRuntimeState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'refreshing'
  | 'unavailable'
  | 'permission_denied'
  | 'empty'
  | 'error';

// ── Refresh Strategy ─────────────────────────────────────────

export type RefreshStrategy =
  | 'manual'
  | 'automatic'
  | 'scheduled'
  | 'real_time'
  | 'background'
  | 'on_visibility'
  | 'future';

// ── Widget Visibility ────────────────────────────────────────

export type WidgetVisibility =
  | 'visible'
  | 'hidden'
  | 'collapsed'
  | 'future';

// ── Widget Action ────────────────────────────────────────────

export type WidgetActionType =
  | 'open_details'
  | 'run_action'
  | 'view_report'
  | 'view_recommendation'
  | 'refresh'
  | 'dismiss'
  | 'navigate'
  | 'future_custom';

export interface WidgetAction {
  id: string;
  type: WidgetActionType;
  label: string;
  icon: string;
  enabled: boolean;
  handler?: WidgetActionHandler;
  futureMetadata: Record<string, unknown>;
}

export type WidgetActionHandler = (context: WidgetActionContext) => void;

export interface WidgetActionContext {
  widgetId: string;
  widgetType: WidgetType;
  data: unknown;
  options: Record<string, unknown>;
}

// ── Widget Provider ──────────────────────────────────────────

export interface WidgetProvider {
  initialize(): Promise<void>;
  load(context: WidgetProviderContext): Promise<unknown>;
  refresh(context: WidgetProviderContext): Promise<unknown>;
  dispose(): Promise<void>;
  validate(): boolean;
}

export interface WidgetProviderContext {
  options: Record<string, unknown>;
  cachedData: unknown;
}

export type WidgetProviderFactory = () => WidgetProvider;

// ── Widget Definition (extended from Part 1) ─────────────────

export interface WidgetDefinitionEx {
  type: WidgetType;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  category: WidgetCategory;
  size: WidgetSize;
  priority: WidgetPriority;
  visibility: WidgetVisibility;
  refreshStrategy: RefreshStrategy;
  refreshIntervalMs: number;
  providerFactory: WidgetProviderFactory;
  permissions: WidgetPermissions;
  capabilities: string[];
  actions: WidgetAction[];
  futureMetadata: Record<string, unknown>;
}

// ── Widget Instance (extended) ───────────────────────────────

export interface WidgetInstanceEx {
  id: string;
  definition: WidgetDefinitionEx;
  lifecycle: WidgetLifecycleState;
  state: WidgetRuntimeState;
  data: unknown;
  lastUpdated: string | null;
  error: string | null;
  provider: WidgetProvider | null;
  telemetry: WidgetTelemetryData;
  futureMetadata: Record<string, unknown>;
}

// ── Telemetry ────────────────────────────────────────────────

export interface WidgetTelemetryData {
  loadTimeMs: number;
  refreshTimeMs: number;
  errorCount: number;
  interactionCount: number;
  actionUsage: Record<string, number>;
  visibilityChanges: number;
  lastVisibleAt: string | null;
  lastHiddenAt: string | null;
  performanceMetrics: Record<string, number>;
}

export interface TelemetryRules {
  enabled: boolean;
  trackLoadTime: boolean;
  trackRefreshTime: boolean;
  trackErrors: boolean;
  trackInteractions: boolean;
  trackActionUsage: boolean;
  trackVisibility: boolean;
  trackPerformance: boolean;
  flushIntervalMs: number;
}

// ── Validation ───────────────────────────────────────────────

export interface WidgetValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  widgetId?: string;
}

export interface WidgetValidationResult {
  valid: boolean;
  issues: WidgetValidationIssue[];
}

// ── Events ───────────────────────────────────────────────────

export type WidgetEventType =
  | 'widget_registered'
  | 'widget_initialized'
  | 'widget_loaded'
  | 'widget_refreshed'
  | 'widget_action_invoked'
  | 'widget_hidden'
  | 'widget_disposed'
  | 'widget_error';

export type WidgetEventListener = (payload: WidgetEventPayload) => void;

export interface WidgetEventPayload {
  widgetId: string;
  widgetType: WidgetType;
  eventType: WidgetEventType;
  data?: unknown;
  timestamp: string;
}

// ── Configuration ────────────────────────────────────────────

export interface LifecycleRules {
  autoInitialize: boolean;
  autoDispose: boolean;
  maxConcurrentLoads: number;
  loadTimeoutMs: number;
  retryOnFailure: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface RefreshRules {
  defaultStrategy: RefreshStrategy;
  defaultIntervalMs: number;
  backgroundIntervalMs: number;
  realTimeIntervalMs: number;
  visibilityDebounceMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface PermissionRules {
  defaultMinPlan: 'FREE' | 'PRO' | 'ENTERPRISE';
  strictMode: boolean;
  hideUnavailableWidgets: boolean;
  enterprisePolicies: Record<string, unknown>;
  devicePolicies: Record<string, unknown>;
}

export interface WidgetFrameworkConfiguration {
  frameworkVersion: string;
  lifecycleRules: LifecycleRules;
  refreshRules: RefreshRules;
  permissionRules: PermissionRules;
  telemetryRules: TelemetryRules;
  featureFlags: Record<string, boolean>;
  maxWidgets: number;
  enableEvents: boolean;
}

// ── Statistics ───────────────────────────────────────────────

export interface WidgetStatistics {
  totalWidgets: number;
  byLifecycle: Record<WidgetLifecycleState, number>;
  byState: Record<WidgetRuntimeState, number>;
  averageLoadTimeMs: number;
  averageRefreshTimeMs: number;
  totalErrors: number;
  totalInteractions: number;
  totalRefreshes: number;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateWidgetInstanceId(type: WidgetType): string {
  return `wi_${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function getLifecycleStateLabel(state: WidgetLifecycleState): string {
  const labels: Record<WidgetLifecycleState, string> = {
    registered: 'Registered',
    initialized: 'Initialized',
    loading: 'Loading',
    loaded: 'Loaded',
    refreshing: 'Refreshing',
    suspended: 'Suspended',
    unavailable: 'Unavailable',
    disposed: 'Disposed',
    error: 'Error',
  };
  return labels[state] ?? 'Unknown';
}

export function getRuntimeStateLabel(state: WidgetRuntimeState): string {
  const labels: Record<WidgetRuntimeState, string> = {
    idle: 'Idle',
    loading: 'Loading',
    ready: 'Ready',
    refreshing: 'Refreshing',
    unavailable: 'Unavailable',
    permission_denied: 'Permission Denied',
    empty: 'Empty',
    error: 'Error',
  };
  return labels[state] ?? 'Unknown';
}

export function getRefreshStrategyLabel(strategy: RefreshStrategy): string {
  const labels: Record<RefreshStrategy, string> = {
    manual: 'Manual',
    automatic: 'Automatic',
    scheduled: 'Scheduled',
    real_time: 'Real-time',
    background: 'Background',
    on_visibility: 'On Visibility',
    future: 'Future',
  };
  return labels[strategy] ?? 'Unknown';
}

export function createAction(
  id: string,
  type: WidgetActionType,
  label: string,
  icon: string = '',
  handler?: WidgetActionHandler,
): WidgetAction {
  return {
    id,
    type,
    label,
    icon,
    enabled: true,
    handler,
    futureMetadata: {},
  };
}

export function createTelemetryData(): WidgetTelemetryData {
  return {
    loadTimeMs: 0,
    refreshTimeMs: 0,
    errorCount: 0,
    interactionCount: 0,
    actionUsage: {},
    visibilityChanges: 0,
    lastVisibleAt: null,
    lastHiddenAt: null,
    performanceMetrics: {},
  };
}
