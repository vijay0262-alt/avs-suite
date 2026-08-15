/**
 * ExecutionProgressPanel.tsx — live remediation execution status and cancel control.
 *
 * Displays real backend status and allows cancelling a non-terminal execution.
 */
import { Button } from '@avs/ui';
import type { RemediationExecutionStatus } from './types';

export interface ExecutionProgressPanelProps {
  status: RemediationExecutionStatus;
  onCancel: () => void;
  cancelling: boolean;
}

const TERMINAL_STATUSES = ['completed', 'partial', 'failed', 'cancelled'] as const;

function isTerminalStatus(status?: string): boolean {
  if (!status) return false;
  return TERMINAL_STATUSES.includes(status.toLowerCase() as typeof TERMINAL_STATUSES[number]);
}

export function ExecutionProgressPanel({ status, onCancel, cancelling }: ExecutionProgressPanelProps) {
  const isTerminal = isTerminalStatus(status.status);

  return (
    <div className="space-y-5" data-testid="execution-progress-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">
          Remediation in Progress
        </h3>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-caption font-medium bg-semantic-info/10 text-semantic-info"
          data-testid="execution-status-badge"
        >
          {status.status}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Completed</div>
          <div
            className="text-2xl font-semibold text-[var(--avs-text-primary)]"
            data-testid="execution-completed-count"
          >
            {status.completed} / {status.total}
          </div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Failed</div>
          <div
            className="text-2xl font-semibold text-semantic-danger"
            data-testid="execution-failed-count"
          >
            {status.failed}
          </div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Rejected</div>
          <div
            className="text-2xl font-semibold text-semantic-warning"
            data-testid="execution-rejected-count"
          >
            {status.rejected}
          </div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Skipped</div>
          <div
            className="text-2xl font-semibold text-[var(--avs-text-primary)]"
            data-testid="execution-skipped-count"
          >
            {status.skipped}
          </div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Requires Review</div>
          <div
            className="text-2xl font-semibold text-semantic-warning"
            data-testid="execution-review-count"
          >
            {status.requires_review}
          </div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Cancelled</div>
          <div
            className="text-2xl font-semibold text-[var(--avs-text-primary)]"
            data-testid="execution-cancelled-count"
          >
            {status.cancelled ? 'Yes' : 'No'}
          </div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Dry Run</div>
          <div
            className="text-2xl font-semibold text-[var(--avs-text-primary)]"
            data-testid="execution-dryrun-count"
          >
            {status.dry_run ? 'Yes' : 'No'}
          </div>
        </div>
      </div>

      {status.reason && (
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Reason</div>
          <div className="text-body font-medium text-[var(--avs-text-primary)]">{status.reason}</div>
        </div>
      )}

      {!isTerminal && (
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="danger"
            onClick={onCancel}
            disabled={cancelling}
            data-testid="execution-cancel-btn"
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        </div>
      )}
    </div>
  );
}
