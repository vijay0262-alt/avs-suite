import { Card, ProgressBar } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import type { ScanStatusSnapshot } from '../junkCleaner.types';

export interface ScanProgressProps {
  snapshot: ScanStatusSnapshot;
}

/**
 * Live-progress panel — total junk, files, current scanner, ETA.
 * Shown while scanning; also shown after completion as a summary.
 */
export function ScanProgress({ snapshot }: ScanProgressProps) {
  const running = snapshot.status === 'running';
  const progress = snapshot.progress ?? 0;
  const totalBytes = snapshot.totalBytes ?? 0;
  const totalFiles = snapshot.totalFiles ?? 0;
  const errorCount = snapshot.errorCount ?? 0;

  return (
    <Card
      title={running ? 'Scanning your PC…' : 'Scan summary'}
      className="mb-4"
      data-testid="junk-scan-progress"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Total Junk</div>
          <div
            className="mt-1 text-2xl font-semibold text-text-primary tabular-nums"
            data-testid="junk-total-bytes"
          >
            {formatBytes(totalBytes)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Total Files</div>
          <div
            className="mt-1 text-2xl font-semibold text-text-primary tabular-nums"
            data-testid="junk-total-files"
          >
            {totalFiles.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Current Scanner</div>
          <div
            className="mt-1 truncate text-lg font-medium text-text-primary"
            data-testid="junk-current-cleaner"
            title={snapshot.currentCleaner ?? undefined}
          >
            {snapshot.currentCleaner ?? (running ? 'Starting…' : '—')}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">
            {running ? 'Estimated Remaining' : 'Duration'}
          </div>
          <div
            className="mt-1 text-lg font-medium text-text-primary tabular-nums"
            data-testid="junk-eta"
          >
            {running ? formatDuration(snapshot.etaMs) : formatDuration(snapshot.durationMs ?? 0)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar
          value={progress}
          label={running ? 'Overall progress' : `Finished · ${errorCount} warnings`}
          tone={
            snapshot.status === 'failed'
              ? 'danger'
              : snapshot.status === 'cancelled'
                ? 'warning'
                : 'brand'
          }
        />
      </div>
    </Card>
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}
