/**
 * HealthScoreCalculator — computes the overall health score from
 * per-category results using configurable weights.
 *
 * The calculator is pure: it takes category results and weights,
 * produces a score. It never reads from or modifies any service.
 */
import type {
  CategoryResult,
  CategoryScoreEntry,
  OverallHealthScore,
  CategoryWeights,
  HealthCategoryId,
} from './types';
import { scoreToLevel, scoreToLetter, clampScore } from './types';
import { DEFAULT_CATEGORY_WEIGHTS } from './types';

export class HealthScoreCalculator {
  private _weights: CategoryWeights;

  constructor(weights?: Partial<CategoryWeights>) {
    this._weights = { ...DEFAULT_CATEGORY_WEIGHTS, ...weights };
    this._normalizeWeights();
  }

  /**
   * Update weights for one or more categories.
   * Weights are re-normalized to sum to 1.0 after update.
   */
  setWeights(weights: Partial<CategoryWeights>): void {
    this._weights = { ...this._weights, ...weights };
    this._normalizeWeights();
  }

  /**
   * Get the current weight for a category.
   */
  getWeight(categoryId: HealthCategoryId): number {
    return this._weights[categoryId] ?? 0;
  }

  /**
   * Calculate the overall health score from category results.
   *
   * Only categories that have results are included. Their weights
   * are re-normalized to sum to 1.0 among the participating categories.
   */
  calculate(categoryResults: CategoryResult[]): OverallHealthScore {
    if (categoryResults.length === 0) {
      return {
        score: 0,
        letterGrade: 'F',
        level: 'critical',
        categoryScores: [],
        computedAt: new Date().toISOString(),
      };
    }

    // Collect participating categories and re-normalize their weights
    const participatingIds = new Set(categoryResults.map((r) => r.categoryId));
    let totalWeight = 0;
    for (const id of participatingIds) {
      totalWeight += this._weights[id] ?? 0;
    }

    // If all weights are zero, distribute equally
    const fallbackWeight = 1 / categoryResults.length;

    const categoryScores: CategoryScoreEntry[] = categoryResults.map((result) => {
      const rawWeight = this._weights[result.categoryId] ?? 0;
      const normalizedWeight = totalWeight > 0
        ? rawWeight / totalWeight
        : fallbackWeight;
      const contribution = clampScore(result.score) * normalizedWeight;
      return {
        categoryId: result.categoryId,
        categoryName: result.categoryName,
        score: clampScore(result.score),
        weight: normalizedWeight,
        contribution,
      };
    });

    const overallScore = clampScore(
      categoryScores.reduce((sum, cs) => sum + cs.contribution, 0),
    );

    return {
      score: overallScore,
      letterGrade: scoreToLetter(overallScore),
      level: scoreToLevel(overallScore),
      categoryScores,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Normalize weights to sum to 1.0.
   */
  private _normalizeWeights(): void {
    const total = Object.values(this._weights).reduce((sum, w) => sum + w, 0);
    if (total > 0) {
      for (const key of Object.keys(this._weights) as HealthCategoryId[]) {
        this._weights[key] = this._weights[key] / total;
      }
    }
  }
}

/**
 * Default singleton instance.
 */
export const healthScoreCalculator = new HealthScoreCalculator();
