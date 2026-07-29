/**
 * Recommendation Ranker — ranks recommendations using multi-factor sorting.
 *
 * Ranking order:
 *   1. Overall Score (descending)
 *   2. Highest Impact (descending)
 *   3. Lowest Risk (ascending: none < low < medium < high < critical)
 *   4. Highest Confidence (descending)
 *   5. Lowest Effort (ascending)
 *   6. Most Recent Evidence (descending)
 */
import type { Recommendation, RiskLevel } from './types';

const RISK_ORDER: Record<RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export class RecommendationRanker {
  /**
   * Rank recommendations in-place. Returns the sorted array.
   */
  rank(recommendations: Recommendation[]): Recommendation[] {
    const sorted = [...recommendations].sort((a, b) => {
      return this._compare(a, b);
    });

    // Assign rank implicitly via array order
    return sorted;
  }

  /**
   * Rank and return a new sorted array (does not mutate input).
   */
  rankCopy(recommendations: Recommendation[]): Recommendation[] {
    return this.rank(recommendations);
  }

  /**
   * Get the top N recommendations.
   */
  getTopN(recommendations: Recommendation[], n: number): Recommendation[] {
    return this.rank(recommendations).slice(0, n);
  }

  // ── Private ────────────────────────────────────────────────

  private _compare(a: Recommendation, b: Recommendation): number {
    // 1. Overall Score (descending)
    if (a.scores.overallScore !== b.scores.overallScore) {
      return b.scores.overallScore - a.scores.overallScore;
    }

    // 2. Highest Impact (descending)
    if (a.scores.impactScore !== b.scores.impactScore) {
      return b.scores.impactScore - a.scores.impactScore;
    }

    // 3. Lowest Risk (ascending)
    const riskA = RISK_ORDER[a.safety.riskLevel];
    const riskB = RISK_ORDER[b.safety.riskLevel];
    if (riskA !== riskB) {
      return riskA - riskB;
    }

    // 4. Highest Confidence (descending)
    if (a.scores.confidenceScore !== b.scores.confidenceScore) {
      return b.scores.confidenceScore - a.scores.confidenceScore;
    }

    // 5. Lowest Effort (ascending — lower effort score = less effort)
    if (a.scores.effortScore !== b.scores.effortScore) {
      return a.scores.effortScore - b.scores.effortScore;
    }

    // 6. Most Recent Evidence (descending by createdAt)
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeB - timeA;
  }
}
