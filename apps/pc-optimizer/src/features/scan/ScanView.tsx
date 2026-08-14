/**
 * ScanView.tsx — main shared scan component for Protection Center,
 * AI Smart Optimize, and AI Smart Security.
 *
 * Delegates the live backend wiring to `useScan` and renders the common
 * `UnifiedScanView`.  When idle it shows a single safe Start Scan button.
 */
import { useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { BoltIcon } from '@heroicons/react/24/outline';
import { UnifiedScanView } from '../unified-scan/components/UnifiedScanView';
import type { UnifiedScanAction } from '../unified-scan/unifiedScanTypes';
import { useScan } from './useScan';
import { getScanConfig } from './moduleConfigs';

export interface ScanViewProps {
  module: 'protection' | 'optimize' | 'security';
  mode?: 'quick' | 'full';
  onClose: () => void;
  className?: string;
  buttonLabel?: string;
}

export function ScanView({ module, mode = 'full', onClose, className, buttonLabel }: ScanViewProps) {
  const config = useMemo(() => getScanConfig(module), [module]);
  const scan = useScan({ mode, config });

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
