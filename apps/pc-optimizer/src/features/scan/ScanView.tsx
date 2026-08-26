/**
 * ScanView.tsx — main shared scan component for ALL scan pages.
 *
 * Delegates the live backend wiring to `useScan` and renders the common
 * `UnifiedScanView`.  When idle it shows a single safe Start Scan button.
 *
 * V1.0 UNIFIED: ALL modules (Dashboard, Smart Optimize, Security,
 * Protection) follow the same scan → detect → auto-clean → show results
 * pattern. After scan completion, auto-optimization runs automatically
 * for safe actions, then shows a completion summary.
 */
import { useEffect, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Button } from '@avs/ui';
import { BoltIcon } from '@heroicons/react/24/outline';
import { UnifiedScanView } from '../unified-scan/components/UnifiedScanView';
import type { UnifiedScanAction } from '../unified-scan/unifiedScanTypes';
import { useScan } from './useScan';
import { getScanConfig } from './moduleConfigs';
import { ResultsView } from './ResultsView';
import { PlanReviewView } from './PlanReviewView';
import { AutoOptimizeView } from './AutoOptimizeView';
import type { ScanFinding, ScanStatistics } from './types';

export interface ScanViewProps {
  module: 'protection' | 'optimize' | 'security';
  mode?: 'quick' | 'full';
  onClose: () => void;
  className?: string;
  buttonLabel?: string;
  /** Auto-start the scan immediately on mount (V1.0 Dashboard). */
  autoStart?: boolean;
  /** V1.0: When set, show the previous scan's results (PlanReviewView)
   * instead of starting a new scan. Used by "Review Findings" button. */
  reviewPlanId?: string | null;
}

export function ScanView({ module, mode = 'full', onClose, className, buttonLabel, autoStart, reviewPlanId }: ScanViewProps) {
  const config = useMemo(() => getScanConfig(module), [module]);
  const scan = useScan({ mode, config });
  const [showResults, setShowResults] = useState(false);
  const [showAutoOptimize, setShowAutoOptimize] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const planIdParam = searchParams.get('planId');
  const handlePlanClose = useCallback(() => {
    setSearchParams({});
    onClose();
  }, [setSearchParams, onClose]);

  // V1.0: "Review Findings" — show previous scan results without starting
  // a new scan. Takes priority over autoStart and URL planIdParam.
  const reviewClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // V1.0 UNIFIED: auto-start scan on mount when autoStart is set.
  useEffect(() => {
    if (autoStart && scan.step === 'idle' && !scan.sessionId) {
      void scan.startScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // V1.0 UNIFIED: ALL modules auto-start optimization when scan completes.
  // No more manual "Review & Remediate" — scan → detect → clean → results.
  // If there are zero findings or zero safe actions, auto-optimize still
  // runs so the user sees a "PC is clean" result instead of a blank state.
  const shouldAutoOptimize =
    scan.step === 'complete' &&
    Boolean(scan.report?.planId) &&
    !showResults &&
    !showAutoOptimize;

  // Trigger auto-optimization when scan completes with findings.
  useEffect(() => {
    if (shouldAutoOptimize) {
      setShowAutoOptimize(true);
    }
  }, [shouldAutoOptimize]);

  const actions: UnifiedScanAction[] = useMemo(
    () => [
      {
        id: 'close-scan',
        label: 'Close',
        icon: 'XMarkIcon',
        variant: 'secondary',
        action: onClose,
      },
    ],
    [onClose],
  );

  const resultsClose = useMemo(
    () => () => {
      setShowResults(false);
      scan.reset();
    },
    [scan],
  );

  const autoOptimizeClose = useMemo(
    () => () => {
      setShowAutoOptimize(false);
      // V1.0: Do NOT call scan.reset() here — that would clear the
      // local scan state and prevent "Review Findings" from working
      // on the dashboard. The unifiedScanState still holds the
      // completed session with planId and statistics, which the
      // DashboardScanStatusCard needs for the "Review Findings" button.
      // V1.0: Close the modal entirely after cleanup Done is clicked.
      onClose();
    },
    [onClose],
  );

  const findings = useMemo<ScanFinding[]>(() => {
    const raw = scan.result?.findings;
    return Array.isArray(raw) ? (raw as ScanFinding[]) : [];
  }, [scan.result]);

  const statistics = useMemo<ScanStatistics>(() => {
    const raw = scan.result?.statistics;
    return typeof raw === 'object' && raw !== null ? (raw as ScanStatistics) : {};
  }, [scan.result]);

  const planId = scan.report?.planId ?? (scan.result?.action_plan_id as string | undefined);

  // V1.0: "Review Findings" — show previous scan results (PlanReviewView).
  // This takes priority over autoStart so clicking "Review Findings" does
  // NOT start a new scan — it shows the findings from the last scan.
  if (reviewPlanId) {
    return (
      <PlanReviewView
        planId={reviewPlanId}
        module={module}
        onClose={reviewClose}
      />
    );
  }

  if (planIdParam) {
    return (
      <PlanReviewView
        planId={planIdParam}
        module={module}
        onClose={handlePlanClose}
      />
    );
  }

  // V1.0 UNIFIED: Auto-optimization view for ALL modules.
  // If planId is null (zero cleanable files), show results directly
  // instead of failing with "No Plan Defined".
  if (showAutoOptimize && planId) {
    return (
      <AutoOptimizeView
        planId={planId}
        module={module}
        onClose={autoOptimizeClose}
        onReviewRequired={(_pid) => {
          setShowAutoOptimize(false);
          setShowResults(true);
        }}
      />
    );
  }

  // V1.0: Scan completed but no plan was created (zero findings or
  // zero safe actions).  Show results directly — this is NOT an error.
  if (showAutoOptimize && !planId) {
    return (
      <ResultsView
        moduleName={config.moduleName}
        moduleIcon={config.moduleIcon}
        statistics={statistics}
        findings={findings}
        planId={undefined}
        onClose={autoOptimizeClose}
        onRestart={() => {
          setShowAutoOptimize(false);
          scan.reset();
          void scan.startScan();
        }}
      />
    );
  }

  if (scan.step === 'complete' && showResults) {
    return (
      <ResultsView
        moduleName={config.moduleName}
        moduleIcon={config.moduleIcon}
        statistics={statistics}
        findings={findings}
        planId={planId}
        onClose={resultsClose}
        onRestart={() => {
          setShowResults(false);
          scan.reset();
          void scan.startScan();
        }}
      />
    );
  }

  if (scan.step === 'idle') {
    return (
      <Card variant="glass" className={className} data-testid="scan-view-idle">
        <div className="text-center p-8 space-y-4">
          <div className="inline-flex p-3 rounded-full bg-brand-primary/10">
            <BoltIcon className="h-8 w-8 text-brand-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">{config.moduleName}</h3>
          <p className="text-small text-text-secondary">
            This scan is read-only and will not change your system.
          </p>
          <Button
            onClick={scan.startScan}
            leftIcon={<BoltIcon className="h-4 w-4" />}
            data-testid="scan-start-btn"
          >
            {buttonLabel ?? `Start ${mode === 'full' ? 'Full' : 'Quick'} Scan`}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <UnifiedScanView
      config={config}
      step={scan.step}
      liveStatus={scan.liveStatus}
      counters={scan.counters}
      treeNodes={scan.treeNodes}
      currentPhaseIndex={scan.currentPhaseIndex}
      startTime={scan.startTime}
      error={scan.error}
      report={scan.report}
      actions={actions}
      onPause={scan.pauseScan}
      onResume={scan.resumeScan}
      onCancel={scan.cancelScan}
      onClose={() => { scan.reset(); onClose(); }}
      activityLog={scan.activityLog}
    />
  );
}
