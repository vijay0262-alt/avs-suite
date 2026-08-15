/**
 * ValidationPanel.tsx — displays the result of a remediation validation and,
 * when valid, the explicit approval step.
 *
 * The `Approve & Fix` button is disabled unless the validation is valid and a
 * preview with an approval token is present.  No remediation is run without an
 * explicit user approval.
 */
import { Button } from '@avs/ui';
import type { RemediationPreview, RemediationValidation } from './types';

export interface ValidationPanelProps {
  validation: RemediationValidation;
  preview: RemediationPreview | null;
  onApprove: () => void;
  onBack: () => void;
}

export function ValidationPanel({ validation, preview, onApprove, onBack }: ValidationPanelProps) {
  const canApprove = validation.valid === true && preview !== null;

  return (
    <div className="space-y-5" data-testid="remediation-validation-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">
          Validation Result
        </h3>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-caption font-medium ${
            validation.valid
              ? 'bg-semantic-success/10 text-semantic-success'
              : 'bg-semantic-danger/10 text-semantic-danger'
          }`}
        >
          {validation.valid ? 'Valid' : 'Blocked'}
        </span>
      </div>

      {!validation.valid && (
        <div
          className="rounded-[var(--avs-radius-md)] bg-semantic-danger/10 p-3 text-small text-semantic-danger"
          data-testid="validation-blocked-message"
        >
          Validation failed / execution blocked. Review the warnings before continuing.
        </div>
      )}

      {validation.valid && preview && (
        <div
          className="rounded-[var(--avs-radius-md)] bg-semantic-success/10 p-3 text-small text-semantic-success"
          data-testid="validation-approval-section"
        >
          <div className="text-body font-semibold">Ready for approval</div>
          <p className="mt-1 text-small">
            {validation.total} action(s) reviewed, {validation.completed} ready to execute.
          </p>
          <p className="text-small">{preview.affected_targets.length} affected target(s).</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Status</div>
          <div className="text-body font-medium text-[var(--avs-text-primary)]">{validation.status}</div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Total</div>
          <div className="text-body font-medium text-[var(--avs-text-primary)]">{validation.total}</div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Completed</div>
          <div className="text-body font-medium text-[var(--avs-text-primary)]">{validation.completed}</div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Failed</div>
          <div className="text-body font-medium text-semantic-danger">{validation.failed}</div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Rejected</div>
          <div className="text-body font-medium text-semantic-danger">{validation.rejected}</div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Requires Review</div>
          <div className="text-body font-medium text-semantic-warning">{validation.requires_review}</div>
        </div>
      </div>

      <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
        <div className="text-caption text-[var(--avs-text-muted)]">Dry Run</div>
        <div className="text-body font-medium text-[var(--avs-text-primary)]">
          {validation.dry_run ? 'Yes' : 'No'}
        </div>
      </div>

      {validation.summary && (
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption font-semibold text-[var(--avs-text-muted)]">Summary</div>
          <p className="mt-1 text-small text-[var(--avs-text-secondary)]">{validation.summary}</p>
        </div>
      )}

      {validation.warnings && validation.warnings.length > 0 && (
        <div className="space-y-2">
          <div className="text-caption font-semibold uppercase tracking-wide text-semantic-warning">
            Warnings
          </div>
          <ul className="list-disc pl-5 space-y-1 text-small text-[var(--avs-text-secondary)]">
            {validation.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onBack} data-testid="validation-back-btn">
          Back
        </Button>
        {validation.valid && (
          <Button
            onClick={onApprove}
            disabled={!canApprove}
            data-testid="validation-approve-btn"
          >
            Approve & Fix
          </Button>
        )}
      </div>
    </div>
  );
}
