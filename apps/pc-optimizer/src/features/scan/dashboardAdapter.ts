/**
 * dashboardAdapter.ts — read-only adapter from canonical in-memory and persisted
 * scan state to a dashboard-facing snapshot.
 *
 * All values are derived from the backend-provided scan result, ActionPlan,
 * and RemediationCoordinator state. The adapter does NOT compute safety,
 * actionability, or health scores locally.
 */
import type { AppScanSession, AppScanStatus, AppRemediationStatus } from './unifiedScanState';
import type { ScanStatistics } from './types';
import type { PersistedScanRecord } from './scan.service';

export interface DashboardScanSnapshot {
  hasActiveSession: boolean;
  module: 'protection' | 'optimize' | 'security' | null;
  moduleName: string;
  moduleRoute: string;
  scanStatus: AppScanStatus | 'idle';
  remediationStatus: AppRemediationStatus;
  startedAt: string | null;
  completedAt: string | null;
  issuesFound: number;
  actionableCount: number;
  blockedCount: number;
  reviewCount: number;
  notFixableCount: number;
  planId: string | null;
  executionId: string | null;
  rollbackAvailable: boolean;
  canReview: boolean;
  canApprove: boolean;
  canRollback: boolean;
  error: string | null;
  cleanupResult: {
    detected: number;
    cleaned: number;
    remaining: number;
    failed: number;
    reviewRequired: number;
    spaceRecovered: number;
    healthBefore?: number;
    healthAfter?: number;
    verificationStatus?: string;
  } | null;
}

const MODULE_ROUTE: Record<'protection' | 'optimize' | 'security', string> = {
  protection: '/protection-center',
  optimize: '/ai-smart-optimize',
  security: '/ai-smart-security',
};

const MODULE_LABEL: Record<'protection' | 'optimize' | 'security' | 'unknown', string> = {
  protection: 'AI Protection Center',
  optimize: 'AI Smart Optimize',
  security: 'AI Smart Security',
  unknown: 'Last Unified Scan',
};

function getCount(statistics: ScanStatistics | Record<string, unknown> | undefined, key: string): number {
  if (!statistics) return 0;
  const value = (statistics as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : 0;
}

function isTerminal(status: AppRemediationStatus): boolean {
  return [
    'completed',
    'partial',
    'failed',
    'cancelled',
    'rejected',
    'rollback_success',
    'rollback_partial',
    'rollback_failed',
    'rollback_unavailable',
  ].includes(status);
}

function buildIdleSnapshot(): DashboardScanSnapshot {
  return {
    hasActiveSession: false,
    module: null,
    moduleName: 'Unified Scan',
    moduleRoute: '/ai-smart-optimize',
    scanStatus: 'idle',
    remediationStatus: 'none',
    startedAt: null,
    completedAt: null,
    issuesFound: 0,
    actionableCount: 0,
    blockedCount: 0,
    reviewCount: 0,
    notFixableCount: 0,
    planId: null,
    executionId: null,
    rollbackAvailable: false,
    canReview: false,
    canApprove: false,
    canRollback: false,
    error: null,
    cleanupResult: null,
  };
}

function buildSnapshot(
  module: 'protection' | 'optimize' | 'security' | 'unknown',
  status: AppScanStatus | 'idle',
  remediationStatus: AppRemediationStatus,
  startedAt: string | null,
  completedAt: string | null,
  statistics: ScanStatistics | Record<string, unknown> | undefined,
  planId: string | null,
  executionId: string | null,
  rollbackSupported: boolean | undefined,
  execution: { completed?: number } | undefined,
  rollbackSummary: unknown | undefined,
  error: string | null,
  cleanupResult: Record<string, unknown> | null = null,
): DashboardScanSnapshot {
  const issuesFound = getCount(statistics, 'matches');
  const actionableCount = getCount(statistics, 'actionable');
  const blockedCount = getCount(statistics, 'blocked');
  const reviewCount = getCount(statistics, 'review');
  const notFixableCount = getCount(statistics, 'not_fixable');

  const canReview =
    (status === 'complete' && issuesFound > 0 && Boolean(planId)) ||
    (status === 'complete' && issuesFound > 0 && actionableCount > 0 && Boolean(planId));

  const canApprove = remediationStatus === 'awaiting_approval';

  const completedActions = execution?.completed ?? 0;
  const rollbackAvailable =
    rollbackSupported === true &&
    isTerminal(remediationStatus) &&
    completedActions > 0 &&
    !rollbackSummary;

  const canRollback =
    rollbackSupported === true &&
    isTerminal(remediationStatus) &&
    completedActions > 0;

  // Map cleanup_result from backend format to frontend format
  let mappedCleanupResult: DashboardScanSnapshot['cleanupResult'] = null;
  if (cleanupResult && typeof cleanupResult === 'object') {
    mappedCleanupResult = {
      detected: typeof cleanupResult.detected === 'number' ? cleanupResult.detected : 0,
      cleaned: typeof cleanupResult.cleaned === 'number' ? cleanupResult.cleaned : 0,
      remaining: typeof cleanupResult.remaining === 'number' ? cleanupResult.remaining : 0,
      failed: typeof cleanupResult.failed === 'number' ? cleanupResult.failed : 0,
      reviewRequired: typeof cleanupResult.review_required === 'number' ? cleanupResult.review_required : 0,
      spaceRecovered: typeof cleanupResult.space_recovered === 'number' ? cleanupResult.space_recovered : 0,
      healthBefore: typeof cleanupResult.health_before === 'number' ? cleanupResult.health_before : undefined,
      healthAfter: typeof cleanupResult.health_after === 'number' ? cleanupResult.health_after : undefined,
      verificationStatus: typeof cleanupResult.verification_status === 'string' ? cleanupResult.verification_status : undefined,
    };
  }

  return {
    hasActiveSession: status !== 'idle',
    module: module === 'unknown' ? null : module,
    moduleName: MODULE_LABEL[module],
    moduleRoute: module === 'unknown' ? '/ai-smart-optimize' : MODULE_ROUTE[module],
    scanStatus: status,
    remediationStatus,
    startedAt,
    completedAt,
    issuesFound,
    actionableCount,
    blockedCount,
    reviewCount,
    notFixableCount,
    planId,
    executionId,
    rollbackAvailable,
    canReview,
    canApprove,
    canRollback,
    error,
    cleanupResult: mappedCleanupResult,
  };
}

export function toDashboardSnapshot(session: AppScanSession | null): DashboardScanSnapshot;
export function toDashboardSnapshot(record: PersistedScanRecord | null): DashboardScanSnapshot;
export function toDashboardSnapshot(
  input: AppScanSession | PersistedScanRecord | null,
): DashboardScanSnapshot {
  if (!input) {
    return buildIdleSnapshot();
  }

  if ('sessionId' in input) {
    const session = input as AppScanSession;
    const status = session.status;
    return buildSnapshot(
      session.module,
      status,
      session.remediationStatus,
      session.startedAt,
      session.completedAt ?? null,
      session.statistics,
      session.planId ?? null,
      session.executionId ?? null,
      session.rollbackSupported,
      session.execution,
      session.rollbackSummary,
      session.error,
      null, // cleanup_result not available in active session
    );
  }

  const record = input as PersistedScanRecord;
  const status: AppScanStatus | 'idle' = record.completed
    ? 'complete'
    : record.cancelled
      ? 'cancelled'
      : record.error_count > 0
        ? 'error'
        : 'idle';

  return buildSnapshot(
    'unknown',
    status,
    'none',
    record.started_at,
    record.completed_at,
    record.statistics,
    record.action_plan_id,
    null,
    undefined,
    undefined,
    undefined,
    record.error_count > 0 ? 'Scan completed with errors' : null, // error
    record.cleanup_result || null, // cleanup_result from persisted scan history
  );
}
