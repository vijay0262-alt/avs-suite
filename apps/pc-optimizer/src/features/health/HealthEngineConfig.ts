/**
 * Health Engine Configuration (Part 12).
 *
 * All scoring weights, thresholds, and penalties live here so future
 * versions can tune scoring without changing business logic.
 *
 * Modules read from `healthEngineConfig` — never from hardcoded constants
 * scattered across the codebase.
 */

import type { HealthScoreWeights } from '../dashboard/dashboard.types';
import { DEFAULT_HEALTH_WEIGHTS } from '../dashboard/dashboard.types';

// ── Score zone thresholds ───────────────────────────────────────────

export interface ScoreZoneThresholds {
  perfect: number;   // >= this → perfect
  excellent: number; // >= this → excellent
  good: number;      // >= this → good
  fair: number;      // >= this → fair
  poor: number;      // >= this → poor
  // below poor → critical
}

export const DEFAULT_SCORE_ZONE_THRESHOLDS: ScoreZoneThresholds = {
  perfect: 100,
  excellent: 90,
  good: 80,
  fair: 60,
  poor: 40,
};

// ── Storage scoring thresholds ──────────────────────────────────────

export interface StorageThresholds {
  /** Max junk penalty applied to storage score. */
  maxJunkPenalty: number;
  /** Multiplier for log10(junkMB + 1). */
  junkPenaltyMultiplier: number;
  /** Drive usage % above which a penalty is applied. */
  driveCriticalThreshold: number;
  /** Drive usage % above which a smaller penalty is applied. */
  driveWarningThreshold: number;
  /** Penalty when drive is critically full. */
  driveCriticalPenalty: number;
  /** Penalty when drive is warning-level full. */
  driveWarningPenalty: number;
}

export const DEFAULT_STORAGE_THRESHOLDS: StorageThresholds = {
  maxJunkPenalty: 40,
  junkPenaltyMultiplier: 5,
  driveCriticalThreshold: 90,
  driveWarningThreshold: 80,
  driveCriticalPenalty: 20,
  driveWarningPenalty: 10,
};

// ── Startup scoring thresholds ──────────────────────────────────────

export interface StartupThresholds {
  penaltyPerApp: number;
  maxPenalty: number;
}

export const DEFAULT_STARTUP_THRESHOLDS: StartupThresholds = {
  penaltyPerApp: 5,
  maxPenalty: 50,
};

// ── Privacy scoring thresholds ──────────────────────────────────────

export interface PrivacyThresholds {
  penaltyPerRisk: number;
  maxPenalty: number;
}

export const DEFAULT_PRIVACY_THRESHOLDS: PrivacyThresholds = {
  penaltyPerRisk: 10,
  maxPenalty: 100,
};

// ── Performance scoring thresholds ──────────────────────────────────

export interface PerformanceThresholds {
  cpuWarningThreshold: number;
  cpuCriticalThreshold: number;
  cpuWarningPenalty: number;
  cpuCriticalPenalty: number;
  memoryWarningThreshold: number;
  memoryCriticalThreshold: number;
  memoryWarningPenalty: number;
  memoryCriticalPenalty: number;
}

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  cpuWarningThreshold: 60,
  cpuCriticalThreshold: 80,
  cpuWarningPenalty: 15,
  cpuCriticalPenalty: 30,
  memoryWarningThreshold: 70,
  memoryCriticalThreshold: 85,
  memoryWarningPenalty: 12,
  memoryCriticalPenalty: 25,
};

// ── Security scoring thresholds ─────────────────────────────────────

export interface SecurityThresholds {
  defenderDisabledPenalty: number;
  realTimeProtectionDisabledPenalty: number;
  firewallDisabledPenalty: number;
  smartScreenDisabledPenalty: number;
  pendingUpdatesPenalty: number;
}

export const DEFAULT_SECURITY_THRESHOLDS: SecurityThresholds = {
  defenderDisabledPenalty: 30,
  realTimeProtectionDisabledPenalty: 20,
  firewallDisabledPenalty: 25,
  smartScreenDisabledPenalty: 10,
  pendingUpdatesPenalty: 15,
};

// ── Windows health thresholds ───────────────────────────────────────

export interface WindowsThresholds {
  freshUptimeDays: number;
  normalUptimeDays: number;
  longUptimeDays: number;
  freshScore: number;
  normalScore: number;
  longScore: number;
  veryLongScore: number;
}

export const DEFAULT_WINDOWS_THRESHOLDS: WindowsThresholds = {
  freshUptimeDays: 7,
  normalUptimeDays: 30,
  longUptimeDays: 60,
  freshScore: 100,
  normalScore: 90,
  longScore: 70,
  veryLongScore: 40,
};

// ── Notification thresholds (Part 10) ───────────────────────────────

export interface NotificationThresholds {
  /** Drop in health score that triggers a notification. */
  scoreDropThreshold: number;
  /** Junk bytes that trigger a "junk accumulated" notification. */
  junkAccumulationThreshold: number;
  /** New startup apps that trigger a notification. */
  newStartupAppsThreshold: number;
  /** Minimum time between repeated notifications (ms). */
  notificationCooldownMs: number;
}

export const DEFAULT_NOTIFICATION_THRESHOLDS: NotificationThresholds = {
  scoreDropThreshold: 5,
  junkAccumulationThreshold: 1_000_000_000, // 1 GB
  newStartupAppsThreshold: 3,
  notificationCooldownMs: 3600_000, // 1 hour
};

// ── Aggregate config ────────────────────────────────────────────────

export interface HealthEngineConfig {
  weights: HealthScoreWeights;
  scoreZoneThresholds: ScoreZoneThresholds;
  storage: StorageThresholds;
  startup: StartupThresholds;
  privacy: PrivacyThresholds;
  performance: PerformanceThresholds;
  security: SecurityThresholds;
  windows: WindowsThresholds;
  notifications: NotificationThresholds;
}

export const DEFAULT_HEALTH_ENGINE_CONFIG: HealthEngineConfig = {
  weights: DEFAULT_HEALTH_WEIGHTS,
  scoreZoneThresholds: DEFAULT_SCORE_ZONE_THRESHOLDS,
  storage: DEFAULT_STORAGE_THRESHOLDS,
  startup: DEFAULT_STARTUP_THRESHOLDS,
  privacy: DEFAULT_PRIVACY_THRESHOLDS,
  performance: DEFAULT_PERFORMANCE_THRESHOLDS,
  security: DEFAULT_SECURITY_THRESHOLDS,
  windows: DEFAULT_WINDOWS_THRESHOLDS,
  notifications: DEFAULT_NOTIFICATION_THRESHOLDS,
};

/**
 * Global singleton — modules read from this.
 * Future versions can override individual fields without touching business logic.
 */
let activeConfig: HealthEngineConfig = DEFAULT_HEALTH_ENGINE_CONFIG;

export function getHealthEngineConfig(): HealthEngineConfig {
  return activeConfig;
}

export function setHealthEngineConfig(config: Partial<HealthEngineConfig>): void {
  activeConfig = { ...activeConfig, ...config };
}

export function resetHealthEngineConfig(): void {
  activeConfig = DEFAULT_HEALTH_ENGINE_CONFIG;
}
