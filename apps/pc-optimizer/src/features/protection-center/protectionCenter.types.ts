/**
 * Protection Center types — real-time protection state, monitors,
 * activity events, alerts, and system health snapshot.
 *
 * All data is derived from real backend services. No fabricated values.
 */

import type {
  DashboardMetrics,
  LiveMetrics,
  HardwareSensors,
  HealthScore,
} from '../dashboard/dashboard.types';
import type { OptimizationEvent } from '../health';
import type { HealthNotification } from '../health/HealthNotificationService';
import type { OptimizationHistoryEntry } from '../health/OptimizationHistoryService';

// ─── Protection State ──────────────────────────────────────────────

export type ProtectionLevel = 'fully_protected' | 'partially_protected' | 'at_risk' | 'unknown';

export interface ProtectionState {
  level: ProtectionLevel;
  /** Natural-language headline, e.g. "Your PC is fully protected." */
  headline: string;
  /** Secondary explanation sentence. */
  subheadline: string;
  /** ISO timestamp of last state evaluation. */
  evaluatedAt: string;
}

// ─── Protection Cards ──────────────────────────────────────────────

export type CardStatus = 'active' | 'warning' | 'inactive' | 'pending';

export interface ProtectionCardData {
  id: string;
  title: string;
  status: CardStatus;
  /** Short status label, e.g. "Active", "Needs attention". */
  statusLabel: string;
  /** Primary metric value (string for display flexibility). */
  primaryValue: string;
  /** Optional secondary metric. */
  secondaryValue?: string;
  /** Icon name from heroicons outline. */
  iconName: string;
  /** Navigation path when card is clicked. */
  actionPath?: string;
  /** Last-updated ISO timestamp. */
  lastUpdated: string;
}

// ─── Live Activity Timeline ────────────────────────────────────────

export type ActivityKind = 'optimization' | 'security' | 'system' | 'scan' | 'health';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string;
  timestamp: string;
  /** Optional metric like "1.2 GB recovered" or "3 threats blocked". */
  metric?: string;
}

// ─── Background Monitors ───────────────────────────────────────────

export interface MonitorStatus {
  id: string;
  name: string;
  /** Whether the monitor is actively running. */
  active: boolean;
  /** ISO timestamp of the last heartbeat / check. */
  lastHeartbeat: string | null;
  /** Human-readable status, e.g. "Monitoring", "Idle". */
  statusLabel: string;
  /** Optional detail, e.g. "Checked 2 seconds ago". */
  detail?: string;
}

// ─── Protection Health / Coverage ──────────────────────────────────

export interface CoverageItem {
  id: string;
  label: string;
  covered: boolean;
  /** Optional explanation when not covered. */
  reason?: string;
}

// ─── System Health Snapshot ────────────────────────────────────────

export interface SystemHealthSnapshotData {
  cpuUsage: number;
  cpuTemp: number | null;
  memoryUsage: number;
  storageUsage: number;
  batteryPercent: number | null;
  batteryPlugged: boolean | null;
  securityScore: number;
  performanceScore: number;
  privacyScore: number;
  overallHealthScore: number;
  overallScoreZone: string;
  uptimeSeconds: number;
  capturedAt: string;
}

// ─── What Changed ──────────────────────────────────────────────────

export interface ChangeEntry {
  id: string;
  label: string;
  /** Positive = improvement, negative = degradation. */
  delta: number;
  unit: 'bytes' | 'count' | 'percent' | 'score';
  direction: 'improved' | 'degraded' | 'neutral';
  timestamp: string;
}

// ─── Upcoming Automation ───────────────────────────────────────────

export type AutomationType = 'scan' | 'optimize' | 'update' | 'backup';

export interface ScheduledTask {
  id: string;
  name: string;
  type: AutomationType;
  /** ISO timestamp of next run. */
  nextRun: string | null;
  /** Recurrence description, e.g. "Daily at 3:00 AM". */
  recurrence: string;
  /** Whether this is a pro-only feature. */
  proOnly: boolean;
  /** Whether it is currently enabled. */
  enabled: boolean;
}

// ─── Quick Actions ─────────────────────────────────────────────────

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  iconName: string;
  path: string;
  tone: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  proOnly?: boolean;
}

// ─── Alerts ────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface ProtectionAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  actionLabel?: string;
  actionPath?: string;
  timestamp: string;
}

// ─── Aggregated View State ─────────────────────────────────────────

export interface ProtectionCenterState {
  loading: boolean;
  error: string | null;

  protectionState: ProtectionState | null;
  cards: ProtectionCardData[];
  activities: ActivityEvent[];
  monitors: MonitorStatus[];
  coverage: CoverageItem[];
  systemHealth: SystemHealthSnapshotData | null;
  changes: ChangeEntry[];
  scheduledTasks: ScheduledTask[];
  quickActions: QuickAction[];
  alerts: ProtectionAlert[];

  /** Raw metrics from dashboard service for reference. */
  metrics: DashboardMetrics | null;
  liveMetrics: LiveMetrics | null;
  hardwareSensors: HardwareSensors | null;
  healthScore: HealthScore | null;

  /** Whether the user is on pro edition. */
  isPro: boolean;

  /** Last time the full state was refreshed. */
  lastRefresh: number | null;
}

// Re-export types used from other modules for convenience.
export type {
  DashboardMetrics,
  LiveMetrics,
  HardwareSensors,
  HealthScore,
  OptimizationEvent,
  HealthNotification,
  OptimizationHistoryEntry,
};
