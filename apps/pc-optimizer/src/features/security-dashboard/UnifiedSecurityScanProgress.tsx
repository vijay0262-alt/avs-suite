/**
 * UnifiedSecurityScanProgress — adapter that maps the existing
 * SecurityCenterViewModel state to the UnifiedScanView component.
 *
 * Replaces the custom ScanProgressView with the unified scanning UI
 * while keeping all existing backend logic intact.
 */
import { useMemo } from 'react';
import { UnifiedScanView } from '../unified-scan/components/UnifiedScanView';
import { SECURITY_SCAN_CONFIG } from '../unified-scan/moduleConfigs';
import type {
  UnifiedScanTreeNode,
  UnifiedScanReport,
  UnifiedResultCard,
  UnifiedAISummary,
} from '../unified-scan/unifiedScanTypes';
import type { SecurityCenterViewModel } from './SecurityCenterViewModel';
import type { SecurityAISummary, ScanTreeNode } from './securityScanTypes';

function mapScanTreeNodes(nodes: ScanTreeNode[]): UnifiedScanTreeNode[] {
  return nodes.map((node) => ({
    id: node.id,
    label: node.label,
    status: node.status,
    itemsScanned: node.itemsScanned,
    issuesFound: node.threatsFound,
    children: node.children ? mapScanTreeNodes(node.children) : undefined,
  }));
}

function mapLiveStatsToCounters(stats: SecurityCenterViewModel['state']['scanLiveStats']): Record<string, number> {
  return {
    filesScanned: stats.filesScanned,
    processesAnalyzed: stats.processesAnalyzed,
    servicesChecked: stats.servicesChecked,
    registryKeysChecked: stats.registryKeysChecked,
    browserObjects: stats.browserObjects,
    scriptsInspected: stats.scriptsInspected,
    scheduledTasks: stats.scheduledTasks,
    persistenceEntries: stats.persistenceEntries,
    threatsFound: stats.threatsFound,
    suspiciousProcesses: stats.suspiciousProcesses,
    unsignedExecutables: stats.unsignedExecutables,
    aiConfidence: stats.aiConfidence,
  };
}

function buildSecurityReport(
  summary: SecurityAISummary,
  scanStartTime: number,
): UnifiedScanReport {
  const results: UnifiedResultCard[] = [];

  if (summary.threatsFound > 0) {
    results.push({
      id: 'threats',
      title: 'Threats Detected',
      icon: 'ShieldCheckIcon',
      currentValue: '0',
      improvedValue: `${summary.threatsNeutralized} neutralized`,
      difference: `${summary.threatsFound} found, ${summary.manualReviewRequired} need review`,
      positive: summary.threatsNeutralized > 0,
    });
  }

  if (summary.filesScanned > 0) {
    results.push({
      id: 'files',
      title: 'Files Analyzed',
      icon: 'CircleStackIcon',
      currentValue: '0',
      improvedValue: summary.filesScanned.toLocaleString(),
      difference: `${summary.itemsScanned.toLocaleString()} total items`,
      positive: true,
    });
  }

  const aiSummary: UnifiedAISummary = {
    overallScore: summary.securityScore,
    securityScore: summary.securityScore,
    modulesAnalyzed: 14,
    issuesFound: summary.threatsFound,
    threatsFound: summary.threatsFound,
    aiConfidence: 0.95,
    estimatedImprovements: [
      summary.aiVerdict,
      `Protected areas: ${summary.protectedAreas.join(', ')}`,
      `Estimated risk: ${summary.estimatedRisk}`,
    ],
    verdict: summary.aiVerdict,
    reportId: `SEC-${Date.now()}`,
  };

  return {
    reportId: aiSummary.reportId,
    moduleName: 'AI Smart Security',
    moduleIcon: 'ShieldCheckIcon',
    timestamp: scanStartTime,
    durationMs: summary.scanDuration,
    itemsAnalyzed: summary.itemsScanned,
    issuesFound: summary.threatsFound,
    threatsFound: summary.threatsFound,
    results,
    aiSummary,
    actions: [],
  };
}

export interface UnifiedSecurityScanProgressProps {
  vm: SecurityCenterViewModel;
}

export function UnifiedSecurityScanProgress({ vm }: UnifiedSecurityScanProgressProps) {
  const s = vm.state;
  const phases = s.scanMode === 'full' ? SECURITY_SCAN_CONFIG.phases : SECURITY_SCAN_CONFIG.phases.slice(0, 6);
  const currentPhase = phases[s.scanPhaseIndex];

  const treeNodes = useMemo(() => mapScanTreeNodes(s.scanTree), [s.scanTree]);
  const counters = useMemo(() => mapLiveStatsToCounters(s.scanLiveStats), [s.scanLiveStats]);

  const liveStatus = useMemo(() => ({
    currentPhase: currentPhase?.label ?? 'Scanning...',
    currentActivity: currentPhase?.activities[0] ?? 'Working...',
    overallProgress: s.scanOverallProgress,
    currentFile: s.scanCurrentFile ?? undefined,
    currentFolder: s.scanCurrentFolder ?? undefined,
    currentModule: s.scanCurrentModule ?? undefined,
  }), [currentPhase, s.scanOverallProgress, s.scanCurrentFile, s.scanCurrentFolder, s.scanCurrentModule]);

  // Build report when scan is complete with AI summary
  const report = useMemo(() => {
    if (!s.isScanning && s.aiSummary) {
      return buildSecurityReport(s.aiSummary, s.scanStartTime);
    }
    return null;
  }, [s.isScanning, s.aiSummary, s.scanStartTime]);

  // Use a subset of counters config matching the quick/full mode
  const counterDefs = s.scanMode === 'full'
    ? SECURITY_SCAN_CONFIG.counters
    : SECURITY_SCAN_CONFIG.counters.slice(0, 8);

  const config = useMemo(() => ({
    ...SECURITY_SCAN_CONFIG,
    phases,
    counters: counterDefs,
  }), [phases, counterDefs]);

  return (
    <UnifiedScanView
      config={config}
      step={s.isScanning ? 'scanning' : report ? 'complete' : 'preparing'}
      liveStatus={liveStatus}
      counters={counters}
      treeNodes={treeNodes}
      currentPhaseIndex={s.scanPhaseIndex}
      startTime={s.scanStartTime ?? null}
      error={s.error}
      report={report}
      actions={[]}
      onPause={() => {}}
      onResume={() => {}}
      onCancel={() => vm.cancelScan()}
      onClose={() => vm.setActiveTab('overview')}
    />
  );
}
