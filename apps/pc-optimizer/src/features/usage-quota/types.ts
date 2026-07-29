/**
 * Usage Quota Engine — Type Definitions.
 *
 * Version 2.0 infrastructure for data-driven quota tracking and enforcement.
 * This module does NOT modify any existing architecture.
 * It only creates the foundation that future prompts will use.
 */

// ── Reset Policies ───────────────────────────────────────────

export type ResetPolicy =
  | 'never'
  | 'session'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'custom';

export const RESET_POLICIES: readonly ResetPolicy[] = [
  'never',
  'session',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'custom',
];

// ── Limit Types ──────────────────────────────────────────────

export type LimitType =
  | 'count'
  | 'size_mb'
  | 'size_gb'
  | 'duration_seconds'
  | 'unlimited'
  | 'disabled';

export const LIMIT_TYPES: readonly LimitType[] = [
  'count',
  'size_mb',
  'size_gb',
  'duration_seconds',
  'unlimited',
  'disabled',
];

// ── Usage Units ──────────────────────────────────────────────

export type UsageUnit =
  | 'count'
  | 'mb'
  | 'gb'
  | 'seconds'
  | 'items'
  | 'files'
  | 'actions'
  | 'exports';

// ── Quota Definition ─────────────────────────────────────────

export interface QuotaDefinition {
  /** Unique quota identifier, e.g. "ai_conversations". */
  id: string;
  /** Human-readable name for UI display. */
  displayName: string;
  /** Description of what this quota limits. */
  description: string;
  /** Category for grouping. */
  category: string;
  /** Whether this quota is enabled. */
  enabled: boolean;
  /** Type of limit being enforced. */
  limitType: LimitType;
  /** Numeric limit value (ignored for unlimited/disabled). */
  limitValue: number;
  /** When the quota resets. */
  resetPolicy: ResetPolicy;
  /** Unit of usage measurement. */
  usageUnit: UsageUnit;
  /** Whether this quota is unlimited (no limit). */
  isUnlimited: boolean;
  /** Future metadata for extensibility (promotional bonuses, etc.). */
  futureMetadata?: Record<string, unknown>;
}

// ── Quota State (runtime) ────────────────────────────────────

export interface QuotaState {
  /** Quota ID. */
  quotaId: string;
  /** Current usage amount. */
  currentUsage: number;
  /** Remaining usage. */
  remainingUsage: number;
  /** Whether the quota is currently available. */
  isAvailable: boolean;
  /** Whether the quota is unlimited. */
  isUnlimited: boolean;
  /** Whether the quota is enabled. */
  isEnabled: boolean;
  /** ISO timestamp of last reset. */
  lastResetAt: string | null;
  /** ISO timestamp of next reset (null if never). */
  nextResetAt: string | null;
  /** Limit value. */
  limitValue: number;
  /** Limit type. */
  limitType: LimitType;
  /** Usage unit. */
  usageUnit: UsageUnit;
  /** Reset policy. */
  resetPolicy: ResetPolicy;
}

// ── Usage Record ─────────────────────────────────────────────

export interface UsageRecord {
  /** Unique record ID. */
  id: string;
  /** Quota ID this record belongs to. */
  quotaId: string;
  /** ISO timestamp of the usage. */
  timestamp: string;
  /** Action that triggered the usage. */
  action: string;
  /** Amount consumed. */
  amountUsed: number;
  /** Remaining after this usage. */
  remaining: number;
  /** Source module that triggered the usage. */
  sourceModule: string;
  /** Feature that triggered the usage (optional). */
  feature?: string;
  /** Capability that triggered the usage (optional). */
  capability?: string;
  /** User ID (optional, for multi-user). */
  userId?: string;
  /** Device ID (optional, for multi-device). */
  deviceId?: string;
  /** Session ID (optional, for per-session tracking). */
  sessionId?: string;
}

// ── Quota Configuration ──────────────────────────────────────

export interface QuotaConfig {
  quotas: QuotaDefinition[];
}

// ── Storage ──────────────────────────────────────────────────

export interface QuotaStorageData {
  states: Record<string, { currentUsage: number; lastResetAt: string | null }>;
  records: UsageRecord[];
}

export interface QuotaStorageAdapter {
  load(): Promise<QuotaStorageData>;
  save(data: QuotaStorageData): Promise<void>;
  clear(): Promise<void>;
}

// ── Events ───────────────────────────────────────────────────

export type QuotaEventType =
  | 'quota_initialized'
  | 'quota_consumed'
  | 'quota_restored'
  | 'quota_reset'
  | 'quota_exceeded'
  | 'quota_updated'
  | 'statistics_updated';

export interface QuotaConsumedEvent {
  timestamp: string;
  quotaId: string;
  amountUsed: number;
  remaining: number;
  action: string;
  sourceModule: string;
}

export interface QuotaRestoredEvent {
  timestamp: string;
  quotaId: string;
  amountRestored: number;
  remaining: number;
}

export interface QuotaResetEvent {
  timestamp: string;
  quotaId: string;
  previousUsage: number;
  resetTo: number;
}

export interface QuotaExceededEvent {
  timestamp: string;
  quotaId: string;
  attemptedAmount: number;
  remaining: number;
  limitValue: number;
}

export interface QuotaUpdatedEvent {
  timestamp: string;
  quotaId: string;
  currentUsage: number;
  remaining: number;
}

export interface QuotaInitializedEvent {
  timestamp: string;
  quotaCount: number;
}

export interface StatisticsUpdatedEvent {
  timestamp: string;
  totalQuotas: number;
  activeQuotas: number;
  exceededQuotas: number;
}

export type QuotaEventListener = (payload: unknown) => void;

// ── Statistics ───────────────────────────────────────────────

export interface QuotaStatistics {
  /** Total consumption today. */
  todayUsage: number;
  /** Total consumption this week. */
  weeklyUsage: number;
  /** Total consumption this month. */
  monthlyUsage: number;
  /** Total consumption all time. */
  lifetimeUsage: number;
  /** Most used quota IDs sorted by usage. */
  mostUsed: { quotaId: string; totalUsed: number }[];
  /** Least used quota IDs sorted by usage. */
  leastUsed: { quotaId: string; totalUsed: number }[];
  /** Usage history records. */
  history: UsageRecord[];
  /** Next reset schedule per quota. */
  resetSchedule: { quotaId: string; nextResetAt: string | null }[];
}

export interface QuotaSummary {
  /** Total quotas registered. */
  totalQuotas: number;
  /** Active (enabled) quotas. */
  activeQuotas: number;
  /** Quotas that are unlimited. */
  unlimitedQuotas: number;
  /** Quotas that are exceeded. */
  exceededQuotas: number;
  /** Quotas that are disabled. */
  disabledQuotas: number;
  /** Per-quota state summaries. */
  quotas: QuotaState[];
}

// ── Validation ───────────────────────────────────────────────

export interface QuotaValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  context?: string;
}

export interface QuotaValidationResult {
  valid: boolean;
  issues: QuotaValidationIssue[];
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Check if a reset policy is valid.
 */
export function isValidResetPolicy(policy: string): boolean {
  return RESET_POLICIES.includes(policy as ResetPolicy);
}

/**
 * Check if a limit type is valid.
 */
export function isValidLimitType(type: string): boolean {
  return LIMIT_TYPES.includes(type as LimitType);
}

/**
 * Calculate the next reset timestamp for a given reset policy.
 * Returns null if the policy is 'never' or 'session'.
 */
export function calculateNextReset(policy: ResetPolicy, fromTime: Date = new Date()): string | null {
  switch (policy) {
    case 'never':
      return null;
    case 'session':
      return null;
    case 'daily': {
      const next = new Date(fromTime);
      next.setDate(next.getDate() + 1);
      next.setHours(0, 0, 0, 0);
      return next.toISOString();
    }
    case 'weekly': {
      const next = new Date(fromTime);
      const day = next.getDay();
      const daysUntilMonday = day === 0 ? 1 : 8 - day;
      next.setDate(next.getDate() + daysUntilMonday);
      next.setHours(0, 0, 0, 0);
      return next.toISOString();
    }
    case 'monthly': {
      const next = new Date(fromTime);
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(0, 0, 0, 0);
      return next.toISOString();
    }
    case 'yearly': {
      const next = new Date(fromTime);
      next.setFullYear(next.getFullYear() + 1);
      next.setMonth(0);
      next.setDate(1);
      next.setHours(0, 0, 0, 0);
      return next.toISOString();
    }
    case 'custom':
      return null;
    default:
      return null;
  }
}

/**
 * Check if a quota should be reset based on its reset policy and last reset time.
 */
export function shouldReset(policy: ResetPolicy, lastResetAt: string | null, now: Date = new Date()): boolean {
  if (policy === 'never' || policy === 'session' || policy === 'custom') return false;
  if (!lastResetAt) return true;

  const lastReset = new Date(lastResetAt);
  const nextReset = calculateNextReset(policy, lastReset);
  if (!nextReset) return false;

  return now.getTime() >= new Date(nextReset).getTime();
}
