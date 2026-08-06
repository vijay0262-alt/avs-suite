/**
 * ScanHeader — large module icon, module name, current phase, elapsed/remaining time.
 *
 * Used at the top of every scan view to provide immediate context about
 * what is being scanned and how long it has been running.
 */
import type { ReactNode } from 'react';
import { ClockIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { formatDuration, formatETA } from '../unifiedScanTypes';

export interface ScanHeaderProps {
  moduleIcon: ReactNode;
  moduleName: string;
  currentPhaseLabel: string;
  elapsedMs: number;
  overallProgress: number;
  step: 'preparing' | 'scanning' | 'paused' | 'complete' | 'error';
}

export function ScanHeader({
  moduleIcon,
  moduleName,
  currentPhaseLabel,
  elapsedMs,
  overallProgress,
  step,
}: ScanHeaderProps) {
  const remaining = formatETA(elapsedMs, overallProgress);

  return (
    <div className="flex items-center gap-4" data-testid="unified-scan-header">
      {/* Large module icon */}
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--avs-radius-lg)] bg-brand-primary/10 text-brand-primary">
        {moduleIcon}
      </div>

      {/* Module name + phase */}
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold text-text-primary truncate">{moduleName}</h3>
        <div className="mt-0.5 flex items-center gap-2">
          {step === 'scanning' && (
            <ArrowPathIcon className="h-3.5 w-3.5 animate-spin text-brand-primary" aria-hidden />
          )}
          <p className="text-sm text-text-secondary truncate" aria-live="polite">
            {currentPhaseLabel}
          </p>
        </div>
      </div>

      {/* Time info */}
      <div className="flex items-center gap-4 text-right shrink-0">
        <div>
          <div className="flex items-center gap-1 justify-end text-text-muted">
            <ClockIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="text-xs uppercase tracking-wide">Elapsed</span>
          </div>
          <div className="text-sm font-semibold tabular-nums text-text-primary">
            {formatDuration(elapsedMs)}
          </div>
        </div>
        {step === 'scanning' && remaining !== '—' && (
          <div>
            <div className="text-xs uppercase tracking-wide text-text-muted">Remaining</div>
            <div className="text-sm font-semibold tabular-nums text-text-secondary">
              {remaining}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
