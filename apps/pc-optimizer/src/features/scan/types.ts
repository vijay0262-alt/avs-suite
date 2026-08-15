/**
 * types.ts — scan result, remediation preview, and validation types.
 *
 * These types mirror the backend `DetectionFinding.to_dict()` and the
 * `scan_core.remediation.prepare` / `validate` JSON-RPC responses.
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
