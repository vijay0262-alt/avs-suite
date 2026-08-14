/**
 * reportBuilder.ts — pure helper that builds a UnifiedScanReport from the
 * real orchestrator result and final status.
 *
 * No remediation actions are emitted; the only action is a safe close/review
 * placeholder.  The system is never modified.
 */
import type {
  UnifiedScanReport,
  UnifiedResultCard,
  UnifiedAISummary,
  UnifiedScanAction,
} from '../unified-scan/unifiedScanTypes';
import type { OrchestratorStatus } from '../orchestrator/orchestrator.service';

const MODULE_ICON_MAP: Record<string, string> = {
  'AI Smart Optimize': 'SparklesIcon',
  'AI Smart Security': 'ShieldCheckIcon',
  'AI Protection Center': 'ShieldCheckIcon',
};

function getModuleIcon(moduleName: string): string {
  return MODULE_ICON_MAP[moduleName] ?? 'ShieldCheckIcon';
}

function getResultValue<T>(
  result: Record<string, unknown>,
  key: string,
  fallback: T,
): T {
  const value = result[key];
  if (value === undefined || value === null) return fallback;
  return value as T;
}

export function buildScanReport(
  moduleName: string,
  result: Record<string, unknown>,
  status: OrchestratorStatus,
): UnifiedScanReport {
  const totalIssuesFromResult = getResultValue<number | undefined>(result, 'totalIssues', undefined);
  const totalIssues =
    typeof totalIssuesFromResult === 'number'
      ? totalIssuesFromResult
      : (status.issuesBefore ?? 0);
  const issuesFound = totalIssues;
  const hasIssues = issuesFound > 0;

  const moduleIcon = getModuleIcon(moduleName);
  const reportId =
    typeof result.sessionId === 'string'
      ? result.sessionId
      : `scan-${Date.now()}`;

  const overallScore = getResultValue<number>(result, 'overallScore', 100);
  const durationMs = status.counters?.elapsedMs ?? 0;

  const itemsAnalyzed =
    (status.counters?.itemsScanned ?? 0) + (status.counters?.itemsAnalyzed ?? 0);
  const modulesAnalyzed = Object.keys(status.moduleStatuses ?? {}).length;

  const results: UnifiedResultCard[] = [];
  if (hasIssues) {
    results.push({
      id: 'issues-found',
      title: 'Issues Found',
      icon: 'ExclamationTriangleIcon',
      currentValue: '0',
      improvedValue: `${issuesFound}`,
      difference: `+${issuesFound}`,
      positive: false,
    });
  }

  const modulesRecord = getResultValue<Record<string, { issues?: number }> | undefined>(
    result,
    'modules',
    undefined,
  );
  const threatCount = Object.values(modulesRecord ?? {}).reduce(
    (sum, m) => sum + (typeof m.issues === 'number' ? m.issues : 0),
    0,
  );
  const threatsFound = threatCount > 0 ? threatCount : issuesFound;

  const verdict = hasIssues
    ? `Scan found ${issuesFound} issue${issuesFound === 1 ? '' : 's'}. Review the results to learn more.`
    : 'No issues found. Your system is in good shape.';

  const aiSummary: UnifiedAISummary = {
    overallScore,
    modulesAnalyzed: modulesAnalyzed || 1,
    issuesFound,
    threatsFound,
    aiConfidence: 1,
    estimatedImprovements: [],
    verdict,
    reportId,
  };

  const actions: UnifiedScanAction[] = [
    {
      id: 'close-review',
      label: hasIssues ? 'Review' : 'Close',
      icon: 'XMarkIcon',
      variant: 'secondary',
      action: () => undefined,
    },
  ];

  return {
    reportId,
    moduleName,
    moduleIcon,
    timestamp: Date.now(),
    durationMs,
    itemsAnalyzed,
    issuesFound,
    threatsFound,
    results,
    aiSummary,
    actions,
  };
}
