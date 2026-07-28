/**
 * HealthReportBuilder — assembles a complete HealthReport from
 * category results, overall score, insights, recommendations,
 * and trend analysis.
 *
 * This is a pure builder: it takes all the pieces and combines
 * them into a single report object.
 */
import type {
  CategoryResult,
  OverallHealthScore,
  HealthInsight,
  HealthRecommendation,
  TrendAnalysis,
  HealthReport,
} from './types';

export class HealthReportBuilder {
  /**
   * Build a complete health report.
   */
  build(
    overall: OverallHealthScore,
    categories: CategoryResult[],
    insights: HealthInsight[],
    recommendations: HealthRecommendation[],
    trends: TrendAnalysis | null,
    fromCache: boolean = false,
  ): HealthReport {
    return {
      id: `health-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      generatedAt: new Date().toISOString(),
      overall,
      categories,
      insights,
      recommendations,
      trends,
      fromCache,
    };
  }
}

/**
 * Default singleton instance.
 */
export const healthReportBuilder = new HealthReportBuilder();
