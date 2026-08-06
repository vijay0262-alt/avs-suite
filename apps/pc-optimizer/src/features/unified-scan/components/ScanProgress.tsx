/**
 * ScanProgress — large animated progress bar with smooth transitions.
 *
 * Features:
 *   - Never jumps: uses CSS transition for smooth width animation
 *   - Never freezes: pulse animation while active
 *   - Never instantly completes: minimum display time enforced by caller
 *   - Sub-progress bar for current file/operation
 *   - Accessible: role="progressbar" with aria attributes
 */
import type { UnifiedScanStep } from '../unifiedScanTypes';

export interface ScanProgressProps {
  progress: number; // 0-100
  subProgress?: number; // 0-100 for current file/operation
  step: UnifiedScanStep;
  currentFile?: string | null;
}

export function ScanProgress({ progress, subProgress, step, currentFile }: ScanProgressProps) {
  const isActive = step === 'scanning' || step === 'preparing';
  const isComplete = step === 'complete';
  const isError = step === 'error';
  const isPaused = step === 'paused';

  const barColor = isError
    ? 'bg-semantic-danger'
    : isComplete
      ? 'bg-semantic-success'
      : isPaused
        ? 'bg-semantic-warning'
        : 'bg-brand-primary';

  return (
    <div className="space-y-2" data-testid="unified-scan-progress">
      {/* Percentage + label */}
      <div className="flex items-center justify-between">
        <span className="text-small font-medium text-text-secondary">
          {isComplete ? 'Complete' : isPaused ? 'Paused' : isError ? 'Error' : 'Scanning'}
        </span>
        <span className="text-statistic font-bold tabular-nums text-text-primary" aria-live="polite">
          {Math.round(progress)}%
        </span>
      </div>

      {/* Main progress bar */}
      <div
        className="relative h-3 w-full overflow-hidden rounded-full bg-[var(--avs-surface-muted)]"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Scan progress"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${barColor}`}
          style={{ width: `${progress}%` }}
        />
        {/* Pulse overlay while active */}
        {isActive && (
          <div
            className="absolute inset-0 animate-pulse rounded-full opacity-30"
            style={{
              background: 'linear-gradient(90deg, transparent, var(--avs-brand-primary), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite',
            }}
          />
        )}
      </div>

      {/* Sub-progress for current file/operation */}
      {currentFile && subProgress !== undefined && isActive && (
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-primary" />
            </span>
            <span className="text-caption text-text-secondary truncate font-mono" title={currentFile}>
              {currentFile}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--avs-surface-muted)]">
            <div
              className="h-full rounded-full bg-brand-primary/60 transition-all duration-300 ease-out"
              style={{ width: `${subProgress}%` }}
            />
          </div>
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-pulse, .animate-ping { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
