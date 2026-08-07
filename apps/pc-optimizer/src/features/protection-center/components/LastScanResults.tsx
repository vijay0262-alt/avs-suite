import { CheckCircleIcon, TrashIcon, ArrowTrendingUpIcon, ClockIcon } from '@heroicons/react/24/outline';
import type { HealthScanHistoryEntry, OptimizeExecuteResponse } from '../../dashboard/dashboard.types';

export interface LastScanResultsProps {
  lastScan: HealthScanHistoryEntry | null;
  lastOptimizeResult: OptimizeExecuteResponse | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function LastScanResults({ lastScan, lastOptimizeResult }: LastScanResultsProps) {
  if (!lastScan && !lastOptimizeResult) {
    return (
      <div className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4 text-center">
        <p className="text-small text-[var(--avs-text-muted)]">No scans run yet. Click &ldquo;Scan Now&rdquo; to get started.</p>
      </div>
    );
  }

  const healthBefore = lastScan?.healthBefore ?? 0;
  const healthAfter = lastScan?.healthAfter ?? 0;
  const healthImprovement = healthAfter - healthBefore;
  const recoveredSpace = lastOptimizeResult?.totalRecovered ?? lastScan?.recoveredSpace ?? 0;
  const scanDate = lastOptimizeResult?.completedAt ?? lastScan?.date ?? null;
  const duration = lastOptimizeResult?.elapsedMs ?? lastScan?.durationMs ?? 0;
  const result = lastScan?.result ?? 'success';
  const modulesUsed = lastScan?.modulesUsed ?? [];

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4"
      role="region"
      aria-label="Last scan results"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-small font-semibold text-[var(--avs-text-primary)]">Last Scan Results</span>
        {scanDate && (
          <span className="text-caption text-[var(--avs-text-muted)] flex items-center gap-1">
            <ClockIcon className="h-3.5 w-3.5" />
            {timeAgo(scanDate)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Issues Detected */}
        <div className="rounded-md border border-[var(--avs-border)] p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircleIcon className="h-4 w-4 text-[var(--avs-brand)]" />
            <span className="text-caption text-[var(--avs-text-muted)]">Issues Detected</span>
          </div>
          <span className="text-statistic-sm text-[var(--avs-text-primary)] tabular-nums">
            {modulesUsed.length > 0 ? `${modulesUsed.length} modules` : '—'}
          </span>
        </div>

        {/* Space Recovered */}
        <div className="rounded-md border border-[var(--avs-border)] p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrashIcon className="h-4 w-4 text-[var(--avs-success)]" />
            <span className="text-caption text-[var(--avs-text-muted)]">Space Recovered</span>
          </div>
          <span className="text-statistic-sm text-[var(--avs-text-primary)] tabular-nums">
            {recoveredSpace > 0 ? formatBytes(recoveredSpace) : '—'}
          </span>
        </div>

        {/* Health Improvement */}
        <div className="rounded-md border border-[var(--avs-border)] p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowTrendingUpIcon className="h-4 w-4 text-[var(--avs-success)]" />
            <span className="text-caption text-[var(--avs-text-muted)]">Health Change</span>
          </div>
          <span className="text-statistic-sm text-[var(--avs-text-primary)] tabular-nums">
            {healthImprovement > 0 ? `+${healthImprovement}` : healthImprovement === 0 ? 'No change' : `${healthImprovement}`}
            <span className="text-caption text-[var(--avs-text-muted)] ml-1">({healthBefore} → {healthAfter})</span>
          </span>
        </div>

        {/* Duration */}
        <div className="rounded-md border border-[var(--avs-border)] p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <ClockIcon className="h-4 w-4 text-[var(--avs-text-muted)]" />
            <span className="text-caption text-[var(--avs-text-muted)]">Duration</span>
          </div>
          <span className="text-statistic-sm text-[var(--avs-text-primary)] tabular-nums">
            {duration > 0 ? formatDuration(duration) : '—'}
          </span>
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center justify-between">
        <span
          className={
            result === 'success'
              ? 'text-small font-medium text-[var(--avs-success)]'
              : result === 'partial'
                ? 'text-small font-medium text-[var(--avs-warning)]'
                : 'text-small font-medium text-[var(--avs-danger)]'
          }
        >
          {result === 'success' ? '✓ Completed successfully' : result === 'partial' ? '⚠ Partially completed' : '✗ Cancelled'}
        </span>
        {modulesUsed.length > 0 && (
          <span className="text-caption text-[var(--avs-text-muted)]">
            {modulesUsed.join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}
