/**
 * RollbackResultPanel.tsx — summary of the `scan_core.remediation.rollback` RPC result.
 *
 * Does not perform any direct restoration; it only renders the backend summary.
 */
import { Card, Button } from '@avs/ui';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import type { RollbackStep, RollbackSummary } from './types';

export interface RollbackResultPanelProps {
  summary?: RollbackSummary | null;
  step: RollbackStep;
  rollbackError?: string | null;
  onBack: () => void;
}

export function RollbackResultPanel({
  summary,
  step,
  rollbackError,
  onBack,
}: RollbackResultPanelProps) {
  const base = (
    <div className="space-y-5" data-testid="rollback-result-panel">
      <div className="text-center space-y-3">
        {step === 'success' && (
          <>
            <div className="inline-flex p-3 rounded-full bg-semantic-success/10">
              <CheckCircleIcon className="h-10 w-10 text-semantic-success" />
            </div>
            <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">Rollback Successful</h3>
            <p className="text-small text-[var(--avs-text-secondary)]" data-testid="rollback-result-success">
              {summary?.successful ?? 0} of {summary?.total ?? 0} completed actions were restored.
            </p>
          </>
        )}

        {step === 'partial' && (
          <>
            <div className="inline-flex p-3 rounded-full bg-semantic-warning/10">
              <ExclamationTriangleIcon className="h-10 w-10 text-semantic-warning" />
            </div>
            <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">Rollback Partial</h3>
            <p
              className="text-small text-[var(--avs-text-secondary)]"
              data-testid="rollback-result-partial"
            >
              {summary?.successful ?? 0} restored, {summary?.failed ?? 0} failed out of {summary?.total ?? 0}.
            </p>
          </>
        )}

        {step === 'failed' && (
          <>
            <div className="inline-flex p-3 rounded-full bg-semantic-danger/10">
              <XCircleIcon className="h-10 w-10 text-semantic-danger" />
            </div>
            <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">Rollback Failed</h3>
            <p className="text-small text-[var(--avs-text-secondary)]" data-testid="rollback-result-failed">
              {summary?.failed ?? 0} action(s) could not be restored.
              {rollbackError && (
                <span className="block text-semantic-danger mt-1">{rollbackError}</span>
              )}
            </p>
          </>
        )}

        {step === 'unavailable' && (
          <>
            <div className="inline-flex p-3 rounded-full bg-semantic-info/10">
              <InformationCircleIcon className="h-10 w-10 text-semantic-info" />
            </div>
            <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">Rollback Unavailable</h3>
            <p className="text-small text-[var(--avs-text-secondary)]" data-testid="rollback-result-unavailable">
              This execution cannot be rolled back. Either no actions completed, the plan does not support
              rollback, or the rollback window has expired.
              {rollbackError && (
                <span className="block text-semantic-info mt-1">{rollbackError}</span>
              )}
            </p>
          </>
        )}
      </div>

      {summary && summary.results.length > 0 && (
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-4 space-y-3">
          <h4 className="text-small font-semibold text-[var(--avs-text-primary)]">Rollback details</h4>
          <ul className="space-y-2 text-small">
            {summary.results.map((result) => (
              <li
                key={result.action_id}
                className="flex items-start justify-between gap-3"
                data-testid={`rollback-result-row-${result.action_id}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--avs-text-primary)] truncate">{result.action_id}</p>
                  {result.restored_path && (
                    <p className="text-[var(--avs-text-muted)]" data-testid="rollback-restored-path">
                      {result.restored_path}
                    </p>
                  )}
                  {result.reason && (
                    <p
                      className={
                        result.success
                          ? 'text-[var(--avs-text-muted)]'
                          : 'text-semantic-danger'
                      }
                      data-testid="rollback-failure-reason"
                    >
                      {result.reason}
                    </p>
                  )}
                </div>
                <div
                  className={`shrink-0 font-medium ${
                    result.success ? 'text-semantic-success' : 'text-semantic-danger'
                  }`}
                >
                  {result.success ? 'Restored' : 'Failed'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 pt-2">
        <Button variant="secondary" onClick={onBack} data-testid="rollback-back-to-results-btn">
          Back to Results
        </Button>
      </div>
    </div>
  );

  return (
    <Card variant="glass" className="p-6">
      {base}
    </Card>
  );
}
