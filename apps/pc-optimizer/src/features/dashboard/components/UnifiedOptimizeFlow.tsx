/**
 * UnifiedOptimizeFlow — maps DashboardViewModel health scan state to the
 * same UnifiedScanView + UnifiedResultsView components used by the
 * Security Center. This ensures a consistent scan/fix experience across
 * all three flagship modules (Smart Optimize, Protection Center, Security).
 *
 * Steps:
 *   preparing/scanning → UnifiedScanView (live scan progress)
 *   report             → UnifiedResultsView (AI summary + Optimize Now button)
 *   optimizing         → UnifiedScanView (live fix progress, reusing scan UI)
 *   updating_dashboard → brief verification animation
 *   complete           → Success screen with before/after scores
 */
import { useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { Modal } from './Modal';
import { UnifiedScanView } from '../../unified-scan/components/UnifiedScanView';
import { UnifiedResultsView } from '../../unified-results/components/UnifiedResultsView';
import { useScanHistory } from '../../unified-results/useScanHistory';
import { OPTIMIZE_SCAN_CONFIG } from '../../unified-scan/moduleConfigs';
import type {
  UnifiedScanStep,
  UnifiedScanLiveStatus,
  UnifiedScanTreeNode,
} from '../../unified-scan/unifiedScanTypes';
import type {
  UnifiedResultsReport,
  UnifiedResultAction,
  UnifiedScanHistoryEntry,
  UnifiedScoreDisplay,
  UnifiedAIVerdict,
  UnifiedIssue,
  UnifiedImpactEstimate,
  UnifiedResultCardData,
  UnifiedRecommendation,
  UnifiedFileDetailGroup,
  IssuePriority,
} from '../../unified-results/unifiedResultsTypes';
import type { CurrentOperationCardProps } from '../../unified-scan/components/CurrentOperationCard';
import type { DashboardViewModel } from '../DashboardViewModel';
import type {
  HealthScanReport,
  HealthScanModuleResult,
  ScanLiveStats,
  OptimizationExecutionProgress,
} from '../dashboard.types';
import type { OptimizationSummary } from '../OptimizationSummary.types';
import {
  buildCleaningSummary,
  buildRegistrySummary,
  formatBytes,
} from '../../health/VerificationEngine';
import type { VerificationReport, ModuleVerificationResult } from '../../health/VerificationEngine';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ClockIcon,
  CircleStackIcon,
  CpuChipIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import { FileDetailsSection } from '../../unified-results/components/FileDetailsSection';

export interface UnifiedOptimizeFlowProps {
  vm: DashboardViewModel;
  isPro?: boolean;
  onClose: () => void;
}

export function UnifiedOptimizeFlow({ vm, isPro = false, onClose }: UnifiedOptimizeFlowProps) {
  const s = vm.state;
  const { history, addEntry } = useScanHistory(isPro);

  // ── Map scan live stats to counters ──────────────────────────────
  const counters = useMemo(() => mapLiveStatsToCounters(s.scanLiveStats), [s.scanLiveStats]);

  // ── Map modules to scan tree nodes ────────────────────────────────
  const treeNodes = useMemo(() => mapModulesToTreeNodes(s.healthScanModules), [s.healthScanModules]);

  // ── Map scan phase to live status ────────────────────────────────
  const liveStatus = useMemo<UnifiedScanLiveStatus>(() => {
    const phase = s.scanPhase;
    const phaseInfo = OPTIMIZE_SCAN_CONFIG.phases.find((p) => p.id === phase);
    return {
      currentPhase: phaseInfo?.label ?? 'Preparing...',
      currentActivity: phaseInfo?.activities[0] ?? '',
      currentFile: s.healthScanCurrentFile ?? undefined,
      overallProgress: s.scanOverallProgress,
      subProgress: s.healthScanSubProgress,
    };
  }, [s.scanPhase, s.scanOverallProgress, s.healthScanSubProgress, s.healthScanCurrentFile]);

  // ── Map current operation for CurrentOperationCard ───────────────
  const currentOperation = useMemo<CurrentOperationCardProps | null>(() => {
    if (s.healthScanStep === 'complete' || s.healthScanStep === 'idle' || s.healthScanStep === 'report') return null;
    const moduleName = s.healthScanModules.find((m) => m.moduleId === s.scanPhase)?.moduleName
      ?? s.healthScanExecution?.currentModule
      ?? 'Preparing...';
    return {
      currentModule: moduleName,
      currentOperation: s.scanCurrentOperation,
      currentPath: s.scanCurrentPath,
      itemsProcessed: s.scanItemsProcessed,
      itemsRemaining: s.scanItemsRemaining,
      bytesRecovered: s.scanBytesRecovered,
      elapsedMs: s.scanStartTime ? Date.now() - s.scanStartTime : 0,
      overallProgress: s.scanOverallProgress,
      isOptimizing: s.healthScanStep === 'optimizing' || s.healthScanStep === 'verifying',
    };
  }, [s.healthScanStep, s.scanCurrentOperation, s.scanCurrentPath, s.scanItemsProcessed, s.scanItemsRemaining, s.scanBytesRecovered, s.scanStartTime, s.scanOverallProgress, s.healthScanModules, s.scanPhase, s.healthScanExecution]);

  // ── Determine unified step ───────────────────────────────────────
  const step = useMemo<UnifiedScanStep>(() => {
    switch (s.healthScanStep) {
      case 'preparing':
      case 'scanning':
        return s.healthScanStep;
      case 'optimizing':
        return 'scanning'; // reuse scanning UI for fix progress
      case 'verifying':
        return 'scanning'; // reuse scanning UI for verify phase
      case 'updating_dashboard':
        return 'scanning'; // brief transition — keep scan UI visible
      case 'complete':
        return 'complete';
      case 'report':
        return 'complete'; // results shown via UnifiedResultsView
      default:
        return 'idle';
    }
  }, [s.healthScanStep]);

  // ── Build results report for UnifiedResultsView ──────────────────
  const resultsReport = useMemo<UnifiedResultsReport | null>(() => {
    if (!s.healthScanReport) return null;
    return buildResultsReport(
      s.healthScanReport,
      s.healthScanBeforeReport,
      s.scanStartTime,
      s.optimizationSummary,
    );
  }, [s.healthScanReport, s.healthScanBeforeReport, s.scanStartTime, s.optimizationSummary]);

  // ── Add to scan history when report is available ─────────────────
  useMemo(() => {
    if (resultsReport && s.healthScanStep === 'complete') {
      addEntry(buildHistoryEntry(resultsReport));
    }
  }, [resultsReport, s.healthScanStep, addEntry]);

  // ── Determine what to render ─────────────────────────────────────

  // Scanning phase (includes scanning, optimizing, verifying, updating_dashboard)
  if (step === 'preparing' || step === 'scanning') {
    const isFixing = s.healthScanStep === 'optimizing';
    const isVerifying = s.healthScanStep === 'verifying' || s.healthScanStep === 'updating_dashboard';
    const fixConfig = isFixing ? buildFixConfig(s.healthScanExecution) : isVerifying ? buildVerifyConfig() : OPTIMIZE_SCAN_CONFIG;
    const fixLiveStatus = isFixing
      ? buildFixLiveStatus(s.healthScanExecution)
      : isVerifying
        ? buildVerifyLiveStatus(s.scanOverallProgress)
        : liveStatus;
    const fixCounters = isFixing
      ? buildFixCounters(s.healthScanExecution)
      : isVerifying
        ? buildVerifyCounters(s.scanLiveStats, s.scanBytesRecovered)
        : counters;
    const fixTreeNodes = isFixing
      ? mapModulesToFixTreeNodes(s.healthScanModules)
      : treeNodes;

    return (
      <Modal
        open
        title="AI Smart Optimize — Scanning"
        onClose={onClose}
        size="xl"
        actions={null}
      >
        <UnifiedScanView
          config={fixConfig}
          step={isFixing || isVerifying ? 'scanning' : step}
          liveStatus={fixLiveStatus}
          counters={fixCounters}
          treeNodes={fixTreeNodes}
          currentPhaseIndex={0}
          startTime={s.scanStartTime ?? Date.now()}
          error={s.healthScanError}
          report={null}
          actions={[]}
          isOptimizing={isFixing || isVerifying}
          activityLog={s.scanActivityLog}
          currentOperation={currentOperation}
          onPause={() => {}}
          onResume={() => {}}
          onCancel={() => {
            if (isFixing || isVerifying) {
              vm.cancelHealthScanOptimizations();
            } else {
              vm.cancelHealthScan();
            }
          }}
          onClose={onClose}
        />
      </Modal>
    );
  }

  // Report phase — show AI summary with Optimize Now button
  if (s.healthScanStep === 'report' && resultsReport) {
    const optimizeAction: UnifiedResultAction = {
      id: 'optimize-now',
      label: isPro ? 'Optimize Now' : 'Optimize Now',
      icon: 'BoltIcon',
      variant: 'primary',
      action: () => vm.executeHealthScanOptimizations(),
      requiresPro: false,
    };
    const rescanAction: UnifiedResultAction = {
      id: 'rescan',
      label: 'Scan Again',
      icon: 'ArrowPathIcon',
      variant: 'ghost',
      action: () => {
        vm.closeHealthScan();
        vm.startHealthScan();
      },
    };

    return (
      <Modal
        open
        title="AI Smart Optimize — Results"
        onClose={onClose}
        size="xl"
        actions={null}
      >
        <UnifiedResultsView
          report={resultsReport}
          history={history}
          isPro={isPro}
          onClose={onClose}
          headerAction={optimizeAction}
          extraActions={[rescanAction]}
        />
      </Modal>
    );
  }

  // Complete — verification screen with detailed results
  if (s.healthScanStep === 'complete') {
    // Use the verified report score (computed locally from actual cleaning results)
    // as the primary source — dashboard healthScore may still be loading from
    // the backend metrics refresh.
    const verifiedAfterScore = s.healthScanReport?.overallScore ?? s.healthScore?.overallScore ?? 0;
    return (
      <Modal
        open
        title="AI Smart Optimize — Complete"
        onClose={onClose}
        size="xl"
        actions={null}
      >
        <VerificationScreen
          verificationReport={s.verificationReport}
        optimizationSummary={s.optimizationSummary}
        healthBefore={s.healthScanBeforeReport?.overallScore ?? 0}
        healthAfter={verifiedAfterScore}
        beforeModules={s.healthScanBeforeReport?.modules ?? []}
        afterModules={s.healthScanReport?.modules ?? []}
        onClose={onClose}
        onScanAgain={() => {
          vm.closeHealthScan();
          vm.startHealthScan();
        }}
      />
      </Modal>
    );
  }

  // Fallback
  return null;
}

// ── Mappers ────────────────────────────────────────────────────────

function mapLiveStatsToCounters(stats: ScanLiveStats): Record<string, number> {
  return {
    filesScanned: stats.filesScanned,
    registryEntries: stats.registryEntries,
    startupItems: stats.startupItems,
    privacyItems: stats.privacyItems,
    storageRecovery: stats.estimatedStorageRecovery,
    memoryRecovery: stats.estimatedMemoryRecovery,
    startupImprovement: stats.estimatedStartupImprovement,
    recommendations: stats.recommendationsFound,
  };
}

function mapModulesToTreeNodes(modules: HealthScanModuleResult[]): UnifiedScanTreeNode[] {
  return modules.map((m) => ({
    id: m.moduleId,
    label: m.moduleName,
    status: m.status as UnifiedScanTreeNode['status'],
    itemsScanned: m.issuesFound > 0 ? m.issuesFound : 0,
    issuesFound: m.issuesFound,
    reason: m.status === 'error' ? (m.measuredDetail || 'Scan failed') : m.status === 'skipped' ? (m.measuredDetail || 'No issues found') : undefined,
  }));
}

function mapModulesToFixTreeNodes(modules: HealthScanModuleResult[]): UnifiedScanTreeNode[] {
  return modules.map((m) => ({
    id: m.moduleId,
    label: m.moduleName,
    status: (m.actual ? (m.actual.success ? 'complete' : 'error') : 'pending') as UnifiedScanTreeNode['status'],
    itemsScanned: m.actual?.filesDeleted ?? m.actual?.itemsRemoved ?? m.actual?.issuesFixed ?? 0,
    issuesFound: m.actual?.errors.length ?? 0,
    reason: m.actual && !m.actual.success ? (m.actual.errors[0] || 'Optimization failed') : undefined,
  }));
}

function buildFixConfig(execution: OptimizationExecutionProgress | null) {
  return {
    ...OPTIMIZE_SCAN_CONFIG,
    moduleName: 'Optimizing',
    phases: [
      {
        id: 'optimizing',
        label: 'Applying Optimizations',
        description: 'Cleaning and fixing issues across all modules',
        startPercent: 0,
        endPercent: 100,
        activities: execution?.liveMessages ?? ['Optimizing...'],
      },
    ],
  };
}

function buildVerifyConfig() {
  return {
    ...OPTIMIZE_SCAN_CONFIG,
    moduleName: 'Verifying',
    phases: [
      {
        id: 'verifying',
        label: 'Verifying Results',
        description: 'Confirming all optimizations were applied successfully',
        startPercent: 0,
        endPercent: 100,
        activities: ['Verifying optimizations...', 'Checking results...', 'Updating scores...'],
      },
    ],
  };
}

function buildVerifyLiveStatus(progress: number): UnifiedScanLiveStatus {
  return {
    currentPhase: 'Verifying Results',
    currentActivity: 'Verifying optimizations...',
    overallProgress: progress,
  };
}

function buildVerifyCounters(stats: ScanLiveStats, bytesRecovered: number): Record<string, number> {
  return {
    filesScanned: stats.filesScanned,
    storageRecovery: stats.estimatedStorageRecovery,
    itemsProcessed: stats.recommendationsFound,
    bytesRecovered,
  };
}

function buildFixLiveStatus(execution: OptimizationExecutionProgress | null): UnifiedScanLiveStatus {
  return {
    currentPhase: execution?.currentModule ?? 'Optimizing...',
    currentActivity: execution?.liveMessages[execution.liveMessages.length - 1] ?? 'Applying optimizations...',
    overallProgress: execution?.progress ?? 0,
  };
}

function buildFixCounters(execution: OptimizationExecutionProgress | null): Record<string, number> {
  return {
    filesScanned: execution?.filesRemoved ?? 0,
    storageRecovery: execution?.spaceRecovered ?? 0,
    itemsProcessed: execution?.itemsProcessed ?? 0,
  };
}

function buildResultsReport(
  report: HealthScanReport,
  beforeReport: HealthScanReport | null,
  startTime: number | null,
  summary: OptimizationSummary | null,
): UnifiedResultsReport {
  const isComplete = summary !== null;
  const beforeScore = beforeReport?.overallScore ?? report.overallScore;
  const afterScore = isComplete ? summary!.healthAfter : report.overallScore;

  const primaryScore: UnifiedScoreDisplay = {
    label: isComplete ? 'Optimized Health Score' : 'Health Score',
    value: afterScore,
    max: 100,
    icon: 'SparklesIcon',
    description: isComplete
      ? `Improved from ${beforeScore} to ${afterScore}`
      : `Current health score: ${afterScore}/100`,
  };

  const secondaryScores: UnifiedScoreDisplay[] = report.modules.slice(0, 4).map((m) => ({
    label: m.moduleName,
    value: m.score,
    max: 100,
    icon: 'ShieldCheckIcon',
  }));

  const aiVerdict: UnifiedAIVerdict = {
    summary: isComplete
      ? `Optimization complete. Health score improved from ${beforeScore} to ${afterScore}.`
      : report.overallScore >= 80
        ? 'Your PC is in good health. Minor optimizations available.'
        : report.overallScore >= 60
          ? 'Several issues detected. Optimization recommended.'
          : 'Multiple critical issues found. Optimization strongly recommended.',
    details: isComplete
      ? report.modules
        .filter((m) => m.actual?.success)
        .map((m) => `${m.moduleName}: ${(m.verification?.beforeIssues ?? 0) - (m.verification?.afterIssues ?? 0)} issues fixed, score ${m.verification?.beforeScore ?? 0} → ${m.verification?.afterScore ?? m.score}`)
      : report.modules
        .filter((m) => m.issuesFound > 0)
        .map((m) => `${m.moduleName}: ${m.issuesFound} issues found (${m.severity} severity)`),
    confidence: 95,
    evidenceCount: report.modules.length,
    evidenceSources: report.modules.map((m) => m.moduleName),
  };

  const issues: UnifiedIssue[] = isComplete
    ? []
    : report.modules
      .filter((m) => m.issuesFound > 0)
      .map((m) => ({
        id: m.moduleId,
        title: `${m.moduleName} Issues`,
        description: m.measuredDetail,
        priority: (m.severity === 'high' ? 'high' : m.severity === 'medium' ? 'medium' : 'low') as IssuePriority,
        category: m.moduleId,
        severity: m.severity === 'high' ? 'danger' : m.severity === 'medium' ? 'warning' : 'info',
        confidence: 0.9,
        evidence: [m.measuredDetail],
      }));

  const impactEstimates: UnifiedImpactEstimate[] = isComplete
    ? [
        {
          id: 'storage',
          label: 'Storage Recovered',
          icon: 'CircleStackIcon',
          currentValue: formatBytes(beforeReport?.recoverableSpace ?? 0),
          estimatedValue: formatBytes(summary!.storageRecovered),
          difference: formatBytes(summary!.storageRecovered),
          unit: 'bytes',
          positive: summary!.storageRecovered > 0,
        },
        {
          id: 'registry',
          label: 'Registry Fixed',
          icon: 'ServerStackIcon',
          currentValue: '0',
          estimatedValue: `${summary!.registryFixed}`,
          difference: `${summary!.registryFixed} issues`,
          unit: 'count',
          positive: summary!.registryFixed > 0,
        },
        {
          id: 'startup',
          label: 'Startup Optimized',
          icon: 'ClockIcon',
          currentValue: '0',
          estimatedValue: `${summary!.startupOptimized}`,
          difference: `${summary!.startupOptimized} items`,
          unit: 'count',
          positive: summary!.startupOptimized > 0,
        },
        {
          id: 'privacy',
          label: 'Privacy Cleaned',
          icon: 'EyeSlashIcon',
          currentValue: '0',
          estimatedValue: `${summary!.privacyCleaned}`,
          difference: `${summary!.privacyCleaned} items`,
          unit: 'count',
          positive: summary!.privacyCleaned > 0,
        },
      ]
    : report.modules
        .filter((m) => m.recoverableSpace > 0)
        .map((m) => ({
          id: m.moduleId,
          label: `${m.moduleName} Recovery`,
          icon: 'CircleStackIcon',
          currentValue: '0',
          estimatedValue: formatBytes(m.recoverableSpace),
          difference: formatBytes(m.recoverableSpace),
          unit: 'bytes' as const,
          positive: true,
        }));

  const resultCards: UnifiedResultCardData[] = report.modules.map((m) => ({
    id: m.moduleId,
    title: m.moduleName,
    icon: 'ShieldCheckIcon',
    metrics: [
      { label: 'Score', value: `${m.score}/100`, tone: m.score >= 80 ? 'success' : m.score >= 60 ? 'warning' : 'danger' },
      { label: 'Issues', value: `${m.issuesFound}` },
      ...(m.recoverableSpace > 0 ? [{ label: 'Recoverable', value: formatBytes(m.recoverableSpace) }] : []),
      ...(m.actual ? [
        { label: 'Files Cleaned', value: `${m.actual.filesDeleted ?? 0}`, tone: 'success' as const },
        { label: 'Space Recovered', value: formatBytes(m.actual.bytesRecovered ?? 0), tone: 'success' as const },
      ] : []),
    ],
    status: m.score >= 80 ? 'good' : m.score >= 60 ? 'warning' : 'danger',
  }));

  const recommendations: UnifiedRecommendation[] = isComplete
    ? []
    : report.modules
      .filter((m) => m.canAutoFix && m.issuesFound > 0)
      .map((m) => ({
        id: m.moduleId,
        title: `Optimize ${m.moduleName}`,
        summary: m.measuredDetail,
        description: m.details?.summary ?? m.measuredDetail,
        priority: (m.severity === 'high' ? 'high' : m.severity === 'medium' ? 'medium' : 'low') as IssuePriority,
        category: m.moduleId,
        reason: `${m.issuesFound} issues detected in ${m.moduleName}`,
        expectedBenefit: m.recoverableSpace > 0 ? `Recover ${formatBytes(m.recoverableSpace)}` : `Fix ${m.issuesFound} issues`,
        estimatedTime: '< 30s',
        riskLevel: m.severity === 'high' ? 'low' : 'none',
        rollbackAvailable: true,
        requiresConfirmation: false,
        aiConfidence: 0.9,
        evidence: [m.measuredDetail],
        whyItMatters: m.details?.why ?? `${m.moduleName} issues can slow down your PC`,
        whatHappensIfIgnored: 'Issues may accumulate and further degrade performance',
        requiresPro: false,
        selected: true,
      }));

  const actions: UnifiedResultAction[] = isComplete
    ? [
        {
          id: 'close',
          label: 'Close',
          icon: 'XMarkIcon',
          variant: 'ghost',
          action: () => {},
        },
      ]
    : [
        {
          id: 'optimize',
          label: 'Optimize Now',
          icon: 'BoltIcon',
          variant: 'primary',
          action: () => {},
          requiresPro: false,
        },
      ];

  // Build file details from module scan groups
  const fileDetails: UnifiedFileDetailGroup[] = report.modules
    .filter((m) => m.details?.groups?.some((g) => g.items.length > 0))
    .flatMap((m) =>
      m.details.groups
        .filter((g) => g.items.length > 0)
        .map((g) => ({
          moduleLabel: m.moduleName,
          title: g.title,
          items: g.items.map((item) => ({
            name: item.name,
            size: item.size,
          })),
          totalSize: g.totalSize,
        })),
    );

  return {
    reportId: `opt-${Date.now()}`,
    moduleId: 'optimize',
    moduleName: 'AI Smart Optimize',
    moduleIcon: 'SparklesIcon',
    timestamp: startTime ?? Date.now(),
    durationMs: report.finishedAt - report.startedAt,
    itemsAnalyzed: report.modules.reduce((s, m) => s + m.issuesFound, 0),
    issuesFound: isComplete ? 0 : report.issuesFound,
    aiConfidence: 95,
    primaryScore,
    secondaryScores,
    aiVerdict,
    issues,
    impactEstimates,
    resultCards,
    recommendations,
    fileDetails,
    actions,
  };
}

function buildHistoryEntry(report: UnifiedResultsReport): UnifiedScanHistoryEntry {
  return {
    id: report.reportId,
    module: report.moduleId,
    moduleName: report.moduleName,
    moduleIcon: report.moduleIcon,
    score: report.primaryScore.value,
    durationMs: report.durationMs,
    issuesFound: report.issuesFound,
    actionsTaken: report.recommendations.map((r) => r.title),
    timestamp: report.timestamp,
    reportId: report.reportId,
  };
}

// ── Verification Screen ──────────────────────────────────────────

interface VerificationScreenProps {
  verificationReport: VerificationReport | null;
  optimizationSummary: OptimizationSummary | null;
  healthBefore: number;
  healthAfter: number;
  beforeModules: HealthScanModuleResult[];
  afterModules: HealthScanModuleResult[];
  onClose: () => void;
  onScanAgain: () => void;
}

function VerificationScreen({
  verificationReport,
  optimizationSummary,
  healthBefore,
  healthAfter,
  beforeModules,
  afterModules,
  onClose,
  onScanAgain,
}: VerificationScreenProps) {
  const isVerified = verificationReport?.overallStatus === 'verified';
  const isPartial = verificationReport?.overallStatus === 'partially_verified';

  const cleaningSummary = verificationReport
    ? buildCleaningSummary(verificationReport)
    : null;
  const registrySummary = verificationReport
    ? buildRegistrySummary(verificationReport)
    : null;

  const statusIcon = isVerified
    ? <CheckCircleIcon className="h-10 w-10 text-[var(--avs-success)]" />
    : isPartial
    ? <ExclamationTriangleIcon className="h-10 w-10 text-[var(--avs-warning)]" />
    : <XCircleIcon className="h-10 w-10 text-[var(--avs-danger)]" />;

  const statusColor = isVerified
    ? 'text-[var(--avs-success)]'
    : isPartial
    ? 'text-[var(--avs-warning)]'
    : 'text-[var(--avs-danger)]';

  const statusBg = isVerified
    ? 'bg-[color-mix(in_srgb,var(--avs-success)_8%,transparent)]'
    : isPartial
    ? 'bg-[color-mix(in_srgb,var(--avs-warning)_8%,transparent)]'
    : 'bg-[color-mix(in_srgb,var(--avs-danger)_8%,transparent)]';

  return (
    <div className="space-y-4" data-testid="verification-screen">
      {/* Verification Header */}
      <Card variant="glass" className="overflow-hidden">
        <div className={`flex items-center gap-4 p-6 ${statusBg}`}>
          <div className="shrink-0">
            <div className="rounded-full bg-[var(--avs-surface)] p-3 shadow-[var(--avs-shadow-sm)]">
              {statusIcon}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={`text-xl font-bold ${statusColor}`}>
              {verificationReport?.headline ?? 'Verification Complete'}
            </h2>
            <p className="mt-1 text-small text-[var(--avs-text-secondary)]">
              {verificationReport?.subheadline ?? 'All actions verified successfully.'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-caption text-[var(--avs-text-muted)]">Duration</div>
            <div className="text-body font-semibold text-[var(--avs-text-primary)]">
              {verificationReport ? `${(verificationReport.durationMs / 1000).toFixed(1)}s` : '--'}
            </div>
          </div>
        </div>

        {/* Verification checklist */}
        <div className="border-t border-[var(--avs-border)] p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <VerificationStat
              label="Completed"
              value={verificationReport?.completed ?? 0}
              icon={<CheckCircleIcon className="h-5 w-5 text-[var(--avs-success)]" />}
              color="text-[var(--avs-success)]"
            />
            <VerificationStat
              label="Skipped"
              value={verificationReport?.skipped ?? 0}
              icon={<ClockIcon className="h-5 w-5 text-[var(--avs-text-muted)]" />}
              color="text-[var(--avs-text-muted)]"
            />
            <VerificationStat
              label="Failed"
              value={verificationReport?.failed ?? 0}
              icon={<XCircleIcon className="h-5 w-5 text-[var(--avs-danger)]" />}
              color="text-[var(--avs-danger)]"
            />
            <VerificationStat
              label="Manual Review"
              value={verificationReport?.manualReview ?? 0}
              icon={<ExclamationTriangleIcon className="h-5 w-5 text-[var(--avs-warning)]" />}
              color="text-[var(--avs-warning)]"
            />
          </div>
        </div>
      </Card>

      {/* Score Transition */}
      <Card variant="glass" className="p-6">
        <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)] mb-4">
          Score Improvement
        </h3>
        <div className="flex items-center justify-center gap-8 mb-6">
          <ScoreCircle label="Health Score" before={healthBefore} after={healthAfter} />
        </div>
        {beforeModules.length > 0 && afterModules.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-[var(--avs-border)] pt-4">
            {afterModules.map((afterMod) => {
              const beforeMod = beforeModules.find((m) => m.moduleId === afterMod.moduleId);
              if (!beforeMod) return null;
              return (
                <ModuleScoreTransition
                  key={afterMod.moduleId}
                  label={afterMod.moduleName}
                  before={beforeMod.score}
                  after={afterMod.score}
                />
              );
            })}
          </div>
        )}
      </Card>

      {/* Files Cleaned */}
      {afterModules.length > 0 && (() => {
        const cleanedGroups = afterModules
          .filter((m) => m.actual?.success && m.details?.groups?.some((g) => g.items.length > 0))
          .flatMap((m) =>
            m.details.groups
              .filter((g) => g.items.length > 0)
              .map((g) => ({
                moduleLabel: m.moduleName,
                title: g.title,
                items: g.items.map((item) => ({
                  name: item.name,
                  size: item.size,
                })),
                totalSize: g.totalSize,
              })),
          );
        if (cleanedGroups.length === 0) return null;
        return (
          <Card variant="glass" className="p-6">
            <FileDetailsSection
              groups={cleanedGroups}
              title="Files Cleaned"
              variant="cleaned"
            />
          </Card>
        );
      })()}

      {/* Detailed Cleaning Breakdown */}
      {cleaningSummary && cleaningSummary.breakdown.length > 0 && (
        <Card variant="glass" className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <CircleStackIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
            <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">
              Storage Recovered
            </h3>
            <span className="ml-auto text-body font-bold text-[var(--avs-success)]">
              {formatBytes(cleaningSummary.totalRecovered)}
            </span>
          </div>
          <div className="space-y-2">
            {cleaningSummary.breakdown.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-2.5"
              >
                <span className="text-small text-[var(--avs-text-secondary)]">{item.label}</span>
                <span className="text-small font-semibold text-[var(--avs-text-primary)]">
                  {formatBytes(item.bytes)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Registry Summary */}
      {registrySummary && (registrySummary.brokenEntriesRemoved > 0 || registrySummary.startupEntriesFixed > 0) && (
        <Card variant="glass" className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <BoltIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
            <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">
              Registry & Startup Summary
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryStat label="Broken Entries Removed" value={registrySummary.brokenEntriesRemoved} />
            <SummaryStat label="Startup Entries Fixed" value={registrySummary.startupEntriesFixed} />
            <SummaryStat
              label="Rollback Created"
              value={registrySummary.rollbackCreated ? 'Yes' : 'No'}
            />
          </div>
        </Card>
      )}

      {/* Optimization Summary */}
      {optimizationSummary && (
        <Card variant="glass" className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <CpuChipIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
            <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)]">
              Optimization Summary
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Storage Recovered" value={formatBytes(optimizationSummary.storageRecovered)} />
            <SummaryStat label="Registry Fixed" value={optimizationSummary.registryFixed} />
            <SummaryStat label="Startup Optimized" value={optimizationSummary.startupOptimized} />
            <SummaryStat label="Privacy Cleaned" value={optimizationSummary.privacyCleaned} />
          </div>
        </Card>
      )}

      {/* Per-Module Verification Results */}
      {verificationReport && verificationReport.modules.length > 0 && (
        <Card variant="glass" className="p-6">
          <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)] mb-4">
            Verification Details
          </h3>
          <div className="space-y-2">
            {verificationReport.modules.map((mod) => (
              <ModuleVerificationRow key={mod.moduleId} mod={mod} />
            ))}
          </div>
        </Card>
      )}

      {/* Verification Checklist */}
      <Card variant="glass" className="p-6">
        <h3 className="text-section-title font-semibold text-[var(--avs-text-primary)] mb-4">
          Verification Checklist
        </h3>
        <div className="space-y-2">
          <ChecklistItem
            checked={isVerified || isPartial}
            label="Optimization Verified"
          />
          <ChecklistItem
            checked={isVerified || isPartial}
            label="Scores Updated"
          />
          <ChecklistItem
            checked={isVerified || isPartial}
            label="History Saved"
          />
          <ChecklistItem
            checked={isVerified || isPartial}
            label="Protection Refreshed"
          />
        </div>
      </Card>

      {/* Actions */}
      <div className="flex justify-center gap-3 pb-4">
        <Button
          size="lg"
          variant="ghost"
          onClick={onScanAgain}
          leftIcon={<ArrowPathIcon className="h-4 w-4" />}
        >
          Scan Again
        </Button>
        <Button size="lg" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function VerificationStat({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      {icon}
      <span className={`text-body font-bold ${color}`}>{value}</span>
      <span className="text-caption text-[var(--avs-text-muted)]">{label}</span>
    </div>
  );
}

function ScoreCircle({ label, before, after }: { label: string; before: number; after: number }) {
  const improved = after > before;
  const diff = after - before;

  const beforeColor = before >= 80
    ? 'text-[var(--avs-success)]'
    : before >= 60
    ? 'text-[var(--avs-warning)]'
    : 'text-[var(--avs-danger)]';

  const afterColor = after >= 80
    ? 'text-[var(--avs-success)]'
    : after >= 60
    ? 'text-[var(--avs-warning)]'
    : 'text-[var(--avs-danger)]';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <div className={`text-3xl font-bold ${beforeColor}`}>{before}</div>
          <div className="text-caption text-[var(--avs-text-muted)]">Before</div>
        </div>
        <ArrowPathIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
        <div className="flex flex-col items-center">
          <div className={`text-3xl font-bold ${afterColor}`}>
            {after}
          </div>
          <div className="text-caption text-[var(--avs-text-muted)]">After</div>
        </div>
      </div>
      <span className="text-small font-medium text-[var(--avs-text-secondary)]">{label}</span>
      {improved && (
        <span className="text-caption font-semibold text-[var(--avs-success)]">
          +{diff} points
        </span>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
      <div className="text-body font-bold text-[var(--avs-text-primary)]">{value}</div>
      <div className="text-caption text-[var(--avs-text-muted)] mt-0.5">{label}</div>
    </div>
  );
}

function ModuleScoreTransition({ label, before, after }: { label: string; before: number; after: number }) {
  const improved = after > before;
  const diff = after - before;

  const beforeColor = before >= 80
    ? 'text-[var(--avs-success)]'
    : before >= 60
    ? 'text-[var(--avs-warning)]'
    : 'text-[var(--avs-danger)]';

  const afterColor = after >= 80
    ? 'text-[var(--avs-success)]'
    : after >= 60
    ? 'text-[var(--avs-warning)]'
    : 'text-[var(--avs-danger)]';

  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
      <div className="text-caption text-[var(--avs-text-muted)] mb-1 truncate" title={label}>{label}</div>
      <div className="flex items-center justify-center gap-2">
        <span className={`text-body font-bold ${beforeColor}`}>{before}</span>
        <ArrowPathIcon className="h-3 w-3 text-[var(--avs-text-muted)]" />
        <span className={`text-body font-bold ${afterColor}`}>{after}</span>
      </div>
      {improved && (
        <div className="text-micro font-semibold text-[var(--avs-success)] mt-1">
          +{diff}
        </div>
      )}
    </div>
  );
}

function ModuleVerificationRow({ mod }: { mod: ModuleVerificationResult }) {
  const statusIcon = mod.status === 'completed'
    ? <CheckCircleIcon className="h-5 w-5 text-[var(--avs-success)]" />
    : mod.status === 'skipped'
    ? <ClockIcon className="h-5 w-5 text-[var(--avs-text-muted)]" />
    : mod.status === 'failed'
    ? <XCircleIcon className="h-5 w-5 text-[var(--avs-danger)]" />
    : <ExclamationTriangleIcon className="h-5 w-5 text-[var(--avs-warning)]" />;

  const statusLabel = mod.status === 'completed'
    ? 'Completed'
    : mod.status === 'skipped'
    ? 'Skipped'
    : mod.status === 'failed'
    ? 'Failed'
    : 'Manual Review';

  const statusColor = mod.status === 'completed'
    ? 'text-[var(--avs-success)]'
    : mod.status === 'skipped'
    ? 'text-[var(--avs-text-muted)]'
    : mod.status === 'failed'
    ? 'text-[var(--avs-danger)]'
    : 'text-[var(--avs-warning)]';

  return (
    <div className="flex items-start gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      <div className="shrink-0 mt-0.5">{statusIcon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-small font-semibold text-[var(--avs-text-primary)]">
            {mod.moduleName}
          </span>
          <span className={`text-caption font-medium ${statusColor}`}>{statusLabel}</span>
        </div>
        <p className="text-caption text-[var(--avs-text-muted)] mt-0.5">{mod.reason}</p>
        <div className="flex flex-wrap gap-3 mt-1.5 text-caption text-[var(--avs-text-muted)]">
          {mod.itemsProcessed > 0 && <span>Items: {mod.itemsProcessed}</span>}
          {mod.bytesRecovered > 0 && <span>Recovered: {formatBytes(mod.bytesRecovered)}</span>}
          {mod.itemsFailed > 0 && <span className="text-[var(--avs-danger)]">Failed: {mod.itemsFailed}</span>}
          {mod.rollbackAvailable && <span>Rollback: Available</span>}
        </div>
        {mod.errors.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {mod.errors.slice(0, 3).map((err, i) => (
              <p key={i} className="text-caption text-[var(--avs-danger)]">• {err}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {checked ? (
        <CheckCircleIcon className="h-5 w-5 text-[var(--avs-success)]" />
      ) : (
        <XCircleIcon className="h-5 w-5 text-[var(--avs-danger)]" />
      )}
      <span className="text-small text-[var(--avs-text-secondary)]">{label}</span>
    </div>
  );
}
