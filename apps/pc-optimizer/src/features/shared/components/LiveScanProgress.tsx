/**
 * LiveScanProgress — animated scanning display like SUPERAntiSpyware / CCleaner.
 *
 * Shows:
 *   - Pulsing indicator with current item being scanned
 *   - Overall progress bar with percentage
 *   - Per-category / per-phase progress bars
 *   - Elapsed time and items checked
 *
 * Can be used in two modes:
 *   1. "live" — receives real-time updates via `currentItem` and `progress`
 *   2. "animated" — cycles through `phases` with simulated progress while
 *      a backend operation is in flight (useful for blocking RPC calls
 *      that don't emit progress events).
 */
import { useEffect, useRef, useState } from 'react';

export interface ScanPhase {
  id: string;
  label: string;
}

export interface LiveScanProgressProps {
  /** Whether the scan is currently running. */
  isRunning: boolean;
  /** Optional current item/path being scanned (real-time mode). */
  currentItem?: string | null;
  /** Optional overall progress 0-100 (real-time mode). */
  progress?: number;
  /** Optional total items checked so far. */
  itemsScanned?: number;
  /** Optional threats/issues found so far. */
  itemsFound?: number;
  /** Phases to cycle through (animated mode). */
  phases?: ScanPhase[];
  /** Optional label for the scan type, e.g. "Registry", "Security". */
  scanLabel?: string;
  /** Elapsed time in ms (if externally tracked). */
  elapsedMs?: number;
}

export function LiveScanProgress({
  isRunning,
  currentItem,
  progress,
  itemsScanned,
  itemsFound,
  phases = [],
  scanLabel = 'System',
  elapsedMs,
}: LiveScanProgressProps) {
  const [animatedPhaseIdx, setAnimatedPhaseIdx] = useState(0);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [internalElapsed, setInternalElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // Track elapsed time
  useEffect(() => {
    if (!isRunning) {
      startTimeRef.current = 0;
      setInternalElapsed(0);
      return;
    }
    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }
    const interval = setInterval(() => {
      setInternalElapsed(Date.now() - startTimeRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Animated mode: cycle through phases with simulated progress
  useEffect(() => {
    if (!isRunning || phases.length === 0 || progress !== undefined) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    let frame = 0;
    const animate = () => {
      frame++;
      // Advance progress within each phase
      const phaseProgress = (frame % 60) / 60; // ~1 second per phase at 60fps
      setAnimatedProgress(Math.min(95, Math.round((animatedPhaseIdx + phaseProgress) / phases.length * 100)));

      // Move to next phase
      if (frame % 60 === 0) {
        setAnimatedPhaseIdx((prev) => (prev + 1) % phases.length);
      }

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isRunning, phases, progress, animatedPhaseIdx]);

  // Reset when scan stops
  useEffect(() => {
    if (!isRunning) {
      setAnimatedPhaseIdx(0);
      setAnimatedProgress(0);
    }
  }, [isRunning]);

  if (!isRunning) return null;

  const effectiveProgress = progress ?? animatedProgress;
  const effectiveElapsed = elapsedMs ?? internalElapsed;
  const currentPhase = phases[animatedPhaseIdx];
  const displayItem = currentItem ?? (currentPhase ? currentPhase.label : null);

  return (
    <div
      className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] p-4"
      data-testid="live-scan-progress"
    >
      {/* Pulsing indicator + current item */}
      <div className="flex items-center gap-3 mb-3">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-small font-medium text-text-primary">
            {scanLabel} Scan in Progress…
          </div>
          {displayItem && (
            <div
              className="mt-0.5 truncate text-caption text-text-muted font-mono"
              title={displayItem}
              data-testid="live-scan-current-item"
            >
              {displayItem}
            </div>
          )}
        </div>
        <span className="text-caption tabular-nums text-text-muted">
          {formatDuration(effectiveElapsed)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-caption text-text-secondary">Progress</span>
          <span className="text-caption font-medium tabular-nums text-text-primary">
            {effectiveProgress}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--avs-surface-muted)]">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${effectiveProgress}%`,
              background: 'var(--avs-gradient-brand, var(--avs-brand-primary))',
            }}
          />
        </div>
      </div>

      {/* Stats row */}
      {(itemsScanned !== undefined || itemsFound !== undefined) && (
        <div className="flex gap-6">
          {itemsScanned !== undefined && (
            <div>
              <span className="text-caption uppercase tracking-wide text-text-muted">Items Checked</span>
              <div className="text-section-title font-semibold tabular-nums text-text-primary">
                {itemsScanned.toLocaleString()}
              </div>
            </div>
          )}
          {itemsFound !== undefined && (
            <div>
              <span className="text-caption uppercase tracking-wide text-text-muted">
                {scanLabel === 'Security' ? 'Threats Found' : 'Issues Found'}
              </span>
              <div className="text-section-title font-semibold tabular-nums text-text-primary">
                {itemsFound.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-phase progress (animated mode) */}
      {phases.length > 0 && progress === undefined && (
        <div className="mt-3 space-y-1.5" data-testid="live-scan-phases">
          {phases.map((phase, idx) => {
            const isCurrent = idx === animatedPhaseIdx;
            const isPast = idx < animatedPhaseIdx;
            return (
              <div key={phase.id} className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    isPast
                      ? 'bg-semantic-success'
                      : isCurrent
                        ? 'bg-brand-primary'
                        : 'bg-[var(--avs-border)]'
                  }`}
                />
                <span
                  className={`text-caption ${
                    isCurrent
                      ? 'font-medium text-text-primary'
                      : isPast
                        ? 'text-text-muted'
                        : 'text-text-muted/50'
                  }`}
                >
                  {phase.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
