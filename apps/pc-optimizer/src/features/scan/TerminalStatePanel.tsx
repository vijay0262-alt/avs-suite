/**
 * TerminalStatePanel.tsx — final state for a remediation execution.
 *
 * Displays counts and a safe summary message.  No rollback controls are shown.
 */
import { Button } from '@avs/ui';
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon, NoSymbolIcon } from '@heroicons/react/24/outline';
import type { RemediationExecutionStatus } from './types';

export interface TerminalStatePanelProps {
  status: RemediationExecutionStatus;
  onBack: () => void;
  onRollback?: () => void;
  rollbackAvailable?: boolean;
}

const statusConfig: Record<
  string,
  { title: string; message: string; color: string; Icon: typeof CheckCircleIcon }
> = {
  completed: {
    title: 'Remediation Completed',
    message: 'All approved actions completed successfully.',
    color: 'text-semantic-success',
    Icon: CheckCircleIcon,
  },
  partial: {
    title: 'Remediation Partially Completed',
    message: 'Some actions completed; review the failed or rejected items.',
    color: 'text-semantic-warning',
    Icon: ExclamationCircleIcon,
  },
  failed: {
    title: 'Remediation Failed',
    message: 'The remediation could not be completed.',
    color: 'text-semantic-danger',
    Icon: XCircleIcon,
  },
  cancelled: {
    title: 'Remediation Cancelled',
    message: 'The remediation was cancelled before completion.',
    color: 'text-semantic-warning',
    Icon: NoSymbolIcon,
  },
};

export function TerminalStatePanel({ status, onBack, onRollback, rollbackAvailable }: TerminalStatePanelProps) {
  const config = statusConfig[status.status.toLowerCase()] ?? {
    title: 'Remediation Finished',
    message: status.reason ?? 'The remediation has ended.',
    color: 'text-[var(--avs-text-primary)]',
    Icon: ExclamationCircleIcon,
  };
  const { Icon, color } = config;

  return (
    <div className="space-y-5" data-testid={`terminal-state-${status.status.toLowerCase()}`}>
      <div className="text-center space-y-3">
        <div className="inline-flex p-3 rounded-full bg-[var(--avs-surface-muted)]">
          <Icon className={`h-10 w-10 ${color}`} />
        </div>
        <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">{config.title}</h3>
        <p className="text-small text-[var(--avs-text-secondary)]">{config.message}</p>
        {status.reason && <p className="text-small text-[var(--avs-text-muted)]">{status.reason}</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
          <div className="text-caption text-[var(--avs-text-muted)]">Completed</div>
          <div className="text-body font-semibold text-[var(--avs-text-primary)]">{status.completed}</div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
          <div className="text-caption text-[var(--avs-text-muted)]">Failed</div>
          <div className="text-body font-semibold text-semantic-danger">{status.failed}</div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
          <div className="text-caption text-[var(--avs-text-muted)]">Rejected</div>
          <div className="text-body font-semibold text-semantic-warning">{status.rejected}</div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
          <div className="text-caption text-[var(--avs-text-muted)]">Skipped</div>
          <div className="text-body font-semibold text-[var(--avs-text-primary)]">{status.skipped}</div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        {onRollback && rollbackAvailable && (
          <Button onClick={onRollback} data-testid="terminal-rollback-btn">
            Rollback Changes
          </Button>
        )}
        <Button variant="secondary" onClick={onBack} data-testid="terminal-back-btn">
          Back to Results
        </Button>
      </div>
    </div>
  );
}
