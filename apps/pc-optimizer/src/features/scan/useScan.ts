/**
 * useScan.ts — domain hook that wires the unified scan UI to the real
 * scan-core backend via `scan_core.scan.*` RPC methods.
 *
 * - Owns the `sessionId` ref.
 * - Polls `scanService.scan_status(sessionId)` every 500ms.
 * - Maps the scan-core `ScanProgress` shape to `UnifiedScanLiveStatus`.
 * - Stops polling on completion, cancellation, or error.
 * - Never generates fake progress.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { scanService } from './scan.service';
import { buildScanReport } from './reportBuilder';
import { unifiedScanState } from './unifiedScanState';
import type { ScanStatistics } from './types';
import { useUnifiedScan } from '../unified-scan/useUnifiedScan';
import type { UseUnifiedScanReturn } from '../unified-scan/useUnifiedScan';
import type {
  UnifiedScanModuleConfig,
  UnifiedScanTreeNode,
} from '../unified-scan/unifiedScanTypes';
import type { ActivityEntry } from '../unified-scan/components/ActivityStream';
import type { CurrentOperationCardProps } from '../unified-scan/components/CurrentOperationCard';

export interface UseScanOptions {
  mode?: 'quick' | 'full';
  config: UnifiedScanModuleConfig;
  /** V1.0: Identifies the entry point — "dashboard" or "smart_optimize" — for edition gating. */
  source?: string;
}

export interface UseScanReturn extends Omit<UseUnifiedScanReturn, 'startScan' | 'cancelScan'> {
  startScan: () => Promise<void>;
  cancelScan: () => void;
  reset: () => void;
  sessionId: string | null;
  result: Record<string, unknown> | null;
  activityLog: ActivityEntry[];
  currentOperation: CurrentOperationCardProps | null;
}

interface ScanStatusResponse {
  ok: boolean;
  progress?: Record<string, unknown> | null;
  completed?: boolean;
  cancelled?: boolean;
  error?: string | null;
}

function toAppModule(configId: string): 'protection' | 'optimize' | 'security' {
  if (configId === 'protection-center') return 'protection';
  if (configId === 'security') return 'security';
  return 'optimize';
}

function getProgressValue<T>(progress: Record<string, unknown> | null | undefined, key: string, fallback: T): T {
  const value = progress?.[key];
  if (value === undefined || value === null) return fallback;
  return value as T;
}

function mapStatusCounters(
  progress: Record<string, unknown> | null | undefined,
  config: UnifiedScanModuleConfig,
): Record<string, number> {
  // These field names match the backend's ScanProgress.to_dict() output:
  //   scan_id, phase, current_operation, assets_discovered, assets_evaluated,
  //   findings, actions_available, elapsed_time_ms, is_cancelled, completion_percent
  const counters: Record<string, number> = {
    filesScanned: getProgressValue<number>(progress, 'assets_discovered', 0),
    itemsScanned: getProgressValue<number>(progress, 'assets_evaluated', 0),
    recommendations: getProgressValue<number>(progress, 'findings', 0),
    actionsAvailable: getProgressValue<number>(progress, 'actions_available', 0),
    elapsedMs: getProgressValue<number>(progress, 'elapsed_time_ms', 0),
    // V1.0 Protection Center: separate security counters.
    confirmedThreats: getProgressValue<number>(progress, 'confirmed_threats', 0),
    suspiciousItems: getProgressValue<number>(progress, 'suspicious_items', 0),
    threatsSecured: getProgressValue<number>(progress, 'threats_secured', 0),
    threatsRemaining: getProgressValue<number>(progress, 'threats_remaining', 0),
    // Legacy counter aliases for backward compatibility with other configs.
    threatsFound: getProgressValue<number>(progress, 'confirmed_threats', 0),
    threatsChecked: getProgressValue<number>(progress, 'assets_discovered', 0),
    // V1.0: Direct cleanup counters — bytes recovered from backend.
    storageRecovered: getProgressValue<number>(progress, 'bytes_recovered', 0),
    bytesRecovered: getProgressValue<number>(progress, 'bytes_recovered', 0),
    memoryRecovery: 0,
    startupImprovement: 0,
  };

  // V1.0: Populate config-specific counters using backendCounterMap.
  // This ensures Security and Protection counters update during scan.
  if (config.backendCounterMap) {
    for (const [counterId, backendField] of Object.entries(config.backendCounterMap)) {
      const rawValue = getProgressValue<number>(progress, backendField, 0);
      // For aiConfidence mapped to completion_percent, convert to 0-100 percent.
      if (counterId === 'aiConfidence' && backendField === 'completion_percent') {
        counters[counterId] = Math.min(100, Math.max(0, rawValue));
      } else {
        counters[counterId] = rawValue;
      }
    }
  }

  return counters;
}

function mapCurrentOperation(
  progress: Record<string, unknown> | null | undefined,
  elapsedMs: number,
): CurrentOperationCardProps {
  return {
    currentModule: getProgressValue<string | null>(progress, 'phase', null),
    currentOperation: getProgressValue<string | null>(progress, 'current_operation', null),
    // The backend's ProgressEvent (from the enumerator) includes current_folder.
    // We surface it as currentPath so the user can see what is being scanned.
    currentPath: getProgressValue<string | null>(progress, 'current_folder', null),
    itemsProcessed: getProgressValue<number>(progress, 'assets_evaluated', 0),
    itemsRemaining: 0,
    bytesRecovered: 0,
    elapsedMs,
    overallProgress: getProgressValue<number>(progress, 'completion_percent', 0),
  };
}

export function useScan({ mode = 'full', config, source }: UseScanOptions): UseScanReturn {
  const {
    startScan: hookStartScan,
    reset: hookReset,
    ...scan
  } = useUnifiedScan({ config });

  const sessionIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [currentOperation, setCurrentOperation] = useState<CurrentOperationCardProps | null>(null);

  const stopPoll = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid) {
      void scanService.cancel_scan(sid);
    }
    sessionIdRef.current = null;
    startingRef.current = false;
    stopPoll();
    setResult(null);
    hookReset();
  }, [hookReset, stopPoll]);

  const handleComplete = useCallback(
    async (sid: string) => {
      stopPoll();
      try {
        const response = (await scanService.result(sid)) as { ok?: boolean; result?: Record<string, unknown>; error?: string };
        if (response.ok === false || response.error) {
          throw new Error(response.error ?? 'Failed to fetch scan result');
        }
        const result = response.result ?? null;
        setResult(result);
        const report = buildScanReport(config.moduleName, result ?? {});
        scan.completeScan(report);

        const rawStats = result?.statistics;
        const statistics = typeof rawStats === 'object' && rawStats !== null
          ? (rawStats as ScanStatistics)
          : ({} as ScanStatistics);
        const planId =
          (result?.action_plan_id as string | undefined) ??
          (report.planId as string | undefined) ??
          undefined;

        // V1.0: Extract cleanup_summary from the scan result.
        // For direct cleanup (quick scan), the cleanup already happened
        // during the scan itself. Map it to cleanupResult so dashboard
        // cards and Smart Optimize cards show real data immediately.
        const cleanupSummary = result?.cleanup_summary as Record<string, unknown> | undefined;
        const cleanupResult = cleanupSummary && typeof cleanupSummary === 'object'
          ? {
              detected: typeof cleanupSummary.files_found === 'number' ? cleanupSummary.files_found : (typeof cleanupSummary.detected === 'number' ? cleanupSummary.detected : 0),
              cleaned: typeof cleanupSummary.files_deleted === 'number' ? cleanupSummary.files_deleted : (typeof cleanupSummary.files_cleaned === 'number' ? cleanupSummary.files_cleaned : (typeof cleanupSummary.cleaned === 'number' ? cleanupSummary.cleaned : 0)),
              foldersCleaned: typeof cleanupSummary.folders_deleted === 'number' ? cleanupSummary.folders_deleted : (typeof cleanupSummary.folders_cleaned === 'number' ? cleanupSummary.folders_cleaned : 0),
              remaining: typeof cleanupSummary.remaining === 'number' ? cleanupSummary.remaining : 0,
              failed: typeof cleanupSummary.files_skipped === 'number' ? cleanupSummary.files_skipped : (typeof cleanupSummary.failed === 'number' ? cleanupSummary.failed : 0),
              reviewRequired: typeof cleanupSummary.requires_review === 'number' ? cleanupSummary.requires_review : 0,
              spaceRecovered: typeof cleanupSummary.space_recovered === 'number' ? cleanupSummary.space_recovered : (typeof cleanupSummary.bytes_recovered === 'number' ? cleanupSummary.bytes_recovered : 0),
              healthBefore: typeof cleanupSummary.health_before === 'number' ? cleanupSummary.health_before : undefined,
              healthAfter: typeof cleanupSummary.health_after === 'number' ? cleanupSummary.health_after : undefined,
              verificationStatus: typeof cleanupSummary.verification_status === 'string' ? cleanupSummary.verification_status : undefined,
            }
          : undefined;

        unifiedScanState.updateLatest({
          status: 'complete',
          completedAt: new Date().toISOString(),
          result,
          statistics,
          planId,
          cleanupResult: cleanupResult ?? null,
        });
      } catch (err) {
        scan.failScan(err instanceof Error ? err.message : 'Failed to fetch scan result');
      }
    },
    [config.moduleName, scan, stopPoll],
  );

  const processStatus = useCallback(
    async (sid: string, status: ScanStatusResponse) => {
      if (status.error) {
        unifiedScanState.updateLatest({ status: 'error', error: status.error });
        stopPoll();
        scan.failScan(status.error);
        return;
      }

      if (status.cancelled) {
        unifiedScanState.updateLatest({ status: 'cancelled' });
        reset();
        return;
      }

      const progress = status.progress ?? null;
      const rawPhase = getProgressValue<string | null>(progress, 'phase', null);
      // Map backend phase to frontend phase ID using the config's backendPhaseMap.
      const currentPhase = rawPhase
        ? (config.backendPhaseMap?.[rawPhase] ?? rawPhase)
        : null;

      if (status.completed) {
        await handleComplete(sid);
        return;
      }

      // Use the backend's completion_percent directly — it is the canonical
      // progress value derived from actual scan work, not a UI animation.
      const completionPercent = getProgressValue<number>(progress, 'completion_percent', 0);

      const phaseIndex = currentPhase ? config.phases.findIndex((p) => p.id === currentPhase) : -1;
      if (phaseIndex >= 0) {
        scan.setPhase(phaseIndex);
      } else if (completionPercent > 0) {
        // V1.0: If no backendPhaseMap match, derive the phase from
        // completion_percent by finding which phase range contains it.
        const derivedIndex = config.phases.findIndex(
          (p) => completionPercent >= p.startPercent && completionPercent < p.endPercent,
        );
        if (derivedIndex >= 0) {
          scan.setPhase(derivedIndex);
        }
      }

      const currentOperation =
        getProgressValue<string | null>(progress, 'current_operation', null) ??
        currentPhase ??
        'Scanning...';

      scan.updateProgress({
        overallProgress: completionPercent,
        currentModule: currentPhase ?? undefined,
        currentActivity: currentOperation,
        // V1.0: Pass the current folder/file path so the UI can show
        // what is being scanned in real time. Fall back to current_operation
        // so the user always sees what's happening.
        currentFile:
          getProgressValue<string | null>(progress, 'current_folder', null) ??
          getProgressValue<string | null>(progress, 'current_operation', null) ??
          undefined,
        // V1.0: Pass the current category name for category-wise display
        currentCategory: getProgressValue<string | null>(progress, 'current_category', null) ?? undefined,
      });

      scan.updateCounters(mapStatusCounters(progress, config));

      const currentPhaseConfig = config.phases[phaseIndex] ?? config.phases[scan.currentPhaseIndex] ?? config.phases[0];
      if (currentPhaseConfig) {
        const itemsScanned = getProgressValue<number>(progress, 'assets_evaluated', 0);
        const issuesFound = getProgressValue<number>(progress, 'findings', 0);
        const treeUpdate: Partial<UnifiedScanTreeNode> = {
          itemsScanned,
          issuesFound,
        };
        scan.updateTreeNode(currentPhaseConfig.id, treeUpdate);
      }

      unifiedScanState.updateLatest({
        status: 'scanning',
        error: null,
      });

      const elapsedMs = scan.startTime ? Date.now() - scan.startTime : 0;
      setCurrentOperation(mapCurrentOperation(progress, elapsedMs));
      setActivityLog([]);
    },
    [config, scan, reset, stopPoll, handleComplete],
  );

  const pollOnce = useCallback(
    async (sid: string) => {
      try {
        const status = (await scanService.status(sid)) as unknown as ScanStatusResponse;
        await processStatus(sid, status);
      } catch (err) {
        stopPoll();
        scan.failScan(err instanceof Error ? err.message : 'Status poll failed');
      }
    },
    [processStatus, scan, stopPoll],
  );

  const startPoll = useCallback(
    (sid: string) => {
      stopPoll();
      pollIntervalRef.current = setInterval(() => {
        void pollOnce(sid);
      }, 500);
    },
    [stopPoll, pollOnce],
  );

  const startScan = useCallback(async () => {
    if (startingRef.current || sessionIdRef.current) return;
    startingRef.current = true;
    hookStartScan();
    try {
      const startMethod = mode === 'quick' ? scanService.scan_quick : scanService.scan_full;
      // V1.0: The backend now waits for the orchestrator to be ready
      // (up to 90s) instead of returning "still initializing" on the
      // first click.  This call may block for a while on cold start,
      // but the backend will start the scan as soon as it's ready.
      //
      // V1.0 Architecture separation: pass ruleCategories from the module
      // config so the security scan only runs security rules, not junk/temp.
      const response = (await startMethod(undefined, config.ruleCategories, source)) as { ok?: boolean; session_id?: string; started_at?: string; error?: string; error_code?: string; required_edition?: string };
      if (response.ok === false) {
        const backendError = response.error ?? 'Scan could not start';
        throw new Error(backendError);
      }
      const sid = response.session_id;
      if (!sid) {
        throw new Error('AVS could not start the scan. Please try again.');
      }
      sessionIdRef.current = sid;
      unifiedScanState.setLatest({
        sessionId: sid,
        module: toAppModule(config.moduleId),
        mode,
        status: 'scanning',
        startedAt: response.started_at ?? new Date().toISOString(),
        remediationStatus: 'none',
        error: null,
      });
      startPoll(sid);
    } catch (err) {
      unifiedScanState.updateLatest({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to start scan',
      });
      stopPoll();
      scan.failScan(err instanceof Error ? err.message : 'Failed to start scan');
    } finally {
      startingRef.current = false;
    }
  }, [hookStartScan, mode, startPoll, scan, stopPoll, config.moduleId, config.ruleCategories, source]);

  const cancelScan = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid) {
      void scanService.cancel_scan(sid);
      // Prevent the subsequent reset() from issuing a second cancel_scan.
      sessionIdRef.current = null;
    }
    reset();
  }, [reset]);

  // When the scan completes, clear the session ref so a new scan can start.
  // handleComplete already calls stopPoll and sets the result; we just need
  // to release the session guard so startScan() doesn't bail out.
  useEffect(() => {
    if (scan.step === 'complete' || scan.step === 'error' || scan.step === 'cancelled') {
      sessionIdRef.current = null;
      startingRef.current = false;
    }
  }, [scan.step]);

  useEffect(() => {
    return () => {
      stopPoll();
    };
  }, [stopPoll]);

  return {
    ...scan,
    reset,
    sessionId: sessionIdRef.current,
    result,
    startScan,
    cancelScan,
    activityLog,
    currentOperation,
  };
}
