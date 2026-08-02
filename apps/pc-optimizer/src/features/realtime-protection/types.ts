/**
 * Real-Time AI Protection — Type Definitions
 *
 * Version 1.2 — EPIC 2 — Part 1 — Real-Time Monitoring Framework
 *
 * Architecture principles:
 *   - Event-driven whenever possible — never poll where OS notifications exist
 *   - Lightweight — target <1% idle CPU, <150MB memory
 *   - Never block the UI thread
 *   - Reuse existing scanning modules — no duplicate logic
 *   - Enterprise-ready architecture
 *
 * Event Pipeline:
 *   System Event → Normalize → Classify → Filter → Provider Analysis
 *   → AI Investigation → Recommendation → User Notification → Optional Remediation
 */

import type {
  Threat,
  ThreatCategory,
  ThreatSeverity,
  ThreatRisk,
  ThreatStatus,
  SecurityEvidence,
  AffectedAsset,
} from '../security-center/types';

// ── Re-exports for convenience ───────────────────────────────────────

export type {
  Threat,
  ThreatCategory,
  ThreatSeverity,
  ThreatRisk,
  ThreatStatus,
  SecurityEvidence,
  AffectedAsset,
};

// ── Protection Modes ─────────────────────────────────────────────────

export type ProtectionMode = 'disabled' | 'passive' | 'interactive' | 'maximum' | 'enterprise';

export type ProtectionState = 'stopped' | 'starting' | 'running' | 'paused' | 'stopping' | 'error' | 'restarting';

// ── System Events ────────────────────────────────────────────────────

export type SystemEventType =
  | 'file_created'
  | 'file_modified'
  | 'file_deleted'
  | 'file_renamed'
  | 'process_created'
  | 'process_terminated'
  | 'service_created'
  | 'service_modified'
  | 'scheduled_task_created'
  | 'scheduled_task_modified'
  | 'startup_entry_added'
  | 'startup_entry_modified'
  | 'registry_run_key_changed'
  | 'browser_extension_installed'
  | 'browser_extension_removed'
  | 'browser_setting_changed'
  | 'download_completed'
  | 'usb_inserted'
  | 'usb_removed'
  | 'network_profile_changed'
  | 'network_connection_established'
  | 'network_connection_closed';

export type EventCategory =
  | 'file_system'
  | 'process'
  | 'service'
  | 'scheduled_task'
  | 'startup'
  | 'registry'
  | 'browser'
  | 'download'
  | 'usb'
  | 'network';

export type EventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type EventStatus = 'pending' | 'processing' | 'analyzed' | 'threat' | 'benign' | 'filtered' | 'dropped' | 'failed';

export interface SystemEvent {
  id: string;
  type: SystemEventType;
  category: EventCategory;
  severity: EventSeverity;
  status: EventStatus;
  timestamp: number;
  source: string;
  target: EventTarget;
  metadata: EventMetadata;
  normalized: boolean;
  classified: boolean;
  filtered: boolean;
  processingTime: number | null;
}

export interface EventTarget {
  type: 'file' | 'process' | 'service' | 'scheduled_task' | 'startup_entry' | 'registry' | 'browser_extension' | 'browser_setting' | 'usb_device' | 'network_connection';
  path: string;
  name: string;
  pid?: number;
  hash?: string;
  size?: number;
  publisher?: string;
  signatureStatus?: string;
}

export interface EventMetadata {
  operation: string;
  details: Record<string, unknown>;
  rawEvent?: unknown;
}

// ── Monitors ─────────────────────────────────────────────────────────

export type MonitorType =
  | 'file_system'
  | 'process'
  | 'service'
  | 'scheduled_task'
  | 'startup'
  | 'registry'
  | 'browser'
  | 'download'
  | 'usb'
  | 'network';

export type MonitorStatus = 'active' | 'inactive' | 'error' | 'paused' | 'unsupported';

export interface MonitorConfig {
  type: MonitorType;
  enabled: boolean;
  paths: string[];
  filterPatterns: string[];
  priority: number;
}

export interface MonitorInfo {
  type: MonitorType;
  status: MonitorStatus;
  enabled: boolean;
  eventsProcessed: number;
  eventsDropped: number;
  lastEvent: number | null;
  lastError: string | null;
  startedAt: number | null;
}

// ── Protection Rules ─────────────────────────────────────────────────

export type RuleCondition =
  | 'path_matches'
  | 'name_matches'
  | 'hash_matches'
  | 'publisher_matches'
  | 'category_matches'
  | 'severity_above'
  | 'signature_unsigned'
  | 'process_suspicious'
  | 'file_in_temp'
  | 'file_in_download'
  | 'file_in_desktop'
  | 'file_in_documents'
  | 'usb_auto_run'
  | 'network_external';

export type RuleAction = 'allow' | 'block' | 'monitor' | 'investigate' | 'notify' | 'quarantine';

export interface ProtectionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  conditions: RuleConditionSpec[];
  action: RuleAction;
  mode: ProtectionMode | 'all';
}

export interface RuleConditionSpec {
  type: RuleCondition;
  value: string;
  negate?: boolean;
}

export interface RuleMatchResult {
  matched: boolean;
  ruleId: string | null;
  action: RuleAction;
  reason: string;
}

// ── Action Queue ─────────────────────────────────────────────────────

export type ActionType = 'investigate' | 'notify' | 'quarantine' | 'block' | 'monitor' | 'scan';

export type ActionStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'deferred';

export type ActionPriority = 'low' | 'normal' | 'high' | 'critical';

export interface QueuedAction {
  id: string;
  eventId: string;
  type: ActionType;
  priority: ActionPriority;
  status: ActionStatus;
  queuedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  result: ActionResult | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
}

export interface ActionResult {
  threatDetected: boolean;
  threatId: string | null;
  recommendation: string | null;
  investigationId: string | null;
  remediationPlanId: string | null;
  details: string;
}

// ── Notifications ────────────────────────────────────────────────────

export type NotificationType = 'threat_detected' | 'investigation_complete' | 'remediation_required' | 'system_alert' | 'protection_status' | 'monitor_failure';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export interface ProtectionNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  eventId: string | null;
  threatId: string | null;
  investigationId: string | null;
  timestamp: number;
  read: boolean;
  dismissed: boolean;
  actionRequired: boolean;
  actionLabel: string | null;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  critical: number;
  actionRequired: number;
  oldest: number | null;
}

// ── Session ──────────────────────────────────────────────────────────

export interface ProtectionSession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  mode: ProtectionMode;
  state: ProtectionState;
  eventsProcessed: number;
  threatsDetected: number;
  threatsBlocked: number;
  investigationsTriggered: number;
  remediationsTriggered: number;
  notificationsSent: number;
  uptime: number;
  lastEventAt: number | null;
}

// ── Statistics ───────────────────────────────────────────────────────

export interface ProtectionStatistics {
  totalEvents: number;
  eventsByType: Record<SystemEventType, number>;
  eventsByCategory: Record<EventCategory, number>;
  eventsBySeverity: Record<EventSeverity, number>;
  eventsProcessed: number;
  eventsFiltered: number;
  eventsDropped: number;
  threatsDetected: number;
  threatsBlocked: number;
  investigationsTriggered: number;
  remediationsTriggered: number;
  notificationsSent: number;
  averageProcessingTime: number;
  maxProcessingTime: number;
  queueBacklog: number;
  activeMonitors: number;
  totalMonitors: number;
  sessionStartTime: number | null;
  uptime: number;
}

// ── Health ───────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface ProtectionHealthReport {
  status: HealthStatus;
  issues: HealthIssue[];
  recommendations: string[];
  timestamp: number;
}

export interface HealthIssue {
  component: string;
  severity: EventSeverity;
  description: string;
  recommendation: string;
}

// ── Diagnostics ──────────────────────────────────────────────────────

export interface ProtectionDiagnosticResult {
  component: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details: Record<string, unknown>;
  timestamp: number;
}

export interface ProtectionDiagnosticsReport {
  results: ProtectionDiagnosticResult[];
  overallStatus: 'pass' | 'fail' | 'warn';
  timestamp: number;
}

// ── History ──────────────────────────────────────────────────────────

export interface ProtectionHistoryEntry {
  id: string;
  timestamp: number;
  eventType: SystemEventType;
  eventCategory: EventCategory;
  severity: EventSeverity;
  status: EventStatus;
  target: string;
  action: string;
  threatDetected: boolean;
  threatId: string | null;
  processingTime: number;
}

export interface ProtectionHistoryData {
  entries: ProtectionHistoryEntry[];
  totalEvents: number;
  totalThreats: number;
  totalBlocked: number;
  totalInvestigations: number;
  averageProcessingTime: number;
  lastEventAt: number | null;
}

// ── Telemetry (local only) ───────────────────────────────────────────

export interface ProtectionTelemetry {
  cpuUsage: number;
  memoryUsage: number;
  eventsPerMinute: number;
  averageLatencyMs: number;
  queueDepth: number;
  monitorHealth: Record<MonitorType, boolean>;
  providerFailures: number;
  droppedEvents: number;
  uptime: number;
  timestamp: number;
}

export interface TelemetrySample {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  eventsPerMinute: number;
  latencyMs: number;
  queueDepth: number;
}

// ── Configuration ────────────────────────────────────────────────────

export interface ProtectionConfiguration {
  enabled: boolean;
  mode: ProtectionMode;
  monitors: MonitorConfig[];
  rules: ProtectionRule[];
  maxQueueSize: number;
  maxConcurrentActions: number;
  eventBatchSize: number;
  eventBatchTimeoutMs: number;
  cpuTargetPercent: number;
  memoryTargetMB: number;
  notificationEnabled: boolean;
  notificationMinSeverity: EventSeverity;
  autoInvestigate: boolean;
  autoNotify: boolean;
  telemetryEnabled: boolean;
  telemetryIntervalMs: number;
  maxTelemetrySamples: number;
  maxHistoryEntries: number;
  restartOnFailure: boolean;
  maxRestartAttempts: number;
  restartDelayMs: number;
}

export const DEFAULT_PROTECTION_CONFIG: ProtectionConfiguration = {
  enabled: true,
  mode: 'passive',
  monitors: [
    { type: 'file_system', enabled: true, paths: ['%TEMP%', '%USERPROFILE%\\Downloads', '%USERPROFILE%\\Desktop', '%USERPROFILE%\\Documents'], filterPatterns: ['*.exe', '*.dll', '*.scr', '*.bat', '*.cmd', '*.ps1', '*.vbs', '*.js'], priority: 1 },
    { type: 'process', enabled: true, paths: [], filterPatterns: [], priority: 0 },
    { type: 'service', enabled: true, paths: [], filterPatterns: [], priority: 2 },
    { type: 'scheduled_task', enabled: true, paths: [], filterPatterns: [], priority: 2 },
    { type: 'startup', enabled: true, paths: [], filterPatterns: [], priority: 2 },
    { type: 'registry', enabled: true, paths: ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'], filterPatterns: [], priority: 2 },
    { type: 'browser', enabled: true, paths: [], filterPatterns: [], priority: 1 },
    { type: 'download', enabled: true, paths: ['%USERPROFILE%\\Downloads'], filterPatterns: ['*.exe', '*.dll', '*.scr', '*.bat', '*.cmd', '*.ps1', '*.zip', '*.rar'], priority: 1 },
    { type: 'usb', enabled: true, paths: [], filterPatterns: [], priority: 1 },
    { type: 'network', enabled: true, paths: [], filterPatterns: [], priority: 3 },
  ],
  rules: [],
  maxQueueSize: 1000,
  maxConcurrentActions: 3,
  eventBatchSize: 50,
  eventBatchTimeoutMs: 5000,
  cpuTargetPercent: 1.0,
  memoryTargetMB: 150,
  notificationEnabled: true,
  notificationMinSeverity: 'medium',
  autoInvestigate: true,
  autoNotify: true,
  telemetryEnabled: true,
  telemetryIntervalMs: 60000,
  maxTelemetrySamples: 1440,
  maxHistoryEntries: 500,
  restartOnFailure: true,
  maxRestartAttempts: 3,
  restartDelayMs: 5000,
};

// ── Policy ───────────────────────────────────────────────────────────

export interface ProtectionPolicy {
  mode: ProtectionMode;
  autoInvestigate: boolean;
  autoNotify: boolean;
  autoQuarantine: boolean;
  blockUnsignedExecutables: boolean;
  blockScriptsFromTemp: boolean;
  blockUsbAutoRun: boolean;
  monitorDownloads: boolean;
  monitorBrowserChanges: boolean;
  monitorStartupChanges: boolean;
  monitorRegistryRunKeys: boolean;
  monitorScheduledTasks: boolean;
  monitorServices: boolean;
  monitorNetworkProfiles: boolean;
  minSeverityForNotification: EventSeverity;
  minSeverityForInvestigation: EventSeverity;
  minSeverityForQuarantine: EventSeverity;
  enterpriseMode: boolean;
  centralManagement: boolean;
}

export const DEFAULT_PROTECTION_POLICY: ProtectionPolicy = {
  mode: 'passive',
  autoInvestigate: true,
  autoNotify: true,
  autoQuarantine: false,
  blockUnsignedExecutables: false,
  blockScriptsFromTemp: false,
  blockUsbAutoRun: true,
  monitorDownloads: true,
  monitorBrowserChanges: true,
  monitorStartupChanges: true,
  monitorRegistryRunKeys: true,
  monitorScheduledTasks: true,
  monitorServices: true,
  monitorNetworkProfiles: true,
  minSeverityForNotification: 'medium',
  minSeverityForInvestigation: 'medium',
  minSeverityForQuarantine: 'high',
  enterpriseMode: false,
  centralManagement: false,
};

// ── Dashboard ────────────────────────────────────────────────────────

export interface ProtectionDashboardData {
  summary: ProtectionDashboardSummary;
  activeMonitors: MonitorInfo[];
  recentEvents: ProtectionDashboardEvent[];
  recentNotifications: ProtectionNotification[];
  health: ProtectionHealthReport;
  statistics: ProtectionStatistics;
  lastUpdated: number;
}

export interface ProtectionDashboardSummary {
  protectionStatus: ProtectionState;
  mode: ProtectionMode;
  activeMonitors: number;
  totalMonitors: number;
  eventsToday: number;
  threatsBlocked: number;
  threatsInvestigated: number;
  pendingApprovals: number;
  lastEvent: number | null;
  engineHealth: HealthStatus;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
}

export interface ProtectionDashboardEvent {
  id: string;
  type: SystemEventType;
  category: EventCategory;
  severity: EventSeverity;
  status: EventStatus;
  target: string;
  timestamp: number;
  threatDetected: boolean;
}

// ── Events ───────────────────────────────────────────────────────────

export type ProtectionEventType =
  | 'protection_started'
  | 'protection_stopped'
  | 'protection_paused'
  | 'protection_resumed'
  | 'protection_error'
  | 'protection_restarted'
  | 'mode_changed'
  | 'event_received'
  | 'event_processed'
  | 'event_filtered'
  | 'event_dropped'
  | 'threat_detected'
  | 'investigation_triggered'
  | 'notification_sent'
  | 'monitor_started'
  | 'monitor_stopped'
  | 'monitor_failed'
  | 'queue_overflow'
  | 'health_degraded';

export interface ProtectionEvent {
  type: ProtectionEventType;
  timestamp: number;
  eventId?: string;
  threatId?: string;
  monitorType?: MonitorType;
  mode?: ProtectionMode;
  message?: string;
  data?: Record<string, unknown>;
}

export type ProtectionEventListener = (event: ProtectionEvent) => void;

// ── Integration References ───────────────────────────────────────────

export interface IntegrationRefs {
  securityEngineId: string | null;
  investigationEngineId: string | null;
  remediationEngineId: string | null;
  hardwareEngineId: string | null;
  processEngineId: string | null;
  predictiveEngineId: string | null;
  optimizationEngineId: string | null;
}

// ── Helper Functions ─────────────────────────────────────────────────

export function severityToNumber(severity: EventSeverity): number {
  const order: EventSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
  return order.indexOf(severity);
}

export function meetsSeverityThreshold(severity: EventSeverity, threshold: EventSeverity): boolean {
  return severityToNumber(severity) >= severityToNumber(threshold);
}

export function modeAllowsAutoAction(mode: ProtectionMode): boolean {
  return mode === 'interactive' || mode === 'maximum' || mode === 'enterprise';
}

export function modeAllowsBlocking(mode: ProtectionMode): boolean {
  return mode === 'maximum' || mode === 'enterprise';
}

export function modeAllowsAutoQuarantine(mode: ProtectionMode): boolean {
  return mode === 'maximum' || mode === 'enterprise';
}

export function isMonitorTypeEnabled(config: ProtectionConfiguration, type: MonitorType): boolean {
  const monitor = config.monitors.find((m) => m.type === type);
  return monitor ? monitor.enabled : false;
}

export function categorizeEventType(type: SystemEventType): EventCategory {
  if (type.startsWith('file_')) return 'file_system';
  if (type.startsWith('process_')) return 'process';
  if (type.startsWith('service_')) return 'service';
  if (type.startsWith('scheduled_task_')) return 'scheduled_task';
  if (type.startsWith('startup_')) return 'startup';
  if (type.startsWith('registry_')) return 'registry';
  if (type.startsWith('browser_')) return 'browser';
  if (type.startsWith('download_')) return 'download';
  if (type.startsWith('usb_')) return 'usb';
  if (type.startsWith('network_')) return 'network';
  return 'file_system';
}
