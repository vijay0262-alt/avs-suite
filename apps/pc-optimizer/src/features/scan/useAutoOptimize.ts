/**
 * useAutoOptimize — manages the one-click auto-optimization workflow.
 *
 * After a scan completes with findings, this hook:
 *   1. Calls `scan_core.dashboard.auto_optimize` to start the pipeline.
 *   2. Polls `scan_core.dashboard.auto_optimize_status` for progress.
 *   3. Exposes the optimization phase, progress, and cleanup results.
 *
 * Safety is NOT bypassed:
 *   - The backend chains prepare → validate → execute (live).
 *   - The SafetyGate evaluates every action.
 *   - Only APPROVED actions are executed.
 *   - REQUIRES_REVIEW and REJECTED actions are skipped and counted.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { remediationService } from './remediation.service';
import type {
  AutoOptimizePhase,
  AutoOptimizeResult,
  AutoOptimizeStatus,
} from './types';

export interface UseAutoOptimizeReturn {
  /** True when auto-optimization is running. */
  isRunning: boolean;
  /** Current optimization phase. */
  phase: AutoOptimizePhase | 'idle';
  /** Human-readable status message from the backend. */
  message: string;
  /** Total actions in the plan. */
  totalActions: number;
  /** Actions classified as safe (APPROVED by SafetyGate). */
  safeActions: number;
  /** Actions requiring manual review. */
  reviewRequired: number;
  /** Actions blocked by safety. */
  blocked: number;
  /** Final result when optimization completes. */
  result: AutoOptimizeResult | null;
  /** Verification status: 'passed' | 'partial' | 'failed' | null. */
  verificationStatus: string | null;
  /** Error message if optimization failed. */
  error: string | null;
  /** Number of actions executed so far. */
  executionProgress: number;
  /** Total actions to execute. */
  executionTotal: number;
  /** Current file path being cleaned. */
  currentFile: string;
  /** Current cleanup category being cleaned (e.g. "Temporary Files"). */
  currentCategory: string;
  /** Overall progress percentage (0-100). */
  overallProgress: number;
  /** Live space recovered in bytes during execution. */
  spaceRecovered: number;
  /** Start auto-optimization for a plan. */
  startAutoOptimize: (planId: string) => Promise<void>;
  /** Cancel the running optimization. */
  cancelAutoOptimize: () => void;
  /** Reset to idle state. */
  reset: () => void;
}

const POLL_INTERVAL_MS = 500;

export function useAutoOptimize(): UseAutoOptimizeReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<AutoOptimizePhase | 'idle'>('idle');
  const [message, setMessage] = useState('');
  const [totalActions, setTotalActions] = useState(0);
  const [safeActions, setSafeActions] = useState(0);
  const [reviewRequired, setReviewRequired] = useState(0);
  const [blocked, setBlocked] = useState(0);
  const [result, setResult] = useState<AutoOptimizeResult | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [executionTotal, setExecutionTotal] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [currentCategory, setCurrentCategory] = useState('');
  const [overallProgress, setOverallProgress] = useState(0);
  const [spaceRecovered, setSpaceRecovered] = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid) {
      void remediationService.autoOptimizeCancel(sid);
    }
    sessionIdRef.current = null;
    if (cancelTimeoutRef.current) {
      clearTimeout(cancelTimeoutRef.current);
      cancelTimeoutRef.current = null;
    }
    stopPoll();
    setIsRunning(false);
    setPhase('idle');
    setMessage('');
    setTotalActions(0);
    setSafeActions(0);
    setReviewRequired(0);
    setBlocked(0);
    setResult(null);
    setVerificationStatus(null);
    setError(null);
    setExecutionProgress(0);
    setExecutionTotal(0);
    setCurrentFile('');
    setCurrentCategory('');
    setOverallProgress(0);
    setSpaceRecovered(0);
  }, [stopPoll]);

  const processStatus = useCallback((status: AutoOptimizeStatus) => {
    if (!status.ok) {
      setError(status.error ?? 'Optimization status unavailable');
      setIsRunning(false);
      stopPoll();
      return;
    }

    setPhase(status.phase);
    setMessage(status.message);
    setTotalActions(status.total_actions);
    setSafeActions(status.safe_actions);
    setReviewRequired(status.review_required);
    setBlocked(status.blocked);

    // Update execution progress fields
    if (status.execution_progress !== undefined) {
      setExecutionProgress(status.execution_progress);
    }
    if (status.execution_total !== undefined) {
      setExecutionTotal(status.execution_total);
    }
    if (status.current_file !== undefined) {
      setCurrentFile(status.current_file);
    }
    const statusAny = status as unknown as Record<string, unknown>;
    if (statusAny.current_category !== undefined) {
      setCurrentCategory(String(statusAny.current_category));
    }
    if (status.overall_progress !== undefined) {
      setOverallProgress(status.overall_progress);
    }
    if (status.space_recovered !== undefined) {
      setSpaceRecovered(Number(status.space_recovered) || 0);
    }

    if (status.error) {
      setError(status.error);
    }

    if (status.verification_status) {
      setVerificationStatus(status.verification_status);
    }

    if (status.result) {
      setResult(status.result);
    }

    if (status.completed) {
      if (cancelTimeoutRef.current) {
        clearTimeout(cancelTimeoutRef.current);
        cancelTimeoutRef.current = null;
      }
      setIsRunning(false);
      stopPoll();
      if (status.phase === 'error') {
        setError(status.error ?? 'Optimization failed');
      }
    }

    if (status.cancelled && !status.completed) {
      // Wait for completion flag — the backend will set completed=true
      // after the cancellation is processed.
    }
  }, [stopPoll]);

  const startPoll = useCallback((sessionId: string) => {
    stopPoll();
    const poll = async () => {
      try {
        const status = await remediationService.autoOptimizeStatus(sessionId);
        processStatus(status);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to poll optimization status');
        setIsRunning(false);
        stopPoll();
      }
    };
    void poll();
    pollIntervalRef.current = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
  }, [processStatus, stopPoll]);

  const startAutoOptimize = useCallback(async (planId: string) => {
    if (!planId || sessionIdRef.current) return;

    setIsRunning(true);
    setPhase('starting');
    setMessage('Starting optimization...');
    setError(null);
    setResult(null);
    setVerificationStatus(null);

    try {
      const response = await remediationService.autoOptimize(planId);
      if (response.ok === false || !response.session_id) {
        throw new Error(response.error ?? 'Failed to start optimization');
      }
      sessionIdRef.current = response.session_id;
      startPoll(response.session_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start optimization');
      setIsRunning(false);
      setPhase('error');
    }
  }, [startPoll]);

  const cancelAutoOptimize = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid) {
      void remediationService.autoOptimizeCancel(sid);
      // Safety timeout: if backend doesn't set completed=true within 10s,
      // force the cancelled state locally to avoid being stuck.
      cancelTimeoutRef.current = setTimeout(() => {
        stopPoll();
        setIsRunning(false);
        setPhase('cancelled');
        setMessage('Optimization cancelled');
        sessionIdRef.current = null;
      }, 10000);
    }
  }, [stopPoll]);

  useEffect(() => {
    return () => {
      stopPoll();
      if (cancelTimeoutRef.current) {
        clearTimeout(cancelTimeoutRef.current);
      }
    };
  }, [stopPoll]);

  return {
    isRunning,
    phase,
    message,
    totalActions,
    safeActions,
    reviewRequired,
    blocked,
    result,
    verificationStatus,
    error,
    executionProgress,
    executionTotal,
    currentFile,
    currentCategory,
    overallProgress,
    spaceRecovered,
    startAutoOptimize,
    cancelAutoOptimize,
    reset,
  };
}
