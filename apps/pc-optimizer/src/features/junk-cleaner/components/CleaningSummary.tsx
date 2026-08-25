import { Button, Badge } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, ArrowUturnLeftIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline';
import { Modal } from './Modal';
import { useElevation } from '../../../hooks/useElevation';
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

function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function fmtSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(1)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * Post-clean summary — shown once the CleaningManager marks the task
 * as completed / cancelled / failed. Per-category rollup + aggregate.
 */
export function CleaningSummary({ open, snapshot, onClose, onUndo }: CleaningSummaryProps) {
  const { isAdmin, relaunchAsAdmin } = useElevation();
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
  
  // Calculate additional metrics
  const durationMs = snapshot.durationMs ?? 0;
  const bytesRecovered = snapshot.totalBytesRecovered ?? 0;
  const filesRemoved = snapshot.totalFilesRemoved ?? 0;
  const filesSkipped = snapshot.totalFilesSkipped ?? 0;
  const filesFailed = snapshot.totalFilesFailed ?? 0;
  const totalFiles = filesRemoved + filesSkipped + filesFailed;
  
  const speed = durationMs > 0 ? (bytesRecovered / (durationMs / 1000)) : 0;

  const totalCandidates = (snapshot.cleaners ?? []).reduce(
    (n, c) => n + (c.totalCandidates ?? 0),
    0,
  );
  const remaining = Math.max(0, totalCandidates - totalFiles);

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
        {/* Overall result */}
        <div className="flex items-center gap-3">
          <Icon className={`h-8 w-8 ${tone}`} aria-hidden />
          <div>
            <div
              className="text-statistic font-semibold text-text-primary tabular-nums"
              data-testid="cleaning-summary-recovered"
            >
              Recovered {formatBytes(bytesRecovered)}
            </div>
            <div className="text-small text-text-secondary">
              {filesRemoved.toLocaleString()} files removed in {fmtDuration(durationMs)}
            </div>
          </div>
        </div>

        {/* Detailed metrics */}
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="Cleanable Files" value={totalFiles} testId="cs-total" />
          <StatCard label="Removed" value={filesRemoved} testId="cs-removed" />
          <StatCard label="Skipped" value={filesSkipped} testId="cs-skipped" />
          <StatCard label="Failed" value={filesFailed} testId="cs-failed" />
          <StatCard label="Remaining" value={remaining} testId="cs-remaining" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Recovered" value={formatBytes(bytesRecovered)} testId="cs-recovered" />
          <StatCard label="Elapsed" value={fmtDuration(durationMs)} testId="cs-elapsed" />
          <StatCard label="Avg speed" value={fmtSpeed(speed)} testId="cs-speed" />
        </div>

        {/* Per category breakdown */}
        <div>
          <div className="mb-2 text-caption uppercase tracking-wide text-text-muted">Per category</div>
          <table className="w-full text-small" data-testid="cleaning-summary-table">
            <thead>
              <tr className="border-b border-[var(--avs-border)] text-caption uppercase text-text-muted">
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
                <tr key={c.id} className="border-b border-[var(--avs-border)]/60">
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
        
        {/* Errors/warnings if any */}
        {(snapshot.totalFilesFailed ?? 0) > 0 && (
          <div className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-3 text-caption text-text-secondary">
            <div className="mb-1">
              Some files could not be cleaned due to locks, permissions, or other errors.
              These files were skipped for safety.
            </div>
            {!isAdmin && (filesFailed > 0 || filesSkipped > 0) && (
              <div className="mt-2 flex items-center gap-2">
                <ShieldExclamationIcon className="h-4 w-4 shrink-0 text-[color-mix(in_srgb,var(--avs-warning)_85%,black)]" />
                <span className="flex-1">
                  {filesFailed + filesSkipped} file(s) were skipped — some may require administrator privileges.
                </span>
                <button
                  type="button"
                  onClick={() => void relaunchAsAdmin()}
                  className="flex items-center gap-1.5 rounded-[var(--avs-radius-sm)] bg-[color-mix(in_srgb,var(--avs-warning)_85%,black)] px-2.5 py-1 text-caption font-medium text-white transition-opacity hover:opacity-90"
                  data-testid="cleaning-summary-elevate-btn"
                >
                  Restart as Admin
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function StatCard({ label, value, testId }: { label: string; value: number | string; testId: string }) {
  return (
    <div className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-3">
      <div className="text-caption uppercase text-text-muted">{label}</div>
      <div
        className="mt-1 text-xl font-semibold text-text-primary tabular-nums"
        data-testid={testId}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
