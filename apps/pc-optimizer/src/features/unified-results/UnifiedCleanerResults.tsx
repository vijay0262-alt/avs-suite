/**
 * UnifiedCleanerResults — generic adapter for individual cleaner modules.
 *
 * Maps simple scan result data (issues found, categories, recoverable space)
 * to the UnifiedResultsView component. Used by Registry, Privacy, Junk,
 * Duplicate Finder, and other cleaner modules.
 */
import { useMemo } from 'react';
import { UnifiedResultsView } from '../unified-results/components/UnifiedResultsView';
import { useScanHistory } from '../unified-results/useScanHistory';
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
} from '../unified-results/unifiedResultsTypes';

export interface CleanerResultData {
  moduleId: string;
  moduleName: string;
  moduleIcon: string;
  timestamp: number;
  durationMs: number;
  itemsAnalyzed: number;
  issuesFound: number;
  recoverableSpace?: number;
  categoryBreakdown?: Record<string, number>;
  categoryLabels?: Record<string, string>;
  issues?: Array<{
    id: string;
    description: string;
    category: string;
    severity: 'low' | 'medium' | 'high';
    location?: string;
  }>;
}

export interface UnifiedCleanerResultsProps {
  data: CleanerResultData;
  isPro?: boolean;
  onClose: () => void;
  onFix?: (issueIds: string[]) => void;
  onRescan?: () => void;
}

export function UnifiedCleanerResults({
  data,
  isPro = false,
  onClose,
  onFix,
  onRescan,
}: UnifiedCleanerResultsProps) {
  const { history, addEntry } = useScanHistory(isPro);

  const resultsReport = useMemo(() => buildCleanerReport(data), [data]);

  useMemo(() => {
    if (resultsReport) {
      addEntry(buildHistoryEntry(resultsReport));
    }
  }, [resultsReport, addEntry]);

  return (
    <UnifiedResultsView
      report={resultsReport}
      history={history}
      isPro={isPro}
      onClose={onClose}
      onApplySelected={onFix}
      onApplyAllSafe={onFix}
      extraActions={onRescan ? [{
        id: 'rescan',
        label: 'Scan Again',
        icon: 'ArrowPathIcon',
        variant: 'ghost',
        action: onRescan,
      }] : []}
    />
  );
}

function buildCleanerReport(data: CleanerResultData): UnifiedResultsReport {
  const hasIssues = data.issuesFound > 0;
  const score = hasIssues ? Math.max(30, 100 - data.issuesFound * 5) : 100;

  // Build issues
  const issues: UnifiedIssue[] = (data.issues ?? []).map((issue) => ({
    id: issue.id,
    title: issue.description,
    description: `${data.categoryLabels?.[issue.category] ?? issue.category}`,
    priority: severityToPriority(issue.severity),
    category: issue.category,
    severity: issue.severity === 'high' ? 'danger' : issue.severity === 'medium' ? 'warning' : 'info',
    location: issue.location,
    confidence: 0.85,
    evidence: [`Category: ${data.categoryLabels?.[issue.category] ?? issue.category}`],
  }));

  // Build impact estimates
  const impactEstimates: UnifiedImpactEstimate[] = [];
  if (data.recoverableSpace && data.recoverableSpace > 0) {
    impactEstimates.push({
      id: 'storage',
      label: 'Storage Recovery',
      icon: 'CircleStackIcon',
      currentValue: '—',
      estimatedValue: formatBytes(data.recoverableSpace),
      difference: `+${formatBytes(data.recoverableSpace)}`,
      unit: 'bytes',
      positive: true,
    });
  }
  if (data.issuesFound > 0) {
    impactEstimates.push({
      id: 'issues',
      label: 'Issues Found',
      icon: 'ServerStackIcon',
      currentValue: '0',
      estimatedValue: String(data.issuesFound),
      difference: `${data.issuesFound} to fix`,
      unit: 'count',
      positive: false,
    });
  }

  // Build result cards
  const resultCards: UnifiedResultCardData[] = [];
  if (data.recoverableSpace && data.recoverableSpace > 0) {
    resultCards.push({
      id: 'storage',
      title: 'Storage Recovery',
      icon: 'CircleStackIcon',
      status: 'good',
      metrics: [
        { label: 'Recoverable', value: formatBytes(data.recoverableSpace), tone: 'success' },
        { label: 'Remaining', value: formatBytes(data.recoverableSpace), tone: 'success' },
      ],
    });
  }
  if (data.categoryBreakdown && Object.keys(data.categoryBreakdown).length > 0) {
    const topCats = Object.entries(data.categoryBreakdown).slice(0, 3);
    resultCards.push({
      id: 'categories',
      title: 'Issue Categories',
      icon: 'ServerStackIcon',
      status: hasIssues ? 'warning' : 'good',
      metrics: topCats.map(([cat, count]) => ({
        label: data.categoryLabels?.[cat] ?? cat,
        value: String(count),
        tone: count > 10 ? 'danger' : count > 0 ? 'warning' : 'success',
      })),
    });
  }

  // Build recommendations
  const recommendations: UnifiedRecommendation[] = [];
  if (hasIssues) {
    recommendations.push({
      id: 'fix-all',
      title: `Fix ${data.issuesFound} ${data.issuesFound === 1 ? 'issue' : 'issues'}`,
      summary: `Clean all detected ${data.moduleName.toLowerCase()} issues`,
      description: `This will fix all ${data.issuesFound} issue(s) found during the scan. A backup will be created before any changes are made.`,
      priority: data.issuesFound > 20 ? 'high' : 'medium',
      category: data.moduleId,
      reason: `${data.issuesFound} issue(s) detected during scan.`,
      expectedBenefit: data.recoverableSpace
        ? `Recover ${formatBytes(data.recoverableSpace)} of storage`
        : `Fix ${data.issuesFound} issue(s)`,
      estimatedTime: `~${Math.max(1, Math.round(data.issuesFound / 10))}s`,
      riskLevel: 'low',
      rollbackAvailable: true,
      requiresConfirmation: false,
      aiConfidence: 0.88,
      evidence: [`${data.issuesFound} issues found`, `Scan duration: ${Math.round(data.durationMs / 1000)}s`],
      whyItMatters: `${data.moduleName} issues can slow down your PC and cause system instability over time.`,
      whatHappensIfIgnored: 'Issues will persist and may accumulate, potentially causing performance degradation.',
      requiresPro: false,
    });
  }

  // Build scores
  const primaryScore: UnifiedScoreDisplay = {
    label: getScoreLabel(data.moduleId),
    value: score,
    description: score >= 90
      ? 'Your system is clean.'
      : score >= 75
      ? 'Minor issues detected.'
      : score >= 60
      ? 'Several issues need attention.'
      : 'Immediate cleanup recommended.',
  };

  // Build AI verdict
  const aiVerdict: UnifiedAIVerdict = {
    summary: hasIssues
      ? `${data.issuesFound} ${data.issuesFound === 1 ? 'issue' : 'issues'} found in ${data.moduleName}. ${data.recoverableSpace ? `Estimated recovery: ${formatBytes(data.recoverableSpace)}.` : 'Cleanup is recommended.'}`
      : `No issues found in ${data.moduleName}. Your system is clean.`,
    details: hasIssues ? [
      `${data.issuesFound} ${data.issuesFound === 1 ? 'issue' : 'issues'} identified`,
      data.recoverableSpace ? `Recoverable space: ${formatBytes(data.recoverableSpace)}` : '',
      data.categoryBreakdown ? `${Object.keys(data.categoryBreakdown).length} categories affected` : '',
      'Backup will be created before any changes',
    ].filter(Boolean) : ['No issues found', 'Your system is clean', 'No action needed at this time'],
    confidence: 0.88,
    evidenceCount: data.itemsAnalyzed,
    evidenceSources: data.categoryBreakdown ? Object.keys(data.categoryBreakdown).map((c) => data.categoryLabels?.[c] ?? c) : [data.moduleName],
  };

  return {
    reportId: `${data.moduleId.toUpperCase()}-${Date.now()}`,
    moduleId: data.moduleId,
    moduleName: data.moduleName,
    moduleIcon: data.moduleIcon,
    timestamp: data.timestamp,
    durationMs: data.durationMs,
    itemsAnalyzed: data.itemsAnalyzed,
    issuesFound: data.issuesFound,
    aiConfidence: 0.88,
    primaryScore,
    secondaryScores: [],
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

function getScoreLabel(moduleId: string): string {
  const labels: Record<string, string> = {
    registry: 'Registry Health',
    privacy: 'Privacy Score',
    junk: 'Storage Health',
    duplicate: 'Storage Health',
    browser: 'Browser Health',
  };
  return labels[moduleId] ?? 'Health';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
