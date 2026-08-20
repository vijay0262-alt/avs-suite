/**
 * AutoOptimizeView.tsx — shows the one-click optimization progress and
 * completion summary for the Dashboard scan workflow.
 *
 * This component is displayed after a scan completes with findings.
 * It automatically starts the safe-action optimization pipeline and
 * shows real progress from the backend.
 *
 * Safety is NOT bypassed:
 *   - Only APPROVED actions are executed by the backend.
 *   - REQUIRES_REVIEW actions are counted but not executed.
 *   - REJECTED actions are counted but not executed.
 */
import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowPathIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import type { AutoOptimizePhase } from './types';
import { useAutoOptimize } from './useAutoOptimize';
import { optimizationEventBus, OptimizationEventType } from '../health/OptimizationEventBus';

export interface AutoOptimizeViewProps {
  planId: string;
  onClose: () => void;
  onReviewRequired?: (planId: string) => void;
}

const PHASE_LABELS: Record<AutoOptimizePhase | 'idle', string> = {
  idle: 'Idle',
  starting: 'Starting',
  preparing: 'Preparing',
  validating: 'Validating',
  executing: 'Optimizing',
  verifying: 'Verifying',
  complete: 'Complete',
  cancelled: 'Cancelled',
  error: 'Error',
};

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

export function AutoOptimizeView({ planId, onClose, onReviewRequired }: AutoOptimizeViewProps) {
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
        itemsProcessed: autoOpt.result.completed,
        timestamp: Date.now(),
      });
    }
  }, [autoOpt.phase, autoOpt.result]);

  const isRunning = autoOpt.isRunning;
  const isComplete = autoOpt.phase === 'complete';
  const isError = autoOpt.phase === 'error';
  const isCancelled = autoOpt.phase === 'cancelled';

  // Use actual progress from backend when available (during execution phase)
  // Otherwise fall back to phase-based progress
  const progress = autoOpt.phase === 'executing' && autoOpt.overallProgress > 0
    ? autoOpt.overallProgress
    : PHASE_PROGRESS[autoOpt.phase] ?? 0;
  const phaseLabel = PHASE_LABELS[autoOpt.phase] ?? autoOpt.phase;

  const result = autoOpt.result;
  const hasReviewItems = (autoOpt.reviewRequired ?? 0) > 0 || (result?.requires_review ?? 0) > 0;

  const summaryCards = useMemo(() => {
    if (!result) return [];
    const cards: Array<{
      label: string;
      value: string;
      icon: typeof CheckCircleIcon;
      positive: boolean;
    }> = [];

    if (result.completed > 0) {
      cards.push({
        label: 'Items Cleaned',
        value: formatNumber(result.completed),
        icon: CheckCircleIcon,
        positive: true,
      });
    }

    // V1.0: "Detected" = genuinely cleanable items (safe candidates),
    // NOT all pattern matches. Use result.detected if available.
    const detectedCount = result.detected ?? result.total;
    if (detectedCount > 0) {
      cards.push({
        label: 'Cleanable Items Found',
        value: formatNumber(detectedCount),
        icon: CheckCircleIcon,
        positive: true,
      });
    }

    // Remaining = safe candidates that were not cleaned
    const remaining = result.remaining ?? Math.max(0, detectedCount - result.completed);
    if (remaining > 0) {
      cards.push({
        label: 'Remaining',
        value: formatNumber(remaining),
        icon: ExclamationTriangleIcon,
        positive: false,
      });
    }

    if (result.space_recovered > 0) {
      cards.push({
        label: 'Space Recovered',
        value: formatBytes(result.space_recovered),
        icon: CheckCircleIcon,
        positive: true,
      });
    }

    if (result.failed > 0) {
      cards.push({
        label: 'Failed',
        value: formatNumber(result.failed),
        icon: XCircleIcon,
        positive: false,
      });
    }

    if (result.skipped > 0) {
      cards.push({
        label: 'Skipped',
        value: formatNumber(result.skipped),
        icon: ExclamationTriangleIcon,
        positive: false,
      });
    }

    if (result.requires_review > 0) {
      cards.push({
        label: 'Requires Your Attention',
        value: formatNumber(result.requires_review),
        icon: ExclamationTriangleIcon,
        positive: false,
      });
    }

    return cards;
  }, [result]);

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

  // ── Running state ────────────────────────────────────────────────
  if (isRunning) {
    return (
      <Card variant="glass" className="p-8" data-testid="auto-optimize-running">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-full bg-brand-primary/10 animate-pulse">
              <BoltIcon className="h-8 w-8 text-brand-primary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">
              {phaseLabel === 'Optimizing' ? 'Optimizing your PC...' : `${phaseLabel}...`}
            </h3>
            <p className="text-small text-text-secondary">{autoOpt.message}</p>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-small text-text-muted">
              <span>{phaseLabel}</span>
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

          {/* Current file being cleaned (PART: show file paths) */}
          {autoOpt.currentFile && isRunning && autoOpt.phase === 'executing' && (
            <div className="rounded-[var(--avs-radius-md)] bg-surface-secondary/50 p-3" data-testid="auto-optimize-current-file">
              <div className="flex items-center gap-2">
                <ArrowPathIcon className="h-4 w-4 text-brand-primary animate-spin shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-caption text-text-muted">Cleaning:</div>
                  <div className="text-small text-text-primary font-mono truncate" title={autoOpt.currentFile}>
                    {autoOpt.currentFile}
                  </div>
                </div>
              </div>
              {autoOpt.executionTotal > 0 && (
                <div className="mt-2 flex justify-between text-caption text-text-muted">
                  <span>{formatNumber(autoOpt.executionProgress)} / {formatNumber(autoOpt.executionTotal)} files</span>
                  <span>{autoOpt.executionTotal > 0 ? Math.round((autoOpt.executionProgress / autoOpt.executionTotal) * 100) : 0}%</span>
                </div>
              )}
            </div>
          )}

          {/* Live counters during optimization */}
          {autoOpt.totalActions > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-text-primary tabular-nums">
                  {formatNumber(autoOpt.safeActions)}
                </div>
                <div className="text-caption text-text-muted">Safe Actions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-text-primary tabular-nums">
                  {formatNumber(autoOpt.reviewRequired)}
                </div>
                <div className="text-caption text-text-muted">Need Review</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-text-primary tabular-nums">
                  {formatNumber(autoOpt.blocked)}
                </div>
                <div className="text-caption text-text-muted">Blocked</div>
              </div>
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

  // ── Complete state ───────────────────────────────────────────────
  if (isComplete && result) {
    const detectedCount = result.detected ?? result.total;
    const nothingToClean = detectedCount === 0 || (result.completed === 0 && result.requires_review === 0 && result.failed === 0);

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
                  Your PC is already optimized
                </h3>
                <p className="text-small text-text-secondary">
                  Nothing required cleanup. Verification complete.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-text-primary">
                  Your PC is Optimized
                </h3>
                <p className="text-small text-text-secondary">
                  {autoOpt.verificationStatus === 'passed'
                    ? 'Verification complete.'
                    : autoOpt.verificationStatus === 'partial'
                      ? 'Verification partially completed.'
                      : 'Verification completed with issues.'}
                </p>
              </>
            )}
          </div>

          {/* PART 6: Health Before/After */}
          {result.health_before !== undefined && result.health_after !== undefined && (
            <div className="flex items-center justify-center gap-4 py-4">
              <div className="text-center">
                <div className="text-caption text-text-muted uppercase tracking-wide">Health Before</div>
                <div className="text-3xl font-bold text-text-primary tabular-nums">{result.health_before}</div>
              </div>
              <div className="text-2xl text-text-muted">→</div>
              <div className="text-center">
                <div className="text-caption text-text-muted uppercase tracking-wide">Health After</div>
                <div className="text-3xl font-bold text-semantic-success tabular-nums">{result.health_after}</div>
              </div>
            </div>
          )}

          {/* Summary cards */}
          {summaryCards.length > 0 && (
            <div className="grid grid-cols-2 gap-4" data-testid="auto-optimize-summary">
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-surface-secondary/50 p-4"
                >
                  <card.icon
                    className={`h-6 w-6 ${card.positive ? 'text-semantic-success' : 'text-semantic-warning'}`}
                  />
                  <div>
                    <div className="text-xl font-bold text-text-primary tabular-nums">
                      {card.value}
                    </div>
                    <div className="text-caption text-text-muted">{card.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-center gap-3">
            {hasReviewItems && onReviewRequired && (
              <Button
                onClick={() => onReviewRequired(planId)}
                leftIcon={<ExclamationTriangleIcon className="h-4 w-4" />}
                data-testid="auto-optimize-review-required"
              >
                Review {result?.requires_review ?? autoOpt.reviewRequired} Items
              </Button>
            )}
            <Button
              variant={hasReviewItems ? 'secondary' : 'primary'}
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
