/**
 * ResultsView.tsx — shared component for scan results, remediation preview,
 * validation/approval, and live execution.
 *
 * The only `scan_core.remediation.execute` call is triggered by the explicit
 * `Approve & Fix` button inside `useResults.approve`.
 */
import { Card, Button, LoadingState } from '@avs/ui';
import { ShieldCheckIcon, ExclamationTriangleIcon, CheckCircleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useResults } from './useResults';
import { FindingsList } from './FindingsList';
import { PreviewPanel } from './PreviewPanel';
import { ValidationPanel } from './ValidationPanel';
import { ExecutionProgressPanel } from './ExecutionProgressPanel';
import { TerminalStatePanel } from './TerminalStatePanel';
import { RollbackConfirmationPanel } from './RollbackConfirmationPanel';
import { RollbackResultPanel } from './RollbackResultPanel';
import type { ScanFinding, ScanStatistics } from './types';

export interface CleanupCategoryResult {
  name: string;
  path?: string;
  files_found?: number;
  files_deleted?: number;
  files_skipped?: number;
  folders_removed?: number;
  bytes_recovered?: number;
  mb_recovered?: number;
  skipped_due_to_limit?: number;
}

export interface ResultsViewProps {
  moduleName: string;
  moduleIcon: string;
  statistics: ScanStatistics;
  findings: ScanFinding[];
  planId?: string;
  cleanupSummary?: {
    files_found?: number;
    files_deleted?: number;
    files_skipped?: number;
    folders_found?: number;
    folders_deleted?: number;
    bytes_recovered?: number;
    mb_recovered?: number;
    mb_found?: number;
    categories?: CleanupCategoryResult[];
    requires_upgrade?: boolean;
  };
  onClose: () => void;
  onRestart?: () => void;
  onUpgrade?: () => void;
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

function formatBytesLocal(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Category row — Disk Cleanup style per-category breakdown. */
function CleanupCategoryRow({ cat }: { cat: CleanupCategoryResult }) {
  const files = cat.files_deleted ?? 0;
  const size = cat.bytes_recovered ?? 0;
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b border-[var(--avs-border-subtle)] last:border-0"
      data-testid={`cleanup-cat-${(cat.name || '').toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {files > 0 ? (
          <CheckCircleIcon className="h-4 w-4 text-semantic-success shrink-0" />
        ) : (
          <TrashIcon className="h-4 w-4 text-text-muted shrink-0" />
        )}
        <span className="text-small text-text-primary truncate">{cat.name}</span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-small text-text-muted tabular-nums">
          {files.toLocaleString()} {files === 1 ? 'file' : 'files'}
        </span>
        <span className="text-small font-semibold text-text-primary tabular-nums w-20 text-right">
          {formatBytesLocal(size)}
        </span>
      </div>
    </div>
  );
}

export function ResultsView({
  moduleName,
  moduleIcon,
  statistics,
  findings,
  planId,
  cleanupSummary,
  onClose,
  onRestart,
  onUpgrade,
}: ResultsViewProps) {
  const {
    step,
    selectedIds,
    preview,
    validation,
    executionStatus,
    isCancelling,
    isRollbacking,
    isPreparing,
    isValidating,
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
        <PreviewPanel
          preview={preview}
          onValidate={validate}
          onBack={goBack}
          isValidating={isValidating}
        />
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
    // V1.0: Free user — scan found files but cleaning requires upgrade.
    // Show what was found + upgrade prompt instead of cleaning.
    if (cleanupSummary && cleanupSummary.requires_upgrade && (cleanupSummary.files_found || 0) > 0) {
      const mbFound = cleanupSummary.mb_found ?? cleanupSummary.mb_recovered ?? 0;
      const mbStr = mbFound >= 1024
        ? `${(mbFound / 1024).toFixed(2)} GB`
        : `${mbFound.toFixed(2)} MB`;
      const categories = cleanupSummary.categories?.filter(
        (c) => (c.files_found ?? 0) > 0,
      ) ?? [];
      return (
        <Card variant="glass" className="p-8" data-testid="results-view-upgrade">
          <div className="text-center space-y-4">
            <div className="inline-flex p-3 rounded-full bg-brand-primary/10">
              <ModuleIcon icon={moduleIcon} />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">{moduleName}</h3>
            <p className="text-small text-text-secondary">
              Found {cleanupSummary.files_found?.toLocaleString() ?? 0} cleanable files ({mbStr})
            </p>

            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
                <div className="text-2xl font-bold text-brand-primary tabular-nums">
                  {cleanupSummary.files_found?.toLocaleString() ?? 0}
                </div>
                <div className="text-caption text-[var(--avs-text-muted)]">Files Found</div>
              </div>
              <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
                <div className="text-2xl font-bold text-brand-primary tabular-nums">
                  {mbStr}
                </div>
                <div className="text-caption text-[var(--avs-text-muted)]">Space to Clean</div>
              </div>
            </div>

            {/* Per-category breakdown of what was found */}
            {categories.length > 0 && (
              <div
                className="rounded-[var(--avs-radius-md)] bg-surface-secondary/30 p-4 text-left"
                data-testid="results-view-categories"
              >
                <div className="text-caption uppercase tracking-wide text-text-muted mb-2">
                  Categories Found
                </div>
                {categories.map((cat) => (
                  <CleanupCategoryRow key={cat.name} cat={cat} />
                ))}
              </div>
            )}

            {/* Upgrade prompt */}
            <div className="rounded-[var(--avs-radius-md)] bg-brand-primary/5 p-4 border border-brand-primary/20">
              <p className="text-small font-semibold text-text-primary">
                Upgrade to Professional for 1-Click Optimization
              </p>
              <p className="text-caption text-text-secondary mt-1">
                Clean all {cleanupSummary.files_found?.toLocaleString() ?? 0} files instantly,
                or use Junk Cleaner to clean manually.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3">
              {onUpgrade && (
                <Button onClick={onUpgrade} data-testid="results-upgrade-btn">
                  Upgrade to Professional
                </Button>
              )}
              <Button variant="secondary" onClick={onClose} data-testid="results-close-btn">
                Close
              </Button>
            </div>
          </div>
        </Card>
      );
    }
    // V1.0: If we have a cleanup summary (direct cleanup), show the
    // actual results: files deleted, space recovered, etc.
    if (cleanupSummary && (cleanupSummary.files_deleted || 0) > 0) {
      const mb = cleanupSummary.mb_recovered ?? 0;
      const mbStr = mb >= 1024
        ? `${(mb / 1024).toFixed(2)} GB`
        : `${mb.toFixed(2)} MB`;
      const categories = cleanupSummary.categories?.filter(
        (c) => (c.files_deleted ?? 0) > 0 || (c.files_found ?? 0) > 0,
      ) ?? [];
      return (
        <Card variant="glass" className="p-8" data-testid="results-view-cleanup">
          <div className="text-center space-y-4">
            <div className="inline-flex p-3 rounded-full bg-semantic-success/10">
              <ModuleIcon icon={moduleIcon} />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">{moduleName}</h3>
            <p className="text-small text-text-secondary">Cleanup Complete</p>

            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
                <div className="text-2xl font-bold text-semantic-success tabular-nums">
                  {cleanupSummary.files_deleted?.toLocaleString() ?? 0}
                </div>
                <div className="text-caption text-[var(--avs-text-muted)]">Files Deleted</div>
              </div>
              <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
                <div className="text-2xl font-bold text-brand-primary tabular-nums">
                  {mbStr}
                </div>
                <div className="text-caption text-[var(--avs-text-muted)]">Space Recovered</div>
              </div>
              <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
                <div className="text-2xl font-bold text-text-secondary tabular-nums">
                  {cleanupSummary.folders_deleted?.toLocaleString() ?? 0}
                </div>
                <div className="text-caption text-[var(--avs-text-muted)]">Folders Removed</div>
              </div>
            </div>

            {(cleanupSummary.files_skipped ?? 0) > 0 && (
              <p className="text-caption text-text-muted">
                {cleanupSummary.files_skipped} file(s) skipped (in use or locked)
              </p>
            )}

            {/* V1.0: Per-category breakdown — Disk Cleanup style */}
            {categories.length > 0 && (
              <div
                className="rounded-[var(--avs-radius-md)] bg-surface-secondary/30 p-4 text-left"
                data-testid="results-view-categories"
              >
                <div className="text-caption uppercase tracking-wide text-text-muted mb-2">
                  Cleanup Summary by Category
                </div>
                {categories.map((cat) => (
                  <CleanupCategoryRow key={cat.name} cat={cat} />
                ))}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <Button variant="secondary" onClick={onClose} data-testid="results-close-btn">
                Close
              </Button>
              {onRestart && (
                <Button onClick={onRestart} data-testid="results-restart-btn">
                  Scan Again
                </Button>
              )}
            </div>
          </div>
        </Card>
      );
    }
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
              disabled={!canRemediate || isPreparing}
              data-testid="review-remediate-btn"
            >
              {isPreparing ? 'Preparing...' : 'Review & Remediate'}
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
