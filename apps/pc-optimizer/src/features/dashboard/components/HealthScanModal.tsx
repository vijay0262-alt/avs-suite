import { useState } from 'react';
import { Button, Card } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ClockIcon,
  SparklesIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  TrashIcon,
  CpuChipIcon,
  CircleStackIcon,
  ServerIcon,
  InformationCircleIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { Modal } from './Modal';
import { useAnimatedNumber } from './useAnimatedNumber';
import { SCORE_ZONE_CONFIG, type ScoreZone } from '../dashboard.types';
import type {
  HealthScanStep,
  HealthScanModuleResult,
  HealthScanReport,
  OptimizationExecutionProgress,
  OptimizeExecuteResponse,
} from '../dashboard.types';

export interface HealthScanModalProps {
  step: HealthScanStep;
  modules: HealthScanModuleResult[];
  report: HealthScanReport | null;
  execution: OptimizationExecutionProgress | null;
  result: OptimizeExecuteResponse | null;
  error: string | null;
  onCancel: () => void;
  onClose: () => void;
  onOptimize: () => void;
  onCancelExecute: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'text-semantic-danger',
  medium: 'text-semantic-warning',
  low: 'text-semantic-success',
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remaining}s`;
  return `${remaining}s`;
}

function scoreToZone(score: number): ScoreZone {
  if (score >= 100) return 'perfect';
  if (score >= 90) return 'excellent';
  if (score >= 80) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}

function scoreToColor(score: number): string {
  return SCORE_ZONE_CONFIG[scoreToZone(score)].textColor;
}

function ModuleIcon({ id }: { id: string }) {
  const icons: Record<string, typeof ShieldCheckIcon> = {
    junk: TrashIcon,
    startup: ServerIcon,
    privacy: ShieldCheckIcon,
    performance: CpuChipIcon,
    disk: CircleStackIcon,
    registry: ServerIcon,
    security: ShieldCheckIcon,
    system: CpuChipIcon,
  };
  const Icon = icons[id] || ShieldCheckIcon;
  return <Icon className="h-5 w-5" aria-hidden />;
}

export function HealthScanModal({
  step,
  modules,
  report,
  execution,
  result,
  error,
  onCancel,
  onClose,
  onOptimize,
  onCancelExecute,
}: HealthScanModalProps) {
  const total = modules.length || 1;
  const done = modules.filter((m) => m.status === 'complete' || m.status === 'error' || m.status === 'skipped').length;
  const progress = Math.round((done / total) * 100);
  const currentModule = modules.find((m) => m.status === 'scanning');

  if (step === 'preparing') {
    return (
      <Modal open title="Preparing Optimization" onClose={onCancel} size="lg" actions={null}>
        <div className="space-y-6 text-center" data-testid="health-scan-preparing">
          <div className="flex justify-center">
            <SparklesIcon className="h-12 w-12 text-brand-primary animate-pulse" aria-hidden />
          </div>
          <div className="text-lg font-medium text-text-primary">
            Preparing Optimization...
          </div>
          <p className="text-sm text-text-secondary">
            Analyzing your system to find the best optimization actions.
          </p>
          <div className="w-full h-3 bg-bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-brand-primary transition-all duration-500" style={{ width: '5%' }} />
          </div>
          <div className="flex justify-center">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'scanning') {
    return (
      <Modal open title="Health Scan" onClose={onCancel} size="lg" actions={null}>
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-lg font-medium text-text-primary mb-1">
              {currentModule ? `Scanning ${currentModule.moduleName}...` : 'Preparing scan...'}
            </div>
            <div className="text-sm text-text-secondary">{progress}% complete</div>
          </div>

          <div className="w-full h-3 bg-bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <ClockIcon className="h-4 w-4" aria-hidden />
            <span>Elapsed: {report ? formatDuration(Date.now() - report.startedAt) : '0s'}</span>
          </div>

          <div className="space-y-2">
            {modules.map((m) => (
              <div
                key={m.moduleId}
                className="flex items-center justify-between p-3 rounded-md bg-surface-muted"
              >
                <div className="flex items-center gap-3">
                  <div className="text-text-muted">
                    <ModuleIcon id={m.moduleId} />
                  </div>
                  <span className="text-sm font-medium text-text-primary">{m.moduleName}</span>
                </div>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Button variant="secondary" onClick={onCancel}>
              Cancel Scan
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'report' && report) {
    const duration = report.finishedAt - report.startedAt;
    return (
      <Modal
        open
        title="Health Scan Report"
        onClose={onClose}
        size="lg"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {report.modules.some((m) => m.status === 'complete' && m.canAutoFix && (m.recoverableSpace > 0 || m.issuesFound > 0)) && (
              <Button onClick={onOptimize} leftIcon={<SparklesIcon className="h-4 w-4" />}>
                Optimize Now
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <div className="text-3xl font-bold text-text-primary tabular-nums">
                {report.overallScore}
              </div>
              <div className="text-sm text-text-secondary">Overall Health</div>
            </Card>
            <Card>
              <div className="text-3xl font-bold text-semantic-danger tabular-nums">
                {report.issuesFound}
              </div>
              <div className="text-sm text-text-secondary">Issues Found</div>
            </Card>
            <Card>
              <div className="text-3xl font-bold text-semantic-success tabular-nums">
                {formatBytes(report.recoverableSpace)}
              </div>
              <div className="text-sm text-text-secondary">Recoverable Space</div>
            </Card>
          </div>

          <div>
            <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
              Detected Issues by Category
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {report.modules.map((m) => (
                <ModuleReportCard key={m.moduleId} module={m} />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>Scan completed in {formatDuration(duration)}</span>
            {error && (
              <span className="text-semantic-danger">{error}</span>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'optimizing') {
    return (
      <Modal open title="Optimizing" onClose={onCancelExecute} size="lg" actions={null}>
        <div className="space-y-6 text-center" data-testid="health-scan-optimizing">
          <div className="text-lg font-medium text-text-primary">
            {execution?.currentModule || 'Optimizing...'}
          </div>

          <div className="w-full h-3 bg-bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all duration-300"
              style={{ width: `${execution?.progress || 0}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {execution?.filesRemoved || 0}
              </div>
              <div className="text-sm text-text-secondary">Files Removed</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-semantic-success tabular-nums">
                {formatBytes(execution?.spaceRecovered || 0)}
              </div>
              <div className="text-sm text-text-secondary">Space Recovered</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {execution?.itemsProcessed || 0}
              </div>
              <div className="text-sm text-text-secondary">Items Processed</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {execution ? formatDuration(execution.elapsedMs) : '0s'}
              </div>
              <div className="text-sm text-text-secondary">Elapsed</div>
            </Card>
          </div>

          {execution?.liveMessages && execution.liveMessages.length > 0 && (
            <div className="text-left space-y-1.5 max-h-32 overflow-y-auto" data-testid="optimization-live-messages">
              {execution.liveMessages.slice(-8).map((msg, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                  {msg.startsWith('✓') ? (
                    <CheckCircleIcon className="h-4 w-4 text-semantic-success shrink-0" aria-hidden />
                  ) : msg.startsWith('✗') ? (
                    <XCircleIcon className="h-4 w-4 text-semantic-danger shrink-0" aria-hidden />
                  ) : (
                    <ArrowPathIcon className="h-4 w-4 text-brand-primary shrink-0 animate-spin" aria-hidden />
                  )}
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-center">
            <Button variant="secondary" onClick={onCancelExecute}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'verifying') {
    return (
      <Modal open title="Verifying Results" onClose={onCancelExecute} size="lg" actions={null}>
        <div className="space-y-6 text-center">
          <div className="text-lg font-medium text-text-primary">{execution?.currentModule || 'Verifying...'}</div>
          <p className="text-sm text-text-secondary">Running a fresh health scan to measure real changes. Do not close this window.</p>
          <div className="w-full h-3 bg-bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-brand-primary transition-all duration-300" style={{ width: `${execution?.progress || 0}%` }} />
          </div>
          <div className="flex justify-center">
            <Button variant="secondary" onClick={onCancelExecute}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'updating_dashboard') {
    return (
      <Modal open title="Updating Dashboard" onClose={onCancelExecute} size="lg" actions={null}>
        <div className="space-y-6 text-center" data-testid="health-scan-updating-dashboard">
          <div className="flex justify-center">
            <ArrowPathIcon className="h-12 w-12 text-brand-primary animate-spin" aria-hidden />
          </div>
          <div className="text-lg font-medium text-text-primary">
            {execution?.currentModule || 'Updating Dashboard...'}
          </div>
          <p className="text-sm text-text-secondary">
            Refreshing health score, issues, and dashboard cards with verified post-optimization data.
          </p>
          <div className="w-full h-3 bg-bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all duration-300"
              style={{ width: `${execution?.progress || 95}%` }}
            />
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'complete' && report) {
    return (
      <CompleteStep
        report={report}
        result={result}
        execution={execution}
        error={error}
        onClose={onClose}
      />
    );
  }

  return null;
}

// ── Complete Step: Celebration with animated health score ───────────

interface CompleteStepProps {
  report: HealthScanReport;
  result: OptimizeExecuteResponse | null;
  execution: OptimizationExecutionProgress | null;
  error: string | null;
  onClose: () => void;
}

function CompleteStep({ report, result, execution, error, onClose }: CompleteStepProps) {
  const beforeOverall = report.modules.length
    ? Math.round(report.modules.reduce((s, m) => s + (m.verification?.beforeScore ?? m.score), 0) / report.modules.length)
    : report.overallScore;
  const afterOverall = report.overallScore;
  const elapsed = result?.elapsedMs ?? execution?.elapsedMs ?? 0;
  const hasFailures = report.modules.some((m) => m.actual && !m.actual.success);
  const modulesWithActual = report.modules.filter((m) => m.actual);
  const totalBytesRecovered = modulesWithActual.reduce((s, m) => s + (m.actual?.bytesRecovered || 0), 0);
  const totalItemsRemoved = modulesWithActual.reduce((s, m) => s + (m.actual?.itemsRemoved || 0), 0);
  const totalEntriesDisabled = modulesWithActual.reduce((s, m) => s + (m.actual?.entriesDisabled || 0), 0);
  const totalIssuesFixed = modulesWithActual.reduce((s, m) => s + (m.actual?.issuesFixed || 0), 0);
  const totalFilesDeleted = modulesWithActual.reduce((s, m) => s + (m.actual?.filesDeleted || 0), 0);
  const scoreChanged = afterOverall !== beforeOverall;

  // Animate from before score to after score
  const animatedScore = useAnimatedNumber(afterOverall, 1200);
  const displayScore = Math.round(animatedScore);
  const animatedColor = scoreToColor(animatedScore);
  const beforeColor = scoreToColor(beforeOverall);

  const [showDetails, setShowDetails] = useState(false);

  return (
    <Modal
      open
      title={hasFailures ? 'Optimization Completed with Failures' : 'Optimization Complete'}
      onClose={onClose}
      size="lg"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowDetails((v) => !v)} data-testid="complete-view-details">
            {showDetails ? 'Hide Details' : 'View Details'}
          </Button>
          <Button onClick={onClose} leftIcon={<CheckCircleIcon className="h-4 w-4" />} data-testid="complete-done">
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-6" data-testid="celebration-dialog">
        {/* Celebration header */}
        <div className="text-center" data-testid="celebration-header">
          <div className={`inline-flex p-3 rounded-full mb-3 ${hasFailures ? 'bg-semantic-warning/10' : 'bg-semantic-success/10'}`}>
            {hasFailures ? (
              <ExclamationTriangleIcon className="h-10 w-10 text-semantic-warning" aria-hidden />
            ) : (
              <CheckCircleIcon className="h-10 w-10 text-semantic-success" aria-hidden />
            )}
          </div>
          <h3 className="text-lg font-semibold text-text-primary">
            {hasFailures ? 'Optimization Completed with Failures' : 'Your PC has been successfully optimized.'}
          </h3>
        </div>

        {/* Animated Health Score Gauge */}
        <div className="flex items-center justify-center gap-6 py-4" data-testid="health-score-animation">
          {/* Before score */}
          <div className="text-center">
            <div className={`text-4xl font-bold tabular-nums ${beforeColor}`}>
              {beforeOverall}
            </div>
            <div className="text-xs text-text-muted mt-1">Before</div>
          </div>

          {/* Arrow */}
          <ArrowRightIcon className="h-8 w-8 text-text-muted" aria-hidden />

          {/* After score (animated) */}
          <div className="text-center">
            <div
              className={`text-5xl font-bold tabular-nums ${animatedColor} transition-colors duration-500`}
              data-testid="animated-health-score"
            >
              {displayScore}
            </div>
            <div className="text-xs text-text-muted mt-1">After</div>
            <div className={`text-sm font-medium mt-1 ${animatedColor} transition-colors duration-500`}>
              {SCORE_ZONE_CONFIG[scoreToZone(animatedScore)].label}
            </div>
          </div>
        </div>

        {/* Summary metrics grid */}
        <div>
          <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">Optimization Summary</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-testid="celebration-summary">
            <Card>
              <div className="text-xl font-bold text-semantic-success tabular-nums">
                {formatBytes(totalBytesRecovered)}
              </div>
              <div className="text-xs text-text-secondary">Recovered Storage</div>
            </Card>
            {totalIssuesFixed > 0 && (
              <Card>
                <div className="text-xl font-bold text-text-primary tabular-nums">
                  {totalIssuesFixed}
                </div>
                <div className="text-xs text-text-secondary">Registry Fixed</div>
              </Card>
            )}
            {totalEntriesDisabled > 0 && (
              <Card>
                <div className="text-xl font-bold text-text-primary tabular-nums">
                  {totalEntriesDisabled}
                </div>
                <div className="text-xs text-text-secondary">Startup Optimized</div>
              </Card>
            )}
            {totalItemsRemoved > 0 && (
              <Card>
                <div className="text-xl font-bold text-text-primary tabular-nums">
                  {totalItemsRemoved}
                </div>
                <div className="text-xs text-text-secondary">Privacy Files Removed</div>
              </Card>
            )}
            {totalFilesDeleted > 0 && (
              <Card>
                <div className="text-xl font-bold text-text-primary tabular-nums">
                  {totalFilesDeleted}
                </div>
                <div className="text-xs text-text-secondary">Files Deleted</div>
              </Card>
            )}
            <Card>
              <div className="text-xl font-bold text-text-primary tabular-nums">
                {formatDuration(elapsed)}
              </div>
              <div className="text-xs text-text-secondary">Time Taken</div>
            </Card>
          </div>
        </div>

        {/* If nothing changed, say so honestly */}
        {totalBytesRecovered === 0 && totalItemsRemoved === 0 && totalEntriesDisabled === 0 && totalIssuesFixed === 0 && (
          <div className="flex items-center gap-3 py-3 px-4 rounded-md bg-surface-muted text-sm text-text-secondary">
            <InformationCircleIcon className="h-5 w-5 shrink-0" aria-hidden />
            <span>No measurable improvement detected. Your system may already be optimized.</span>
          </div>
        )}

        {/* If score didn't change, explain why */}
        {!scoreChanged && (
          <div className="flex items-center gap-3 py-3 px-4 rounded-md bg-surface-muted text-sm text-text-secondary">
            <InformationCircleIcon className="h-5 w-5 shrink-0" aria-hidden />
            <span>Health score remained at {afterOverall}. This can happen when cleaned files were small relative to overall system state.</span>
          </div>
        )}

        {/* Expandable Detailed Results */}
        {showDetails && (
          <div className="space-y-3" data-testid="detailed-results">
            <div className="text-xs uppercase tracking-wide text-text-muted">Detailed Results</div>
            {modulesWithActual.map((m) => (
              <DetailedResultSection key={m.moduleId} module={m} />
            ))}

            {/* Modules without actual results (skipped or no issues) */}
            {report.modules
              .filter((m) => !m.actual)
              .map((m) => (
                <DetailedResultSection key={m.moduleId} module={m} />
              ))}
          </div>
        )}

        {/* Issues that still need user action */}
        {(() => {
          const needsAction = report.modules.filter(
            (m) => m.status === 'complete' && !m.canAutoFix && m.issuesFound > 0
          );
          if (needsAction.length === 0) return null;
          return (
            <div>
              <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
                Still needs your attention
              </div>
              <div className="space-y-2">
                {needsAction.map((m) => (
                  <div key={m.moduleId} className="p-3 rounded-md bg-semantic-warning/10 border border-semantic-warning/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-text-primary">{m.moduleName}</span>
                      <span className="text-xs font-medium text-semantic-warning">Manual action</span>
                    </div>
                    <div className="text-xs text-text-secondary">{m.measuredDetail}</div>
                    <div className="text-xs text-text-secondary mt-1">
                      {m.details.groups.flatMap((g) => g.items.map((i) => i.name)).slice(0, 3).join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Post-optimization recommendations */}
        <div className="space-y-2" data-testid="post-optimization-recommendations">
          {afterOverall >= 90 ? (
            <div className="flex items-center gap-3 py-3 px-4 rounded-md bg-semantic-success/10">
              <SparklesIcon className="h-5 w-5 text-semantic-success shrink-0" aria-hidden />
              <div>
                <div className="text-sm font-medium text-text-primary">Your PC Health is Excellent.</div>
                <div className="text-xs text-text-secondary">Next optimization recommended in 7 days.</div>
              </div>
            </div>
          ) : afterOverall >= 75 ? (
            <div className="flex items-center gap-3 py-3 px-4 rounded-md bg-surface-muted">
              <SparklesIcon className="h-5 w-5 text-text-secondary shrink-0" aria-hidden />
              <div>
                <div className="text-sm font-medium text-text-primary">Your PC Health is Good.</div>
                <div className="text-xs text-text-secondary">Next optimization recommended in 3 days.</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-3 px-4 rounded-md bg-semantic-warning/10">
              <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning shrink-0" aria-hidden />
              <div>
                <div className="text-sm font-medium text-text-primary">Further optimization recommended.</div>
                <div className="text-xs text-text-secondary">Some issues remain. Consider running optimization again or reviewing manual action items.</div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 py-3 px-4 rounded-md bg-semantic-danger/10 text-sm text-semantic-danger">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Expandable Detailed Result Section ───────────────────────────────

function DetailedResultSection({ module: m }: { module: HealthScanModuleResult }) {
  const [expanded, setExpanded] = useState(false);
  const actual = m.actual;
  const hasActual = Boolean(actual);
  const scanned = m.issuesFound;
  const removed = actual
    ? (actual.filesDeleted || 0) + (actual.itemsRemoved || 0) + (actual.entriesDisabled || 0) + (actual.issuesFixed || 0)
    : 0;
  const skipped = Math.max(0, scanned - removed);
  const reason = actual?.reason || (m.canAutoFix ? 'Automatically optimized' : 'Requires manual action');

  return (
    <div className="rounded-md bg-surface-muted overflow-hidden" data-testid={`detail-section-${m.moduleId}`}>
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-surface-muted/80 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid={`detail-toggle-${m.moduleId}`}
      >
        <div className="flex items-center gap-3">
          <div className="text-text-muted">
            <ModuleIcon id={m.moduleId} />
          </div>
          <span className="text-sm font-medium text-text-primary">{m.moduleName}</span>
        </div>
        <div className="flex items-center gap-3">
          {hasActual && (
            <span className={`text-xs font-medium ${actual!.success ? 'text-semantic-success' : 'text-semantic-danger'}`}>
              {actual!.success ? 'Verified' : 'Failed'}
            </span>
          )}
          {!hasActual && m.status === 'skipped' && (
            <span className="text-xs font-medium text-text-muted">Skipped</span>
          )}
          {!hasActual && m.status === 'complete' && m.issuesFound === 0 && (
            <span className="text-xs font-medium text-semantic-success">Clean</span>
          )}
          <ChevronDownIcon
            className={`h-4 w-4 text-text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2" data-testid={`detail-content-${m.moduleId}`}>
          {/* Scanned / Removed / Skipped / Reason */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-text-muted">Scanned</div>
              <div className="font-medium text-text-primary tabular-nums">{scanned}</div>
            </div>
            <div>
              <div className="text-text-muted">Removed</div>
              <div className="font-medium text-semantic-success tabular-nums">{removed}</div>
            </div>
            <div>
              <div className="text-text-muted">Skipped</div>
              <div className="font-medium text-text-secondary tabular-nums">{skipped}</div>
            </div>
            <div>
              <div className="text-text-muted">Reason</div>
              <div className="font-medium text-text-secondary">{reason}</div>
            </div>
          </div>

          {/* Actual measured results */}
          {hasActual && actual!.bytesRecovered !== undefined && actual!.bytesRecovered > 0 && (
            <div className="text-xs text-text-secondary">
              {formatBytes(actual!.bytesRecovered)} recovered
            </div>
          )}

          {/* Errors */}
          {hasActual && actual!.errors.length > 0 && (
            <div className="text-xs text-semantic-danger">
              {actual!.errors.slice(0, 3).join('; ')}
            </div>
          )}

          {/* Before/After verification if available */}
          {m.verification && (
            <div className="text-xs text-text-secondary">
              Score: {m.verification.beforeScore} → {m.verification.afterScore}
              {' · '}
              Issues: {m.verification.beforeIssues} → {m.verification.afterIssues}
              {' · '}
              Recoverable: {formatBytes(m.verification.beforeRecoverable)} → {formatBytes(m.verification.afterRecoverable)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: HealthScanModuleResult['status'] }) {
  if (status === 'scanning') {
    return <span className="text-sm text-brand-primary">Scanning...</span>;
  }
  if (status === 'complete') {
    return <CheckCircleIcon className="h-5 w-5 text-semantic-success" aria-hidden />;
  }
  if (status === 'error') {
    return <XCircleIcon className="h-5 w-5 text-semantic-danger" aria-hidden />;
  }
  if (status === 'skipped') {
    return <span className="text-sm text-text-muted">Skipped</span>;
  }
  return <span className="text-sm text-text-muted">Pending</span>;
}

function ModuleReportCard({ module }: { module: HealthScanModuleResult }) {
  return (
    <div className="p-3 rounded-md bg-surface-muted">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="text-text-muted">
            <ModuleIcon id={module.moduleId} />
          </div>
          <span className="text-sm font-medium text-text-primary">{module.moduleName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${SEVERITY_COLORS[module.severity]}`}>
            {module.score}
          </span>
          <StatusBadge status={module.status} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-text-secondary">
        <div>Issues: {module.issuesFound}</div>
        <div>Recoverable: {formatBytes(module.recoverableSpace)}</div>
        <div className="col-span-3">{module.measuredDetail}</div>
      </div>
      {module.issuesFound > 0 && (
        <div className="mt-2">
          {module.canAutoFix ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-semantic-success">
              <SparklesIcon className="h-3.5 w-3.5" aria-hidden />
              Will be auto-fixed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-semantic-warning">
              <ExclamationTriangleIcon className="h-3.5 w-3.5" aria-hidden />
              Requires manual action
            </span>
          )}
        </div>
      )}
    </div>
  );
}
