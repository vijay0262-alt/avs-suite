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

function getProgressValue<T>(progress: Record<string, unknown> | null | undefined, key: string, fallback: T): T {
  const value = progress?.[key];
  if (value === undefined || value === null) return fallback;
  return value as T;
}

function mapStatusCounters(
  progress: Record<string, unknown> | null | undefined,
): Record<string, number> {
  return {
    itemsScanned: getProgressValue<number>(progress, 'assets_evaluated', 0),
    itemsAnalyzed: getProgressValue<number>(progress, 'findings', 0),
    actionsAvailable: getProgressValue<number>(progress, 'actions_available', 0),
    elapsedMs: getProgressValue<number>(progress, 'elapsed_time_ms', 0),
    filesScanned: getProgressValue<number>(progress, 'assets_evaluated', 0),
    recommendations: getProgressValue<number>(progress, 'findings', 0),
    threatsChecked: getProgressValue<number>(progress, 'assets_discovered', 0),
    storageRecovered: getProgressValue<number>(progress, 'actions_available', 0),
    bytesRecovered: 0,
    memoryRecovery: 0,
    startupImprovement: 0,
  };
}

function mapCurrentOperation(
  progress: Record<string, unknown> | null | undefined,
  elapsedMs: number,
): CurrentOperationCardProps {
  return {
    currentModule: getProgressValue<string | null>(progress, 'phase', null),
    currentOperation: getProgressValue<string | null>(progress, 'current_operation', null),
    currentPath: null,
    itemsProcessed: getProgressValue<number>(progress, 'assets_evaluated', 0),
    itemsRemaining: 0,
    bytesRecovered: 0,
    elapsedMs,
    overallProgress: getProgressValue<number>(progress, 'completion_percent', 0),
  };
}

export function useScan({ mode = 'full', config }: UseScanOptions): UseScanReturn {
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
        setResult(response.result ?? null);
        const report = buildScanReport(config.moduleName, response.result ?? {});
        scan.completeScan(report);
      } catch (err) {
        scan.failScan(err instanceof Error ? err.message : 'Failed to fetch scan result');
      }
    },
    [config.moduleName, scan, stopPoll],
  );

  const processStatus = useCallback(
    async (sid: string, status: ScanStatusResponse) => {
      if (status.error) {
        stopPoll();
        scan.failScan(status.error);
        return;
      }

      if (status.cancelled) {
        reset();
        return;
      }

      const progress = status.progress ?? null;
      const currentPhase = getProgressValue<string | null>(progress, 'phase', null);

      if (status.completed) {
        await handleComplete(sid);
        return;
      }

      const phaseIndex = currentPhase ? config.phases.findIndex((p) => p.id === currentPhase) : -1;
      if (phaseIndex >= 0) {
        scan.setPhase(phaseIndex);
      }

      scan.updateProgress({
        overallProgress: getProgressValue<number>(progress, 'completion_percent', 0),
        currentModule: currentPhase ?? undefined,
        currentActivity:
          getProgressValue<string | null>(progress, 'current_operation', null) ??
          currentPhase ??
          'Scanning...',
      });

      scan.updateCounters(mapStatusCounters(progress));

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
      const response = (await startMethod()) as { session_id?: string; started_at?: string };
      const sid = response.session_id;
      if (!sid) {
        throw new Error('Backend did not return a session id');
      }
      sessionIdRef.current = sid;
      startPoll(sid);
    } catch (err) {
      stopPoll();
      scan.failScan(err instanceof Error ? err.message : 'Failed to start scan');
    } finally {
      startingRef.current = false;
    }
  }, [hookStartScan, mode, startPoll, scan, stopPoll]);

  const cancelScan = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid) {
      void scanService.cancel_scan(sid);
    }
    reset();
  }, [reset]);

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
