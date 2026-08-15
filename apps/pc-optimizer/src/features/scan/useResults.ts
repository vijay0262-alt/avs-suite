/**
 * useResults.ts — domain hook for the scan results / remediation preview flow.
 *
 * Manages finding selection, preview generation, and validation.  It never
 * calls `scan_core.remediation.execute`.
 */
import { useCallback, useMemo, useState } from 'react';
import { remediationService } from './remediation.service';
import type { ScanFinding, ScanStatistics, RemediationPreview, RemediationValidation } from './types';

export interface UseResultsOptions {
  planId?: string;
  findings: ScanFinding[];
  statistics: ScanStatistics;
}

export type ResultsStep = 'results' | 'preview' | 'validating' | 'validated' | 'error';

export interface UseResultsReturn {
  step: ResultsStep;
  selectedIds: Set<string>;
  preview: RemediationPreview | null;
  validation: RemediationValidation | null;
  error: string | null;
  toggleFinding: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  prepare: () => Promise<void>;
  validate: () => Promise<void>;
  goBack: () => void;
}

function isActionable(finding: ScanFinding): boolean {
  return finding.is_actionable === true && !finding.is_blocked && !finding.requires_review;
}

export function useResults({ planId, findings, statistics: _statistics }: UseResultsOptions): UseResultsReturn {
  const [step, setStep] = useState<ResultsStep>('results');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<RemediationPreview | null>(null);
  const [validation, setValidation] = useState<RemediationValidation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actionable = useMemo(
    () => findings.filter(isActionable),
    [findings],
  );

  const toggleFinding = useCallback(
    (id: string) => {
      const finding = findings.find((f) => f.finding_id === id);
      if (!finding || !isActionable(finding)) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [findings],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(actionable.map((f) => f.finding_id)));
  }, [actionable]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const goBack = useCallback(() => {
    setError(null);
    setStep('results');
  }, []);

  const prepare = useCallback(async () => {
    if (!planId) {
      setError('No remediation plan is available.');
      setStep('error');
      return;
    }
    setError(null);
    try {
      const response = (await remediationService.prepare(planId)) as {
        ok?: boolean;
        preview?: RemediationPreview;
        error?: string | null;
      };
      if (response.ok === false || response.error) {
        throw new Error(response.error ?? 'Failed to prepare remediation preview');
      }
      setPreview(response.preview ?? null);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare remediation preview');
      setStep('error');
    }
  }, [planId]);

  const validate = useCallback(async () => {
    if (!planId) {
      setError('No remediation plan is available.');
      setStep('error');
      return;
    }
    setError(null);
    setStep('validating');
    try {
      const response = (await remediationService.validate(planId)) as {
        ok?: boolean;
        validation?: RemediationValidation;
        error?: string | null;
      };
      if (response.ok === false || response.error) {
        throw new Error(response.error ?? 'Failed to validate remediation plan');
      }
      setValidation(response.validation ?? null);
      setStep('validated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate remediation plan');
      setStep('error');
    }
  }, [planId]);

  return {
    step,
    selectedIds,
    preview,
    validation,
    error,
    toggleFinding,
    selectAll,
    clearSelection,
    prepare,
    validate,
    goBack,
  };
}
