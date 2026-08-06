/**
 * useUnifiedScan — manages the lifecycle of a unified scan.
 *
 * Provides a single hook that any module can use to run a scan with:
 *   - Phase tracking and progress calculation
 *   - Live counter updates
 *   - Scan tree node status updates
 *   - Activity message cycling
 *   - Pause/resume support
 *   - Cancel support
 *   - Report generation
 *
 * The hook is backend-agnostic — the caller provides a `runScan` function
 * that performs the actual RPC call and emits progress events.
 */
import { useCallback, useRef, useState } from 'react';
import type {
  UnifiedScanStep,
  UnifiedScanPhase,
  UnifiedScanTreeNode,
  UnifiedScanLiveStatus,
  UnifiedScanReport,
  UnifiedScanModuleConfig,
} from './unifiedScanTypes';

export interface UnifiedScanCallbacks {
  /** Called when the scan starts */
  onStart?: () => void;
  /** Called when a phase changes */
  onPhaseChange?: (phaseIndex: number, phase: UnifiedScanPhase) => void;
  /** Called when counters update */
  onCountersUpdate?: (counters: Record<string, number>) => void;
  /** Called when the scan completes */
  onComplete?: (report: UnifiedScanReport) => void;
  /** Called when the scan is cancelled */
  onCancel?: () => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
}

export interface UseUnifiedScanOptions {
  config: UnifiedScanModuleConfig;
  callbacks?: UnifiedScanCallbacks;
}

export interface UseUnifiedScanReturn {
  step: UnifiedScanStep;
  liveStatus: UnifiedScanLiveStatus;
  counters: Record<string, number>;
  treeNodes: UnifiedScanTreeNode[];
  currentPhaseIndex: number;
  startTime: number | null;
  endTime: number | null;
  error: string | null;
  report: UnifiedScanReport | null;
  /** Start the scan */
  startScan: () => void;
  /** Update progress from backend events */
  updateProgress: (update: Partial<UnifiedScanLiveStatus>) => void;
  /** Update counters from backend events */
  updateCounters: (update: Record<string, number>) => void;
  /** Update tree node status */
  updateTreeNode: (nodeId: string, update: Partial<UnifiedScanTreeNode>) => void;
  /** Set the current phase by index */
  setPhase: (index: number) => void;
  /** Complete the scan with a report */
  completeScan: (report: UnifiedScanReport) => void;
  /** Fail the scan with an error */
  failScan: (error: string) => void;
  /** Pause the scan */
  pauseScan: () => void;
  /** Resume the scan */
  resumeScan: () => void;
  /** Cancel the scan */
  cancelScan: () => void;
  /** Reset to idle state */
  reset: () => void;
}

const INITIAL_LIVE_STATUS: UnifiedScanLiveStatus = {
  currentPhase: '',
  currentActivity: '',
  overallProgress: 0,
};

export function useUnifiedScan({ config, callbacks }: UseUnifiedScanOptions): UseUnifiedScanReturn {
  const [step, setStep] = useState<UnifiedScanStep>('idle');
  const [liveStatus, setLiveStatus] = useState<UnifiedScanLiveStatus>(INITIAL_LIVE_STATUS);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [treeNodes, setTreeNodes] = useState<UnifiedScanTreeNode[]>([]);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<UnifiedScanReport | null>(null);

  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);

  const buildInitialTreeNodes = useCallback((): UnifiedScanTreeNode[] => {
    return config.phases.map((phase) => ({
      id: phase.id,
      label: phase.label,
      status: 'pending' as const,
      itemsScanned: 0,
      issuesFound: 0,
    }));
  }, [config.phases]);

  const startScan = useCallback(() => {
    cancelledRef.current = false;
    pausedRef.current = false;
    setStep('preparing');
    setError(null);
    setReport(null);
    setCounters({});
    setLiveStatus({
      currentPhase: config.phases[0]?.label ?? '',
      currentActivity: config.phases[0]?.activities[0] ?? '',
      overallProgress: 0,
    });
    setTreeNodes(buildInitialTreeNodes());
    setCurrentPhaseIndex(0);
    setStartTime(Date.now());
    setEndTime(null);
    callbacks?.onStart?.();
  }, [config.phases, buildInitialTreeNodes, callbacks]);

  const updateProgress = useCallback((update: Partial<UnifiedScanLiveStatus>) => {
    setLiveStatus((prev) => ({ ...prev, ...update }));
  }, []);

  const updateCounters = useCallback((update: Record<string, number>) => {
    setCounters((prev) => ({ ...prev, ...update }));
    callbacks?.onCountersUpdate?.({ ...counters, ...update });
  }, [counters, callbacks]);

  const updateTreeNode = useCallback((nodeId: string, update: Partial<UnifiedScanTreeNode>) => {
    setTreeNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId ? { ...node, ...update } : node,
      ),
    );
  }, []);

  const setPhase = useCallback((index: number) => {
    if (index < 0 || index >= config.phases.length) return;
    const phase = config.phases[index];
    if (!phase) return;
    setCurrentPhaseIndex(index);
    setLiveStatus((prev) => ({
      ...prev,
      currentPhase: phase.label,
      currentActivity: phase.activities[0] ?? '',
      overallProgress: phase.startPercent,
    }));
    setTreeNodes((prev) =>
      prev.map((node, i) => ({
        ...node,
        status: i < index ? 'complete' as const : i === index ? 'scanning' as const : node.status,
      })),
    );
    callbacks?.onPhaseChange?.(index, phase);
  }, [config.phases, callbacks]);

  const completeScan = useCallback((r: UnifiedScanReport) => {
    setStep('complete');
    setEndTime(Date.now());
    setReport(r);
    setLiveStatus((prev) => ({ ...prev, overallProgress: 100 }));
    setTreeNodes((prev) => prev.map((node) => ({ ...node, status: 'complete' as const })));
    callbacks?.onComplete?.(r);
  }, [callbacks]);

  const failScan = useCallback((err: string) => {
    setStep('error');
    setError(err);
    setEndTime(Date.now());
    callbacks?.onError?.(err);
  }, [callbacks]);

  const pauseScan = useCallback(() => {
    pausedRef.current = true;
    setStep('paused');
  }, []);

  const resumeScan = useCallback(() => {
    pausedRef.current = false;
    setStep('scanning');
  }, []);

  const cancelScan = useCallback(() => {
    cancelledRef.current = true;
    setStep('cancelled');
    setEndTime(Date.now());
    callbacks?.onCancel?.();
  }, [callbacks]);

  const reset = useCallback(() => {
    setStep('idle');
    setLiveStatus(INITIAL_LIVE_STATUS);
    setCounters({});
    setTreeNodes([]);
    setCurrentPhaseIndex(0);
    setStartTime(null);
    setEndTime(null);
    setError(null);
    setReport(null);
    pausedRef.current = false;
    cancelledRef.current = false;
  }, []);

  return {
    step,
    liveStatus,
    counters,
    treeNodes,
    currentPhaseIndex,
    startTime,
    endTime,
    error,
    report,
    startScan,
    updateProgress,
    updateCounters,
    updateTreeNode,
    setPhase,
    completeScan,
    failScan,
    pauseScan,
    resumeScan,
    cancelScan,
    reset,
  };
}
