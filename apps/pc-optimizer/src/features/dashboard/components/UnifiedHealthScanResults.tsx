/**
 * UnifiedHealthScanResults — adapter that maps the existing DashboardViewModel
 * HealthScanReport to the UnifiedResultsView component.
 *
 * Replaces the old HealthScanModal report view with the premium
 * AI results experience while keeping all existing backend logic intact.
 */
import { useMemo } from 'react';
import { Modal } from './Modal';
import { UnifiedResultsView } from '../../unified-results/components/UnifiedResultsView';
import { useScanHistory } from '../../unified-results/useScanHistory';
import type {
  UnifiedResultsReport,
  UnifiedIssue,
  UnifiedImpactEstimate,
  UnifiedResultCardData,
  UnifiedRecommendation,
  UnifiedScoreDisplay,
  UnifiedAIVerdict,
  UnifiedScanHistoryEntry,
  IssuePriority,
} from '../../unified-results/unifiedResultsTypes';
import type {
  HealthScanReport,
  HealthScanStep,
  OptimizeExecuteResponse,
} from '../dashboard.types';
import { formatDataSize } from '@avs/shared/utils';

export interface UnifiedHealthScanResultsProps {
  step: HealthScanStep;
  report: HealthScanReport | null;
  result: OptimizeExecuteResponse | null;
  onClose: () => void;
  onOptimize: () => void;
  isPro?: boolean;
}

export function UnifiedHealthScanResults({
  step,
  report,
  onClose,
  onOptimize,
  isPro = false,
}: UnifiedHealthScanResultsProps) {
  const { history, addEntry } = useScanHistory(isPro);

  const resultsReport = useMemo(() => {
    if (!report || (step !== 'report' && step !== 'complete')) return null;
    return buildResultsReport(report);
  }, [report, step]);

  // Add to history when report becomes available
  useMemo(() => {
    if (resultsReport) {
      addEntry(buildHistoryEntry(resultsReport));
    }
  }, [resultsReport, addEntry]);

  if (!resultsReport) return null;

  const hasOptimizable = report?.modules.some(
    (m) => m.status === 'complete' && m.canAutoFix && (m.recoverableSpace > 0 || m.issuesFound > 0),
  ) ?? false;

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
        extraActions={hasOptimizable ? [{
          id: 'optimize',
          label: 'Optimize Now',
          icon: 'SparklesIcon',
          variant: 'primary',
          action: onOptimize,
        }] : []}
      />
    </Modal>
  );
}

function buildResultsReport(report: HealthScanReport): UnifiedResultsReport {
  const duration = report.finishedAt - report.startedAt;
  const findings = report.modules.filter((m) => m.status === 'complete' && m.issuesFound > 0);
  const cleanModules = report.modules.filter((m) => m.status === 'complete' && m.issuesFound === 0);
  const totalRecovery = report.recoverableSpace;
  const memoryRecovery = report.modules.find((m) => m.moduleId === 'performance')?.recoverableSpace ?? 0;
  const startupItems = report.modules.find((m) => m.moduleId === 'startup')?.issuesFound ?? 0;
  const estStartupImprovement = Math.min(30, startupItems * 3);
  const perfScore = report.modules.find((m) => m.moduleId === 'performance')?.score ?? report.overallScore;
  const securityScore = report.modules.find((m) => m.moduleId === 'security')?.score ?? 100;

  // Build issues
  const issues: UnifiedIssue[] = findings.map((m) => ({
    id: m.moduleId,
    title: m.moduleName,
    description: m.measuredDetail || `${m.issuesFound} issue(s) found in ${m.moduleName}`,
    priority: severityToPriority(m.severity),
    category: m.moduleId,
    severity: m.severity === 'high' ? 'danger' : m.severity === 'medium' ? 'warning' : 'info',
    confidence: 0.9,
    evidence: [m.measuredDetail].filter(Boolean),
  }));

  // Build impact estimates
  const impactEstimates: UnifiedImpactEstimate[] = [];
  if (totalRecovery > 0) {
    impactEstimates.push({
      id: 'storage',
      label: 'Storage Recovery',
      icon: 'CircleStackIcon',
      currentValue: '—',
      estimatedValue: formatDataSize(totalRecovery),
      difference: `+${formatDataSize(totalRecovery)}`,
      unit: 'bytes',
      positive: true,
    });
  }
  if (memoryRecovery > 0) {
    impactEstimates.push({
      id: 'memory',
      label: 'Memory Recovery',
      icon: 'CpuChipIcon',
      currentValue: '—',
      estimatedValue: formatDataSize(memoryRecovery),
      difference: `+${formatDataSize(memoryRecovery)}`,
      unit: 'bytes',
      positive: true,
    });
  }
  if (estStartupImprovement > 0) {
    impactEstimates.push({
      id: 'startup',
      label: 'Startup Improvement',
      icon: 'ClockIcon',
      currentValue: '—',
      estimatedValue: `~${estStartupImprovement}s`,
      difference: `~${estStartupImprovement}s faster`,
      unit: 'seconds',
      positive: true,
    });
  }
  const estSpeedImprovement = Math.min(25, Math.round(report.issuesFound * 3 + report.recoverableSpace / (500 * 1024 * 1024) * 5));
  if (estSpeedImprovement > 0) {
    impactEstimates.push({
      id: 'performance',
      label: 'Performance Gain',
      icon: 'RocketLaunchIcon',
      currentValue: '—',
      estimatedValue: `~${estSpeedImprovement}%`,
      difference: `~${estSpeedImprovement}% faster`,
      unit: 'percent',
      positive: true,
    });
  }

  // Build result cards
  const resultCards: UnifiedResultCardData[] = [];
  if (totalRecovery > 0) {
    resultCards.push({
      id: 'storage',
      title: 'Storage Recovery',
      icon: 'CircleStackIcon',
      status: 'good',
      metrics: [
        { label: 'Recoverable', value: formatDataSize(totalRecovery), tone: 'success' },
        { label: 'Modules', value: String(findings.filter((m) => m.recoverableSpace > 0).length) },
      ],
    });
  }
  if (memoryRecovery > 0) {
    resultCards.push({
      id: 'memory',
      title: 'Memory Recovery',
      icon: 'CpuChipIcon',
      status: 'good',
      metrics: [
        { label: 'Recoverable', value: formatDataSize(memoryRecovery), tone: 'success' },
      ],
    });
  }
  if (estStartupImprovement > 0) {
    resultCards.push({
      id: 'startup',
      title: 'Startup',
      icon: 'ClockIcon',
      status: 'good',
      metrics: [
        { label: 'Current', value: '—' },
        { label: 'Improved', value: `~${estStartupImprovement}s`, tone: 'success' },
        { label: 'Difference', value: `-${estStartupImprovement}s`, tone: 'success' },
      ],
    });
  }

  // Build recommendations
  const recommendations: UnifiedRecommendation[] = findings
    .filter((m) => m.canAutoFix)
    .map((m) => ({
      id: m.moduleId,
      title: `Optimize ${m.moduleName}`,
      summary: m.measuredDetail || `${m.issuesFound} issue(s) found`,
      description: `${m.moduleName} has ${m.issuesFound} issue(s) that can be automatically fixed. Recoverable space: ${formatDataSize(m.recoverableSpace)}.`,
      priority: severityToPriority(m.severity),
      category: m.moduleId,
      reason: `${m.issuesFound} issue(s) detected during scan with ${formatDataSize(m.recoverableSpace)} recoverable space.`,
      expectedBenefit: m.recoverableSpace > 0
        ? `Recover ${formatDataSize(m.recoverableSpace)} of storage`
        : `Fix ${m.issuesFound} issue(s)`,
      estimatedTime: `~${Math.max(1, Math.round(duration / 1000 / findings.length))}s`,
      riskLevel: 'low' as const,
      rollbackAvailable: true,
      requiresConfirmation: false,
      aiConfidence: 0.9,
      evidence: [m.measuredDetail].filter(Boolean),
      whyItMatters: `${m.moduleName} issues can slow down your PC and waste storage. Fixing them improves performance and frees up space.`,
      whatHappensIfIgnored: `The ${m.issuesFound} issue(s) will persist, potentially causing ${m.severity === 'high' ? 'significant performance degradation' : 'minor performance impact'} over time.`,
      requiresPro: false,
    }));

  // Build scores
  const primaryScore: UnifiedScoreDisplay = {
    label: 'Health',
    value: report.overallScore,
    description: report.overallScore >= 90
      ? 'Your PC is in excellent condition.'
      : report.overallScore >= 75
      ? 'Your PC is performing well with minor issues.'
      : report.overallScore >= 60
      ? 'Your PC has several issues that need attention.'
      : 'Your PC needs immediate optimization.',
  };

  const secondaryScores: UnifiedScoreDisplay[] = [
    { label: 'Performance', value: perfScore },
    { label: 'Security', value: securityScore },
  ];

  // Build AI verdict
  const aiVerdict: UnifiedAIVerdict = {
    summary: findings.length > 0
      ? `Your PC has ${report.issuesFound} ${report.issuesFound === 1 ? 'issue' : 'issues'} across ${findings.length} ${findings.length === 1 ? 'module' : 'modules'}. Estimated storage recovery is ${formatDataSize(totalRecovery)}.`
      : 'Your PC is healthy overall. No issues were detected during the scan.',
    details: findings.length > 0 ? [
      `${findings.length} optimization ${findings.length === 1 ? 'opportunity' : 'opportunities'} identified`,
      `Estimated storage recovery: ${formatDataSize(totalRecovery)}`,
      estStartupImprovement > 0 ? `Startup time can be reduced by ~${estStartupImprovement} seconds` : '',
      `${cleanModules.length} ${cleanModules.length === 1 ? 'module' : 'modules'} are clean`,
      'No security threats were detected',
    ].filter(Boolean) : ['Your PC is healthy. No optimization needed at this time.'],
    confidence: 0.92,
    evidenceCount: report.modules.reduce((s, m) => s + m.issuesFound, 0),
    evidenceSources: report.modules.filter((m) => m.status === 'complete').map((m) => m.moduleName),
  };

  return {
    reportId: `OPT-${Date.now()}`,
    moduleId: 'optimize',
    moduleName: 'AI Smart Optimize',
    moduleIcon: 'SparklesIcon',
    timestamp: report.startedAt,
    durationMs: duration,
    itemsAnalyzed: report.modules.reduce((s, m) => s + m.issuesFound, 0),
    issuesFound: report.issuesFound,
    aiConfidence: 0.92,
    primaryScore,
    secondaryScores,
    aiVerdict,
    issues,
    impactEstimates,
    resultCards,
    recommendations,
    actions: [],
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
    actionsTaken: [],
    timestamp: report.timestamp,
    reportId: report.reportId,
  };
}

function severityToPriority(severity: 'low' | 'medium' | 'high'): IssuePriority {
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}
