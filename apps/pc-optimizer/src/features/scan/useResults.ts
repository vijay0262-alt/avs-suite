/**
 * useResults.ts — domain hook for the scan results / remediation execution flow.
 *
 * Manages finding selection, preview generation, validation, explicit approval,
 * and live execution with status polling.  It never calls orchestrator methods.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { remediationService } from './remediation.service';
import type {
  ScanFinding,
  ScanStatistics,
  RemediationPreview,
  RemediationValidation,
  RemediationExecution,
  RemediationExecutionStatus,
  RollbackStep,
  RollbackSummary,
} from './types';

export interface UseResultsOptions {
  planId?: string;
  findings: ScanFinding[];
  statistics: ScanStatistics;
}

export type ResultsStep =
  | 'results'
  | 'preview'
  | 'validating'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'error';

const TERMINAL_STATUSES = ['completed', 'partial', 'failed', 'cancelled'] as const;

function isTerminalStatus(status?: string): boolean {
  if (!status) return false;
  return TERMINAL_STATUSES.includes(status.toLowerCase() as typeof TERMINAL_STATUSES[number]);
}

export interface UseResultsReturn {
  step: ResultsStep;
  selectedIds: Set<string>;
  preview: RemediationPreview | null;
  validation: RemediationValidation | null;
  executionId: string | null;
  executionStatus: RemediationExecutionStatus | null;
  isCancelling: boolean;
  isRollbacking: boolean;
  rollbackStep: RollbackStep;
  rollbackSummary: RollbackSummary | null;
  rollbackError: string | null;
  error: string | null;
  toggleFinding: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  prepare: () => Promise<void>;
  validate: () => Promise<void>;
  approve: () => Promise<void>;
  cancelExecution: () => Promise<void>;
  initiateRollback: () => void;
  confirmRollback: () => Promise<void>;
  cancelRollback: () => void;
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
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<RemediationExecutionStatus | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rollbackStep, setRollbackStep] = useState<RollbackStep>('idle');
  const [rollbackSummary, setRollbackSummary] = useState<RollbackSummary | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [isRollbacking, setIsRollbacking] = useState(false);
  const hasRequestedExecution = useRef(false);
  const hasRequestedRollback = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const resetExecutionState = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setExecutionId(null);
    setExecutionStatus(null);
    setIsCancelling(false);
    hasRequestedExecution.current = false;
  }, []);

  const resetRollback = useCallback(() => {
    setRollbackStep('idle');
    setRollbackSummary(null);
    setRollbackError(null);
    setIsRollbacking(false);
    hasRequestedRollback.current = false;
  }, []);

  const goBack = useCallback(() => {
    setError(null);
    resetExecutionState();
    resetRollback();
    setStep('results');
  }, [resetExecutionState, resetRollback]);

  const prepare = useCallback(async () => {
    if (!planId) {
      setError('No remediation plan is available.');
      setStep('error');
      return;
    }
    setError(null);
    try {
      const response = await remediationService.prepare(planId);
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
      const response = await remediationService.validate(planId);
      if (response.ok === false || response.error) {
        throw new Error(response.error ?? 'Failed to validate remediation plan');
      }
      setValidation(response.validation ?? null);
      setStep('awaiting_approval');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate remediation plan');
      setStep('error');
    }
  }, [planId]);

  const approve = useCallback(async () => {
    if (hasRequestedExecution.current) {
      return;
    }
    if (!preview || !validation || validation.valid !== true) {
      setError('Approval requires a valid remediation plan and preview.');
      setStep('error');
      return;
    }
    hasRequestedExecution.current = true;
    setError(null);
    setIsCancelling(false);
    try {
      const response = await remediationService.execute(
        preview.plan_id,
        preview.request_id,
        preview.approval_token,
        'live',
      );
      if (response.ok === false || !response.summary) {
        throw new Error(response.error ?? 'Failed to start remediation execution');
      }
      const summary: RemediationExecution = response.summary;
      setExecutionId(summary.execution_id);
      setExecutionStatus(summary);
      if (isTerminalStatus(summary.status)) {
        setStep(summary.status as ResultsStep);
      } else {
        setStep('executing');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start remediation execution');
      setStep('error');
      hasRequestedExecution.current = false;
    }
  }, [preview, validation]);

  const cancelExecution = useCallback(async () => {
    if (!executionId) return;
    setIsCancelling(true);
    try {
      await remediationService.cancel(executionId);
    } catch {
      // Continue polling the backend until a terminal state is reported.
    }
  }, [executionId]);

  const rollbackAvailable = useCallback((): boolean => {
    if (!executionId || !executionStatus || !preview) return false;
    if (!isTerminalStatus(executionStatus.status)) return false;
    if (executionStatus.completed <= 0) return false;
    return preview.rollback_supported === true;
  }, [executionId, executionStatus, preview]);

  const initiateRollback = useCallback(() => {
    if (isRollbacking || hasRequestedRollback.current) return;
    if (rollbackStep !== 'idle') return;
    if (rollbackAvailable()) {
      setRollbackStep('confirm');
    } else {
      setRollbackStep('unavailable');
    }
  }, [isRollbacking, rollbackStep, rollbackAvailable]);

  const cancelRollback = useCallback(() => {
    if (rollbackStep === 'confirm') {
      setRollbackStep('idle');
    }
  }, [rollbackStep]);

  const confirmRollback = useCallback(async () => {
    if (hasRequestedRollback.current || isRollbacking || !executionId) return;
    if (!rollbackAvailable()) {
      setRollbackStep('unavailable');
      return;
    }
    hasRequestedRollback.current = true;
    setIsRollbacking(true);
    setRollbackStep('rollbacking');
    setRollbackError(null);
    try {
      const response = await remediationService.rollback(executionId);
      if (response.ok === false || !response.rollback) {
        const msg = response.error ?? 'Rollback failed';
        setRollbackError(msg);
        setRollbackStep(msg.toLowerCase().includes('unavailable') ? 'unavailable' : 'failed');
        setIsRollbacking(false);
        return;
      }
      const summary: RollbackSummary = response.rollback;
      setRollbackSummary(summary);
      if (summary.failed === 0 && summary.successful === summary.total) {
        setRollbackStep('success');
      } else if (summary.failed > 0 && summary.successful > 0) {
        setRollbackStep('partial');
      } else if (summary.failed > 0 && summary.successful === 0) {
        setRollbackStep('failed');
      } else {
        setRollbackStep('failed');
      }
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : 'Rollback request failed');
      setRollbackStep('failed');
    } finally {
      setIsRollbacking(false);
      // The single rollback attempt flag stays true to prevent double rollback.
    }
  }, [executionId, isRollbacking, rollbackAvailable]);

  // Poll execution status while an execution is active.
  useEffect(() => {
    if (!executionId || step !== 'executing') {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const response = await remediationService.status(executionId);
        if (response.ok === false || !response.status) {
          throw new Error(response.error ?? 'execution status unavailable');
        }
        const status = response.status;
        setExecutionStatus(status);
        if (isTerminalStatus(status.status)) {
          if (pollTimer.current) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
          }
          setIsCancelling(false);
          setStep(status.status as ResultsStep);
        }
      } catch (err) {
        if (pollTimer.current) {
          clearInterval(pollTimer.current);
          pollTimer.current = null;
        }
        setError(err instanceof Error ? err.message : 'execution status unavailable');
        setStep('error');
      }
    };

    void poll();
    pollTimer.current = setInterval(() => {
      void poll();
    }, 500);

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [executionId, step]);

  return {
    step,
    selectedIds,
    preview,
    validation,
    executionId,
    executionStatus,
    isCancelling,
    isRollbacking,
    rollbackStep,
    rollbackSummary,
    rollbackError,
    error,
    toggleFinding,
    selectAll,
    clearSelection,
    prepare,
    validate,
    approve,
    cancelExecution,
    initiateRollback,
    confirmRollback,
    cancelRollback,
    goBack,
  };
}
