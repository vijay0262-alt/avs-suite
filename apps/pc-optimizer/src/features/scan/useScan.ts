/**
 * useScan.ts — domain hook that wires the unified scan UI to the real
 * orchestrator backend.
 *
 * - Owns the `sessionId` ref.
 * - Polls `scanService.status(sessionId)` every 500ms.
 * - Maps real `OrchestratorStatus` to `updateProgress`, `updateCounters`,
 *   and `setPhase` based on the provided config.
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
import type { OrchestratorStatus } from '../orchestrator/orchestrator.service';

export interface UseScanOptions {
  mode?: 'quick' | 'full';
  config: UnifiedScanModuleConfig;
}

export interface UseScanReturn extends Omit<UseUnifiedScanReturn, 'startScan' | 'cancelScan'> {
  startScan: () => Promise<void>;
  cancelScan: () => void;
  reset: () => void;
  sessionId: string | null;
  activityLog: ActivityEntry[];
  currentOperation: CurrentOperationCardProps | null;
}

function mapStatusCounters(
  config: UnifiedScanModuleConfig,
  status: OrchestratorStatus,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const counter of config.counters) {
    values[counter.id] = 0;
  }

  const counters = status.counters ?? {};
  const moduleStatuses = status.moduleStatuses ?? {};

  if ('filesScanned' in values) values.filesScanned = counters.itemsScanned ?? 0;
  if ('registryEntries' in values) values.registryEntries = counters.registryFixed ?? 0;
  if ('startupItems' in values) values.startupItems = counters.itemsOptimized ?? 0;
  if ('privacyItems' in values) values.privacyItems = counters.itemsCleaned ?? 0;
  if ('storageRecovery' in values) {
    values.storageRecovery = counters.storageRecovered ?? counters.bytesRecovered ?? 0;
  }
  if ('memoryRecovery' in values) values.memoryRecovery = 0;
  if ('startupImprovement' in values) values.startupImprovement = 0;
  if ('recommendations' in values) {
    values.recommendations = counters.threatsChecked ?? counters.itemsAnalyzed ?? 0;
  }
  if ('processesAnalyzed' in values) values.processesAnalyzed = counters.itemsAnalyzed ?? 0;
  if ('servicesChecked' in values) values.servicesChecked = counters.itemsAnalyzed ?? 0;
  if ('registryKeysChecked' in values) values.registryKeysChecked = counters.itemsScanned ?? 0;
  if ('browserObjects' in values) values.browserObjects = 0;
  if ('scriptsInspected' in values) values.scriptsInspected = 0;
  if ('scheduledTasks' in values) values.scheduledTasks = counters.itemsSkipped ?? 0;
  if ('persistenceEntries' in values) values.persistenceEntries = 0;
  if ('threatsFound' in values) {
    values.threatsFound =
      Object.values(moduleStatuses).reduce(
        (sum, m) => sum + (m.issuesFound ?? 0),
        0,
      ) || (status.issuesBefore ?? 0);
  }
  if ('suspiciousProcesses' in values) values.suspiciousProcesses = 0;
  if ('unsignedExecutables' in values) values.unsignedExecutables = 0;
  if ('aiConfidence' in values) values.aiConfidence = 100;
  if ('protectionAreas' in values) {
    values.protectionAreas =
      Object.keys(moduleStatuses).length || config.phases.length;
  }
  if ('suspiciousProcesses' in values) values.suspiciousProcesses = 0;

  return values;
}

function mapCurrentOperation(
  status: OrchestratorStatus,
  elapsedMs: number,
): CurrentOperationCardProps {
  return {
    currentModule: status.currentModule,
    currentOperation: status.currentOperation,
    currentPath: status.currentPath,
    itemsProcessed: status.itemsProcessed,
    itemsRemaining: status.itemsRemaining,
    bytesRecovered: status.bytesRecovered,
    elapsedMs,
    overallProgress: status.progress,
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
    hookReset();
  }, [hookReset, stopPoll]);

  const handleComplete = useCallback(
    async (status: OrchestratorStatus) => {
      stopPoll();
      try {
        const result = await scanService.result(status.sessionId);
        const report = buildScanReport(config.moduleName, result, status);
        scan.completeScan(report);
      } catch (err) {
        scan.failScan(err instanceof Error ? err.message : 'Failed to fetch scan result');
      }
    },
    [config.moduleName, scan, stopPoll],
  );

  const processStatus = useCallback(
    async (status: OrchestratorStatus) => {
      if (status.error) {
        stopPoll();
        scan.failScan(status.error);
        return;
      }

      if (status.cancelled) {
        reset();
        return;
      }

      if (status.phase === 'complete') {
        await handleComplete(status);
        return;
      }

      const phaseIndex = config.phases.findIndex((p) => p.id === status.phase);
      if (phaseIndex >= 0) {
        scan.setPhase(phaseIndex);
      }

      scan.updateProgress({
        overallProgress: status.progress,
        currentModule: status.currentModule ?? undefined,
        currentFolder: status.currentPath ?? undefined,
        currentActivity: status.currentOperation ?? status.phase ?? 'Scanning...',
      });

      scan.updateCounters(mapStatusCounters(config, status));

      const currentPhase = config.phases[phaseIndex] ?? config.phases[scan.currentPhaseIndex] ?? config.phases[0];
      if (currentPhase) {
        const itemsScanned = status.counters?.itemsScanned ?? 0;
        const issuesFound =
          status.issuesBefore ??
          Object.values(status.moduleStatuses ?? {}).reduce(
            (sum, m) => sum + (m.issuesFound ?? 0),
            0,
          );
        const treeUpdate: Partial<UnifiedScanTreeNode> = {
          itemsScanned,
          issuesFound,
        };
        scan.updateTreeNode(currentPhase.id, treeUpdate);
      }

      const elapsedMs = scan.startTime ? Date.now() - scan.startTime : 0;
      setCurrentOperation(mapCurrentOperation(status, elapsedMs));
      setActivityLog(status.activityLog ?? []);
    },
    [config, scan, reset, stopPoll, handleComplete],
  );

  const pollOnce = useCallback(
    async (sid: string) => {
      try {
        const status = await scanService.status(sid);
        await processStatus(status);
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
      const response = await startMethod();
      sessionIdRef.current = response.sessionId;
      startPoll(response.sessionId);
    } catch (err) {
      stopPoll();
      scan.failScan(err instanceof Error ? err.message : 'Failed to start scan');
    } finally {
      startingRef.current = false;
    }
  }, [hookStartScan, mode, startPoll, scan, stopPoll]);

  const cancelScan = useCallback(() => {
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
    startScan,
    cancelScan,
    activityLog,
    currentOperation,
  };
}
