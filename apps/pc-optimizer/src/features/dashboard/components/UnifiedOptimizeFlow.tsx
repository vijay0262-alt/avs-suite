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
import { Card } from '@avs/ui';
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
  IssuePriority,
} from '../../unified-results/unifiedResultsTypes';
import type { DashboardViewModel } from '../DashboardViewModel';
import type {
  HealthScanReport,
  HealthScanModuleResult,
  ScanLiveStats,
  OptimizationExecutionProgress,
} from '../dashboard.types';
import type { OptimizationSummary } from '../OptimizationSummary.types';
import {
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

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

  // ── Determine unified step ───────────────────────────────────────
  const step = useMemo<UnifiedScanStep>(() => {
    switch (s.healthScanStep) {
      case 'preparing':
      case 'scanning':
        return s.healthScanStep;
      case 'optimizing':
        return 'scanning'; // reuse scanning UI for fix progress
      case 'updating_dashboard':
        return 'complete'; // brief transition
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

  // Scanning phase
  if (step === 'preparing' || step === 'scanning') {
    const isFixing = s.healthScanStep === 'optimizing';
    const fixConfig = isFixing ? buildFixConfig(s.healthScanExecution) : OPTIMIZE_SCAN_CONFIG;
    const fixLiveStatus = isFixing
      ? buildFixLiveStatus(s.healthScanExecution)
      : liveStatus;
    const fixCounters = isFixing
      ? buildFixCounters(s.healthScanExecution)
      : counters;
    const fixTreeNodes = isFixing
      ? mapModulesToFixTreeNodes(s.healthScanModules)
      : treeNodes;

    return (
      <UnifiedScanView
        config={fixConfig}
        step={isFixing ? 'scanning' : step}
        liveStatus={fixLiveStatus}
        counters={fixCounters}
        treeNodes={fixTreeNodes}
        currentPhaseIndex={0}
        startTime={s.scanStartTime ?? Date.now()}
        error={s.healthScanError}
        report={null}
        actions={[]}
        onPause={() => {}}
        onResume={() => {}}
        onCancel={() => {
          if (isFixing) {
            vm.cancelHealthScanOptimizations();
          } else {
            vm.cancelHealthScan();
          }
        }}
        onClose={onClose}
      />
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
      <UnifiedResultsView
        report={resultsReport}
        history={history}
        isPro={isPro}
        onClose={onClose}
        extraActions={[optimizeAction, rescanAction]}
      />
    );
  }

  // Updating dashboard — brief verification
  if (s.healthScanStep === 'updating_dashboard') {
    return (
      <Card variant="glass" data-testid="unified-optimize-verifying">
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="relative">
            <div className="rounded-full bg-brand-primary/10 p-4">
              <ArrowPathIcon className="h-8 w-8 text-brand-primary animate-spin" />
            </div>
          </div>
          <div>
            <h3 className="text-section-title font-semibold text-text-primary">Verifying Optimization</h3>
            <p className="mt-1 text-small text-text-secondary">Confirming all changes were applied successfully...</p>
          </div>
        </div>
      </Card>
    );
  }

  // Complete — success screen
  if (s.healthScanStep === 'complete' && resultsReport) {
    return (
      <UnifiedResultsView
        report={resultsReport}
        history={history}
        isPro={isPro}
        onClose={onClose}
        extraActions={[
          {
            id: 'rescan',
            label: 'Scan Again',
            icon: 'ArrowPathIcon',
            variant: 'ghost',
            action: () => {
              vm.closeHealthScan();
              vm.startHealthScan();
            },
          },
        ]}
      />
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
  }));
}

function mapModulesToFixTreeNodes(modules: HealthScanModuleResult[]): UnifiedScanTreeNode[] {
  return modules.map((m) => ({
    id: m.moduleId,
    label: m.moduleName,
    status: (m.actual ? (m.actual.success ? 'complete' : 'error') : 'pending') as UnifiedScanTreeNode['status'],
    itemsScanned: m.actual?.filesDeleted ?? m.actual?.itemsRemoved ?? m.actual?.issuesFixed ?? 0,
    issuesFound: m.actual?.errors.length ?? 0,
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
    details: report.modules
      .filter((m) => m.issuesFound > 0)
      .map((m) => `${m.moduleName}: ${m.issuesFound} issues found (${m.severity} severity)`),
    confidence: 95,
    evidenceCount: report.modules.length,
    evidenceSources: report.modules.map((m) => m.moduleName),
  };

  const issues: UnifiedIssue[] = report.modules
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

  const recommendations: UnifiedRecommendation[] = report.modules
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

  return {
    reportId: `opt-${Date.now()}`,
    moduleId: 'optimize',
    moduleName: 'AI Smart Optimize',
    moduleIcon: 'SparklesIcon',
    timestamp: startTime ?? Date.now(),
    durationMs: report.finishedAt - report.startedAt,
    itemsAnalyzed: report.modules.reduce((s, m) => s + m.issuesFound, 0),
    issuesFound: report.issuesFound,
    aiConfidence: 95,
    primaryScore,
    secondaryScores,
    aiVerdict,
    issues,
    impactEstimates,
    resultCards,
    recommendations,
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

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}
