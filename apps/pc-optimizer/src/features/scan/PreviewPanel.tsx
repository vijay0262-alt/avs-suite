/**
 * PreviewPanel.tsx — read-only remediation preview.
 *
 * Displays the plan summary, safety state, fixability, and affected targets.
 * No system changes are made from this component.
 */
import { Button } from '@avs/ui';
import { formatCounterValue } from '../unified-scan/unifiedScanTypes';
import type { RemediationPreview } from './types';

export interface PreviewPanelProps {
  preview: RemediationPreview;
  onValidate: () => void;
  onBack: () => void;
}

function displayTarget(target: { display_name: string; path?: string } | string): string {
  if (typeof target === 'string') return target;
  return target.display_name ?? target.path ?? 'Unknown target';
}

function CountList({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)]">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2"
          >
            <div className="text-caption text-[var(--avs-text-muted)]">{key}</div>
            <div className="text-body font-medium text-[var(--avs-text-primary)]">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PreviewPanel({ preview, onValidate, onBack }: PreviewPanelProps) {
  const targets = preview.affected_targets ?? [];

  return (
    <div className="space-y-5" data-testid="remediation-preview-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">
          Remediation Preview
        </h3>
        {preview.is_stale && (
          <span className="inline-flex items-center rounded-full bg-semantic-warning/10 px-2.5 py-1 text-caption font-medium text-semantic-warning">
            Stale
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Total Actions</div>
          <div className="text-2xl font-semibold text-[var(--avs-text-primary)]">
            {preview.total_actions}
          </div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Affected Targets</div>
          <div className="text-2xl font-semibold text-[var(--avs-text-primary)]">
            {targets.length}
          </div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Estimated Size</div>
          <div className="text-2xl font-semibold text-[var(--avs-text-primary)]">
            {formatCounterValue(preview.estimated_size, 'bytes')}
          </div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
          <div className="text-caption text-[var(--avs-text-muted)]">Backup Required</div>
          <div className="text-2xl font-semibold text-[var(--avs-text-primary)]">
            {preview.backup_required ? 'Yes' : 'No'}
          </div>
        </div>
      </div>

      {targets.length > 0 && (
        <div className="space-y-1">
          <div className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)]">
            Affected Targets
          </div>
          <ul className="max-h-32 overflow-y-auto rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2 space-y-1">
            {targets.map((target, index) => (
              <li
                key={`${displayTarget(target)}-${index}`}
                className="text-small text-[var(--avs-text-secondary)] truncate"
              >
                {displayTarget(target)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <CountList title="Action Types" counts={preview.action_types ?? {}} />
      <CountList title="Safety States" counts={preview.safety_state_counts ?? {}} />
      <CountList title="Fixability" counts={preview.fixability_counts ?? {}} />

      <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 space-y-1">
        <div className="text-caption text-[var(--avs-text-muted)]">Rollback Supported</div>
        <div className="text-body font-medium text-[var(--avs-text-primary)]">
          {preview.rollback_supported ? 'Yes' : 'No'}
        </div>
        <div className="text-caption text-[var(--avs-text-muted)]">Generated At</div>
        <div className="text-body font-medium text-[var(--avs-text-primary)]">
          {preview.generated_at}
        </div>
      </div>

      {preview.warnings && preview.warnings.length > 0 && (
        <div className="space-y-2">
          <div className="text-caption font-semibold uppercase tracking-wide text-semantic-warning">
            Warnings
          </div>
          <ul className="list-disc pl-5 space-y-1 text-small text-[var(--avs-text-secondary)]">
            {preview.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onBack} data-testid="preview-back-btn">
          Back
        </Button>
        <Button onClick={onValidate} data-testid="preview-validate-btn">
          Validate Plan
        </Button>
      </div>
    </div>
  );
}
