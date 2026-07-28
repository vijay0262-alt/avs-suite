/**
 * HealthInsightGenerator — generates intelligent insights from
 * category analysis results and execution history.
 *
 * Insights are higher-level observations that combine data from
 * multiple sources to provide actionable intelligence.
 */
import type {
  CategoryResult,
  HealthInsight,
  HealthAnalysisInput,
  HealthCategoryId,
} from './types';
import { severityToPriority } from './types';

function generateInsightId(prefix: string, index: number): string {
  return `insight-${prefix}-${index}`;
}

function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

export class HealthInsightGenerator {
  /**
   * Generate insights from category results and execution history.
   */
  generate(categoryResults: CategoryResult[], input: HealthAnalysisInput): HealthInsight[] {
    const insights: HealthInsight[] = [];
    let idx = 0;

    // ── Category-based insights ───────────────────────────────

    for (const result of categoryResults) {
      if (result.issues.length === 0) continue;

      const worstIssue = result.issues.reduce((worst, issue) =>
        severityToPriority(issue.severity) < severityToPriority(worst.severity) ? issue : worst,
      );

      if (severityToPriority(worstIssue.severity) <= 1) {
        insights.push({
          id: generateInsightId(result.categoryId, idx++),
          title: worstIssue.title,
          severity: worstIssue.severity,
          confidence: result.confidence,
          explanation: worstIssue.description,
          suggestedAction: result.recommendations[0] ?? 'Review and address this issue',
          category: result.categoryId,
        });
      }
    }

    // ── Temporary files insight ───────────────────────────────

    const tempResult = categoryResults.find((r) => r.categoryId === 'temp_files');
    if (tempResult && tempResult.score < 70) {
      insights.push({
        id: generateInsightId('temp', idx++),
        title: 'Large amount of temporary files',
        severity: 'medium',
        confidence: tempResult.confidence,
        explanation: 'Temporary files are accumulating. Regular cleanup prevents disk space waste and potential slowdowns.',
        suggestedAction: 'Run the Junk Cleaner to remove temporary files',
        category: 'temp_files' as HealthCategoryId,
      });
    }

    // ── Browser cache growing ─────────────────────────────────

    const browserResult = categoryResults.find((r) => r.categoryId === 'browser');
    if (browserResult && browserResult.score < 75) {
      insights.push({
        id: generateInsightId('browser', idx++),
        title: 'Browser cache growing rapidly',
        severity: 'low',
        confidence: browserResult.confidence,
        explanation: 'Browser cache is taking up significant disk space and may slow down browsing.',
        suggestedAction: 'Clear browser cache using the Privacy Cleaner',
        category: 'browser' as HealthCategoryId,
      });
    }

    // ── Startup programs increasing ───────────────────────────

    const startupResult = categoryResults.find((r) => r.categoryId === 'startup');
    if (startupResult && startupResult.score < 70) {
      insights.push({
        id: generateInsightId('startup', idx++),
        title: 'Startup programs increasing',
        severity: 'medium',
        confidence: startupResult.confidence,
        explanation: 'A high number of startup programs are slowing down boot time and consuming resources.',
        suggestedAction: 'Use the Startup Manager to disable unnecessary programs',
        category: 'startup' as HealthCategoryId,
      });
    }

    // ── Low storage available ─────────────────────────────────

    const storageResult = categoryResults.find((r) => r.categoryId === 'storage');
    if (storageResult && storageResult.score < 60) {
      insights.push({
        id: generateInsightId('storage', idx++),
        title: 'Low storage available',
        severity: 'high',
        confidence: storageResult.confidence,
        explanation: 'Disk space is critically low. This can cause system instability and prevent updates.',
        suggestedAction: 'Free up disk space by running Junk Cleaner and emptying the Recycle Bin',
        category: 'storage' as HealthCategoryId,
      });
    }

    // ── History-based insights ────────────────────────────────

    const history = input.executionHistory;
    const stats = input.executionStatistics;

    // Maintenance frequency decreasing
    if (stats.totalExecutions > 5 && stats.lastRunAt) {
      const daysSinceLastRun = daysSince(stats.lastRunAt);
      if (daysSinceLastRun > 14) {
        insights.push({
          id: generateInsightId('frequency', idx++),
          title: 'Maintenance frequency decreasing',
          severity: 'medium',
          confidence: 0.8,
          explanation: `Last maintenance was run ${Math.round(daysSinceLastRun)} days ago. Regular maintenance keeps the system healthy.`,
          suggestedAction: 'Run a maintenance scan now or set up a schedule',
          category: 'performance' as HealthCategoryId,
        });
      }
    }

    // Frequent cleanup failures
    if (stats.totalExecutions > 3 && stats.failedExecutions > 0) {
      const failureRate = (stats.failedExecutions / stats.totalExecutions) * 100;
      if (failureRate > 20) {
        insights.push({
          id: generateInsightId('failures', idx++),
          title: 'Frequent cleanup failures',
          severity: 'high',
          confidence: 0.85,
          explanation: `${failureRate.toFixed(0)}% of recent maintenance executions have failed. This may indicate underlying system issues.`,
          suggestedAction: 'Check error logs in Maintenance History and run diagnostics',
          category: 'performance' as HealthCategoryId,
        });
      }
    }

    // Low space recovered in recent runs
    if (history.length > 0) {
      const recentRuns = history.slice(-5);
      const avgRecovered = recentRuns.reduce((sum, r) => sum + r.totalSpaceRecovered, 0) / recentRuns.length;
      if (avgRecovered < 1024 * 1024 && stats.totalExecutions > 3) {
        insights.push({
          id: generateInsightId('low-recovery', idx++),
          title: 'Low space recovered in recent cleanups',
          severity: 'low',
          confidence: 0.6,
          explanation: 'Recent maintenance runs have recovered minimal space. The system may already be clean.',
          suggestedAction: 'No action needed — system appears well-maintained',
          category: 'storage' as HealthCategoryId,
        });
      }
    }

    // No maintenance history at all
    if (stats.totalExecutions === 0) {
      insights.push({
        id: generateInsightId('no-history', idx++),
        title: 'No maintenance history yet',
        severity: 'info',
        confidence: 0.9,
        explanation: 'No maintenance has been performed yet. Running an initial scan can identify optimization opportunities.',
        suggestedAction: 'Run your first maintenance scan to establish a baseline',
        category: 'performance' as HealthCategoryId,
      });
    }

    // Sort by severity (critical first)
    insights.sort((a, b) => severityToPriority(a.severity) - severityToPriority(b.severity));

    return insights;
  }
}

/**
 * Default singleton instance.
 */
export const healthInsightGenerator = new HealthInsightGenerator();
