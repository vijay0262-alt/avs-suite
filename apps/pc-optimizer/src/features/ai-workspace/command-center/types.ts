/**
 * AI Command Center — Type Definitions
 *
 * EPIC 5 PHASE A PART 3
 *
 * The AI Command Center is the primary AI workspace for the application.
 * It is widget-driven and configurable, consuming existing AI modules
 * without duplicating business logic.
 *
 * Architecture:
 *   AI Modules → Data Aggregator → View Models → Widget Registry →
 *   Layout Engine → Command Center
 */

// ── Re-export AIAssistant types used by Command Center ────────────

export type {
  AIAssistantContext,
  AIAssistantEvidence,
  AIAssistantSuggestion,
  AIAssistantActionPlan,
  PermissionLevel,
  AIAssistantIntentType,
} from '../aiAssistant/types';

import type {
  AIAssistantContext,
  AIAssistantEvidence,
  AIAssistantSuggestion,
  AIAssistantActionPlan,
  PermissionLevel,
} from '../aiAssistant/types';

// ── Widget Categories ─────────────────────────────────────────

export type WidgetCategory =
  | 'health'
  | 'recommendations'
  | 'goals'
  | 'predictions'
  | 'optimization'
  | 'maintenance'
  | 'automation'
  | 'timeline'
  | 'recovery'
  | 'device_profile'
  | 'aiAssistant'
  | 'quick_actions'
  | 'future_category';

export function getWidgetCategoryLabel(category: WidgetCategory): string {
  const labels: Record<WidgetCategory, string> = {
    health: 'Health Overview',
    recommendations: 'AI Recommendations',
    goals: 'Active Goals',
    predictions: 'Predictions',
    optimization: 'Optimization Session',
    maintenance: 'Maintenance Status',
    automation: 'Automation Status',
    timeline: 'Timeline Summary',
    recovery: 'Recovery Status',
    device_profile: 'Device Profile',
    aiAssistant: 'AVS AI Assistant Suggestions',
    quick_actions: 'Quick Actions',
    future_category: 'Future Widget',
  };
  return labels[category] ?? 'Unknown';
}

// ── Widget Priority ───────────────────────────────────────────

export type WidgetPriority = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export function getWidgetPriorityLabel(priority: WidgetPriority): string {
  const labels: Record<WidgetPriority, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    informational: 'Informational',
  };
  return labels[priority] ?? 'Unknown';
}

// ── Widget Status ─────────────────────────────────────────────

export type WidgetStatus = 'visible' | 'hidden' | 'collapsed' | 'pinned' | 'loading' | 'error' | 'future_status';

export function getWidgetStatusLabel(status: WidgetStatus): string {
  const labels: Record<WidgetStatus, string> = {
    visible: 'Visible',
    hidden: 'Hidden',
    collapsed: 'Collapsed',
    pinned: 'Pinned',
    loading: 'Loading',
    error: 'Error',
    future_status: 'Future Status',
  };
  return labels[status] ?? 'Unknown';
}

// ── Layout Types ──────────────────────────────────────────────

export type LayoutType = 'grid' | 'list' | 'compact' | 'future_layout';

export function getLayoutTypeLabel(layout: LayoutType): string {
  const labels: Record<LayoutType, string> = {
    grid: 'Grid',
    list: 'List',
    compact: 'Compact',
    future_layout: 'Future Layout',
  };
  return labels[layout] ?? 'Unknown';
}

// ── Refresh Policies ──────────────────────────────────────────

export type RefreshPolicyType = 'manual' | 'interval' | 'event_driven' | 'on_focus' | 'on_demand' | 'future_policy';

export function getRefreshPolicyLabel(policy: RefreshPolicyType): string {
  const labels: Record<RefreshPolicyType, string> = {
    manual: 'Manual',
    interval: 'Interval',
    event_driven: 'Event Driven',
    on_focus: 'On Focus',
    on_demand: 'On Demand',
    future_policy: 'Future Policy',
  };
  return labels[policy] ?? 'Unknown';
}

export interface RefreshPolicy {
  type: RefreshPolicyType;
  intervalMs: number;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Widget Definition ─────────────────────────────────────────

export interface WidgetDefinition {
  id: string;
  title: string;
  category: WidgetCategory;
  priority: WidgetPriority;
  layout: WidgetLayoutConfig;
  refreshPolicy: RefreshPolicy;
  requiredCapabilities: string[];
  requiredPermissions: PermissionLevel;
  supportedActions: WidgetAction[];
  dataProvider: string;
  futureMetadata: Record<string, unknown>;
}

export interface WidgetLayoutConfig {
  type: LayoutType;
  columns: number;
  rows: number;
  order: number;
  resizable: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface WidgetAction {
  id: string;
  label: string;
  type: QuickActionType;
  icon: string | null;
  description: string;
  futureMetadata: Record<string, unknown>;
}

// ── Quick Actions ─────────────────────────────────────────────

export type QuickActionType =
  | 'generate_optimization_session'
  | 'ask_ai'
  | 'compare_plans'
  | 'create_goal'
  | 'run_simulation'
  | 'view_timeline'
  | 'view_recovery'
  | 'generate_report'
  | 'start_maintenance'
  | 'future_action';

export function getQuickActionLabel(action: QuickActionType): string {
  const labels: Record<QuickActionType, string> = {
    generate_optimization_session: 'Generate Optimization Session',
    ask_ai: 'Ask AI',
    compare_plans: 'Compare Plans',
    create_goal: 'Create Goal',
    run_simulation: 'Run Simulation',
    view_timeline: 'View Timeline',
    view_recovery: 'View Recovery',
    generate_report: 'Generate Report',
    start_maintenance: 'Start Maintenance',
    future_action: 'Future Action',
  };
  return labels[action] ?? 'Unknown';
}

// ── Widget Instance (runtime state) ───────────────────────────

export interface WidgetInstance {
  definition: WidgetDefinition;
  status: WidgetStatus;
  data: WidgetData | null;
  lastRefreshedAt: string | null;
  error: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Widget Data ───────────────────────────────────────────────

export interface WidgetData {
  widgetId: string;
  category: WidgetCategory;
  content: Record<string, unknown>;
  evidence: AIAssistantEvidence[];
  confidence: number;
  timestamp: string;
  futureMetadata: Record<string, unknown>;
}

// ── Data Provider Interface ───────────────────────────────────

export interface WidgetDataProvider {
  getProviderName(): string;
  getCategory(): WidgetCategory;
  fetchData(context: AIAssistantContext): Promise<WidgetData>;
}

// ── View Model ────────────────────────────────────────────────

export interface CommandCenterViewModel {
  health: HealthViewModel | null;
  goals: GoalsViewModel | null;
  recommendations: RecommendationsViewModel | null;
  predictions: PredictionsViewModel | null;
  maintenance: MaintenanceViewModel | null;
  automation: AutomationViewModel | null;
  timeline: TimelineViewModel | null;
  recovery: RecoveryViewModel | null;
  deviceProfile: DeviceProfileViewModel | null;
  aiAssistant: AIAssistantViewModel | null;
  optimization: OptimizationViewModel | null;
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface HealthViewModel {
  score: number | null;
  level: string;
  trend: 'improving' | 'declining' | 'stable' | 'unknown';
  evidence: AIAssistantEvidence[];
  futureMetadata: Record<string, unknown>;
}

export interface GoalsViewModel {
  activeGoals: GoalItem[];
  completedCount: number;
  blockedCount: number;
  futureMetadata: Record<string, unknown>;
}

export interface GoalItem {
  id: string;
  name: string;
  status: string;
  priority: string;
  progress: number;
  futureMetadata: Record<string, unknown>;
}

export interface RecommendationsViewModel {
  total: number;
  byPriority: Record<string, number>;
  topRecommendations: RecommendationItem[];
  futureMetadata: Record<string, unknown>;
}

export interface RecommendationItem {
  id: string;
  title: string;
  category: string;
  priority: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface PredictionsViewModel {
  total: number;
  byRiskLevel: Record<string, number>;
  topPredictions: PredictionItem[];
  futureMetadata: Record<string, unknown>;
}

export interface PredictionItem {
  id: string;
  title: string;
  category: string;
  riskLevel: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface MaintenanceViewModel {
  lastMaintenance: string | null;
  isRunning: boolean;
  historyCount: number;
  futureMetadata: Record<string, unknown>;
}

export interface AutomationViewModel {
  enabled: boolean;
  activeRules: number;
  lastTriggered: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface TimelineViewModel {
  totalEvents: number;
  recentEvents: TimelineEventItem[];
  futureMetadata: Record<string, unknown>;
}

export interface TimelineEventItem {
  id: string;
  title: string;
  timestamp: string;
  category: string;
  severity: string;
  futureMetadata: Record<string, unknown>;
}

export interface RecoveryViewModel {
  available: boolean;
  historyCount: number;
  lastRecovery: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface DeviceProfileViewModel {
  profileType: string;
  performanceTier: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface AIAssistantViewModel {
  suggestions: AIAssistantSuggestion[];
  pendingActions: AIAssistantActionPlan[];
  futureMetadata: Record<string, unknown>;
}

export interface OptimizationViewModel {
  activeSession: boolean;
  lastSession: string | null;
  totalSessions: number;
  futureMetadata: Record<string, unknown>;
}

// ── Layout ────────────────────────────────────────────────────

export interface DashboardLayout {
  id: string;
  name: string;
  type: LayoutType;
  widgets: LayoutWidgetEntry[];
  savedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface LayoutWidgetEntry {
  widgetId: string;
  status: WidgetStatus;
  order: number;
  columns: number;
  rows: number;
  futureMetadata: Record<string, unknown>;
}

// ── Dashboard State ───────────────────────────────────────────

export interface DashboardState {
  layout: DashboardLayout;
  widgets: WidgetInstance[];
  viewModel: CommandCenterViewModel | null;
  lastLoadedAt: string | null;
  lastUpdatedAt: string | null;
  isLoading: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Search ────────────────────────────────────────────────────

export interface SearchQuery {
  query: string;
  categories?: WidgetCategory[];
  futureMetadata?: Record<string, unknown>;
}

export interface SearchResult {
  type: 'widget' | 'goal' | 'recommendation' | 'timeline' | 'report';
  id: string;
  title: string;
  description: string;
  category: WidgetCategory | null;
  futureMetadata: Record<string, unknown>;
}

// ── Analytics ─────────────────────────────────────────────────

export interface CommandCenterAnalytics {
  totalDashboardLoads: number;
  totalWidgetRefreshes: number;
  totalLayoutSaves: number;
  totalLayoutLoads: number;
  byWidget: Record<string, number>;
  averageLoadTimeMs: number;
  averageRefreshTimeMs: number;
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Events ────────────────────────────────────────────────────

export type CommandCenterEventType =
  | 'dashboard_loaded'
  | 'widget_registered'
  | 'widget_refreshed'
  | 'layout_saved'
  | 'layout_loaded'
  | 'dashboard_updated';

export interface CommandCenterEvent {
  type: CommandCenterEventType;
  timestamp: string;
  data: unknown;
}

export type CommandCenterEventListener = (event: CommandCenterEvent) => void;

// ── Configuration ─────────────────────────────────────────────

export interface CommandCenterConfiguration {
  configVersion: string;
  widgetDefinitions: WidgetDefinition[];
  defaultLayout: DashboardLayout;
  savedLayouts: DashboardLayout[];
  refreshPolicies: Record<string, RefreshPolicy>;
  featureFlags: CommandCenterFeatureFlags;
  performanceTargets: CommandCenterPerformanceTargets;
  enterpriseLayouts: DashboardLayout[];
  futureMetadata: Record<string, unknown>;
}

export interface CommandCenterFeatureFlags {
  enableCommandCenter: boolean;
  enableWidgets: boolean;
  enableLayouts: boolean;
  enableRefresh: boolean;
  enableSearch: boolean;
  enableAnalytics: boolean;
  enableEvents: boolean;
  enableQuickActions: boolean;
  enableEnterpriseLayouts: boolean;
  futureFlags: Record<string, boolean>;
}

export interface CommandCenterPerformanceTargets {
  dashboardLoadTargetMs: number;
  widgetRefreshTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Widget Plugin ─────────────────────────────────────────────

export interface WidgetPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getWidgetDefinitions(): WidgetDefinition[];
  getDataProvider(): WidgetDataProvider | null;
}

// ── Helper Functions ───────────────────────────────────────────

export function generateWidgetId(): string {
  return `widget_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateLayoutId(): string {
  return `layout_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateDashboardId(): string {
  return `dashboard_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Default Factories ─────────────────────────────────────────

export function createDefaultRefreshPolicy(intervalMs: number = 30000): RefreshPolicy {
  return { type: 'interval', intervalMs, enabled: true, futureMetadata: {} };
}

export function createDefaultWidgetLayoutConfig(order: number): WidgetLayoutConfig {
  return { type: 'grid', columns: 1, rows: 1, order, resizable: true, futureMetadata: {} };
}

export function createDefaultWidgetDefinitions(): WidgetDefinition[] {
  const defs: WidgetDefinition[] = [];
  const categories: { cat: WidgetCategory; title: string; provider: string; actions: WidgetAction[] }[] = [
    { cat: 'health', title: 'Health Overview', provider: 'health_provider', actions: [] },
    { cat: 'recommendations', title: 'AI Recommendations', provider: 'recommendations_provider', actions: [{ id: 'view_all_recs', label: 'View All', type: 'future_action', icon: null, description: 'View all recommendations', futureMetadata: {} }] },
    { cat: 'goals', title: 'Active Goals', provider: 'goals_provider', actions: [{ id: 'create_goal', label: 'Create Goal', type: 'create_goal', icon: null, description: 'Create a new goal', futureMetadata: {} }] },
    { cat: 'predictions', title: 'Predictions', provider: 'predictions_provider', actions: [] },
    { cat: 'optimization', title: 'Optimization Session', provider: 'optimization_provider', actions: [{ id: 'gen_session', label: 'Generate Session', type: 'generate_optimization_session', icon: null, description: 'Generate optimization session', futureMetadata: {} }] },
    { cat: 'maintenance', title: 'Maintenance Status', provider: 'maintenance_provider', actions: [{ id: 'start_maint', label: 'Start Maintenance', type: 'start_maintenance', icon: null, description: 'Start maintenance', futureMetadata: {} }] },
    { cat: 'automation', title: 'Automation Status', provider: 'automation_provider', actions: [] },
    { cat: 'timeline', title: 'Timeline Summary', provider: 'timeline_provider', actions: [{ id: 'view_timeline', label: 'View Timeline', type: 'view_timeline', icon: null, description: 'View full timeline', futureMetadata: {} }] },
    { cat: 'recovery', title: 'Recovery Status', provider: 'recovery_provider', actions: [{ id: 'view_recovery', label: 'View Recovery', type: 'view_recovery', icon: null, description: 'View recovery options', futureMetadata: {} }] },
    { cat: 'device_profile', title: 'Device Profile', provider: 'device_profile_provider', actions: [] },
    { cat: 'aiAssistant', title: 'AVS AI Assistant Suggestions', provider: 'aiAssistant_provider', actions: [{ id: 'ask_ai', label: 'Ask AI', type: 'ask_ai', icon: null, description: 'Ask the AVS AI Assistant', futureMetadata: {} }] },
    { cat: 'quick_actions', title: 'Quick Actions', provider: 'quick_actions_provider', actions: [
      { id: 'qa_gen_session', label: 'Optimize', type: 'generate_optimization_session', icon: null, description: 'Generate optimization session', futureMetadata: {} },
      { id: 'qa_ask_ai', label: 'Ask AI', type: 'ask_ai', icon: null, description: 'Ask the AVS AI Assistant', futureMetadata: {} },
      { id: 'qa_compare', label: 'Compare', type: 'compare_plans', icon: null, description: 'Compare plans', futureMetadata: {} },
      { id: 'qa_goal', label: 'Goal', type: 'create_goal', icon: null, description: 'Create a goal', futureMetadata: {} },
      { id: 'qa_sim', label: 'Simulate', type: 'run_simulation', icon: null, description: 'Run simulation', futureMetadata: {} },
      { id: 'qa_timeline', label: 'Timeline', type: 'view_timeline', icon: null, description: 'View timeline', futureMetadata: {} },
      { id: 'qa_recovery', label: 'Recovery', type: 'view_recovery', icon: null, description: 'View recovery', futureMetadata: {} },
      { id: 'qa_report', label: 'Report', type: 'generate_report', icon: null, description: 'Generate report', futureMetadata: {} },
    ] },
  ];

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i]!;
    defs.push({
      id: `widget_${c.cat}`,
      title: c.title,
      category: c.cat,
      priority: c.cat === 'health' || c.cat === 'quick_actions' ? 'high' : 'medium',
      layout: createDefaultWidgetLayoutConfig(i),
      refreshPolicy: createDefaultRefreshPolicy(),
      requiredCapabilities: [],
      requiredPermissions: 'free',
      supportedActions: c.actions,
      dataProvider: c.provider,
      futureMetadata: {},
    });
  }

  return defs;
}

export function createDefaultDashboardLayout(): DashboardLayout {
  const defs = createDefaultWidgetDefinitions();
  return {
    id: 'layout_default',
    name: 'Default Layout',
    type: 'grid',
    widgets: defs.map((d, i) => ({
      widgetId: d.id,
      status: 'visible' as WidgetStatus,
      order: i,
      columns: 1,
      rows: 1,
      futureMetadata: {},
    })),
    savedAt: new Date().toISOString(),
    futureMetadata: {},
  };
}

export function createDefaultCommandCenterFeatureFlags(): CommandCenterFeatureFlags {
  return {
    enableCommandCenter: true,
    enableWidgets: true,
    enableLayouts: true,
    enableRefresh: true,
    enableSearch: true,
    enableAnalytics: true,
    enableEvents: true,
    enableQuickActions: true,
    enableEnterpriseLayouts: false,
    futureFlags: {},
  };
}

export function createDefaultCommandCenterPerformanceTargets(): CommandCenterPerformanceTargets {
  return {
    dashboardLoadTargetMs: 300,
    widgetRefreshTargetMs: 100,
    futureMetadata: {},
  };
}

export function createDefaultCommandCenterConfiguration(): CommandCenterConfiguration {
  return {
    configVersion: '1.0.0',
    widgetDefinitions: createDefaultWidgetDefinitions(),
    defaultLayout: createDefaultDashboardLayout(),
    savedLayouts: [],
    refreshPolicies: {},
    featureFlags: createDefaultCommandCenterFeatureFlags(),
    performanceTargets: createDefaultCommandCenterPerformanceTargets(),
    enterpriseLayouts: [],
    futureMetadata: {},
  };
}
