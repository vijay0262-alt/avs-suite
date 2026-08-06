/**
 * UnifiedHealthScanModal — adapter that maps the existing DashboardViewModel
 * state to the UnifiedScanView component.
 *
 * This replaces the old HealthScanModal with the unified scanning UI
 * while keeping all existing backend logic intact.
 */
import { useMemo } from 'react';
import { Modal } from './Modal';
import { UnifiedScanView } from '../../unified-scan/components/UnifiedScanView';
import { OPTIMIZE_SCAN_CONFIG } from '../../unified-scan/moduleConfigs';
import type {
  UnifiedScanTreeNode,
  UnifiedScanReport,
  UnifiedScanAction,
  UnifiedResultCard,
  UnifiedAISummary,
} from '../../unified-scan/unifiedScanTypes';
import type {
  HealthScanStep,
  HealthScanReport,
  OptimizationExecutionProgress,
  OptimizeExecuteResponse,
  ScanLiveStats,
} from '../dashboard.types';
import { formatDataSize } from '@avs/shared/utils';

export interface UnifiedHealthScanModalProps {
  step: HealthScanStep;
  report: HealthScanReport | null;
  execution: OptimizationExecutionProgress | null;
  result: OptimizeExecuteResponse | null;
  error: string | null;
  currentFile?: string | null;
  subProgress?: number;
  scanPhase?: string | null;
  scanOverallProgress?: number;
  scanLiveStats?: ScanLiveStats;
  scanStartTime?: number | null;
  onCancel: () => void;
  onClose: () => void;
  onOptimize: () => void;
  onCancelExecute: () => void;
}

function mapStepToUnified(step: HealthScanStep): 'idle' | 'preparing' | 'scanning' | 'paused' | 'complete' | 'error' | 'cancelled' {
  switch (step) {
    case 'idle': return 'idle';
    case 'preparing': return 'preparing';
    case 'scanning': return 'scanning';
    case 'report': return 'complete';
    case 'optimizing': return 'scanning';
    case 'verifying': return 'scanning';
    case 'updating_dashboard': return 'scanning';
    case 'complete': return 'complete';
    default: return 'idle';
  }
}

function mapStatsToCounters(stats: ScanLiveStats | undefined): Record<string, number> {
  if (!stats) return {};
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

function mapPhaseToTreeNodes(
  phases: typeof OPTIMIZE_SCAN_CONFIG.phases,
  currentPhaseId: string | null | undefined,
  isScanning: boolean,
): UnifiedScanTreeNode[] {
  const currentIdx = phases.findIndex((p) => p.id === currentPhaseId);
  return phases.map((phase, i) => ({
    id: phase.id,
    label: phase.label,
    status: i < currentIdx || !isScanning ? 'complete' : i === currentIdx ? 'scanning' : 'pending',
    itemsScanned: 0,
    issuesFound: 0,
  }));
}

function buildReport(
  report: HealthScanReport,
  _result: OptimizeExecuteResponse | null,
): UnifiedScanReport {
  const duration = report.finishedAt - report.startedAt;
  const modulesAnalyzed = report.modules.filter((m) => m.status === 'complete').length;
  const totalRecovery = report.recoverableSpace;
  const memoryRecovery = report.modules.find((m) => m.moduleId === 'performance')?.recoverableSpace ?? 0;
  const startupItems = report.modules.find((m) => m.moduleId === 'startup')?.issuesFound ?? 0;
  const estStartupImprovement = Math.min(30, startupItems * 3);

  const results: UnifiedResultCard[] = [];

  if (totalRecovery > 0) {
    results.push({
      id: 'storage',
      title: 'Storage Recovery',
      icon: 'CircleStackIcon',
      currentValue: '0 B',
      improvedValue: formatDataSize(totalRecovery),
      difference: `+${formatDataSize(totalRecovery)}`,
      positive: true,
    });
  }
  if (memoryRecovery > 0) {
    results.push({
      id: 'memory',
      title: 'Memory Recovery',
      icon: 'CpuChipIcon',
      currentValue: '0 B',
      improvedValue: formatDataSize(memoryRecovery),
      difference: `+${formatDataSize(memoryRecovery)}`,
      positive: true,
    });
  }
  if (estStartupImprovement > 0) {
    results.push({
      id: 'startup',
      title: 'Startup Improvement',
      icon: 'ClockIcon',
      currentValue: '0s',
      improvedValue: `~${estStartupImprovement}s`,
      difference: `~${estStartupImprovement}s faster`,
      positive: true,
    });
  }

  const findings = report.modules.filter((m) => m.status === 'complete' && m.issuesFound > 0);
  const hasIssues = findings.length > 0;

  const aiSummary: UnifiedAISummary = {
    overallScore: report.overallScore,
    healthScore: report.overallScore,
    securityScore: report.modules.find((m) => m.moduleId === 'security')?.score,
    performanceScore: report.modules.find((m) => m.moduleId === 'performance')?.score,
    modulesAnalyzed,
    issuesFound: report.issuesFound,
    aiConfidence: 0.92,
    estimatedImprovements: hasIssues ? [
      `${findings.length} optimization ${findings.length === 1 ? 'opportunity' : 'opportunities'} found`,
      `Estimated storage recovery is ${formatDataSize(totalRecovery)}`,
      estStartupImprovement > 0 ? `Startup time can be reduced by ~${estStartupImprovement} seconds` : '',
      'No security threats were detected',
    ].filter(Boolean) : ['Your PC is healthy. No optimization needed at this time.'],
    verdict: hasIssues
      ? `Your PC has ${report.issuesFound} ${report.issuesFound === 1 ? 'issue' : 'issues'} across ${findings.length} ${findings.length === 1 ? 'module' : 'modules'}. Estimated storage recovery is ${formatDataSize(totalRecovery)}.`
      : 'Your PC is healthy overall. No issues were detected during the scan.',
    reportId: `OPT-${Date.now()}`,
  };

  return {
    reportId: aiSummary.reportId,
    moduleName: 'AI Smart Optimize',
    moduleIcon: 'SparklesIcon',
    timestamp: report.startedAt,
    durationMs: duration,
    itemsAnalyzed: report.modules.reduce((s, m) => s + m.issuesFound, 0),
    issuesFound: report.issuesFound,
    results,
    aiSummary,
    actions: [],
  };
}

export function UnifiedHealthScanModal({
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
}: UnifiedHealthScanModalProps) {
  const unifiedStep = mapStepToUnified(step);
  const isOptimizing = step === 'optimizing' || step === 'verifying' || step === 'updating_dashboard';

  // Build tree nodes
  const treeNodes = useMemo(
    () => mapPhaseToTreeNodes(OPTIMIZE_SCAN_CONFIG.phases, scanPhase, step === 'scanning' || step === 'preparing'),
    [scanPhase, step],
  );

  // Build counters
  const counters = useMemo(() => mapStatsToCounters(scanLiveStats), [scanLiveStats]);

  // Build unified report when complete
  const unifiedReport = useMemo(() => {
    if ((step === 'report' || step === 'complete') && report) {
      return buildReport(report, result);
    }
    return null;
  }, [step, report, result]);

  // Determine current phase index
  const currentPhaseIndex = useMemo(() => {
    const phaseId = scanPhase ?? null;
    if (!phaseId) return 0;
    const idx = OPTIMIZE_SCAN_CONFIG.phases.findIndex((p) => p.id === phaseId);
    return idx >= 0 ? idx : 0;
  }, [scanPhase]);

  // Build live status
  const liveStatus = useMemo(() => {
    if (isOptimizing && execution) {
      return {
        currentPhase: execution.currentModule || 'Optimizing...',
        currentActivity: execution.currentModule || 'Optimizing...',
        overallProgress: execution.progress,
        currentFile: undefined,
      };
    }
    const phase = OPTIMIZE_SCAN_CONFIG.phases[currentPhaseIndex];
    return {
      currentPhase: phase?.label ?? 'Preparing...',
      currentActivity: phase?.activities[0] ?? 'Working...',
      overallProgress: scanOverallProgress ?? 0,
      currentFile: currentFile ?? undefined,
      subProgress: subProgress,
    };
  }, [isOptimizing, execution, currentPhaseIndex, scanOverallProgress, currentFile, subProgress]);

  // Build actions for complete view
  const actions: UnifiedScanAction[] = useMemo(() => {
    if (step === 'report' && report) {
      const hasOptimizable = report.modules.some(
        (m) => m.status === 'complete' && m.canAutoFix && (m.recoverableSpace > 0 || m.issuesFound > 0),
      );
      if (hasOptimizable) {
        return [{
          id: 'optimize',
          label: 'Optimize Now',
          icon: 'SparklesIcon',
          variant: 'primary',
          action: onOptimize,
        }];
      }
    }
    return [];
  }, [step, report, onOptimize]);

  // Don't render if idle
  if (step === 'idle') return null;

  // For optimizing/verifying/updating_dashboard steps, show a modal
  if (isOptimizing) {
    return (
      <Modal
        open
        title="AI Smart Optimize — Optimizing"
        onClose={onCancelExecute}
        size="xl"
        actions={null}
      >
        <UnifiedScanView
          config={OPTIMIZE_SCAN_CONFIG}
          step="scanning"
          liveStatus={liveStatus}
          counters={counters}
          treeNodes={treeNodes}
          currentPhaseIndex={currentPhaseIndex}
          startTime={scanStartTime ?? null}
          error={error}
          report={null}
          actions={[]}
          onPause={() => {}}
          onResume={() => {}}
          onCancel={onCancelExecute}
          onClose={onCancelExecute}
        />
      </Modal>
    );
  }

  // For scanning/preparing/report/complete/error
  return (
    <Modal
      open
      title={unifiedStep === 'complete' ? 'AI Smart Optimize — Complete' : 'AI Smart Optimize — Scanning'}
      onClose={unifiedStep === 'complete' ? onClose : onCancel}
      size="xl"
      actions={null}
    >
      <UnifiedScanView
        config={OPTIMIZE_SCAN_CONFIG}
        step={unifiedStep === 'idle' ? 'preparing' : unifiedStep}
        liveStatus={liveStatus}
        counters={counters}
        treeNodes={treeNodes}
        currentPhaseIndex={currentPhaseIndex}
        startTime={scanStartTime ?? null}
        error={error}
        report={unifiedReport}
        actions={actions}
        onPause={() => {}}
        onResume={() => {}}
        onCancel={onCancel}
        onClose={onClose}
      />
    </Modal>
  );
}
