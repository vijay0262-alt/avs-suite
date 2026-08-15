/**
 * FindingsList.tsx — renders a list of `ScanFinding` cards.
 *
 * Actionable findings have a checkbox; blocked, review-required, and
 * detection-only findings are shown read-only.
 */
import { Card } from '@avs/ui';
import { formatCounterValue } from '../unified-scan/unifiedScanTypes';
import type { ScanFinding } from './types';

export interface FindingsListProps {
  findings: ScanFinding[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

function isActionable(finding: ScanFinding): boolean {
  return finding.is_actionable === true && !finding.is_blocked && !finding.requires_review;
}

export function FindingsList({ findings, selectedIds, onToggle }: FindingsListProps) {
  if (findings.length === 0) {
    return (
      <div
        className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-6 text-center text-small text-[var(--avs-text-secondary)]"
        data-testid="findings-list-empty"
      >
        No findings to display.
      </div>
    );
  }

  return (
    <div
      className="space-y-3 max-h-[420px] overflow-y-auto pr-1"
      data-testid="findings-list"
    >
      {findings.map((finding) => {
        const actionable = isActionable(finding);
        const checked = selectedIds.has(finding.finding_id);

        let statusBadge: string | null = null;
        let statusColor = '';
        if (finding.is_blocked) {
          statusBadge = 'Blocked';
          statusColor = 'bg-semantic-danger/10 text-semantic-danger';
        } else if (finding.requires_review) {
          statusBadge = 'Requires review';
          statusColor = 'bg-semantic-warning/10 text-semantic-warning';
        } else if (!finding.is_actionable) {
          statusBadge = 'Detection only';
          statusColor = 'bg-[var(--avs-surface-elevated)] text-[var(--avs-text-muted)]';
        } else {
          statusBadge = 'Actionable';
          statusColor = 'bg-semantic-success/10 text-semantic-success';
        }

        return (
          <Card
            key={finding.finding_id}
            padded={false}
            variant={finding.is_blocked ? 'default' : 'default'}
            className="overflow-hidden"
            data-testid="finding-card"
          >
            <div className="px-4 py-3">
              <div className="flex items-start gap-3">
                {actionable ? (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(finding.finding_id)}
                    className="mt-1 h-4 w-4 accent-brand-primary cursor-pointer"
                    data-testid={`finding-checkbox-${finding.finding_id}`}
                    aria-label={`Select ${finding.display_name}`}
                  />
                ) : (
                  <span className="mt-1 h-4 w-4 inline-block rounded-full bg-[var(--avs-surface-muted)]" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-body font-medium text-[var(--avs-text-primary)] truncate">
                      {finding.display_name}
                    </h4>
                    {statusBadge && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium ${statusColor}`}
                      >
                        {statusBadge}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-caption text-[var(--avs-text-secondary)]">
                    <span>Rule: {finding.rule_id}</span>
                    <span>Category: {finding.rule_category}</span>
                    <span>Severity: {finding.severity}</span>
                    <span>Confidence: {finding.confidence}</span>
                    <span>Safety: {finding.safety}</span>
                    {finding.estimated_size > 0 && (
                      <span>Size: {formatCounterValue(finding.estimated_size, 'bytes')}</span>
                    )}
                  </div>
                  {finding.reason && (
                    <p className="mt-2 text-small text-[var(--avs-text-secondary)]">
                      {finding.reason}
                    </p>
                  )}
                  {finding.recommended_action && (
                    <p className="mt-1 text-small text-[var(--avs-text-muted)]">
                      Recommended: {finding.recommended_action}
                    </p>
                  )}
                  {finding.canonical_path && (
                    <p className="mt-1 text-caption font-mono text-[var(--avs-text-muted)] truncate">
                      {finding.canonical_path}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
