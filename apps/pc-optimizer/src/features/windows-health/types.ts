/**
 * Windows System Health Platform — Type Definitions
 *
 * Complete type system for Windows OS analysis, security evaluation,
 * update tracking, driver health, hardware assessment, and integration.
 *
 * This module does NOT modify any existing architecture.
 */
import type { HealthCategoryId, Severity } from '../ai-health-engine/types';

// ── Windows System Info ───────────────────────────────────────

export interface WindowsSystemInfo {
  edition: string;
  version: string;
  buildNumber: string;
  release: string | null;
  installDate: string | null;
  activationStatus: 'activated' | 'not_activated' | 'unknown';
  lastBootTime: string | null;
  pendingRestart: boolean;
  systemLocale: string | null;
  architecture: 'x64' | 'arm64' | 'x86' | 'unknown';
  deviceName: string;
  systemManufacturer: string | null;
  biosVersion: string | null;
  uefiStatus: boolean;
  secureBoot: boolean;
  tpmVersion: string | null;
  bitLockerStatus: 'on' | 'off' | 'unknown';
  virtualizationSupport: boolean;
}

// ── Windows Update ────────────────────────────────────────────

export type UpdateClassification = 'security' | 'feature' | 'optional' | 'driver' | 'definition';

export interface PendingUpdate {
  id: string;
  title: string;
  classification: UpdateClassification;
  sizeBytes: number;
  isSecurity: boolean;
  isRequired: boolean;
}

export interface UpdateStatus {
  serviceEnabled: boolean;
  lastUpdateDate: string | null;
  pendingUpdates: PendingUpdate[];
  failedUpdates: PendingUpdate[];
  securityUpdatesPending: number;
  featureUpdatesPending: number;
  optionalUpdatesPending: number;
  restartRequired: boolean;
  pausedUpdates: boolean;
  deliveryOptimizationEnabled: boolean;
  daysSinceLastUpdate: number;
}

export interface UpdateAnalysisResult {
  score: number;
  issues: WindowsHealthIssue[];
  recommendations: string[];
  pendingCount: number;
  failedCount: number;
  securityPendingCount: number;
  restartRequired: boolean;
  analyzedAt: string;
}

// ── Driver Info ───────────────────────────────────────────────

export type DriverStatus = 'ok' | 'outdated' | 'error' | 'unknown' | 'disabled' | 'unsigned';

export interface DriverInfo {
  id: string;
  deviceName: string;
  deviceClass: string;
  manufacturer: string | null;
  driverVersion: string | null;
  driverDate: string | null;
  status: DriverStatus;
  isSigned: boolean;
  hasError: boolean;
  errorMessage: string | null;
  isEnabled: boolean;
}

export interface DriverAnalysisResult {
  score: number;
  issues: WindowsHealthIssue[];
  recommendations: string[];
  totalDrivers: number;
  outdatedCount: number;
  unknownDeviceCount: number;
  errorCount: number;
  disabledCount: number;
  unsignedCount: number;
  analyzedAt: string;
}

// ── Security Status ───────────────────────────────────────────

export interface SecurityStatus {
  defenderEnabled: boolean;
  realTimeProtection: boolean;
  firewallEnabled: boolean;
  smartScreenEnabled: boolean;
  secureBootEnabled: boolean;
  tpmPresent: boolean;
  tpmVersion: string | null;
  coreIsolationEnabled: boolean;
  memoryIntegrityEnabled: boolean;
  ransomwareProtectionEnabled: boolean;
  virusDefinitionsUpdated: boolean;
  virusDefinitionsDate: string | null;
  thirdPartyAV: string | null;
  bitLockerStatus: 'on' | 'off' | 'unknown';
  uacEnabled: boolean;
}

export interface SecurityAnalysisResult {
  score: number;
  issues: WindowsHealthIssue[];
  recommendations: string[];
  defenderActive: boolean;
  firewallActive: boolean;
  allProtectionsEnabled: boolean;
  analyzedAt: string;
}

// ── Hardware Info ─────────────────────────────────────────────

export interface CpuInfo {
  name: string;
  manufacturer: string;
  cores: number;
  logicalCores: number;
  maxFrequency: number;
  currentUsage: number;
}

export interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  usage: number;
  slotsUsed: number | null;
  slotsTotal: number | null;
  speed: number | null;
}

export interface StorageDeviceInfo {
  id: string;
  name: string;
  type: 'ssd' | 'hdd' | 'nvme' | 'unknown';
  totalSize: number;
  freeSpace: number;
  usedSpace: number;
  usage: number;
  isSystemDrive: boolean;
  smartStatus: 'ok' | 'warning' | 'failed' | 'unknown';
}

export interface GpuInfo {
  name: string;
  manufacturer: string;
  driverVersion: string | null;
  vram: number;
}

export interface BatteryInfo {
  present: boolean;
  percent: number;
  powerPlugged: boolean;
  cycleCount: number | null;
  health: 'good' | 'fair' | 'poor' | 'unknown';
  designCapacity: number | null;
  fullChargeCapacity: number | null;
}

export interface HardwareInfo {
  cpu: CpuInfo;
  memory: MemoryInfo;
  storage: StorageDeviceInfo[];
  gpus: GpuInfo[];
  battery: BatteryInfo | null;
  totalStorageFree: number;
  totalStorageUsed: number;
  totalStorageTotal: number;
}

export interface HardwareAnalysisResult {
  score: number;
  issues: WindowsHealthIssue[];
  recommendations: string[];
  cpuUsage: number;
  memoryUsage: number;
  storageUsage: number;
  batteryHealth: 'good' | 'fair' | 'poor' | 'unknown' | 'not_present';
  lowDiskSpaceDrives: StorageDeviceInfo[];
  analyzedAt: string;
}

// ── Windows Health (Overall) ──────────────────────────────────

export type WindowsHealthIssueType =
  | 'pending_updates'
  | 'failed_updates'
  | 'overdue_updates'
  | 'restart_required'
  | 'defender_disabled'
  | 'realtime_protection_off'
  | 'firewall_disabled'
  | 'smart_screen_disabled'
  | 'secure_boot_disabled'
  | 'tpm_not_found'
  | 'core_isolation_disabled'
  | 'memory_integrity_disabled'
  | 'ransomware_protection_off'
  | 'virus_definitions_outdated'
  | 'outdated_driver'
  | 'unknown_device'
  | 'device_error'
  | 'unsigned_driver'
  | 'disabled_device'
  | 'high_cpu_usage'
  | 'high_memory_usage'
  | 'low_disk_space'
  | 'poor_battery_health'
  | 'update_service_disabled'
  | 'paused_updates';

export interface WindowsHealthIssue {
  type: WindowsHealthIssueType;
  title: string;
  description: string;
  severity: Severity;
  impact: number;
  autoFixable: boolean;
}

export interface WindowsHealthResult {
  overallScore: number;
  performanceScore: number;
  updateScore: number;
  securityScore: number;
  hardwareScore: number;
  issues: WindowsHealthIssue[];
  insights: string[];
  systemInfo: WindowsSystemInfo | null;
  updateStatus: UpdateStatus | null;
  securityStatus: SecurityStatus | null;
  hardwareInfo: HardwareInfo | null;
  driverInfo: DriverInfo[];
  analyzedAt: string;
}

// ── Scan Result ───────────────────────────────────────────────

export interface WindowsScanResult {
  systemInfo: WindowsSystemInfo | null;
  updateStatus: UpdateStatus | null;
  securityStatus: SecurityStatus | null;
  hardwareInfo: HardwareInfo | null;
  drivers: DriverInfo[];
  scannedAt: string;
  scanDurationMs: number;
  errors: string[];
  fromCache: boolean;
}

// ── Recommendations ───────────────────────────────────────────

export type WindowsRecommendationType =
  | 'install_windows_updates'
  | 'restart_computer'
  | 'enable_firewall'
  | 'enable_defender'
  | 'enable_smartscreen'
  | 'enable_secure_boot'
  | 'review_device_errors'
  | 'review_unsigned_drivers'
  | 'free_disk_space'
  | 'review_battery_health';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

export interface WindowsRecommendation {
  id: string;
  type: WindowsRecommendationType;
  title: string;
  description: string;
  priority: RecommendationPriority;
  risk: RiskLevel;
  estimatedBenefit: number;
  reviewRequired: boolean;
  affectedComponent: 'update' | 'security' | 'driver' | 'hardware' | 'system';
}

// ── Execution ─────────────────────────────────────────────────

export type WindowsActionType =
  | 'open_windows_update'
  | 'open_security_settings'
  | 'trigger_update_scan'
  | 'clear_update_cache';

export interface WindowsExecutionConfig {
  actions: WindowsActionType[];
}

export interface WindowsActionRecord {
  id: string;
  actionType: WindowsActionType;
  timestamp: string;
  success: boolean;
  errorMessage: string | null;
  durationMs: number;
}

// ── History ───────────────────────────────────────────────────

export type WindowsHistoryEntryType = 'scan' | 'update_check' | 'execution' | 'health_change';

export interface WindowsHistoryEntry {
  id: string;
  type: WindowsHistoryEntryType;
  timestamp: string;
  description: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  actionType: WindowsActionType | null;
  success: boolean;
  durationMs: number;
}

// ── Health Integration ────────────────────────────────────────

export interface WindowsHealthContribution {
  categoryId: HealthCategoryId;
  categoryName: string;
  score: number;
  severity: Severity;
  issues: WindowsHealthIssue[];
  insights: string[];
  recommendations: string[];
  confidence: number;
  analyzedAt: string;
}

// ── Dashboard Integration ─────────────────────────────────────

export interface WindowsDashboardCard {
  overallHealthScore: number;
  updateStatus: 'up_to_date' | 'pending' | 'overdue' | 'unknown';
  securityStatus: 'secure' | 'at_risk' | 'critical' | 'unknown';
  hardwareStatus: 'good' | 'fair' | 'poor' | 'unknown';
  restartRequired: boolean;
  pendingUpdateCount: number;
  quickActions: { label: string; actionType: WindowsActionType }[];
}

// ── Events ────────────────────────────────────────────────────

export type WindowsEventType =
  | 'windows_scan_started'
  | 'windows_scan_completed'
  | 'windows_analysis_completed'
  | 'windows_update_checked'
  | 'windows_execution_started'
  | 'windows_execution_completed'
  | 'windows_execution_failed';

export interface WindowsEventPayloads {
  windows_scan_started: { timestamp: string };
  windows_scan_completed: { result: WindowsScanResult };
  windows_analysis_completed: { result: WindowsHealthResult };
  windows_update_checked: { status: UpdateStatus };
  windows_execution_started: { actions: WindowsActionType[] };
  windows_execution_completed: { records: WindowsActionRecord[] };
  windows_execution_failed: { error: string; partialRecords: WindowsActionRecord[] };
}

export type WindowsEventListener = (payload: unknown) => void;

// ── Helper Functions ──────────────────────────────────────────

export function daysSince(dateString: string | null): number {
  if (!dateString) return Infinity;
  const diff = Date.now() - new Date(dateString).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

// ── Thresholds ────────────────────────────────────────────────

export const OVERDUE_UPDATE_THRESHOLD_DAYS = 60;
export const HIGH_CPU_USAGE_THRESHOLD = 85;
export const HIGH_MEMORY_USAGE_THRESHOLD = 85;
export const LOW_DISK_SPACE_THRESHOLD = 0.9;
export const LOW_DISK_SPACE_WARNING_THRESHOLD = 0.8;
export const VIRUS_DEFINITIONS_STALE_DAYS = 7;
export const CACHE_TTL_MS = 30_000;
export const THROTTLE_INTERVAL_MS = 5_000;
