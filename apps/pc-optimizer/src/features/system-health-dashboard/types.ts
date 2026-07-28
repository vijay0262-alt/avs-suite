/**
 * System Health Dashboard — Type Definitions
 *
 * Complete type system for the real-time System Health Dashboard.
 * Consumes existing services (dashboard, health engine, maintenance history)
 * without duplicating business logic or modifying their architecture.
 */
import type { HealthCategoryId, TrendDirection, Severity } from '../ai-health-engine/types';
import type { HealthReport, CategoryResult } from '../ai-health-engine/types';
import type { DashboardMetrics } from '../dashboard/dashboard.types';

// ── Live System Metrics ───────────────────────────────────────

/**
 * Lightweight live metrics for real-time display.
 * Derived from DashboardMetrics/LiveMetrics without duplicating logic.
 */
export interface SystemLiveMetrics {
  cpuUsage: number;
  cpuFrequency: number;
  memoryUsage: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsage: number;
  diskFreeBytes: number;
  diskTotalBytes: number;
  networkUploadSpeed: number;
  networkDownloadSpeed: number;
  systemUptime: number;
  batteryPercent: number | null;
  batteryPlugged: boolean | null;
  runningProcesses: number;
  backgroundServices: number;
  startupPrograms: number;
  capturedAt: string;
}

// ── Health Score Panel ────────────────────────────────────────

/**
 * Health score panel data for the dashboard.
 */
export interface HealthScorePanel {
  overallScore: number;
  letterGrade: string;
  healthLevel: string;
  trend: TrendDirection;
  previousScore: number | null;
  scoreChange: number | null;
  lastAnalysisTime: string | null;
}

// ── Category Card ─────────────────────────────────────────────

/**
 * A single category card for the dashboard.
 */
export interface CategoryCard {
  categoryId: HealthCategoryId;
  categoryName: string;
  score: number;
  trend: TrendDirection;
  issues: CategoryCardIssue[];
  quickRecommendation: string | null;
  severity: Severity;
}

/**
 * A simplified issue for category cards.
 */
export interface CategoryCardIssue {
  title: string;
  severity: Severity;
  autoFixable: boolean;
}

// ── Real-Time Status ──────────────────────────────────────────

/**
 * Real-time status panel data.
 */
export interface RealTimeStatus {
  cpuUsage: number;
  memoryUsage: number;
  diskActivity: number;
  backgroundProcesses: number;
  startupPrograms: number;
  recentMaintenance: RecentMaintenanceSummary | null;
  lastOptimization: OptimizationSessionSummary | null;
}

/**
 * Summary of recent maintenance.
 */
export interface RecentMaintenanceSummary {
  executionId: string;
  status: string;
  timestamp: string;
  filesCleaned: number;
  bytesRecovered: number;
}

/**
 * Summary of the last optimization session.
 */
export interface OptimizationSessionSummary {
  sessionId: string;
  status: string;
  timestamp: string;
  tasksCompleted: number;
  storageRecovered: number;
}

// ── Timeline ──────────────────────────────────────────────────

export type TimelineRange = 'today' | '7days' | '30days';

export type TimelineEntryType =
  | 'health_score'
  | 'maintenance'
  | 'optimization'
  | 'major_change';

/**
 * A single entry in the health timeline.
 */
export interface TimelineEntry {
  id: string;
  type: TimelineEntryType;
  timestamp: string;
  title: string;
  description: string;
  score?: number;
  scoreChange?: number;
  severity?: Severity;
}

// ── Alerts ────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type AlertType =
  | 'critical_health'
  | 'temp_file_growth'
  | 'startup_degradation'
  | 'low_disk_space'
  | 'repeated_failures'
  | 'capability_limitation';

/**
 * A dashboard alert.
 */
export interface DashboardAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  timestamp: string;
  actionPath: string | null;
  actionLabel: string | null;
  dismissed: boolean;
}

// ── Widget System ─────────────────────────────────────────────

export type WidgetCategory =
  | 'health_score'
  | 'category_card'
  | 'real_time'
  | 'timeline'
  | 'alert'
  | 'quick_action'
  | 'custom';

/**
 * Definition of a pluggable dashboard widget.
 */
export interface WidgetDefinition {
  id: string;
  title: string;
  category: WidgetCategory;
  component: string; // Component name/path for lazy loading
  order: number;
  enabled: boolean;
  config?: Record<string, unknown>;
}

// ── Quick Actions ─────────────────────────────────────────────

export type QuickActionType =
  | 'run_health_analysis'
  | 'view_optimization_plan'
  | 'run_smart_optimize'
  | 'open_startup_optimizer'
  | 'open_reports';

/**
 * A quick action entry point on the dashboard.
 */
export interface QuickAction {
  type: QuickActionType;
  label: string;
  description: string;
  icon: string;
  path: string;
  enabled: boolean;
}

// ── Dashboard State ───────────────────────────────────────────

/**
 * The complete state of the System Health Dashboard.
 */
export interface DashboardState {
  loading: boolean;
  error: string | null;
  liveMetrics: SystemLiveMetrics | null;
  healthScorePanel: HealthScorePanel | null;
  categoryCards: CategoryCard[];
  realTimeStatus: RealTimeStatus | null;
  timeline: TimelineEntry[];
  timelineRange: TimelineRange;
  alerts: DashboardAlert[];
  widgets: WidgetDefinition[];
  quickActions: QuickAction[];
  lastUpdated: string | null;
}

// ── Events ────────────────────────────────────────────────────

export type DashboardEventType =
  | 'dashboard_state_updated'
  | 'dashboard_metrics_updated'
  | 'dashboard_health_updated'
  | 'dashboard_alert_added'
  | 'dashboard_alert_dismissed'
  | 'dashboard_widget_registered'
  | 'dashboard_widget_unregistered';

export interface DashboardEventPayloads {
  dashboard_state_updated: { state: DashboardState };
  dashboard_metrics_updated: { metrics: SystemLiveMetrics };
  dashboard_health_updated: { panel: HealthScorePanel; cards: CategoryCard[] };
  dashboard_alert_added: { alert: DashboardAlert };
  dashboard_alert_dismissed: { alertId: string };
  dashboard_widget_registered: { widget: WidgetDefinition };
  dashboard_widget_unregistered: { widgetId: string };
}

export type DashboardEventListener = (payload: unknown) => void;

// ── Helper Functions ──────────────────────────────────────────

/**
 * Extract live metrics from DashboardMetrics.
 */
export function extractLiveMetrics(metrics: DashboardMetrics): SystemLiveMetrics {
  const cpu = metrics.cpu;
  const mem = metrics.memory;
  const primaryDrive = metrics.storage[0];
  const net = metrics.network;
  const perf = metrics.performance;

  return {
    cpuUsage: cpu.usage,
    cpuFrequency: cpu.frequency,
    memoryUsage: mem.usage,
    memoryUsedBytes: mem.used,
    memoryTotalBytes: mem.total,
    diskUsage: primaryDrive?.usage ?? 0,
    diskFreeBytes: primaryDrive?.free ?? 0,
    diskTotalBytes: primaryDrive?.total ?? 0,
    networkUploadSpeed: net?.uploadSpeed ?? 0,
    networkDownloadSpeed: net?.downloadSpeed ?? 0,
    systemUptime: metrics.windows.uptime,
    batteryPercent: metrics.windows.battery?.percent ?? null,
    batteryPlugged: metrics.windows.battery?.powerPlugged ?? null,
    runningProcesses: cpu.processes,
    backgroundServices: perf.backgroundProcesses,
    startupPrograms: perf.startupApps,
    capturedAt: metrics.capturedAt,
  };
}

/**
 * Build category cards from a HealthReport.
 */
export function buildCategoryCards(report: HealthReport): CategoryCard[] {
  return report.categories.map((cat: CategoryResult) => ({
    categoryId: cat.categoryId,
    categoryName: cat.categoryName,
    score: cat.score,
    trend: getTrendForCategory(report, cat.categoryId),
    issues: cat.issues.map((issue) => ({
      title: issue.title,
      severity: issue.severity,
      autoFixable: issue.autoFixable,
    })),
    quickRecommendation: cat.recommendations[0] ?? null,
    severity: cat.severity,
  }));
}

/**
 * Get trend for a category from the report.
 */
function getTrendForCategory(report: HealthReport, categoryId: HealthCategoryId): TrendDirection {
  const trend = report.trends?.categoryTrends?.find((t) => t.categoryId === categoryId);
  return trend?.direction ?? 'insufficient_data';
}

/**
 * Build health score panel from a HealthReport.
 */
export function buildHealthScorePanel(
  report: HealthReport,
  previousScore: number | null,
): HealthScorePanel {
  const score = report.overall.score;
  const change = previousScore !== null ? score - previousScore : null;

  let trend: TrendDirection = 'insufficient_data';
  if (report.trends) {
    trend = report.trends.direction;
  } else if (change !== null) {
    if (change > 2) trend = 'improving';
    else if (change < -2) trend = 'declining';
    else trend = 'stable';
  }

  return {
    overallScore: score,
    letterGrade: scoreToLetter(score),
    healthLevel: scoreToLevel(score),
    trend,
    previousScore,
    scoreChange: change,
    lastAnalysisTime: report.generatedAt,
  };
}

/**
 * Map a numeric score to a letter grade.
 */
function scoreToLetter(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Map a numeric score to a health level.
 */
function scoreToLevel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Poor';
  return 'Critical';
}

/**
 * Default quick actions.
 */
export const DEFAULT_QUICK_ACTIONS: readonly QuickAction[] = [
  {
    type: 'run_health_analysis',
    label: 'Run Health Analysis',
    description: 'Scan your PC for health issues',
    icon: 'heart-pulse',
    path: '/dashboard',
    enabled: true,
  },
  {
    type: 'view_optimization_plan',
    label: 'View Optimization Plan',
    description: 'Review AI-generated recommendations',
    icon: 'list-checks',
    path: '/optimization-planner',
    enabled: true,
  },
  {
    type: 'run_smart_optimize',
    label: 'Run Smart Optimize',
    description: 'One-click optimization execution',
    icon: 'zap',
    path: '/smart-optimize',
    enabled: true,
  },
  {
    type: 'open_startup_optimizer',
    label: 'Startup Optimizer',
    description: 'Manage startup applications',
    icon: 'rocket',
    path: '/startup-manager',
    enabled: true,
  },
  {
    type: 'open_reports',
    label: 'View Reports',
    description: 'Maintenance history and reports',
    icon: 'file-text',
    path: '/reports',
    enabled: true,
  },
];
