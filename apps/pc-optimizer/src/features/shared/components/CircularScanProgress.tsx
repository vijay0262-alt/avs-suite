/**
 * CircularScanProgress — Trend Micro-style animated circular progress ring.
 *
 * Used by all 3 scan modals (Antivirus, Dashboard, AI Smart Optimize)
 * for a consistent, professional scanning experience.
 *
 * Features:
 *   - Smoothly animated SVG ring with CSS transition
 *   - Large percentage in the center
 *   - Phase label below the percentage
 *   - Optional files-scanned counter
 *   - Color changes based on phase (scanning / cleaning / complete / error)
 *   - Pulsing glow while active
 */
import type { ReactNode } from 'react';

export type ScanPhase = 'idle' | 'scanning' | 'pending_confirmation' | 'cleaning' | 'complete' | 'cancelled' | 'error' | 'preparing' | 'paused';

export interface CircularScanProgressProps {
  /** Progress 0-100 */
  progress: number;
  /** Current phase — drives color and label */
  phase: ScanPhase | string;
  /** Optional override for the phase label shown below percentage */
  phaseLabel?: string;
  /** Optional title shown below the ring */
  title?: string;
  /** Optional subtitle / current file shown below the title */
  subtitle?: string;
  /** Files scanned so far */
  filesScanned?: number;
  /** Total files to scan */
  totalFiles?: number;
  /** Threats found (for antivirus scans) */
  threatsFound?: number;
  /** Threats quarantined (for antivirus scans) */
  threatsQuarantined?: number;
  /** Optional extra content below the ring (stats grid, buttons, etc.) */
  children?: ReactNode;
  /** Ring diameter in pixels (default 208 = w-52 h-52) */
  size?: number;
}

const RING_RADIUS = 90;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ~565.49

function getPhaseColor(phase: string): string {
  if (phase === 'complete') return 'text-semantic-success';
  if (phase === 'cancelled' || phase === 'error') return 'text-semantic-danger';
  if (phase === 'pending_confirmation' || phase === 'cleaning' || phase === 'paused') return 'text-semantic-warning';
  return 'text-brand-primary';
}

function getDefaultPhaseLabel(phase: string): string {
  switch (phase) {
    case 'scanning':
    case 'preparing':
      return 'Scanning';
    case 'pending_confirmation':
      return 'Review';
    case 'cleaning':
      return 'Cleaning';
    case 'complete':
      return 'Complete';
    case 'cancelled':
      return 'Cancelled';
    case 'error':
      return 'Error';
    case 'paused':
      return 'Paused';
    default:
      return 'Scanning';
  }
}

export function CircularScanProgress({
  progress,
  phase,
  phaseLabel,
  title,
  subtitle,
  filesScanned,
  totalFiles,
  threatsFound,
  threatsQuarantined,
  children,
  size = 208,
}: CircularScanProgressProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const displayLabel = phaseLabel ?? getDefaultPhaseLabel(phase);
  const phaseColor = getPhaseColor(phase);
  const isActive = phase === 'scanning' || phase === 'preparing' || phase === 'cleaning' || phase === 'paused';

  return (
    <div className="flex flex-col items-center text-center" data-testid="circular-scan-progress">
      {/* Ring */}
      <div className="relative mb-4" style={{ width: size, height: size }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
          {/* Background track */}
          <circle
            cx="100" cy="100" r={RING_RADIUS}
            fill="none"
            stroke="var(--avs-border)"
            strokeWidth="12"
          />
          {/* Progress arc */}
          <circle
            cx="100" cy="100" r={RING_RADIUS}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            className={phaseColor}
            stroke="currentColor"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - clampedProgress / 100)}
            style={{
              transition: 'stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>

        {/* Pulsing glow overlay while active */}
        {isActive && (
          <div
            className="absolute inset-0 rounded-full opacity-20 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, var(--avs-brand-primary) 0%, transparent 70%)',
              animation: 'pulse-glow 2s ease-in-out infinite',
            }}
          />
        )}

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-text-primary tabular-nums">
            {Math.round(clampedProgress)}%
          </span>
          <span className="text-caption text-text-muted mt-1">
            {displayLabel}
          </span>
        </div>
      </div>

      {/* Title */}
      {title && (
        <h3 className="text-base font-semibold text-text-primary mb-1">
          {title}
        </h3>
      )}

      {/* Subtitle / current file */}
      {subtitle && (
        <p
          className="text-caption text-text-secondary max-w-md truncate"
          title={subtitle}
        >
          {subtitle}
        </p>
      )}

      {/* File counter row */}
      {(filesScanned !== undefined || totalFiles !== undefined) && (
        <div className="mt-2 flex items-center gap-4 text-caption text-text-muted">
          {filesScanned !== undefined && (
            <span className="tabular-nums">
              {filesScanned.toLocaleString()}
              {totalFiles !== undefined && totalFiles > 0 && (
                <span className="text-text-muted/60"> / {totalFiles.toLocaleString()}</span>
              )}{' '}
              files
            </span>
          )}
          {threatsFound !== undefined && threatsFound > 0 && (
            <span className="text-semantic-warning font-medium tabular-nums">
              {threatsFound} threat{threatsFound !== 1 ? 's' : ''}
            </span>
          )}
          {threatsQuarantined !== undefined && threatsQuarantined > 0 && (
            <span className="text-semantic-success font-medium tabular-nums">
              {threatsQuarantined} quarantined
            </span>
          )}
        </div>
      )}

      {/* Extra content (stats grid, buttons, etc.) */}
      {children}

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.15; transform: scale(0.95); }
          50% { opacity: 0.25; transform: scale(1.05); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pulse-glow { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
