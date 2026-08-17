/**
 * useDashboardOptimizationPlan — creates a canonical ActionPlan from Dashboard
 * One-Click Optimize preview actions via the scan_core.dashboard_optimization.plan
 * RPC (SC-8C13 Phase 2 backend).
 *
 * Planning-only: never executes remediation. Returns a backend-generated
 * plan_id that can be passed to PlanReviewView for the canonical
 * prepare → validate → approve → execute → rollback flow.
 *
 * Concurrency: a ref guard prevents duplicate plan creation from
 * double-clicks or rapid re-submissions.
 *
 * Privacy: only the minimum fields required by the backend adapter are
 * serialized. No canonical_path, asset_id, backup_location, registry keys,
 * browser profile paths, raw evidence, executable commands, PowerShell,
 * shell commands, or internal target payloads are sent beyond what the
 * adapter genuinely requires for planning.
 */
import { useCallback, useRef, useState } from 'react';
import { scanService, type DashboardOptimizationPlanResponse } from './scan.service';

export interface UseDashboardOptimizationPlanReturn {
  planId: string | null;
  isCreating: boolean;
  error: string | null;
  response: DashboardOptimizationPlanResponse | null;
  createPlan: (actions: Record<string, unknown>[]) => Promise<string | null>;
  reset: () => void;
}

export function useDashboardOptimizationPlan(): UseDashboardOptimizationPlanReturn {
  const [planId, setPlanId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<DashboardOptimizationPlanResponse | null>(null);
  const isCreatingRef = useRef(false);

  const createPlan = useCallback(
    async (actions: Record<string, unknown>[]): Promise<string | null> => {
      if (isCreatingRef.current) {
        return null;
      }
      if (!actions || actions.length === 0) {
        setError('No dashboard optimization actions to review.');
        return null;
      }
      isCreatingRef.current = true;
      setIsCreating(true);
      setError(null);
      try {
        const res = await scanService.dashboard_optimization_plan(actions);
        if (!res.ok || !res.plan_id) {
          const msg = res.error ?? 'Failed to create dashboard optimization plan';
          setError(msg);
          setResponse(res);
          return null;
        }
        setPlanId(res.plan_id);
        setResponse(res);
        return res.plan_id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create dashboard optimization plan';
        setError(msg);
        return null;
      } finally {
        isCreatingRef.current = false;
        setIsCreating(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    if (isCreatingRef.current) return;
    setPlanId(null);
    setError(null);
    setResponse(null);
  }, []);

  return {
    planId,
    isCreating,
    error,
    response,
    createPlan,
    reset,
  };
}
