/**
 * Intelligent Dashboard Platform — Type Definitions.
 *
 * Core architectural principle:
 *   "The dashboard is a consumer of the AI Intelligence Platform.
 *    Widgets receive data through providers, never directly from
 *    internal services. Every widget is modular, configurable,
 *    and extensible."
 *
 * Pipeline:
 *   AI Engines → Dashboard Data Providers → Dashboard Engine →
 *   Widget Registry → Dashboard State → UI Components
 */
import type { AIContext } from '../ai-intelligence/context/types';
import type { KnowledgeObject } from '../ai-intelligence/knowledge/types';
import type { RecommendationList } from '../ai-intelligence/recommendations/types';
import type { InsightList } from '../ai-intelligence/insights/types';
import type { PredictionList } from '../ai-intelligence/predictions/types';
import type { DeviceProfile } from '../ai-intelligence/device-profile/types';

// Re-export for convenience
export type { AIContext } from '../ai-intelligence/context/types';
export type { KnowledgeObject } from '../ai-intelligence/knowledge/types';
export type { RecommendationList } from '../ai-intelligence/recommendations/types';
export type { InsightList } from '../ai-intelligence/insights/types';
export type { PredictionList } from '../ai-intelligence/predictions/types';
export type { DeviceProfile } from '../ai-intelligence/device-profile/types';

// ── Widget Types ─────────────────────────────────────────────

export type WidgetType =
  | 'health_score'
  | 'overall_status'
  | 'ai_morning_brief'
  | 'top_recommendations'
  | 'quick_wins'
  | 'prediction_summary'
  | 'recent_improvements'
  | 'achievements'
  | 'milestones'
  | 'optimization_history'
  | 'storage_summary'
  | 'performance_summary'
  | 'privacy_summary'
  | 'startup_summary'
  | 'windows_summary'
  | 'device_profile'
  | 'subscription_status'
  | 'usage_quotas'
  | 'future_widget';

export type WidgetCategory =
  | 'health'
  | 'recommendations'
  | 'insights'
  | 'predictions'
  | 'profile'
  | 'history'
  | 'system'
  | 'subscription'
  | 'future';

export type WidgetSize =
  | 'small'
  | 'medium'
  | 'large'
  | 'full';

export type WidgetPriority =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low';

export type RefreshPolicyType =
  | 'real_time'
  | 'on_startup'
  | 'manual'
  | 'scheduled'
  | 'background'
  | 'on_demand'
  | 'future';

export type WidgetStateType =
  | 'loading'
  | 'ready'
  | 'refreshing'
  | 'error'
  | 'unavailable'
  | 'permission_denied'
  | 'empty';

export interface WidgetDefinition {
  type: WidgetType;
  title: string;
  subtitle: string;
  category: WidgetCategory;
  priority: WidgetPriority;
  size: WidgetSize;
  refreshPolicy: RefreshPolicyType;
  providerName: string;
  requiredCapabilities: string[];
  permissions: WidgetPermissions;
  futureMetadata: Record<string, unknown>;
}

export interface WidgetPermissions {
  minPlan: 'FREE' | 'PRO' | 'ENTERPRISE' | 'FUTURE';
  requiredFeatures: string[];
  requiresQuota: boolean;
  futurePolicies: Record<string, unknown>;
}

export interface WidgetInstance {
  id: string;
  definition: WidgetDefinition;
  state: WidgetState;
  data: unknown;
  lastUpdated: string | null;
  error: string | null;
}

export interface WidgetState {
  type: WidgetStateType;
  message: string | null;
  lastStateChange: string;
  retryCount: number;
}

// ── Layout Types ─────────────────────────────────────────────

export type LayoutType =
  | 'default'
  | 'compact'
  | 'detailed'
  | 'beginner'
  | 'advanced'
  | 'custom'
  | 'future';

export interface LayoutDefinition {
  type: LayoutType;
  label: string;
  description: string;
  widgetOrder: WidgetType[];
  columns: number;
  maxWidgets: number;
  futureMetadata: Record<string, unknown>;
}

export interface DashboardLayout {
  type: LayoutType;
  widgets: WidgetInstance[];
  columns: number;
  createdAt: string;
  updatedAt: string;
}

// ── Data Provider Types ──────────────────────────────────────

export interface DashboardDataProvider {
  getProviderName(): string;
  getProviderType(): string;
  isAvailable(): boolean;
  getData(context: ProviderContext): unknown;
  getPriority(): number;
}

export interface ProviderContext {
  aiContext: AIContext | null;
  knowledge: KnowledgeObject | null;
  recommendations: RecommendationList | null;
  insights: InsightList | null;
  predictions: PredictionList | null;
  deviceProfile: DeviceProfile | null;
  options: Record<string, unknown>;
}

// ── Dashboard State ──────────────────────────────────────────

export interface DashboardState {
  layout: LayoutType;
  widgets: Map<string, WidgetInstance>;
  isLoaded: boolean;
  isRefreshing: boolean;
  lastRefreshedAt: string | null;
  loadTimeMs: number;
}

// ── Statistics ───────────────────────────────────────────────

export interface DashboardStatistics {
  totalWidgets: number;
  byState: Record<WidgetStateType, number>;
  byCategory: Record<WidgetCategory, number>;
  averageLoadTimeMs: number;
  totalRefreshes: number;
  failedRefreshes: number;
  lastLoadedAt: string | null;
}

// ── Validation ───────────────────────────────────────────────

export interface DashboardValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  widgetId?: string;
}

export interface DashboardValidationResult {
  valid: boolean;
  issues: DashboardValidationIssue[];
}

// ── Events ───────────────────────────────────────────────────

export type DashboardEventType =
  | 'dashboard_loaded'
  | 'dashboard_refreshed'
  | 'widget_registered'
  | 'widget_loaded'
  | 'widget_updated'
  | 'widget_removed'
  | 'layout_changed'
  | 'provider_registered';

export type DashboardEventListener = (payload: unknown) => void;

// ── Configuration ────────────────────────────────────────────

export interface RefreshRules {
  realTimeIntervalMs: number;
  scheduledIntervalMs: number;
  backgroundIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
  parallelLoading: boolean;
}

export interface PermissionRules {
  defaultMinPlan: 'FREE' | 'PRO' | 'ENTERPRISE';
  strictMode: boolean;
  hideUnavailableWidgets: boolean;
  futureEnterprisePolicies: Record<string, unknown>;
}

export interface ProviderRules {
  timeoutMs: number;
  failOnError: boolean;
  cacheResults: boolean;
  cacheTtlMs: number;
}

export interface FeatureFlags {
  enableMorningBrief: boolean;
  enablePredictions: boolean;
  enableDeviceProfile: boolean;
  enableAchievements: boolean;
  enableMilestones: boolean;
  enableQuickWins: boolean;
  futureFlags: Record<string, boolean>;
}

export interface DashboardConfiguration {
  dashboardVersion: string;
  widgetDefinitions: WidgetDefinition[];
  layoutDefinitions: LayoutDefinition[];
  defaultLayout: LayoutType;
  refreshRules: RefreshRules;
  permissionRules: PermissionRules;
  providerRules: ProviderRules;
  featureFlags: FeatureFlags;
  maxWidgets: number;
  enableEvents: boolean;
}

// ── Dashboard Data Bundle ────────────────────────────────────

export interface DashboardDataBundle {
  aiContext: AIContext | null;
  knowledge: KnowledgeObject | null;
  recommendations: RecommendationList | null;
  insights: InsightList | null;
  predictions: PredictionList | null;
  deviceProfile: DeviceProfile | null;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateWidgetId(type: WidgetType): string {
  return `widget_${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateDashboardId(): string {
  return `dash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function getWidgetTypeLabel(type: WidgetType): string {
  const labels: Record<WidgetType, string> = {
    health_score: 'Health Score',
    overall_status: 'Overall Status',
    ai_morning_brief: 'AI Morning Brief',
    top_recommendations: 'Top Recommendations',
    quick_wins: 'Quick Wins',
    prediction_summary: 'Prediction Summary',
    recent_improvements: 'Recent Improvements',
    achievements: 'Achievements',
    milestones: 'Milestones',
    optimization_history: 'Optimization History',
    storage_summary: 'Storage Summary',
    performance_summary: 'Performance Summary',
    privacy_summary: 'Privacy Summary',
    startup_summary: 'Startup Summary',
    windows_summary: 'Windows Summary',
    device_profile: 'Device Profile',
    subscription_status: 'Subscription Status',
    usage_quotas: 'Usage Quotas',
    future_widget: 'Future Widget',
  };
  return labels[type] ?? 'Unknown Widget';
}

export function getLayoutTypeLabel(type: LayoutType): string {
  const labels: Record<LayoutType, string> = {
    default: 'Default Layout',
    compact: 'Compact Layout',
    detailed: 'Detailed Layout',
    beginner: 'Beginner Layout',
    advanced: 'Advanced Layout',
    custom: 'Custom Layout',
    future: 'Future Layout',
  };
  return labels[type] ?? 'Unknown Layout';
}

export function getWidgetStateLabel(state: WidgetStateType): string {
  const labels: Record<WidgetStateType, string> = {
    loading: 'Loading',
    ready: 'Ready',
    refreshing: 'Refreshing',
    error: 'Error',
    unavailable: 'Unavailable',
    permission_denied: 'Permission Denied',
    empty: 'Empty',
  };
  return labels[state] ?? 'Unknown';
}

export function createWidgetState(type: WidgetStateType, message?: string): WidgetState {
  return {
    type,
    message: message ?? null,
    lastStateChange: new Date().toISOString(),
    retryCount: 0,
  };
}
