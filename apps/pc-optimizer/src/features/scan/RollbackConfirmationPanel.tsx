/**
 * RollbackConfirmationPanel.tsx — confirmation step before calling the
 * `scan_core.remediation.rollback` RPC.
 *
 * Does not perform any filesystem/registry/browser restoration itself.
 */
import { Card, Button } from '@avs/ui';
import { ArrowUturnLeftIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export interface RollbackConfirmationPanelProps {
  executionId: string;
  completedCount: number;
  totalCount: number;
  affectedTargets: Array<{ display_name: string; path?: string } | string>;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RollbackConfirmationPanel({
  executionId,
  completedCount,
  totalCount,
  affectedTargets,
  onConfirm,
  onCancel,
}: RollbackConfirmationPanelProps) {
  return (
    <Card variant="glass" className="p-6" data-testid="rollback-confirmation-panel">
      <div className="text-center space-y-4">
        <div className="inline-flex p-3 rounded-full bg-[var(--avs-surface-muted)]">
          <ArrowUturnLeftIcon className="h-8 w-8 text-semantic-warning" />
        </div>
        <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">Rollback Changes</h3>

        <div className="text-left space-y-3 text-small text-[var(--avs-text-secondary)]">
          <p>
            <strong className="text-[var(--avs-text-primary)]">Execution ID:</strong>{' '}
            <code className="text-xs bg-[var(--avs-surface-muted)] px-1 py-0.5 rounded">{executionId}</code>
          </p>
          <p>
            This will attempt to reverse <strong className="text-[var(--avs-text-primary)]">{completedCount}</strong>{' '}
            of <strong className="text-[var(--avs-text-primary)]">{totalCount}</strong> completed actions.
          </p>

          {affectedTargets.length > 0 && (
            <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
              <div className="text-caption text-[var(--avs-text-muted)] mb-1">Affected targets</div>
              <ul className="list-disc list-inside space-y-1">
                {affectedTargets.slice(0, 10).map((target, index) => {
                  const label = typeof target === 'string' ? target : target.display_name;
                  return (
                    <li key={index} className="text-[var(--avs-text-secondary)]">
                      {label}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-[var(--avs-radius-md)] bg-semantic-warning/10 p-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning shrink-0 mt-0.5" />
            <p className="text-[var(--avs-text-secondary)]">
              Rollback will attempt to restore backed-up changes, but not every action may be reversible.
              Confirm only if you want to undo the completed remediation steps.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="secondary" onClick={onCancel} data-testid="rollback-cancel-btn">
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} data-testid="rollback-confirm-btn">
            Confirm Rollback
          </Button>
        </div>
      </div>
    </Card>
  );
}
