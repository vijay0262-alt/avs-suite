/**
 * AutoOptimizeView.tsx — Disk Cleanup style optimization view.
 *
 * V1.0 Disk Cleanup style:
 *   - During scanning: shows "Scanning your PC..." with category checklist
 *   - During cleaning: shows current category, files cleaned, space recovered
 *   - On complete: shows per-category breakdown like Windows Disk Cleanup
 *
 * NEVER shows "Files Scanned" or traversal counts.
 * Only shows CLEANABLE data: files to clean, space to clean, what was cleaned.
 */
import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowPathIcon,
  BoltIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { AutoOptimizePhase } from './types';
import { useAutoOptimize } from './useAutoOptimize';
import { optimizationEventBus, OptimizationEventType } from '../health/OptimizationEventBus';

export interface AutoOptimizeViewProps {
  planId: string;
  onClose: () => void;
  /** V1.0: Review callback is no longer used but kept for API compat. */
  onReviewRequired?: (planId: string) => void;
  /** V1.0 UNIFIED: Module context for labels. */
  module?: 'optimize' | 'security' | 'protection';
}

const PHASE_PROGRESS: Record<AutoOptimizePhase | 'idle', number> = {
  idle: 0,
  starting: 0,
  preparing: 10,
  validating: 20,
  executing: 50, // Will be overridden by actual progress during execution
  verifying: 90,
  complete: 100,
  cancelled: 100,
  error: 100,
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Category breakdown row — Disk Cleanup style.
 * Shows category name, file count, and size.
 */
function CategoryRow({
  name,
  files,
  size,
  cleaned,
}: {
  name: string;
  files: number;
  size: number;
  cleaned?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b border-[var(--avs-border-subtle)] last:border-0"
      data-testid={`category-row-${name.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {cleaned ? (
          <CheckCircleIcon className="h-4 w-4 text-semantic-success shrink-0" />
        ) : (
          <TrashIcon className="h-4 w-4 text-text-muted shrink-0" />
        )}
        <span className="text-small text-text-primary truncate">{name}</span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-small text-text-muted tabular-nums">
          {formatNumber(files)} {files === 1 ? 'file' : 'files'}
        </span>
        <span className="text-small font-semibold text-text-primary tabular-nums w-20 text-right">
          {formatBytes(size)}
        </span>
      </div>
    </div>
  );
}

export function AutoOptimizeView({ planId, onClose, module = 'optimize' }: AutoOptimizeViewProps) {
  const autoOpt = useAutoOptimize();

  // Automatically start optimization when the component mounts.
  useEffect(() => {
    if (planId && autoOpt.phase === 'idle') {
      void autoOpt.startAutoOptimize(planId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // When optimization completes, emit a CleaningCompleted event so the
  // Dashboard recalculates the health score from fresh metrics.
  useEffect(() => {
    if (autoOpt.phase === 'complete' && autoOpt.result) {
      optimizationEventBus.emit({
        type: OptimizationEventType.CleaningCompleted,
        moduleId: 'junk',
        action: 'clean',
        bytesRecovered: autoOpt.result.space_recovered,
        itemsProcessed: autoOpt.result.files_cleaned ?? autoOpt.result.cleaned ?? 0,
        timestamp: Date.now(),
      });
    }
  }, [autoOpt.phase, autoOpt.result]);

  const isRunning = autoOpt.isRunning;
  const isComplete = autoOpt.phase === 'complete';
  const isError = autoOpt.phase === 'error';
  const isCancelled = autoOpt.phase === 'cancelled';

  // V1.0 UNIFIED: Module-appropriate labels.
  const isSecurity = module === 'security' || module === 'protection';
  const cleanedLabel = isSecurity ? 'Threats Cleaned' : 'Files Cleaned';
  const phaseRunningLabel = isSecurity ? 'Cleaning threats...' : 'Cleaning your PC...';
  const phaseCompleteLabel = isSecurity ? 'Security Cleanup Complete' : 'Cleanup Complete';
  const phaseAlreadyClean = isSecurity ? 'Your PC is secure' : 'Your PC is already clean';
  const phaseAlreadyCleanDesc = isSecurity ? 'No threats required cleanup.' : 'Nothing required cleanup.';

  // Use actual progress from backend when available (during execution phase)
  // Otherwise fall back to phase-based progress
  const progress = autoOpt.phase === 'executing' && autoOpt.overallProgress > 0
    ? autoOpt.overallProgress
    : PHASE_PROGRESS[autoOpt.phase] ?? 0;
  // V1.0: Map internal phases to user-friendly labels.
  // Do not expose internal backend phase names.
  const USER_PHASE_LABELS: Record<string, string> = {
    idle: 'Starting...',
    starting: 'Starting...',
    preparing: 'Preparing...',
    validating: 'Preparing...',
    executing: phaseRunningLabel,
    verifying: 'Verifying cleanup...',
    complete: 'Complete',
    cancelled: 'Cancelled',
    error: 'Error',
  };
  const phaseLabel = USER_PHASE_LABELS[autoOpt.phase] ?? phaseRunningLabel;

  const result = autoOpt.result;

  // V1.0: Build per-category breakdown from result.categories
  const categoryEntries = useMemo(() => {
    if (!result?.categories) return [];
    return Object.entries(result.categories)
      .filter(([, stats]) => stats.files_found > 0 || stats.files_cleaned > 0)
      .map(([name, stats]) => ({
        name,
        files: stats.files_found,
        cleaned: stats.files_cleaned,
        size: stats.space_recovered,
      }));
  }, [result]);

  // V1.0: Total summary for the result view
  const totalCleaned = result?.files_cleaned ?? result?.cleaned ?? 0;
  const totalSpace = result?.space_recovered ?? 0;
  const totalFoldersCleaned = result?.folders_cleaned ?? 0;

  // ── Error state ──────────────────────────────────────────────────
  if (isError) {
    return (
      <Card variant="glass" className="p-8" data-testid="auto-optimize-error">
        <div className="text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-semantic-danger/10">
            <XCircleIcon className="h-8 w-8 text-semantic-danger" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Optimization Failed</h3>
          <p className="text-small text-text-secondary">
            {autoOpt.error ?? 'An error occurred during optimization.'}
          </p>
          <div className="flex justify-center gap-3">
            <Button
              onClick={() => autoOpt.startAutoOptimize(planId)}
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              data-testid="auto-optimize-retry"
            >
              Retry
            </Button>
            <Button variant="secondary" onClick={onClose} data-testid="auto-optimize-close">
              Close
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // ── Cancelled state ──────────────────────────────────────────────
  if (isCancelled) {
    return (
      <Card variant="glass" className="p-8" data-testid="auto-optimize-cancelled">
        <div className="text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-semantic-warning/10">
            <ExclamationTriangleIcon className="h-8 w-8 text-semantic-warning" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Optimization Cancelled</h3>
          <p className="text-small text-text-secondary">
            The optimization was cancelled. No incomplete actions were left running.
          </p>
          <Button variant="secondary" onClick={onClose} data-testid="auto-optimize-close">
            Close
          </Button>
        </div>
      </Card>
    );
  }

  // ── Running state (Cleaning) ─────────────────────────────────────
  if (isRunning) {
    return (
      <Card variant="glass" className="p-8" data-testid="auto-optimize-running">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-full bg-brand-primary/10 animate-pulse">
              <BoltIcon className="h-8 w-8 text-brand-primary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">
              {phaseLabel}
            </h3>
            {/* V1.0: Show current category being cleaned */}
            {autoOpt.currentCategory && autoOpt.phase === 'executing' && (
              <p className="text-small text-text-secondary font-medium">
                {autoOpt.currentCategory}
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-small text-text-muted">
              <span>{autoOpt.phase === 'verifying' ? 'Verifying' : autoOpt.phase === 'preparing' || autoOpt.phase === 'starting' || autoOpt.phase === 'validating' ? 'Preparing' : 'Cleaning'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
                data-testid="auto-optimize-progress-bar"
              />
            </div>
          </div>

          {/* V1.0: Live counters — Files Cleaned + Space Recovered */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[var(--avs-radius-md)] bg-surface-secondary/50 p-4 text-center">
              <div className="text-2xl font-bold text-semantic-success tabular-nums">
                {formatNumber(autoOpt.executionProgress)}
              </div>
              <div className="text-caption text-text-muted">{cleanedLabel}</div>
            </div>
            <div className="rounded-[var(--avs-radius-md)] bg-surface-secondary/50 p-4 text-center">
              <div className="text-2xl font-bold text-brand-primary tabular-nums">
                {formatBytes(0)}
              </div>
              <div className="text-caption text-text-muted">Space Recovered</div>
            </div>
          </div>

          {/* V1.0: Execution progress detail */}
          {autoOpt.executionTotal > 0 && autoOpt.phase === 'executing' && (
            <div className="flex justify-between text-caption text-text-muted">
              <span>{formatNumber(autoOpt.executionProgress)} / {formatNumber(autoOpt.executionTotal)} files</span>
              <span>{autoOpt.executionTotal > 0 ? Math.round((autoOpt.executionProgress / autoOpt.executionTotal) * 100) : 0}%</span>
            </div>
          )}

          {/* Cancel button */}
          <div className="flex justify-center">
            <Button
              variant="secondary"
              onClick={autoOpt.cancelAutoOptimize}
              data-testid="auto-optimize-cancel-btn"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // ── Complete state — Disk Cleanup style results ──────────────────
  if (isComplete && result) {
    const nothingToClean = totalCleaned === 0;

    return (
      <Card variant="glass" className="p-8" data-testid="auto-optimize-complete">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-full bg-semantic-success/10">
              <CheckCircleIcon className="h-8 w-8 text-semantic-success" />
            </div>
            {nothingToClean ? (
              <>
                <h3 className="text-lg font-semibold text-text-primary">
                  {phaseAlreadyClean}
                </h3>
                <p className="text-small text-text-secondary">
                  {phaseAlreadyCleanDesc}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-text-primary">
                  {phaseCompleteLabel}
                </h3>
                <p className="text-small text-text-secondary">
                  Your PC has been optimized.
                </p>
              </>
            )}
          </div>

          {/* V1.0: Disk Cleanup style per-category breakdown */}
          {categoryEntries.length > 0 && (
            <div
              className="rounded-[var(--avs-radius-md)] bg-surface-secondary/30 p-4"
              data-testid="auto-optimize-categories"
            >
              <div className="text-caption uppercase tracking-wide text-text-muted mb-2">
                Cleanup Summary
              </div>
              {categoryEntries.map((cat) => (
                <CategoryRow
                  key={cat.name}
                  name={cat.name}
                  files={cat.cleaned}
                  size={cat.size}
                  cleaned
                />
              ))}
            </div>
          )}

          {/* V1.0: Total summary — Disk Cleanup style */}
          {!nothingToClean && (
            <div
              className="rounded-[var(--avs-radius-md)] bg-brand-primary/5 p-4 border border-brand-primary/20"
              data-testid="auto-optimize-total"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-caption uppercase tracking-wide text-text-muted">
                    Total Cleaned
                  </div>
                  <div className="text-2xl font-bold text-text-primary tabular-nums">
                    {formatBytes(totalSpace)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-small text-text-secondary tabular-nums">
                    {formatNumber(totalCleaned)} {totalCleaned === 1 ? 'file' : 'files'}
                  </div>
                  {totalFoldersCleaned > 0 && (
                    <div className="text-small text-text-secondary tabular-nums">
                      {formatNumber(totalFoldersCleaned)} {totalFoldersCleaned === 1 ? 'folder' : 'folders'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions — just Done */}
          <div className="flex justify-center">
            <Button
              variant="primary"
              onClick={onClose}
              data-testid="auto-optimize-done"
            >
              Done
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // ── Idle / loading state ─────────────────────────────────────────
  return (
    <Card variant="glass" className="p-8" data-testid="auto-optimize-loading">
      <div className="text-center space-y-4">
        <div className="inline-flex p-3 rounded-full bg-brand-primary/10 animate-pulse">
          <BoltIcon className="h-8 w-8 text-brand-primary" />
        </div>
        <h3 className="text-lg font-semibold text-text-primary">Starting optimization...</h3>
      </div>
    </Card>
  );
}
