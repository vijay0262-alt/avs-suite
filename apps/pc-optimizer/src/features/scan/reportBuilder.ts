/**
 * reportBuilder.ts — pure helper that builds a UnifiedScanReport from the
 * real scan-core `ScanResult`.
 *
 * No remediation actions are emitted; the only action is a safe close/review
 * placeholder. The system is never modified.
 */
import type {
  UnifiedScanReport,
  UnifiedResultCard,
  UnifiedAISummary,
  UnifiedScanAction,
} from '../unified-scan/unifiedScanTypes';

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
): UnifiedScanReport {
  const statistics = getResultValue<Record<string, unknown>>(result, 'statistics', {});
  const cleanupSummary = getResultValue<Record<string, unknown> | undefined>(result, 'cleanup_summary', undefined);

  const totalIssues = getResultValue<number>(result, 'findings_count', 0);
  const issuesFound = totalIssues;
  const hasIssues = issuesFound > 0;

  // V1.0: Determine if this is an optimize/cleanup module (no threats).
  const isOptimizeModule = moduleName === 'AI Smart Optimize' || moduleName === 'Dashboard';

  const moduleIcon = getModuleIcon(moduleName);
  const reportId =
    typeof result.scan_id === 'string'
      ? result.scan_id
      : `scan-${Date.now()}`;

  const overallScore = getResultValue<number>(result, 'overallScore', 100);
  const durationMs = getResultValue<number>(result, 'elapsed_time_ms', 0) ||
    getResultValue<number>(result, 'duration_ms', 0);

  // V1.0: For optimize/direct cleanup, use cleanup_summary data.
  const filesDeleted = cleanupSummary
    ? getResultValue<number>(cleanupSummary, 'files_deleted', 0)
    : getResultValue<number>(statistics, 'files_cleaned', 0);
  const bytesRecovered = cleanupSummary
    ? getResultValue<number>(cleanupSummary, 'bytes_recovered', 0)
    : getResultValue<number>(statistics, 'space_recovered', 0) ||
      getResultValue<number>(statistics, 'bytes_recovered', 0);
  const foldersDeleted = cleanupSummary
    ? getResultValue<number>(cleanupSummary, 'folders_deleted', 0)
    : getResultValue<number>(statistics, 'folders_cleaned', 0);

  const itemsAnalyzed =
    typeof statistics.assets_evaluated === 'number'
      ? statistics.assets_evaluated
      : issuesFound;
  const modulesAnalyzed =
    typeof statistics.rules_evaluated === 'number' && statistics.rules_evaluated > 0
      ? Number(statistics.rules_evaluated)
      : 1;

  // V1.0: For optimize module, build cleanup result cards.
  // For security module, build threat result cards.
  const results: UnifiedResultCard[] = [];
  if (isOptimizeModule && cleanupSummary) {
    // Optimize: show files deleted and space recovered
    if (filesDeleted > 0) {
      const mb = bytesRecovered / (1024 * 1024);
      const sizeStr = mb >= 1024
        ? `${(mb / 1024).toFixed(2)} GB`
        : `${mb.toFixed(2)} MB`;
      results.push({
        id: 'files-deleted',
        title: 'Files Cleaned',
        icon: 'TrashIcon',
        currentValue: '0',
        improvedValue: `${filesDeleted}`,
        difference: `+${filesDeleted}`,
        positive: true,
      });
      results.push({
        id: 'space-recovered',
        title: 'Space Recovered',
        icon: 'CircleStackIcon',
        currentValue: '0 MB',
        improvedValue: sizeStr,
        difference: sizeStr,
        positive: true,
      });
    }
  } else if (hasIssues) {
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

  // V1.0: Only show threats for security modules, not optimize.
  const threatsFound = isOptimizeModule ? undefined : issuesFound;

  const verdict = isOptimizeModule
    ? (filesDeleted > 0
      ? `Cleaned ${filesDeleted} files and recovered ${(bytesRecovered / (1024 * 1024)).toFixed(2)} MB of space.`
      : 'Your PC is already clean.')
    : hasIssues
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
    planId: getResultValue<string | undefined>(result, 'action_plan_id', undefined),
    results,
    aiSummary,
    actions,
  };
}
