/**
 * types.ts — scan result, remediation preview, validation, and execution types.
 *
 * These types mirror the backend `DetectionFinding.to_dict()` and the
 * `scan_core.remediation.prepare` / `validate` / `execute` / `status` JSON-RPC responses.
 */

export interface ScanFinding {
  finding_id: string;
  display_name: string;
  rule_id: string;
  rule_category: string;
  severity: string;
  confidence: number;
  safety: string;
  reason: string;
  recommended_action: string;
  estimated_size: number;
  is_blocked: boolean;
  requires_review: boolean;
  is_actionable: boolean;
  canonical_path: string;
}

export interface ScanStatistics {
  assets_discovered?: number;
  assets_evaluated?: number;
  matches?: number;
  rules_evaluated?: number;
  actionable?: number;
  blocked?: number;
  review?: number;
  not_fixable?: number;
  [key: string]: unknown;
}

export interface RemediationPreview {
  request_id: string;
  approval_token: string;
  plan_id: string;
  total_actions: number;
  action_types: Record<string, number>;
  affected_targets: Array<{ display_name: string; path?: string } | string>;
  estimated_size: number;
  safety_state_counts: Record<string, number>;
  fixability_counts: Record<string, number>;
  backup_required: boolean;
  rollback_supported: boolean;
  warnings: string[];
  is_stale: boolean;
  generated_at: string;
}

export interface RemediationPrepareResponse {
  ok: boolean;
  preview?: RemediationPreview;
  error?: string | null;
}

export interface RemediationValidation {
  valid: boolean;
  status: string;
  total: number;
  completed: number;
  failed: number;
  rejected: number;
  requires_review: number;
  dry_run: boolean;
  warnings: string[];
  summary?: string;
}

export interface RemediationValidateResponse {
  ok: boolean;
  validation?: RemediationValidation;
  error?: string | null;
}

export type ExecutionStatus =
  | 'preparing'
  | 'validating'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export interface RemediationExecution {
  execution_id: string;
  request_id: string;
  plan_id: string;
  status: ExecutionStatus;
  total: number;
  completed: number;
  failed: number;
  rejected: number;
  skipped: number;
  requires_review: number;
  cancelled: boolean;
  dry_run: boolean;
  started_at?: string;
  completed_at?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface RemediationExecutionStatus {
  execution_id: string;
  plan_id: string;
  status: ExecutionStatus;
  total: number;
  completed: number;
  failed: number;
  rejected: number;
  skipped: number;
  requires_review: number;
  cancelled: boolean;
  dry_run: boolean;
  started_at?: string;
  completed_at?: string;
  reason?: string;
}

export interface RemediationExecuteResponse {
  ok: boolean;
  summary?: RemediationExecution;
  error?: string | null;
}

export interface RemediationStatusResponse {
  ok: boolean;
  status?: RemediationExecutionStatus;
  error?: string | null;
}

export interface RemediationCancelResponse {
  ok: boolean;
  cancelled?: boolean;
  error?: string | null;
}

export interface RollbackResult {
  action_id: string;
  backup_identity: string;
  success: boolean;
  reason?: string;
  restored_path?: string;
}

export interface RollbackSummary {
  execution_id: string;
  total: number;
  successful: number;
  failed: number;
  results: RollbackResult[];
  timestamp: string;
}

export interface RemediationRollbackResponse {
  ok: boolean;
  rollback?: RollbackSummary;
  error?: string | null;
}

export type ExecutionStep = 'executing' | 'completed' | 'partial' | 'failed' | 'cancelled';

export type RollbackStep =
  | 'idle'
  | 'confirm'
  | 'rollbacking'
  | 'success'
  | 'partial'
  | 'failed'
  | 'unavailable';
