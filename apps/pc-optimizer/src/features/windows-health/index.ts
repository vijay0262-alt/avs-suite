/**
 * Windows System Health Platform — Barrel Export
 *
 * Complete Windows health module providing:
 *   • OS info discovery (edition, version, build, activation, boot, locale, architecture)
 *   • Windows Update analysis (pending, failed, security, overdue, restart)
 *   • Driver analysis (outdated, unknown, errors, disabled, unsigned)
 *   • Security analysis (Defender, firewall, SmartScreen, Secure Boot, TPM, Core Isolation)
 *   • Hardware analysis (CPU, memory, storage, GPU, battery)
 *   • Safe execution (open settings, trigger update scan, clear update cache)
 *   • AI Health Engine integration (system_updates, drivers, security contributions)
 *   • Dashboard integration (Windows health card)
 *   • History tracking (scans, update checks, health changes, executions)
 *
 * Components:
 *   • WindowsScanner — collects OS, update, driver, security, hardware data
 *   • WindowsRepository — in-memory store with querying and caching
 *   • UpdateAnalyzer — Windows Update status analysis
 *   • DriverAnalyzer — installed driver health analysis
 *   • SecurityAnalyzer — Windows security posture evaluation
 *   • HardwareAnalyzer — hardware health and performance assessment
 *   • WindowsAnalyzer — comprehensive Windows health analysis
 *   • WindowsRecommendationEngine — 10 recommendation types
 *   • WindowsExecutionTask — MaintenanceTask for safe Windows actions
 *   • WindowsHistory — scan, update check, health change, execution history
 *   • WindowsHealthIntegration — AI Health Engine data provider
 *
 * This module does NOT modify:
 *   • Authentication, licensing, subscriptions, payment
 *   • Configuration synchronization
 *   • AI Health Engine architecture
 *   • Execution Engine architecture
 *   • Optimization Planner
 *   • Dashboard architecture
 *   • Storage Intelligence
 *   • Browser Health
 */

// Types
export type {
  WindowsSystemInfo,
  UpdateClassification,
  PendingUpdate,
  UpdateStatus,
  UpdateAnalysisResult,
  DriverStatus,
  DriverInfo,
  DriverAnalysisResult,
  SecurityStatus,
  SecurityAnalysisResult,
  CpuInfo,
  MemoryInfo,
  StorageDeviceInfo,
  GpuInfo,
  BatteryInfo,
  HardwareInfo,
  HardwareAnalysisResult,
  WindowsHealthIssueType,
  WindowsHealthIssue,
  WindowsHealthResult,
  WindowsScanResult,
  WindowsRecommendationType,
  RiskLevel,
  RecommendationPriority,
  WindowsRecommendation,
  WindowsActionType,
  WindowsExecutionConfig,
  WindowsActionRecord,
  WindowsHistoryEntryType,
  WindowsHistoryEntry,
  WindowsHealthContribution,
  WindowsDashboardCard,
  WindowsEventType,
  WindowsEventPayloads,
  WindowsEventListener,
} from './types';
export {
  daysSince,
  formatBytes,
  formatDuration,
  OVERDUE_UPDATE_THRESHOLD_DAYS,
  HIGH_CPU_USAGE_THRESHOLD,
  HIGH_MEMORY_USAGE_THRESHOLD,
  LOW_DISK_SPACE_THRESHOLD,
  LOW_DISK_SPACE_WARNING_THRESHOLD,
  VIRUS_DEFINITIONS_STALE_DAYS,
  CACHE_TTL_MS,
  THROTTLE_INTERVAL_MS,
} from './types';

// Events
export { WindowsEventEmitter, windowsEvents } from './windowsEvents';

// Scanner
export { WindowsScanner, windowsScanner } from './windowsScanner';

// Repository
export { WindowsRepository, windowsRepository } from './windowsRepository';

// Analyzers
export { UpdateAnalyzer, updateAnalyzer } from './updateAnalyzer';
export { DriverAnalyzer, driverAnalyzer } from './driverAnalyzer';
export { SecurityAnalyzer, securityAnalyzer } from './securityAnalyzer';
export { HardwareAnalyzer, hardwareAnalyzer } from './hardwareAnalyzer';
export { WindowsAnalyzer, windowsAnalyzer } from './windowsAnalyzer';

// Recommendation Engine
export { WindowsRecommendationEngine, windowsRecommendationEngine } from './windowsRecommendationEngine';

// Execution Task
export { WindowsExecutionTask, WINDOWS_TASK_ID } from './windowsExecutionTask';

// History
export { WindowsHistory, windowsHistory } from './windowsHistory';

// Health Integration
export { WindowsHealthIntegration, windowsHealthIntegration } from './windowsHealthIntegration';
