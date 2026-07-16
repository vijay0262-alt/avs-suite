import { Button, Badge } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { Modal } from './Modal';
import type { CleaningStatusSnapshot } from '../junkCleaner.types';

export interface CleaningSummaryProps {
  open: boolean;
  snapshot: CleaningStatusSnapshot;
  onClose: () => void;
  onUndo?: () => void;
}

const RESULT_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'brand'> = {
  success: 'success',
  partial: 'warning',
  cancelled: 'warning',
  failed: 'danger',
  nothing: 'neutral',
  pending: 'neutral',
};

/**
 * Post-clean summary — shown once the CleaningManager marks the task
 * as completed / cancelled / failed. Per-category rollup + aggregate.
 */
export function CleaningSummary({ open, snapshot, onClose, onUndo }: CleaningSummaryProps) {
  const overall = snapshot.status ?? 'completed';
  const Icon =
    overall === 'completed'
      ? CheckCircleIcon
      : overall === 'failed'
        ? XCircleIcon
        : ExclamationTriangleIcon;
  const tone =
    overall === 'completed'
      ? 'text-semantic-success'
      : overall === 'failed'
        ? 'text-semantic-danger'
        : 'text-[color-mix(in_srgb,var(--avs-warning)_85%,black)]';

  const canUndo = overall === 'completed' && onUndo !== undefined;

  return (
    <Modal
      open={open}
      title="Cleaning summary"
      onClose={onClose}
      size="lg"
      testId="cleaning-summary-dialog"
      actions={
        <div className="flex items-center gap-2">
          {canUndo && (
            <Button
              variant="secondary"
              onClick={() => onUndo()}
              leftIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
              data-testid="cleaning-summary-undo"
            >
              Undo
            </Button>
          )}
          <Button onClick={onClose} data-testid="cleaning-summary-close">
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Icon className={`h-8 w-8 ${tone}`} aria-hidden />
          <div>
            <div
              className="text-2xl font-semibold text-text-primary tabular-nums"
              data-testid="cleaning-summary-recovered"
            >
              Recovered {formatBytes(snapshot.totalBytesRecovered ?? 0)}
            </div>
            <div className="text-sm text-text-secondary">
              {(snapshot.totalFilesRemoved ?? 0).toLocaleString()} files removed in{' '}
              {Math.max(1, Math.round((snapshot.durationMs ?? 0) / 1000))}s
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Removed" value={snapshot.totalFilesRemoved ?? 0} testId="cs-removed" />
          <StatCard label="Skipped" value={snapshot.totalFilesSkipped ?? 0} testId="cs-skipped" />
          <StatCard label="Failed" value={snapshot.totalFilesFailed ?? 0} testId="cs-failed" />
          <StatCard label="Elapsed" value={`${Math.round((snapshot.durationMs ?? 0) / 100) / 10}s`} testId="cs-elapsed" />
        </div>

        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-text-muted">Per category</div>
          <table className="w-full text-sm" data-testid="cleaning-summary-table">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-text-muted">
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-right font-medium">Removed</th>
                <th className="py-2 text-right font-medium">Recovered</th>
                <th className="py-2 text-right font-medium">Skipped</th>
                <th className="py-2 text-right font-medium">Failed</th>
                <th className="py-2 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot.cleaners ?? []).map((c) => (
                <tr key={c.id} className="border-b border-border/60">
                  <td className="py-2 text-text-primary">{c.name}</td>
                  <td className="py-2 text-right tabular-nums">{c.filesRemoved.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums">{formatBytes(c.bytesRecovered)}</td>
                  <td className="py-2 text-right tabular-nums">{c.filesSkipped.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums">{c.filesFailed.toLocaleString()}</td>
                  <td className="py-2 text-right">
                    <Badge tone={RESULT_TONE[c.result] ?? 'neutral'}>{c.result}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function StatCard({ label, value, testId }: { label: string; value: number | string; testId: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-muted p-3">
      <div className="text-xs uppercase text-text-muted">{label}</div>
      <div
        className="mt-1 text-xl font-semibold text-text-primary tabular-nums"
        data-testid={testId}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
