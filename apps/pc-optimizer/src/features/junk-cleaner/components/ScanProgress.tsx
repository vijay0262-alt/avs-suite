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
  const totalItems = snapshot.totalItems ?? totalFiles;
  const errorCount = snapshot.errorCount ?? 0;
  const currentPath = snapshot.currentPath ?? null;
  const currentCleaner = snapshot.currentCleaner ?? null;

  return (
    <Card
      title={running ? 'Scanning your PC…' : 'Scan summary'}
      className="mb-4"
      data-testid="junk-scan-progress"
    >
      {/* Live file display — prominent like SUPERAntiSpyware / CCleaner */}
      {running && (
        <div className="mb-4 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-3" data-testid="junk-live-file">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-primary" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-text-secondary">
                {currentCleaner ? `Scanning: ${currentCleaner}` : 'Starting scan…'}
              </div>
              {currentPath && (
                <div
                  className="mt-0.5 truncate text-xs text-text-muted font-mono"
                  title={currentPath}
                  data-testid="junk-current-file"
                >
                  {currentPath}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Files Scanned</div>
          <div
            className="mt-1 text-2xl font-semibold text-text-primary tabular-nums"
            data-testid="junk-total-files"
          >
            {totalFiles.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Items Found</div>
          <div
            className="mt-1 text-2xl font-semibold text-text-primary tabular-nums"
            data-testid="junk-total-items"
          >
            {totalItems.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Junk Identified</div>
          <div
            className="mt-1 text-2xl font-semibold text-text-primary tabular-nums"
            data-testid="junk-total-bytes"
          >
            {formatBytes(totalBytes)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-text-muted">Elapsed Time</div>
          <div
            className="mt-1 text-lg font-medium text-text-primary tabular-nums"
            data-testid="junk-elapsed"
          >
            {formatDuration(snapshot.durationMs ?? 0)}
          </div>
          <div className="text-xs text-text-muted tabular-nums mt-1">
            {running ? `Remaining: ${formatDuration(snapshot.etaMs)}` : `Duration: ${formatDuration(snapshot.durationMs ?? 0)}`}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-text-muted">Current Operation</div>
          <div
            className="mt-1 truncate text-lg font-medium text-text-primary"
            data-testid="junk-current-cleaner"
            title={currentCleaner ?? undefined}
          >
            {currentCleaner ?? (running ? 'Starting…' : '—')}
          </div>
        </div>
        {currentPath && (
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-text-muted">Current Path</div>
            <div
              className="mt-1 truncate text-sm font-medium text-text-primary"
              data-testid="junk-current-path"
              title={currentPath}
            >
              {currentPath}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <ProgressBar
          value={progress}
          label={running ? `Scanning… ${progress}%` : `Finished · ${errorCount} warnings`}
          tone={
            snapshot.status === 'failed'
              ? 'danger'
              : snapshot.status === 'cancelled'
                ? 'warning'
                : 'brand'
          }
        />
      </div>

      {/* Per-cleaner progress bars — shown while scanning */}
      {running && snapshot.cleaners && snapshot.cleaners.length > 0 && (
        <div className="mt-4 space-y-2" data-testid="junk-per-cleaner-progress">
          {snapshot.cleaners
            .filter((c) => (c.progress ?? 0) < 100)
            .slice(0, 6)
            .map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs text-text-secondary" title={c.name}>
                  {c.name}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--avs-surface-muted)]">
                  <div
                    className="h-full rounded-full bg-brand-primary transition-all duration-300"
                    style={{ width: `${c.progress ?? 0}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">
                  {c.progress ?? 0}%
                </span>
              </div>
            ))}
        </div>
      )}
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
