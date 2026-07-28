/**
 * Optimization Estimator — estimates benefits, duration, and space recovery
 * for optimization items based on health analysis data.
 *
 * The estimator uses:
 *   • Category scores and issues from the health report
 *   • Execution history for duration calibration
 *   • Metrics data for space recovery estimation
 *
 * It NEVER executes anything — it only computes estimates.
 */
import type {
  HealthReport,
  CategoryResult,
  HealthCategoryId,
} from '../ai-health-engine/types';
import type { ExecutionRecord, ExecutionStatistics } from '../maintenance-history/types';
import type { DashboardMetrics } from '../dashboard/dashboard.types';
import type { RiskLevel } from '../ai-health-engine/types';
import { CATEGORY_TASK_MAP } from './types';

// ── Task duration estimates (seconds) ─────────────────────────

const TASK_DURATION_ESTIMATES: Record<string, number> = {
  junk_cleaner: 60,
  browser_cleaner: 30,
  recycle_bin_cleaner: 15,
  temp_files_cleaner: 20,
};

// ── Category → space recovery source ──────────────────────────

interface SpaceEstimate {
  bytes: number;
  source: string;
}

/**
 * Estimate space recovery for a category based on metrics.
 */
function estimateSpaceRecovery(
  category: HealthCategoryId,
  metrics: DashboardMetrics | null,
): SpaceEstimate {
  if (!metrics) return { bytes: 0, source: 'no metrics' };

  switch (category) {
    case 'temp_files': {
      const tempBytes = metrics.performance.temporaryFilesSize;
      // Assume ~80% of temp files can be recovered
      return { bytes: Math.floor(tempBytes * 0.8), source: 'temporary files' };
    }
    case 'recycle_bin': {
      const binBytes = metrics.performance.recycleBinSize;
      // Assume 100% of recycle bin can be emptied
      return { bytes: binBytes, source: 'recycle bin' };
    }
    case 'browser': {
      const cacheBytes = metrics.performance.browserCacheSize;
      // Assume ~90% of browser cache can be cleaned
      return { bytes: Math.floor(cacheBytes * 0.9), source: 'browser cache' };
    }
    case 'privacy': {
      const browserBytes = metrics.performance.browserCacheSize;
      // Privacy cleanup recovers browser data + cookies
      return { bytes: Math.floor(browserBytes * 0.5), source: 'privacy data' };
    }
    case 'storage': {
      // Junk cleaner recovers from all cleaners
      const tempBytes = metrics.performance.temporaryFilesSize;
      const binBytes = metrics.performance.recycleBinSize;
      const cacheBytes = metrics.performance.browserCacheSize;
      const total = tempBytes + binBytes + cacheBytes;
      return { bytes: Math.floor(total * 0.7), source: 'junk files' };
    }
    default:
      return { bytes: 0, source: 'no direct space recovery' };
  }
}

/**
 * Estimate the benefit (score improvement) for a category.
 * Based on how far the category score is from 100 and the issue impact.
 */
function estimateBenefit(categoryResult: CategoryResult): number {
  const gap = 100 - categoryResult.score;
  if (gap <= 0) return 0;

  // Benefit is proportional to the gap, weighted by autoFixable issues
  const autoFixableIssues = categoryResult.issues.filter((i) => i.autoFixable);
  if (autoFixableIssues.length === 0) {
    // No auto-fixable issues — benefit is limited
    return Math.min(gap * 0.3, 10);
  }

  const totalImpact = autoFixableIssues.reduce((sum, i) => sum + i.impact, 0);
  // Benefit is the minimum of the gap and the total impact
  return Math.min(gap, totalImpact);
}

/**
 * Estimate duration for a category based on its task.
 */
function estimateDuration(
  category: HealthCategoryId,
  executionHistory: ExecutionRecord[],
): number {
  const taskId = CATEGORY_TASK_MAP[category];
  if (!taskId) return 0;

  // Check execution history for this task's actual duration
  const relevantRecords = executionHistory.filter(
    (r) => r.taskResults?.some((t) => t.taskId?.includes(taskId)),
  );

  if (relevantRecords.length > 0) {
    // Use average of historical durations
    const durations = relevantRecords
      .flatMap((r) => r.taskResults ?? [])
      .filter((t) => t.taskId?.includes(taskId))
      .map((t) => t.durationMs / 1000);
    if (durations.length > 0) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      // Blend historical average with default estimate (70/30)
      const defaultEst = TASK_DURATION_ESTIMATES[taskId] ?? 30;
      return Math.round(avg * 0.7 + defaultEst * 0.3);
    }
  }

  return TASK_DURATION_ESTIMATES[taskId] ?? 30;
}

/**
 * Determine risk level for a category optimization.
 */
function estimateRisk(categoryResult: CategoryResult): RiskLevel {
  const hasNonFixable = categoryResult.issues.some((i) => !i.autoFixable);
  const hasCritical = categoryResult.issues.some((i) => i.severity === 'critical');

  if (hasNonFixable && hasCritical) return 'high';
  if (hasNonFixable) return 'medium';
  return 'low';
}

// ── Public Estimation API ─────────────────────────────────────

export interface CategoryEstimate {
  category: HealthCategoryId;
  benefit: number;
  durationSeconds: number;
  spaceRecoveryBytes: number;
  spaceRecoverySource: string;
  risk: RiskLevel;
}

/**
 * Estimate all metrics for a single category.
 */
export function estimateCategory(
  categoryResult: CategoryResult,
  metrics: DashboardMetrics | null,
  executionHistory: ExecutionRecord[],
): CategoryEstimate {
  const space = estimateSpaceRecovery(categoryResult.categoryId, metrics);
  return {
    category: categoryResult.categoryId,
    benefit: estimateBenefit(categoryResult),
    durationSeconds: estimateDuration(categoryResult.categoryId, executionHistory),
    spaceRecoveryBytes: space.bytes,
    spaceRecoverySource: space.source,
    risk: estimateRisk(categoryResult),
  };
}

/**
 * Estimate the predicted health score after applying optimizations.
 * Uses the health report's current score plus the sum of benefits,
 * clamped to [0, 100].
 */
export function estimatePredictedScore(
  currentScore: number,
  estimates: CategoryEstimate[],
): number {
  const totalBenefit = estimates.reduce((sum, e) => sum + e.benefit, 0);
  return Math.min(100, currentScore + totalBenefit);
}

/**
 * Estimate overall performance improvement from the plan.
 * Based on performance and memory category benefits.
 */
export function estimatePerformanceImprovement(
  estimates: CategoryEstimate[],
  _report: HealthReport,
): number {
  const perfCategories: HealthCategoryId[] = ['performance', 'memory', 'startup'];
  const relevantEstimates = estimates.filter((e) => perfCategories.includes(e.category));
  const benefit = relevantEstimates.reduce((sum, e) => sum + e.benefit, 0);

  // Performance improvement is a portion of the benefit
  return Math.min(100, benefit * 0.5);
}

/**
 * Estimate overall privacy improvement from the plan.
 * Based on privacy and browser category benefits.
 */
export function estimatePrivacyImprovement(
  estimates: CategoryEstimate[],
): number {
  const privacyCategories: HealthCategoryId[] = ['privacy', 'browser'];
  const relevantEstimates = estimates.filter((e) => privacyCategories.includes(e.category));
  const benefit = relevantEstimates.reduce((sum, e) => sum + e.benefit, 0);

  return Math.min(100, benefit * 0.7);
}

/**
 * Determine the overall risk level of a plan from its items.
 */
export function estimateOverallRisk(risks: RiskLevel[]): RiskLevel {
  if (risks.some((r) => r === 'high')) return 'high';
  if (risks.some((r) => r === 'medium')) return 'medium';
  if (risks.some((r) => r === 'low')) return 'low';
  return 'none';
}

/**
 * Estimate average execution duration from statistics.
 * Used for plan-level duration calibration.
 */
export function estimateFromStatistics(stats: ExecutionStatistics): number {
  if (stats.totalExecutions === 0) return 0;
  return Math.round(stats.averageDurationMs / 1000);
}
