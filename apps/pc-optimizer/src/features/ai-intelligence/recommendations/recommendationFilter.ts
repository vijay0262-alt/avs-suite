/**
 * Recommendation Filter — filters recommendations by various criteria.
 *
 * Supports filtering by:
 *   Category, Priority, Safety/Risk, Impact, Time required,
 *   Subscription requirement, Automation readiness, Quick wins,
 *   Future custom filters.
 */
import type { Recommendation, RecommendationFilter, RecommendationConfiguration } from './types';

export class RecommendationFilterer {
  private _config: RecommendationConfiguration;

  constructor(config: RecommendationConfiguration) {
    this._config = config;
  }

  updateConfig(config: RecommendationConfiguration): void {
    this._config = config;
  }

  /**
   * Filter recommendations. Returns a new array.
   */
  filter(
    recommendations: Recommendation[],
    filter: RecommendationFilter,
  ): Recommendation[] {
    return recommendations.filter((rec) => this._matches(rec, filter));
  }

  /**
   * Filter by category.
   */
  byCategory(
    recommendations: Recommendation[],
    categories: string[],
  ): Recommendation[] {
    return recommendations.filter((rec) => categories.includes(rec.category));
  }

  /**
   * Filter by priority.
   */
  byPriority(
    recommendations: Recommendation[],
    priorities: string[],
  ): Recommendation[] {
    return recommendations.filter((rec) => priorities.includes(rec.priority));
  }

  /**
   * Filter safe recommendations (risk none or low).
   */
  safeOnly(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.filter(
      (rec) => rec.safety.riskLevel === 'none' || rec.safety.riskLevel === 'low',
    );
  }

  /**
   * Filter quick wins: high benefit, low effort, very safe, under time threshold.
   */
  quickWins(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.filter((rec) => this._isQuickWin(rec));
  }

  /**
   * Filter automation-eligible recommendations.
   */
  automationReady(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.filter((rec) => rec.safety.automationEligible);
  }

  /**
   * Filter by max time required.
   */
  underTime(
    recommendations: Recommendation[],
    maxSeconds: number,
  ): Recommendation[] {
    return recommendations.filter((rec) => rec.benefits.estimatedTime <= maxSeconds);
  }

  /**
   * Filter by minimum impact.
   */
  minImpact(
    recommendations: Recommendation[],
    minScore: number,
  ): Recommendation[] {
    return recommendations.filter((rec) => rec.scores.impactScore >= minScore);
  }

  /**
   * Filter by pro requirement.
   */
  proOnly(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.filter((rec) => rec.requiresPro);
  }

  /**
   * Filter free-only (no pro required).
   */
  freeOnly(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.filter((rec) => !rec.requiresPro);
  }

  /**
   * Check if a recommendation is a quick win.
   */
  isQuickWin(rec: Recommendation): boolean {
    return this._isQuickWin(rec);
  }

  // ── Private ────────────────────────────────────────────────

  private _matches(rec: Recommendation, filter: RecommendationFilter): boolean {
    if (filter.categories && !filter.categories.includes(rec.category)) return false;
    if (filter.priorities && !filter.priorities.includes(rec.priority)) return false;
    if (filter.riskLevels && !filter.riskLevels.includes(rec.safety.riskLevel)) return false;
    if (filter.minImpact !== undefined && rec.scores.impactScore < filter.minImpact) return false;
    if (filter.maxEffort !== undefined && rec.scores.effortScore > filter.maxEffort) return false;
    if (filter.minSafety !== undefined && rec.scores.safetyScore < filter.minSafety) return false;
    if (filter.maxTimeRequired !== undefined && rec.benefits.estimatedTime > filter.maxTimeRequired) return false;
    if (filter.requiresPro !== undefined && rec.requiresPro !== filter.requiresPro) return false;
    if (filter.automationReady !== undefined && rec.safety.automationEligible !== filter.automationReady) return false;
    if (filter.quickWinsOnly && !this._isQuickWin(rec)) return false;
    if (filter.custom && !filter.custom(rec)) return false;
    return true;
  }

  private _isQuickWin(rec: Recommendation): boolean {
    return (
      rec.benefits.estimatedTime <= this._config.quickWinMaxTime &&
      rec.scores.impactScore >= this._config.quickWinMinImpact &&
      rec.scores.safetyScore >= this._config.quickWinMinSafety &&
      rec.scores.effortScore <= this._config.quickWinMaxEffort
    );
  }
}
