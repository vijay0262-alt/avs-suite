/**
 * ScanView.tsx — main shared scan component for Protection Center,
 * AI Smart Optimize, and AI Smart Security.
 *
 * Delegates the live backend wiring to `useScan` and renders the common
 * `UnifiedScanView`.  When idle it shows a single safe Start Scan button.
 *
 * For the Dashboard (module="optimize"), after scan completion it
 * automatically starts the one-click auto-optimization flow for safe
 * actions, then shows a completion summary.
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
}

export function ScanView({ module, mode = 'full', onClose, className, buttonLabel, autoStart }: ScanViewProps) {
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

  const isDashboardOptimize = module === 'optimize';

  // V1.0 Dashboard: auto-start scan on mount when autoStart is set.
  useEffect(() => {
    if (autoStart && scan.step === 'idle' && !scan.sessionId) {
      void scan.startScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const canReview =
    scan.step === 'complete' &&
    Boolean(scan.report?.planId) &&
    (scan.report?.issuesFound ?? 0) > 0;

  // For Dashboard optimize, auto-start optimization when scan completes.
  // For other modules, show the manual "Review & Remediate" button.
  const shouldAutoOptimize =
    isDashboardOptimize &&
    scan.step === 'complete' &&
    Boolean(scan.report?.planId) &&
    (scan.report?.issuesFound ?? 0) > 0 &&
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
      ...(canReview && !isDashboardOptimize
        ? [
            {
              id: 'review-remediate',
              label: 'Review & Remediate',
              icon: 'BoltIcon',
              variant: 'primary' as const,
              action: () => setShowResults(true),
            },
          ]
        : []),
      {
        id: 'close-scan',
        label: 'Close',
        icon: 'XMarkIcon',
        variant: 'secondary',
        action: onClose,
      },
    ],
    [onClose, canReview, isDashboardOptimize],
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
      scan.reset();
    },
    [scan],
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

  if (planIdParam) {
    return (
      <PlanReviewView
        planId={planIdParam}
        module={module}
        onClose={handlePlanClose}
      />
    );
  }

  // Auto-optimization view for Dashboard
  if (showAutoOptimize && planId) {
    return (
      <AutoOptimizeView
        planId={planId}
        onClose={autoOptimizeClose}
        onReviewRequired={(_pid) => {
          setShowAutoOptimize(false);
          setShowResults(true);
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
      currentOperation={scan.currentOperation}
    />
  );
}
