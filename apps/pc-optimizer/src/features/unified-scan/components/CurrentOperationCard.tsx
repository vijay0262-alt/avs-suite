/**
 * CurrentOperationCard — large card showing the current operation in detail.
 *
 * Displays:
 *   - Current module name and icon
 *   - Current operation (Scanning, Cleaning, Optimizing, Verifying)
 *   - Real file/folder path when available
 *   - Items processed / items remaining
 *   - Bytes recovered so far
 *   - Elapsed time and estimated remaining time
 *   - Progress percentage
 *
 * All data comes from real backend events — no simulation.
 */
import {
  CpuChipIcon,
  ClockIcon,
  CircleStackIcon,
  DocumentTextIcon,
  FolderOpenIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { formatDuration, formatETA } from '../unifiedScanTypes';

export interface CurrentOperationCardProps {
  currentModule: string | null;
  currentOperation: string | null;
  currentPath: string | null;
  itemsProcessed: number;
  itemsRemaining: number;
  bytesRecovered: number;
  elapsedMs: number;
  overallProgress: number;
  isOptimizing?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const OPERATION_ICONS: Record<string, typeof CpuChipIcon> = {
  Scanning: DocumentTextIcon,
  Cleaning: CircleStackIcon,
  Optimizing: CpuChipIcon,
  Verifying: ArrowPathIcon,
  Analyzing: CpuChipIcon,
  Preparing: ClockIcon,
  Completed: ArrowPathIcon,
  Skipped: ClockIcon,
};

export function CurrentOperationCard({
  currentModule,
  currentOperation,
  currentPath,
  itemsProcessed,
  itemsRemaining,
  bytesRecovered,
  elapsedMs,
  overallProgress,
  isOptimizing = false,
}: CurrentOperationCardProps) {
  const OpIcon = (currentOperation && OPERATION_ICONS[currentOperation]) || CpuChipIcon;
  const hasPath = currentPath && currentPath.length > 0;
  const eta = formatETA(elapsedMs, overallProgress);

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface)] p-4 space-y-3"
      data-testid="current-operation-card"
      role="status"
      aria-live="polite"
      aria-label={`Current operation: ${currentOperation ?? 'Idle'} on ${currentModule ?? 'no module'}`}
    >
      {/* Header row: operation icon + module + operation label */}
      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2">
          <OpIcon className="h-5 w-5 text-brand-primary" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-caption text-text-muted uppercase tracking-wide">
            {isOptimizing ? 'Optimizing' : 'Scanning'}
          </div>
          <div className="text-body font-semibold text-text-primary truncate">
            {currentModule ?? 'Preparing...'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-caption text-text-muted">Operation</div>
          <div className="text-small font-semibold text-brand-primary">
            {currentOperation ?? '—'}
          </div>
        </div>
      </div>

      {/* Current path */}
      {hasPath && (
        <div className="flex items-center gap-2 rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-3 py-2">
          <FolderOpenIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          <span className="text-caption font-mono text-text-secondary truncate" title={currentPath ?? undefined}>
            {currentPath}
          </span>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          icon={<DocumentTextIcon className="h-4 w-4" />}
          label="Processed"
          value={itemsProcessed.toLocaleString()}
        />
        <StatTile
          icon={<ClockIcon className="h-4 w-4" />}
          label="Remaining"
          value={itemsRemaining > 0 ? itemsRemaining.toLocaleString() : '—'}
        />
        <StatTile
          icon={<CircleStackIcon className="h-4 w-4" />}
          label="Recovered"
          value={bytesRecovered > 0 ? formatBytes(bytesRecovered) : '—'}
        />
        <StatTile
          icon={<ClockIcon className="h-4 w-4" />}
          label="ETA"
          value={eta}
        />
      </div>

      {/* Progress + elapsed row */}
      <div className="flex items-center justify-between text-caption text-text-muted">
        <span>
          Elapsed: <span className="font-medium text-text-primary tabular-nums">{formatDuration(elapsedMs)}</span>
        </span>
        <span>
          Progress: <span className="font-medium text-text-primary tabular-nums">{Math.round(overallProgress)}%</span>
        </span>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-3 py-2">
      <div className="flex items-center gap-1.5 text-text-muted">
        <span className="shrink-0" aria-hidden>{icon}</span>
        <span className="text-micro uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-0.5 text-small font-semibold text-text-primary tabular-nums">
        {value}
      </div>
    </div>
  );
}
