/**
 * TrendAnalyzer — compares health scores over time to detect
 * improving, declining, or stable trends.
 *
 * Compares:
 *   Today's score
 *   Last 7 days average
 *   Last 30 days average
 *
 * The analyzer uses historical health report snapshots.
 * It does not modify any data source.
 */
import type {
  TrendAnalysis,
  TrendDirection,
  CategoryTrend,
  HealthCategoryId,
  OverallHealthScore,
} from './types';

/**
 * A historical health snapshot used for trend analysis.
 */
export interface HealthSnapshot {
  /** ISO timestamp of the snapshot. */
  timestamp: string;
  /** Overall health score (0–100). */
  score: number;
  /** Per-category scores. */
  categoryScores: { categoryId: HealthCategoryId; score: number }[];
}

/**
 * Threshold for considering a change significant.
 * Changes below this are considered "stable".
 */
const TREND_THRESHOLD = 5;

export class TrendAnalyzer {
  /**
   * Analyze trends from historical health snapshots.
   *
   * @param snapshots Historical health snapshots, oldest first.
   * @param currentScore Current overall health score.
   * @param currentCategoryScores Current per-category scores.
   */
  analyze(
    snapshots: HealthSnapshot[],
    currentScore: number,
    currentCategoryScores: { categoryId: HealthCategoryId; score: number }[],
  ): TrendAnalysis {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Filter snapshots into time ranges
    const last7Days = snapshots.filter((s) => new Date(s.timestamp).getTime() >= sevenDaysAgo);
    const last30Days = snapshots.filter((s) => new Date(s.timestamp).getTime() >= thirtyDaysAgo);

    const todayScore = currentScore;
    const last7DaysAvg = last7Days.length > 0
      ? last7Days.reduce((sum, s) => sum + s.score, 0) / last7Days.length
      : null;
    const last30DaysAvg = last30Days.length > 0
      ? last30Days.reduce((sum, s) => sum + s.score, 0) / last30Days.length
      : null;

    // Score 7 days ago (or closest snapshot)
    const sevenDaysAgoSnapshot = this._findClosestSnapshot(snapshots, sevenDaysAgo);
    const sevenDaysAgoScore = sevenDaysAgoSnapshot?.score ?? null;
    const change7Days = sevenDaysAgoScore !== null
      ? todayScore - sevenDaysAgoScore
      : null;

    // Score 30 days ago (or closest snapshot)
    const thirtyDaysAgoSnapshot = this._findClosestSnapshot(snapshots, thirtyDaysAgo);
    const thirtyDaysAgoScore = thirtyDaysAgoSnapshot?.score ?? null;
    const change30Days = thirtyDaysAgoScore !== null
      ? todayScore - thirtyDaysAgoScore
      : null;

    // Overall direction
    const direction = this._determineDirection(change7Days, change30Days, snapshots.length);

    // Per-category trends
    const categoryTrends: CategoryTrend[] = currentCategoryScores.map((current) => {
      const catSnapshots = snapshots.map((s) => ({
        timestamp: s.timestamp,
        score: s.categoryScores.find((c) => c.categoryId === current.categoryId)?.score ?? null,
      })).filter((s) => s.score !== null) as { timestamp: string; score: number }[];

      const cat7DaysAgo = this._findClosestSnapshot(catSnapshots, sevenDaysAgo);
      const catPreviousScore = cat7DaysAgo?.score ?? null;
      const catChange = catPreviousScore !== null
        ? current.score - catPreviousScore
        : null;

      return {
        categoryId: current.categoryId,
        direction: this._determineDirection(catChange, null, catSnapshots.length),
        todayScore: current.score,
        previousScore: catPreviousScore,
        change: catChange,
      };
    });

    return {
      direction,
      todayScore,
      last7DaysAvg,
      last30DaysAvg,
      change7Days,
      change30Days,
      categoryTrends,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Find the snapshot closest to a target timestamp.
   */
  private _findClosestSnapshot(
    snapshots: { timestamp: string; score: number }[],
    targetMs: number,
  ): { timestamp: string; score: number } | null {
    if (snapshots.length === 0) return null;

    let closest = snapshots[0]!;
    let minDiff = Math.abs(new Date(closest.timestamp).getTime() - targetMs);

    for (const s of snapshots) {
      const diff = Math.abs(new Date(s.timestamp).getTime() - targetMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = s;
      }
    }

    // Only use the snapshot if it's within a reasonable window (±3 days)
    if (minDiff > 3 * 24 * 60 * 60 * 1000) return null;

    return closest;
  }

  /**
   * Determine trend direction from score changes.
   */
  private _determineDirection(
    change7Days: number | null,
    change30Days: number | null,
    snapshotCount: number,
  ): TrendDirection {
    if (snapshotCount < 2) return 'insufficient_data';

    // Prefer 7-day change for short-term direction
    const primaryChange = change7Days ?? change30Days;

    if (primaryChange === null) return 'insufficient_data';

    if (primaryChange > TREND_THRESHOLD) return 'improving';
    if (primaryChange < -TREND_THRESHOLD) return 'declining';
    return 'stable';
  }

  /**
   * Create a health snapshot from a current score for future trend analysis.
   */
  createSnapshot(score: OverallHealthScore): HealthSnapshot {
    return {
      timestamp: score.computedAt,
      score: score.score,
      categoryScores: score.categoryScores.map((cs) => ({
        categoryId: cs.categoryId,
        score: cs.score,
      })),
    };
  }
}

/**
 * Default singleton instance.
 */
export const trendAnalyzer = new TrendAnalyzer();
