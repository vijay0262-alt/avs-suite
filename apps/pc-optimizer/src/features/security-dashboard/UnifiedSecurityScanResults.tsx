/**
 * UnifiedSecurityScanResults — adapter that maps the existing
 * SecurityCenterViewModel state to the UnifiedResultsView component.
 *
 * Replaces the custom ScanAISummary with the premium AI results
 * experience while keeping all existing backend logic intact.
 */
import { useMemo } from 'react';
import { UnifiedResultsView } from '../unified-results/components/UnifiedResultsView';
import { useScanHistory } from '../unified-results/useScanHistory';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
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
import type { SecurityCenterViewModel } from './SecurityCenterViewModel';
import type { SecurityAISummary } from './securityScanTypes';
import { formatDuration } from '../unified-results/unifiedResultsTypes';

export interface UnifiedSecurityScanResultsProps {
  vm: SecurityCenterViewModel;
  isPro?: boolean;
}

export function UnifiedSecurityScanResults({ vm, isPro = false }: UnifiedSecurityScanResultsProps) {
  const s = vm.state;
  const { history, addEntry } = useScanHistory(isPro);
  const { guard, dialogElement } = useFeatureGuard();

  const resultsReport = useMemo(() => {
    if (!s.aiSummary) return null;
    return buildSecurityResultsReport(s.aiSummary, s.scanStartTime ?? Date.now(), s.lastScanResult?.threats ?? []);
  }, [s.aiSummary, s.scanStartTime, s.lastScanResult]);

  // Add to history when report becomes available
  useMemo(() => {
    if (resultsReport) {
      addEntry(buildHistoryEntry(resultsReport));
    }
  }, [resultsReport, addEntry]);

  if (!resultsReport) return null;

  return (
    <>
    <UnifiedResultsView
      report={resultsReport}
      history={history}
      isPro={isPro}
      onClose={() => vm.dismissSummary()}
      onReviewDetails={() => vm.setActiveTab('threats')}
      extraActions={[
        {
          id: 'quarantine',
          label: isPro ? 'Quarantine All' : 'Upgrade to Quarantine',
          icon: 'ShieldCheckIcon',
          variant: 'primary',
          action: () => {
            guard('security.quarantine', 'Security Center', () => {
              if (s.lastScanResult && s.lastScanResult.threats.length > 0) {
                const inv = s.investigations.find((i) =>
                  i.threatIds.some((tid) => s.lastScanResult!.threats.some((t) => t.id === tid)),
                );
                if (inv) {
                  vm.createRemediationPlan(inv.id);
                  vm.setActiveTab('remediation');
                }
              }
            }, {
              limitDescription: 'Free users can detect threats but cannot quarantine them.',
              proBenefit: 'Quarantine detected threats, execute remediation plans, and restore files safely.',
            });
          },
        },
        {
          id: 'investigate',
          label: 'Open Investigation',
          icon: 'SparklesIcon',
          variant: 'secondary',
          action: () => vm.setActiveTab('investigation'),
        },
        {
          id: 'rescan',
          label: 'Scan Again',
          icon: 'ArrowPathIcon',
          variant: 'ghost',
          action: () => {
            vm.dismissSummary();
            vm.startScan();
          },
        },
      ]}
    />
    {dialogElement}
    </>
  );
}

function buildSecurityResultsReport(
  summary: SecurityAISummary,
  startTime: number,
  threats: Array<{ id: string; name: string; severity: string; category: string; confidence: number; status: string; affectedAssets: Array<{ path: string }> }>,
): UnifiedResultsReport {
  const duration = summary.scanDuration;

  // Build issues from threats
  const issues: UnifiedIssue[] = threats.map((threat) => ({
    id: threat.id,
    title: threat.name,
    description: `${threat.category} · ${threat.status}`,
    priority: severityToPriority(threat.severity),
    category: threat.category,
    severity: threat.severity === 'critical' ? 'danger' : threat.severity === 'high' ? 'danger' : 'warning',
    location: threat.affectedAssets[0]?.path,
    confidence: threat.confidence,
    evidence: [`Detection source: ${threat.category}`, `Confidence: ${Math.round(threat.confidence * 100)}%`],
  }));

  // Build impact estimates for security
  const impactEstimates: UnifiedImpactEstimate[] = [];
  if (summary.threatsFound > 0) {
    impactEstimates.push({
      id: 'threats',
      label: 'Threats Found',
      icon: 'ShieldCheckIcon',
      currentValue: '0',
      estimatedValue: String(summary.threatsFound),
      difference: `${summary.threatsFound} active`,
      unit: 'count',
      positive: false,
    });
  }
  if (summary.threatsNeutralized > 0) {
    impactEstimates.push({
      id: 'neutralized',
      label: 'Neutralized',
      icon: 'ShieldCheckIcon',
      currentValue: String(summary.threatsFound),
      estimatedValue: String(summary.threatsFound - summary.threatsNeutralized),
      difference: `${summary.threatsNeutralized} resolved`,
      unit: 'count',
      positive: true,
    });
  }
  if (summary.manualReviewRequired > 0) {
    impactEstimates.push({
      id: 'review',
      label: 'Manual Review',
      icon: 'ShieldCheckIcon',
      currentValue: '—',
      estimatedValue: String(summary.manualReviewRequired),
      difference: `${summary.manualReviewRequired} pending`,
      unit: 'count',
      positive: false,
    });
  }

  // Build result cards
  const resultCards: UnifiedResultCardData[] = [
    {
      id: 'security',
      title: 'Security',
      icon: 'ShieldCheckIcon',
      status: summary.securityScore >= 80 ? 'good' : summary.securityScore >= 60 ? 'warning' : 'danger',
      metrics: [
        { label: 'Threats', value: String(summary.threatsFound), tone: summary.threatsFound > 0 ? 'danger' : 'success' },
        { label: 'Risk', value: summary.estimatedRisk, tone: summary.estimatedRisk === 'Low' ? 'success' : summary.estimatedRisk === 'Moderate' ? 'warning' : 'danger' },
        { label: 'Protection', value: summary.securityScore >= 80 ? 'Active' : 'At Risk', tone: summary.securityScore >= 80 ? 'success' : 'danger' },
      ],
    },
    {
      id: 'scan-stats',
      title: 'Scan Statistics',
      icon: 'ShieldCheckIcon',
      status: 'good',
      metrics: [
        { label: 'Items Analyzed', value: summary.itemsScanned.toLocaleString() },
        { label: 'Threats Found', value: summary.threatsFound.toLocaleString() },
        { label: 'Duration', value: formatDuration(summary.scanDuration) },
      ],
    },
  ];

  // Build recommendations from threats
  const recommendations: UnifiedRecommendation[] = threats.map((threat) => ({
    id: threat.id,
    title: `Quarantine ${threat.name}`,
    summary: `${threat.category} detected with ${Math.round(threat.confidence * 100)}% confidence`,
    description: `This threat was detected during the security scan. Quarantining will safely isolate it without deleting system files.`,
    priority: severityToPriority(threat.severity),
    category: 'security',
    reason: `Detected as ${threat.category} with ${Math.round(threat.confidence * 100)}% confidence during ${threat.status} scan.`,
    expectedBenefit: 'Neutralize threat and restore system security',
    estimatedTime: '~5s',
    riskLevel: 'low' as const,
    rollbackAvailable: true,
    requiresConfirmation: true,
    aiConfidence: threat.confidence,
    evidence: [`Category: ${threat.category}`, `Status: ${threat.status}`, `Confidence: ${Math.round(threat.confidence * 100)}%`],
    whyItMatters: 'Active threats can compromise system security, steal data, or cause system instability.',
    whatHappensIfIgnored: 'The threat remains active and may cause further damage or data loss.',
    requiresPro: false,
  }));

  // Build scores
  const primaryScore: UnifiedScoreDisplay = {
    label: 'Security',
    value: summary.securityScore,
    description: summary.securityScore >= 80
      ? 'Your system is well-protected.'
      : summary.securityScore >= 60
      ? 'Your system has some security concerns.'
      : 'Your system is at risk. Immediate action recommended.',
  };

  const secondaryScores: UnifiedScoreDisplay[] = [];

  // Build AI verdict
  const aiVerdict: UnifiedAIVerdict = {
    summary: summary.aiVerdict,
    details: [
      `${summary.threatsFound} ${summary.threatsFound === 1 ? 'threat' : 'threats'} found`,
      `${summary.threatsNeutralized} neutralized`,
      summary.manualReviewRequired > 0 ? `${summary.manualReviewRequired} require manual review` : '',
      `Estimated risk: ${summary.estimatedRisk}`,
      `${summary.protectedAreas.length} areas protected`,
    ].filter(Boolean),
    confidence: 0.95,
    evidenceCount: summary.filesScanned + summary.itemsScanned,
    evidenceSources: summary.protectedAreas,
  };

  return {
    reportId: `SEC-${Date.now()}`,
    moduleId: 'security',
    moduleName: 'AI Smart Security',
    moduleIcon: 'ShieldCheckIcon',
    timestamp: startTime,
    durationMs: duration,
    itemsAnalyzed: summary.itemsScanned,
    issuesFound: summary.threatsFound,
    threatsFound: summary.threatsFound,
    aiConfidence: 0.95,
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
    threatsFound: report.threatsFound,
    actionsTaken: [],
    timestamp: report.timestamp,
    reportId: report.reportId,
  };
}

function severityToPriority(severity: string): IssuePriority {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  if (severity === 'low') return 'low';
  return 'informational';
}
