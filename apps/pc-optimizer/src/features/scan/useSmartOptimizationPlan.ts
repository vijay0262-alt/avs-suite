/**
 * useSmartOptimizationPlan — creates a canonical ActionPlan from Smart
 * Optimization analysis output via the scan_core.smart_optimization.plan RPC.
 *
 * Planning-only: never executes remediation. Returns a backend-generated
 * plan_id that can be passed to PlanReviewView for the canonical
 * prepare → validate → approve → execute → rollback flow.
 *
 * Concurrency: a ref guard prevents duplicate plan creation from
 * double-clicks or rapid re-submissions.
 */
import { useCallback, useRef, useState } from 'react';
import { scanService, type SmartOptimizationPlanResponse } from './scan.service';

export interface UseSmartOptimizationPlanReturn {
  planId: string | null;
  isCreating: boolean;
  error: string | null;
  response: SmartOptimizationPlanResponse | null;
  createPlan: (actions: Record<string, unknown>[]) => Promise<string | null>;
  reset: () => void;
}

export function useSmartOptimizationPlan(): UseSmartOptimizationPlanReturn {
  const [planId, setPlanId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SmartOptimizationPlanResponse | null>(null);
  const isCreatingRef = useRef(false);

  const createPlan = useCallback(
    async (actions: Record<string, unknown>[]): Promise<string | null> => {
      if (isCreatingRef.current) {
        return null;
      }
      if (!actions || actions.length === 0) {
        setError('No optimization actions to review.');
        return null;
      }
      isCreatingRef.current = true;
      setIsCreating(true);
      setError(null);
      try {
        const res = await scanService.smart_optimization_plan(actions);
        if (!res.ok || !res.plan_id) {
          const msg = res.error ?? 'Failed to create optimization plan';
          setError(msg);
          setResponse(res);
          return null;
        }
        setPlanId(res.plan_id);
        setResponse(res);
        return res.plan_id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create optimization plan';
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
