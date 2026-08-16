/**
 * ResultsView.tsx — shared component for scan results, remediation preview,
 * validation/approval, and live execution.
 *
 * The only `scan_core.remediation.execute` call is triggered by the explicit
 * `Approve & Fix` button inside `useResults.approve`.
 */
import { Card, Button, LoadingState } from '@avs/ui';
import { ShieldCheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useResults } from './useResults';
import { FindingsList } from './FindingsList';
import { PreviewPanel } from './PreviewPanel';
import { ValidationPanel } from './ValidationPanel';
import { ExecutionProgressPanel } from './ExecutionProgressPanel';
import { TerminalStatePanel } from './TerminalStatePanel';
import { RollbackConfirmationPanel } from './RollbackConfirmationPanel';
import { RollbackResultPanel } from './RollbackResultPanel';
import type { ScanFinding, ScanStatistics } from './types';

export interface ResultsViewProps {
  moduleName: string;
  moduleIcon: string;
  statistics: ScanStatistics;
  findings: ScanFinding[];
  planId?: string;
  onClose: () => void;
  onRestart?: () => void;
}

const iconMap: Record<string, typeof ShieldCheckIcon> = {
  ShieldCheckIcon,
  SparklesIcon: ExclamationTriangleIcon,
  TrashIcon: ExclamationTriangleIcon,
};

function ModuleIcon({ icon }: { icon: string }) {
  const Icon = iconMap[icon] ?? ShieldCheckIcon;
  return <Icon className="h-7 w-7 text-brand-primary" />;
}

function getCount(statistics: ScanStatistics, key: string): number {
  const value = statistics[key];
  return typeof value === 'number' ? value : 0;
}

export function ResultsView({
  moduleName,
  moduleIcon,
  statistics,
  findings,
  planId,
  onClose,
  onRestart,
}: ResultsViewProps) {
  const {
    step,
    selectedIds,
    preview,
    validation,
    executionStatus,
    isCancelling,
    isRollbacking,
    rollbackStep,
    rollbackSummary,
    rollbackError,
    error,
    toggleFinding,
    selectAll,
    clearSelection,
    prepare,
    validate,
    approve,
    cancelExecution,
    initiateRollback,
    confirmRollback,
    cancelRollback,
    goBack,
  } = useResults({ planId, findings, statistics });

  const findingsCount = findings.length;
  const actionableCount = findings.filter((f) => f.is_actionable && !f.is_blocked).length;
  const blockedCount = findings.filter((f) => f.is_blocked).length;
  const reviewCount = findings.filter((f) => f.requires_review).length;
  const notFixableCount = findings.filter((f) => !f.is_actionable && !f.is_blocked && !f.requires_review).length;

  const selectedActionable = findings.filter(
    (f) => selectedIds.has(f.finding_id) && f.is_actionable && !f.is_blocked,
  );
  const canRemediate = Boolean(planId) && selectedActionable.length > 0;

  if (step === 'validating') {
    return (
      <Card variant="glass" className="p-8" data-testid="results-view-validating">
        <LoadingState message="Validating plan..." />
      </Card>
    );
  }

  if (step === 'preview' && preview) {
    return (
      <Card variant="glass" className="p-6" data-testid="results-view-preview">
        <PreviewPanel preview={preview} onValidate={validate} onBack={goBack} />
      </Card>
    );
  }

  if (step === 'awaiting_approval' && validation) {
    return (
      <Card variant="glass" className="p-6" data-testid="results-view-awaiting-approval">
        <ValidationPanel
          validation={validation}
          preview={preview}
          onApprove={approve}
          onBack={goBack}
        />
      </Card>
    );
  }

  if (step === 'executing' && executionStatus) {
    return (
      <Card variant="glass" className="p-6" data-testid="results-view-executing">
        <ExecutionProgressPanel
          status={executionStatus}
          onCancel={cancelExecution}
          cancelling={isCancelling}
        />
      </Card>
    );
  }

  if (step === 'rejected') {
    return (
      <Card variant="glass" className="p-8" data-testid="results-view-rejected">
        <div className="text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-semantic-danger/10">
            <ExclamationTriangleIcon className="h-8 w-8 text-semantic-danger" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Execution rejected</h3>
          <p className="text-small text-text-secondary">{error}</p>
          <Button variant="secondary" onClick={goBack} data-testid="rejected-back-btn">
            Back to Review
          </Button>
        </div>
      </Card>
    );
  }

  const isTerminal =
    step === 'completed' || step === 'partial' || step === 'failed' || step === 'cancelled';

  if (rollbackStep === 'confirm' && executionStatus && preview) {
    return (
      <Card variant="glass" className="p-6" data-testid="results-view-rollback-confirm">
        <RollbackConfirmationPanel
          executionId={executionStatus.execution_id}
          completedCount={executionStatus.completed}
          totalCount={executionStatus.total}
          affectedTargets={preview.affected_targets}
          onConfirm={confirmRollback}
          onCancel={cancelRollback}
        />
      </Card>
    );
  }

  if (rollbackStep === 'rollbacking' || isRollbacking) {
    return (
      <Card variant="glass" className="p-8" data-testid="results-view-rollbacking">
        <LoadingState message="Reverting changes..." />
      </Card>
    );
  }

  if (
    rollbackStep === 'success' ||
    rollbackStep === 'partial' ||
    rollbackStep === 'failed' ||
    rollbackStep === 'unavailable'
  ) {
    return (
      <Card variant="glass" className="p-6" data-testid={`results-view-rollback-${rollbackStep}`}>
        <RollbackResultPanel
          summary={rollbackSummary}
          step={rollbackStep}
          rollbackError={rollbackError}
          onBack={goBack}
        />
      </Card>
    );
  }

  if (isTerminal) {
    if (executionStatus) {
      const rollbackAvailable =
        executionStatus.completed > 0 &&
        preview?.rollback_supported === true;
      return (
        <Card variant="glass" className="p-6" data-testid={`results-view-${step}`}>
          <TerminalStatePanel
            status={executionStatus}
            onBack={goBack}
            onRollback={initiateRollback}
            rollbackAvailable={rollbackAvailable}
          />
        </Card>
      );
    }
    return (
      <Card variant="glass" className="p-8" data-testid="results-view-error">
        <div className="text-center space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">Execution State Unavailable</h3>
          <Button variant="secondary" onClick={goBack} data-testid="error-back-btn">
            Back
          </Button>
        </div>
      </Card>
    );
  }

  if (step === 'error') {
    return (
      <Card variant="glass" className="p-8" data-testid="results-view-error">
        <div className="text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-semantic-danger/10">
            <ExclamationTriangleIcon className="h-8 w-8 text-semantic-danger" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Preview Error</h3>
          <p className="text-small text-text-secondary">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary" onClick={goBack} data-testid="error-back-btn">
              Back
            </Button>
            {planId && (
              <Button onClick={prepare} data-testid="error-retry-btn">
                Retry
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (findingsCount === 0) {
    return (
      <Card variant="glass" className="p-8" data-testid="results-view-no-issues">
        <div className="text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-semantic-success/10">
            <ModuleIcon icon={moduleIcon} />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">{moduleName}</h3>
          <p className="text-small text-text-secondary">No issues found. Your system is in good shape.</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary" onClick={onClose} data-testid="results-close-btn">
              Close
            </Button>
            {onRestart && (
              <Button onClick={onRestart} data-testid="results-restart-btn">
                Restart Scan
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="glass" className="p-5" data-testid="results-view">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex p-2 rounded-full bg-brand-primary/10">
              <ModuleIcon icon={moduleIcon} />
            </div>
            <div>
              <h3 className="text-section-title font-semibold text-text-primary">{moduleName}</h3>
              <p className="text-small text-text-secondary">
                {findingsCount} {findingsCount === 1 ? 'issue' : 'issues'} found
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2 text-center">
            <div className="text-caption text-[var(--avs-text-muted)]">Actionable</div>
            <div className="text-body font-semibold text-[var(--avs-text-primary)]">
              {getCount(statistics, 'actionable') || actionableCount}
            </div>
          </div>
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2 text-center">
            <div className="text-caption text-[var(--avs-text-muted)]">Blocked</div>
            <div className="text-body font-semibold text-[var(--avs-text-primary)]">
              {getCount(statistics, 'blocked') || blockedCount}
            </div>
          </div>
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2 text-center">
            <div className="text-caption text-[var(--avs-text-muted)]">Review</div>
            <div className="text-body font-semibold text-[var(--avs-text-primary)]">
              {getCount(statistics, 'review') || reviewCount}
            </div>
          </div>
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2 text-center">
            <div className="text-caption text-[var(--avs-text-muted)]">Not Fixable</div>
            <div className="text-body font-semibold text-[var(--avs-text-primary)]">
              {getCount(statistics, 'not_fixable') || notFixableCount}
            </div>
          </div>
        </div>

        <FindingsList
          findings={findings}
          selectedIds={selectedIds}
          onToggle={toggleFinding}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--avs-border)] pt-4">
          <div className="text-small text-[var(--avs-text-secondary)]" data-testid="selected-count">
            {selectedActionable.length} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              data-testid="select-all-actionable-btn"
            >
              Select All Actionable
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              data-testid="clear-selection-btn"
            >
              Clear
            </Button>
            <Button
              onClick={prepare}
              disabled={!canRemediate}
              data-testid="review-remediate-btn"
            >
              Review & Remediate
            </Button>
            <Button variant="secondary" onClick={onClose} data-testid="results-close-btn">
              Close
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
