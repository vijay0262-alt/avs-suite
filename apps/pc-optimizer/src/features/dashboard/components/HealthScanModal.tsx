import { useState, type ReactNode } from 'react';
import { Button, Card } from '@avs/ui';
import { formatDataSize } from '@avs/shared/utils';
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
import { SCORE_ZONE_CONFIG, SCAN_PHASES, type ScoreZone, type ScanPhase, type ScanLiveStats } from '../dashboard.types';
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
  currentFile?: string | null;
  subProgress?: number;
  scanPhase?: ScanPhase | null;
  scanOverallProgress?: number;
  scanLiveStats?: ScanLiveStats;
  scanStartTime?: number | null;
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
  report,
  execution,
  result,
  error,
  currentFile,
  subProgress,
  scanPhase,
  scanOverallProgress,
  scanLiveStats,
  scanStartTime,
  onCancel,
  onClose,
  onOptimize,
  onCancelExecute,
}: HealthScanModalProps) {
  const currentPhaseInfo = scanPhase ? SCAN_PHASES.find((p) => p.id === scanPhase) : null;
  const elapsed = scanStartTime ? Date.now() - scanStartTime : 0;

  if (step === 'preparing') {
    return (
      <Modal open title="Smart Optimize — Full System Scan" onClose={onCancel} size="lg" actions={null}>
        <div className="space-y-6" data-testid="health-scan-preparing">
          <div className="text-center">
            <div className="flex justify-center mb-3">
              <SparklesIcon className="h-12 w-12 text-brand-primary animate-pulse" aria-hidden />
            </div>
            <div className="text-section-title font-medium text-text-primary">
              Preparing AI Analysis...
            </div>
            <p className="text-small text-text-secondary mt-1">
              Initializing optimization engine and loading analysis modules.
            </p>
          </div>

          {/* Phase indicator */}
          <PhaseIndicator currentPhase="preparing" />

          {/* Smooth progress bar */}
          <div className="w-full h-3 bg-[var(--avs-surface-muted)] rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all duration-500 ease-out"
              style={{ width: `${scanOverallProgress ?? 0}%` }}
            />
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
    const overallPct = scanOverallProgress ?? 0;
    const stats = scanLiveStats ?? {
      filesScanned: 0, registryEntries: 0, startupItems: 0, privacyItems: 0,
      storageRecovered: 0, memoryRecovered: 0, startupOptimized: 0, recommendationsFound: 0,
    };

    return (
      <Modal open title="Smart Optimize — Full System Scan" onClose={onCancel} size="lg" actions={null}>
        <div className="space-y-5" data-testid="health-scan-scanning">
          {/* Current phase name + percentage */}
          <div className="text-center">
            <div className="text-section-title font-medium text-text-primary mb-1">
              {currentPhaseInfo?.label ?? 'Scanning...'}
            </div>
            <div className="text-small text-text-secondary tabular-nums">{overallPct}% complete</div>
          </div>

          {/* Smooth overall progress bar */}
          <div className="w-full h-3 bg-[var(--avs-surface-muted)] rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all duration-300 ease-out"
              style={{ width: `${overallPct}%` }}
            />
          </div>

          {/* Phase indicator */}
          <PhaseIndicator currentPhase={scanPhase ?? 'preparing'} />

          {/* Live stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="scan-live-stats">
            <LiveStatBox label="Cleanable Files" value={stats.recommendationsFound.toLocaleString()} icon={<TrashIcon className="h-4 w-4" />} />
            <LiveStatBox label="Registry Entries" value={stats.registryEntries.toLocaleString()} icon={<ServerIcon className="h-4 w-4" />} />
            <LiveStatBox label="Startup Items" value={stats.startupItems.toLocaleString()} icon={<ServerIcon className="h-4 w-4" />} />
            <LiveStatBox label="Privacy Items" value={stats.privacyItems.toLocaleString()} icon={<ShieldCheckIcon className="h-4 w-4" />} />
            <LiveStatBox label="Storage Recovered" value={formatDataSize(stats.storageRecovered)} icon={<TrashIcon className="h-4 w-4" />} />
            <LiveStatBox label="Memory Recovered" value={formatDataSize(stats.memoryRecovered)} icon={<CpuChipIcon className="h-4 w-4" />} />
            <LiveStatBox label="Startup Optimized" value={`${stats.startupOptimized} items`} icon={<ClockIcon className="h-4 w-4" />} />
            <LiveStatBox label="Recommendations" value={stats.recommendationsFound.toLocaleString()} icon={<SparklesIcon className="h-4 w-4" />} />
          </div>

          {/* Current file path display + sub-progress */}
          {currentFile && (
            <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2" data-testid="scan-current-file">
              <div className="flex items-center gap-2">
                <ArrowPathIcon className="h-4 w-4 text-brand-primary shrink-0 animate-spin" aria-hidden />
                <span className="text-caption text-text-secondary truncate font-mono">{currentFile}</span>
              </div>
              <div className="mt-2 w-full h-1.5 bg-[var(--avs-surface-muted)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-primary/60 transition-all duration-300 ease-out"
                  style={{ width: `${subProgress ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Elapsed time */}
          <div className="flex items-center gap-2 text-small text-text-secondary">
            <ClockIcon className="h-4 w-4" aria-hidden />
            <span>Elapsed: {formatDuration(elapsed)}</span>
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
    const zone = scoreToZone(report.overallScore);
    const zoneConfig = SCORE_ZONE_CONFIG[zone];
    const hasOptimizable = report.modules.some((m) => m.status === 'complete' && m.canAutoFix && (m.recoverableSpace > 0 || m.issuesFound > 0));

    // Categorize findings
    const findings = report.modules.filter((m) => m.status === 'complete' && m.issuesFound > 0);
    const cleanModules = report.modules.filter((m) => m.status === 'complete' && m.issuesFound === 0);
    const totalRecovery = report.recoverableSpace;
    const estSpeedImprovement = Math.min(25, Math.round(report.issuesFound * 3 + report.recoverableSpace / (500 * 1024 * 1024) * 5));
    const optimizationActions = findings.filter((m) => m.canAutoFix).length;
    const memoryRecovery = report.modules.find((m) => m.moduleId === 'performance')?.recoverableSpace ?? 0;
    const startupItems = report.modules.find((m) => m.moduleId === 'startup')?.issuesFound ?? 0;
    const estStartupImprovement = Math.min(30, startupItems * 3);

    // Score breakdown from modules
    const perfScore = report.modules.find((m) => m.moduleId === 'performance')?.score ?? report.overallScore;
    const securityScore = report.modules.find((m) => m.moduleId === 'security')?.score ?? report.overallScore;
    const healthScore = report.overallScore;

    return (
      <Modal
        open
        title="Summary — Scan Complete"
        onClose={onClose}
        size="lg"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {hasOptimizable && (
              <Button onClick={onOptimize} leftIcon={<SparklesIcon className="h-4 w-4" />} data-testid="scan-summary-optimize">
                Optimize Now
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-6" data-testid="health-scan-report">
          {/* AI Summary header */}
          <div className="text-center">
            <div className="flex justify-center mb-2">
              <SparklesIcon className="h-10 w-10 text-brand-primary" aria-hidden />
            </div>
            <div className={`text-4xl font-bold ${zoneConfig.textColor}`}>
              {zoneConfig.label}
            </div>
            <p className="mt-1 text-small text-text-secondary">{zoneConfig.message}</p>
          </div>

          {/* Overall Health Score */}
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-5 text-center">
            <div className="text-caption uppercase tracking-wide text-text-muted mb-2">Overall Health Score</div>
            <div className={`text-5xl font-bold tabular-nums ${scoreToColor(healthScore)}`}>{healthScore}</div>
            <div className="mt-2 flex justify-center gap-4">
              <div className="text-center">
                <div className={`text-section-title font-bold ${scoreToColor(perfScore)}`}>{perfScore}</div>
                <div className="text-caption text-text-muted">Performance</div>
              </div>
              <div className="text-center">
                <div className={`text-section-title font-bold ${scoreToColor(securityScore)}`}>{securityScore}</div>
                <div className="text-caption text-text-muted">Security</div>
              </div>
            </div>
          </div>

          {/* AI Summary stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-testid="ai-summary-stats">
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <CircleStackIcon className="h-4 w-4 text-brand-primary" />
                <span className="text-caption text-text-muted">Recoverable Storage</span>
              </div>
              <div className="text-xl font-bold text-text-primary">{formatDataSize(totalRecovery)}</div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <CpuChipIcon className="h-4 w-4 text-brand-primary" />
                <span className="text-caption text-text-muted">Memory Recovery</span>
              </div>
              <div className="text-xl font-bold text-text-primary">{formatDataSize(memoryRecovery)}</div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <ClockIcon className="h-4 w-4 text-brand-primary" />
                <span className="text-caption text-text-muted">Startup Improvement</span>
              </div>
              <div className="text-xl font-bold text-text-primary">~{estStartupImprovement}s faster</div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <SparklesIcon className="h-4 w-4 text-brand-primary" />
                <span className="text-caption text-text-muted">Optimization Actions</span>
              </div>
              <div className="text-xl font-bold text-text-primary">{optimizationActions} found</div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <ClockIcon className="h-4 w-4 text-brand-primary" />
                <span className="text-caption text-text-muted">Estimated Time</span>
              </div>
              <div className="text-xl font-bold text-text-primary">~{Math.max(1, Math.round(duration / 1000))}s</div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <ArrowPathIcon className="h-4 w-4 text-brand-primary" />
                <span className="text-caption text-text-muted">Est. Speed Improvement</span>
              </div>
              <div className="text-xl font-bold text-text-primary">~{estSpeedImprovement}%</div>
            </Card>
          </div>

          {/* Findings */}
          <div className="space-y-2">
            <h4 className="text-caption font-semibold uppercase tracking-wide text-text-muted">Found</h4>
            {findings.length === 0 && cleanModules.length > 0 && (
              <div className="rounded-[var(--avs-radius-md)] bg-semantic-success/10 border border-semantic-success/20 p-3">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
                  <span className="text-small font-medium text-semantic-success">No issues found — your PC is clean!</span>
                </div>
              </div>
            )}
            {findings.map((m) => (
              <div key={m.moduleId} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <ExclamationTriangleIcon className={`h-4 w-4 ${SEVERITY_COLORS[m.severity] ?? 'text-text-muted'}`} />
                <span className="text-small text-text-secondary flex-1">{m.measuredDetail || m.moduleName}</span>
                <span className="text-caption text-text-muted tabular-nums">
                  {m.issuesFound} issue{m.issuesFound > 1 ? 's' : ''}
                  {m.recoverableSpace > 0 && ` · ${formatDataSize(m.recoverableSpace)}`}
                </span>
              </div>
            ))}
            {/* Clean modules as checkmarks */}
            {cleanModules.map((m) => (
              <div key={m.moduleId} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-semantic-success/5 px-3 py-2">
                <CheckCircleIcon className="h-4 w-4 text-semantic-success" />
                <span className="text-small text-text-secondary flex-1">{m.moduleName}</span>
                <span className="text-caption text-semantic-success">Clean</span>
              </div>
            ))}
          </div>

          {/* Recommended Action */}
          {hasOptimizable && (
            <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="h-5 w-5 text-brand-primary" />
                  <div>
                    <p className="text-small font-medium text-text-primary">Recommended: AI Smart Optimize</p>
                    <p className="text-caption text-text-muted">Safe, evidence-based optimization with rollback</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Scan duration */}
          <div className="flex items-center justify-between text-small text-text-secondary">
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
          <div className="text-section-title font-medium text-text-primary">
            {execution?.currentModule || 'Optimizing...'}
          </div>

          <div className="w-full h-3 bg-[var(--avs-surface-muted)] rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all duration-300"
              style={{ width: `${execution?.progress || 0}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <div className="text-statistic font-bold text-text-primary tabular-nums">
                {execution?.filesRemoved || 0}
              </div>
              <div className="text-small text-text-secondary">Files Removed</div>
            </Card>
            <Card>
              <div className="text-statistic font-bold text-semantic-success tabular-nums">
                {formatDataSize(execution?.spaceRecovered || 0)}
              </div>
              <div className="text-small text-text-secondary">Space Recovered</div>
            </Card>
            <Card>
              <div className="text-statistic font-bold text-text-primary tabular-nums">
                {execution?.itemsProcessed || 0}
              </div>
              <div className="text-small text-text-secondary">Items Processed</div>
            </Card>
            <Card>
              <div className="text-statistic font-bold text-text-primary tabular-nums">
                {execution ? formatDuration(execution.elapsedMs) : '0s'}
              </div>
              <div className="text-small text-text-secondary">Elapsed</div>
            </Card>
          </div>

          {execution?.liveMessages && execution.liveMessages.length > 0 && (
            <div className="text-left space-y-1.5 max-h-32 overflow-y-auto" data-testid="optimization-live-messages">
              {execution.liveMessages.slice(-8).map((msg, i) => (
                <div key={i} className="flex items-center gap-2 text-small text-text-secondary">
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
          <div className="text-section-title font-medium text-text-primary">{execution?.currentModule || 'Verifying...'}</div>
          <p className="text-small text-text-secondary">Running a fresh health scan to measure real changes. Do not close this window.</p>
          <div className="w-full h-3 bg-[var(--avs-surface-muted)] rounded-full overflow-hidden">
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
          <div className="text-section-title font-medium text-text-primary">
            {execution?.currentModule || 'Updating Dashboard...'}
          </div>
          <p className="text-small text-text-secondary">
            Refreshing health score, issues, and dashboard cards with verified post-optimization data.
          </p>
          <div className="w-full h-3 bg-[var(--avs-surface-muted)] rounded-full overflow-hidden">
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

  if (step === 'complete') {
    return (
      <Modal open title="Optimization Complete" onClose={onClose} size="md" actions={
        <Button onClick={onClose} leftIcon={<CheckCircleIcon className="h-4 w-4" />}>Done</Button>
      }>
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            {error ? (
              <XCircleIcon className="h-10 w-10 text-semantic-danger" aria-hidden />
            ) : (
              <CheckCircleIcon className="h-10 w-10 text-semantic-success" aria-hidden />
            )}
          </div>
          <div className="text-small text-text-secondary">
            {error ? error : 'No optimization was required. Your system is already healthy.'}
          </div>
        </div>
      </Modal>
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
          <h3 className="text-section-title font-semibold text-text-primary">
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
            <div className="text-caption text-text-muted mt-1">Before</div>
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
            <div className="text-caption text-text-muted mt-1">After</div>
            <div className={`text-small font-medium mt-1 ${animatedColor} transition-colors duration-500`}>
              {SCORE_ZONE_CONFIG[scoreToZone(animatedScore)].label}
            </div>
          </div>
        </div>

        {/* Summary metrics grid */}
        <div>
          <div className="mb-3 text-caption uppercase tracking-wide text-text-muted">Optimization Summary</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-testid="celebration-summary">
            <Card>
              <div className="text-xl font-bold text-semantic-success tabular-nums">
                {formatDataSize(totalBytesRecovered)}
              </div>
              <div className="text-caption text-text-secondary">Recovered Storage</div>
            </Card>
            {totalIssuesFixed > 0 && (
              <Card>
                <div className="text-xl font-bold text-text-primary tabular-nums">
                  {totalIssuesFixed}
                </div>
                <div className="text-caption text-text-secondary">Registry Fixed</div>
              </Card>
            )}
            {totalEntriesDisabled > 0 && (
              <Card>
                <div className="text-xl font-bold text-text-primary tabular-nums">
                  {totalEntriesDisabled}
                </div>
                <div className="text-caption text-text-secondary">Startup Optimized</div>
              </Card>
            )}
            {totalItemsRemoved > 0 && (
              <Card>
                <div className="text-xl font-bold text-text-primary tabular-nums">
                  {totalItemsRemoved}
                </div>
                <div className="text-caption text-text-secondary">Privacy Files Removed</div>
              </Card>
            )}
            {totalFilesDeleted > 0 && (
              <Card>
                <div className="text-xl font-bold text-text-primary tabular-nums">
                  {totalFilesDeleted}
                </div>
                <div className="text-caption text-text-secondary">Files Deleted</div>
              </Card>
            )}
            <Card>
              <div className="text-xl font-bold text-text-primary tabular-nums">
                {formatDuration(elapsed)}
              </div>
              <div className="text-caption text-text-secondary">Time Taken</div>
            </Card>
          </div>
        </div>

        {/* If nothing changed, say so honestly */}
        {totalBytesRecovered === 0 && totalItemsRemoved === 0 && totalEntriesDisabled === 0 && totalIssuesFixed === 0 && (
          <div className="flex items-center gap-3 py-3 px-4 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] text-small text-text-secondary">
            <InformationCircleIcon className="h-5 w-5 shrink-0" aria-hidden />
            <span>No measurable improvement detected. Your system may already be optimized.</span>
          </div>
        )}

        {/* If score didn't change, explain why */}
        {!scoreChanged && (
          <div className="flex items-center gap-3 py-3 px-4 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] text-small text-text-secondary">
            <InformationCircleIcon className="h-5 w-5 shrink-0" aria-hidden />
            <span>Health score remained at {afterOverall}. This can happen when cleaned files were small relative to overall system state.</span>
          </div>
        )}

        {/* Expandable Detailed Results */}
        {showDetails && (
          <div className="space-y-3" data-testid="detailed-results">
            <div className="text-caption uppercase tracking-wide text-text-muted">Detailed Results</div>
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
              <div className="mb-3 text-caption uppercase tracking-wide text-text-muted">
                Still needs your attention
              </div>
              <div className="space-y-2">
                {needsAction.map((m) => (
                  <div key={m.moduleId} className="p-3 rounded-[var(--avs-radius-md)] bg-semantic-warning/10 border border-semantic-warning/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-small font-medium text-text-primary">{m.moduleName}</span>
                      <span className="text-caption font-medium text-semantic-warning">Manual action</span>
                    </div>
                    <div className="text-caption text-text-secondary">{m.measuredDetail}</div>
                    <div className="text-caption text-text-secondary mt-1">
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
            <div className="flex items-center gap-3 py-3 px-4 rounded-[var(--avs-radius-md)] bg-semantic-success/10">
              <SparklesIcon className="h-5 w-5 text-semantic-success shrink-0" aria-hidden />
              <div>
                <div className="text-small font-medium text-text-primary">Your PC Health is Excellent.</div>
                <div className="text-caption text-text-secondary">Next optimization recommended in 7 days.</div>
              </div>
            </div>
          ) : afterOverall >= 75 ? (
            <div className="flex items-center gap-3 py-3 px-4 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)]">
              <SparklesIcon className="h-5 w-5 text-text-secondary shrink-0" aria-hidden />
              <div>
                <div className="text-small font-medium text-text-primary">Your PC Health is Good.</div>
                <div className="text-caption text-text-secondary">Next optimization recommended in 3 days.</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-3 px-4 rounded-[var(--avs-radius-md)] bg-semantic-warning/10">
              <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning shrink-0" aria-hidden />
              <div>
                <div className="text-small font-medium text-text-primary">Further optimization recommended.</div>
                <div className="text-caption text-text-secondary">Some issues remain. Consider running optimization again or reviewing manual action items.</div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 py-3 px-4 rounded-[var(--avs-radius-md)] bg-semantic-danger/10 text-small text-semantic-danger">
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
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] overflow-hidden" data-testid={`detail-section-${m.moduleId}`}>
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--avs-surface-muted)]/80 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid={`detail-toggle-${m.moduleId}`}
      >
        <div className="flex items-center gap-3">
          <div className="text-text-muted">
            <ModuleIcon id={m.moduleId} />
          </div>
          <span className="text-small font-medium text-text-primary">{m.moduleName}</span>
        </div>
        <div className="flex items-center gap-3">
          {hasActual && (
            <span className={`text-caption font-medium ${actual!.success ? 'text-semantic-success' : 'text-semantic-danger'}`}>
              {actual!.success ? 'Verified' : 'Failed'}
            </span>
          )}
          {!hasActual && m.status === 'skipped' && (
            <span className="text-caption font-medium text-text-muted">Skipped</span>
          )}
          {!hasActual && m.status === 'complete' && m.issuesFound === 0 && (
            <span className="text-caption font-medium text-semantic-success">Clean</span>
          )}
          <ChevronDownIcon
            className={`h-4 w-4 text-text-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[var(--avs-border)]/50 pt-2" data-testid={`detail-content-${m.moduleId}`}>
          {/* Scanned / Removed / Skipped / Reason */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-caption">
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
            <div className="text-caption text-text-secondary">
              {formatDataSize(actual!.bytesRecovered)} recovered
            </div>
          )}

          {/* Errors */}
          {hasActual && actual!.errors.length > 0 && (
            <div className="text-caption text-semantic-danger">
              {actual!.errors.slice(0, 3).join('; ')}
            </div>
          )}

          {/* Before/After verification if available */}
          {m.verification && (
            <div className="text-caption text-text-secondary">
              Score: {m.verification.beforeScore} → {m.verification.afterScore}
              {' · '}
              Issues: {m.verification.beforeIssues} → {m.verification.afterIssues}
              {' · '}
              Recoverable: {formatDataSize(m.verification.beforeRecoverable)} → {formatDataSize(m.verification.afterRecoverable)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── Phase Indicator: shows 8 scan phases with current highlighted ──

function PhaseIndicator({ currentPhase }: { currentPhase: ScanPhase }) {
  const currentIndex = SCAN_PHASES.findIndex((p) => p.id === currentPhase);
  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid="phase-indicator">
      {SCAN_PHASES.map((phase, i) => {
        const isComplete = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={phase.id} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-[var(--avs-radius-sm)] text-caption transition-colors ${
                isCurrent
                  ? 'bg-brand-primary/15 text-brand-primary font-medium'
                  : isComplete
                    ? 'text-semantic-success'
                    : 'text-text-muted'
              }`}
            >
              {isComplete ? (
                <CheckCircleIcon className="h-3.5 w-3.5" aria-hidden />
              ) : isCurrent ? (
                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border border-current opacity-40" />
              )}
              <span className={isCurrent ? '' : isComplete ? '' : 'hidden sm:inline'}>{phase.label}</span>
            </div>
            {i < SCAN_PHASES.length - 1 && (
              <div className={`h-px w-3 ${isComplete ? 'bg-semantic-success/40' : 'bg-[var(--avs-border)]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Live Stat Box: compact stat display for the scanning screen ──

function LiveStatBox({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2" data-testid={`live-stat-${label.replace(/\s+/g, '-').toLowerCase()}`}>
      <div className="flex items-center gap-1.5 text-text-muted mb-0.5">
        {icon}
        <span className="text-caption">{label}</span>
      </div>
      <div className="text-small font-bold text-text-primary tabular-nums">{value}</div>
    </div>
  );
}

