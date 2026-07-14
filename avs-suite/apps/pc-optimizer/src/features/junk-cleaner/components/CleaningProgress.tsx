import { Button, ProgressBar } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { StopIcon } from '@heroicons/react/24/outline';
import { Modal } from './Modal';
import type { CleaningStatusSnapshot } from '../junkCleaner.types';

export interface CleaningProgressProps {
  open: boolean;
  snapshot: CleaningStatusSnapshot;
  onCancel: () => void;
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

/**
 * Live progress dialog shown during a running cleaning task. Modal by
 * design — the user should not switch pages mid-clean.
 */
export function CleaningProgress({ open, snapshot, onCancel }: CleaningProgressProps) {
  const totalTargets = snapshot.cleaners?.reduce((n, c) => n + (c.totalCandidates ?? 0), 0) ?? 0;
  const totalRemoved =
    (snapshot.totalFilesRemoved ?? 0) +
    (snapshot.totalFilesSkipped ?? 0) +
    (snapshot.totalFilesFailed ?? 0);
  const remaining = Math.max(0, totalTargets - totalRemoved);

  return (
    <Modal
      open={open}
      title="Cleaning in progress"
      onClose={onCancel}
      size="md"
      testId="cleaning-progress-dialog"
      actions={
        <Button
          variant="danger"
          onClick={onCancel}
          leftIcon={<StopIcon className="h-4 w-4" />}
          data-testid="cleaning-progress-cancel"
        >
          Stop
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-medium text-text-primary">
              {snapshot.currentCleaner ?? 'Starting…'}
            </span>
            <span className="text-xs tabular-nums text-text-muted">
              {snapshot.progress ?? 0}%
            </span>
          </div>
          <ProgressBar value={snapshot.progress ?? 0} tone="brand" />
          <p
            className="mt-2 truncate font-mono text-xs text-text-muted"
            title={snapshot.currentFile ?? undefined}
            data-testid="cleaning-progress-current-file"
          >
            {snapshot.currentFile ?? '—'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <Metric label="Files removed" value={(snapshot.totalFilesRemoved ?? 0).toLocaleString()} testId="cp-removed" />
          <Metric label="Recovered" value={formatBytes(snapshot.totalBytesRecovered ?? 0)} testId="cp-recovered" />
          <Metric label="Remaining" value={remaining.toLocaleString()} testId="cp-remaining" />
          <Metric label="Estimated time" value={fmtDuration(snapshot.etaMs)} testId="cp-eta" />
        </div>

        {(snapshot.totalFilesSkipped ?? 0) > 0 || (snapshot.totalFilesFailed ?? 0) > 0 ? (
          <div className="rounded-md border border-border bg-surface-muted p-3 text-xs text-text-secondary">
            Skipped: {(snapshot.totalFilesSkipped ?? 0).toLocaleString()} ·
            Failed: {(snapshot.totalFilesFailed ?? 0).toLocaleString()} · These files were
            excluded for safety (locks, permissions, or protected paths).
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function Metric({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div
        className="mt-0.5 text-lg font-semibold text-text-primary tabular-nums"
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  );
}
