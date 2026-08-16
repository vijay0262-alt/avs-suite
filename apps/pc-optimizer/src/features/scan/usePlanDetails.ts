/**
 * usePlanDetails.ts — read-only hook that loads a persisted ActionPlan by
 * plan_id and maps it to the sanitized finding/statistics contract used by
 * ResultsView.
 *
 * The hook never executes, prepares, or modifies the plan. It only hydrates
 * the review UI from scan_core persistence.
 */
import { useEffect, useState, useCallback } from 'react';
import { scanService, type PlanDetailsResponse } from './scan.service';
import type { ScanFinding, ScanStatistics } from './types';

export interface UsePlanDetailsReturn {
  loading: boolean;
  error: string | null;
  planId: string | null;
  findings: ScanFinding[];
  statistics: ScanStatistics;
  isStale: boolean;
  refresh: () => void;
}

function toFindings(raw?: Record<string, unknown>[]): ScanFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    finding_id: String(item.finding_id ?? ''),
    display_name: String(item.display_name ?? 'Finding'),
    rule_id: String(item.rule_id ?? ''),
    rule_category: String(item.rule_category ?? 'unknown'),
    severity: String(item.severity ?? 'medium'),
    confidence: typeof item.confidence === 'number' ? item.confidence : 1.0,
    safety: String(item.safety ?? 'unknown'),
    reason: String(item.reason ?? ''),
    recommended_action: String(item.recommended_action ?? ''),
    estimated_size: typeof item.estimated_size === 'number' ? item.estimated_size : 0,
    is_blocked: item.is_blocked === true,
    requires_review: item.requires_review === true,
    is_actionable: item.is_actionable === true,
    canonical_path: '',
  }));
}

function toStatistics(raw?: Record<string, unknown>): ScanStatistics {
  if (!raw || typeof raw !== 'object') return {};
  return {
    matches: typeof raw.matches === 'number' ? raw.matches : 0,
    actionable: typeof raw.actionable === 'number' ? raw.actionable : 0,
    blocked: typeof raw.blocked === 'number' ? raw.blocked : 0,
    review: typeof raw.review === 'number' ? raw.review : 0,
    not_fixable: typeof raw.not_fixable === 'number' ? raw.not_fixable : 0,
    assets_discovered: typeof raw.total_findings === 'number' ? raw.total_findings : 0,
    assets_evaluated: typeof raw.actions_planned === 'number' ? raw.actions_planned : 0,
    rules_evaluated: typeof raw.actions_planned === 'number' ? raw.actions_planned : 0,
    estimated_affected_size: raw.estimated_affected_size,
    generated_at: raw.generated_at,
    ...raw,
  };
}

export function usePlanDetails(planId: string | null | undefined): UsePlanDetailsReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [statistics, setStatistics] = useState<ScanStatistics>({});
  const [isStale, setIsStale] = useState(false);

  const load = useCallback(async () => {
    if (!planId) {
      setError('No plan ID provided.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response: PlanDetailsResponse = await scanService.plan_details(planId);
      if (!response.ok || response.error) {
        throw new Error(response.error ?? 'Plan details unavailable');
      }
      if (!response.findings) {
        throw new Error('Plan details returned no findings');
      }
      setFindings(toFindings(response.findings as Record<string, unknown>[]));
      setStatistics(toStatistics(response.statistics as Record<string, unknown>));
      setIsStale(response.is_stale ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan details');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    error,
    planId: planId ?? null,
    findings,
    statistics,
    isStale,
    refresh: load,
  };
}
