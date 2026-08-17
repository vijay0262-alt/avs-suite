/**
 * scan.service.ts — frontend bridge to the scan-core RPC service.
 *
 * Uses the new `scan_core.scan.*` JSON-RPC methods directly. No call reaches
 * the OptimizationOrchestrator, so scans remain read-only.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface ScanStartResponse {
  session_id: string;
  started_at: string;
}

export interface ScanCancelResponse {
  session_id: string;
  cancelled: boolean;
}

export interface PersistedScanRecord {
  scan_id: string;
  scan_type: 'quick' | 'full' | string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  cancelled: boolean;
  completed: boolean;
  error_count: number;
  findings_count: number;
  action_plan_id: string | null;
  actionable_count: number;
  review_count: number;
  blocked_count: number;
  not_fixable_count: number;
  statistics: Record<string, unknown>;
}

export interface ScanLatestResponse {
  ok: boolean;
  latest: PersistedScanRecord | null;
  error?: string;
}

export interface ScanHistoryResponse {
  ok: boolean;
  history: PersistedScanRecord[];
  error?: string;
}

export interface PlanDetailsResponse {
  ok: boolean;
  plan_id?: string;
  generated_at?: string;
  is_stale?: boolean;
  statistics?: Record<string, unknown>;
  findings?: Record<string, unknown>[];
  error?: string;
}

export interface SmartOptimizationPlanResponse {
  ok: boolean;
  plan_id?: string;
  total_actions?: number;
  auto_fixable?: number;
  review_required?: number;
  not_fixable?: number;
  estimated_affected_size?: number | null;
  statistics?: { converted: number; unsupported: number; errors: number };
  error?: string;
}

export interface SecurityRemediationPlanResponse {
  ok: boolean;
  plan_id?: string;
  total_actions?: number;
  auto_fixable?: number;
  review_required?: number;
  not_fixable?: number;
  estimated_affected_size?: number | null;
  statistics?: { converted: number; unsupported: number; errors: number };
  error?: string;
}

export interface ScanService {
  scan_quick(scope?: string[]): Promise<ScanStartResponse>;
  scan_full(scope?: string[]): Promise<ScanStartResponse>;
  cancel_scan(sessionId: string): Promise<ScanCancelResponse>;
  status(sessionId: string): Promise<Record<string, unknown>>;
  result(sessionId: string): Promise<Record<string, unknown>>;
  latest(): Promise<ScanLatestResponse>;
  history(limit?: number): Promise<ScanHistoryResponse>;
  plan_details(planId: string): Promise<PlanDetailsResponse>;
  smart_optimization_plan(actions: Record<string, unknown>[]): Promise<SmartOptimizationPlanResponse>;
  security_remediation_plan(actions: Record<string, unknown>[]): Promise<SecurityRemediationPlanResponse>;
}

export const scanService: ScanService = {
  scan_quick: (scope?: string[]) => client().call(RPC_METHODS.SCAN_CORE_SCAN_QUICK, { scope }),
  scan_full: (scope?: string[]) => client().call(RPC_METHODS.SCAN_CORE_SCAN_FULL, { scope }),
  cancel_scan: (sessionId: string) => client().call(RPC_METHODS.SCAN_CORE_SCAN_CANCEL, { session_id: sessionId }),
  status: (sessionId: string) => client().call(RPC_METHODS.SCAN_CORE_SCAN_STATUS, { session_id: sessionId }),
  result: (sessionId: string) => client().call(RPC_METHODS.SCAN_CORE_SCAN_RESULT, { session_id: sessionId }),
  latest: () => client().call(RPC_METHODS.SCAN_CORE_SCAN_LATEST, {}) as Promise<ScanLatestResponse>,
  history: (limit?: number) => client().call(RPC_METHODS.SCAN_CORE_SCAN_HISTORY, { limit: limit ?? 10 }) as Promise<ScanHistoryResponse>,
  plan_details: (planId: string) => client().call(RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS, { plan_id: planId }) as Promise<PlanDetailsResponse>,
  smart_optimization_plan: (actions: Record<string, unknown>[]) =>
    client().call(RPC_METHODS.SCAN_CORE_SMART_OPTIMIZATION_PLAN, { actions }) as Promise<SmartOptimizationPlanResponse>,
  security_remediation_plan: (actions: Record<string, unknown>[]) =>
    client().call(RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_PLAN, { actions }) as Promise<SecurityRemediationPlanResponse>,
};
