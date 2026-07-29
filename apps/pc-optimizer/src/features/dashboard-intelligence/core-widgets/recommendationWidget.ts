/**
 * Recommendation Widget Provider — extracts top recommendations.
 *
 * Displays: Top 5 recommendations, Priority, Estimated benefit,
 * Estimated execution time, Safety, Confidence, Category.
 */
import type { WidgetProvider, WidgetProviderContext } from '../widgets/types';
import type { RecommendationData, RecommendationDisplayItem, CoreWidgetDataBundle } from './types';

export class RecommendationProvider implements WidgetProvider {
  private _initialized = false;

  async initialize(): Promise<void> {
    this._initialized = true;
  }

  async load(context: WidgetProviderContext): Promise<RecommendationData> {
    const bundle = (context as unknown as { dataBundle: CoreWidgetDataBundle }).dataBundle;
    const recs = bundle?.recommendations;

    if (!recs || !recs.recommendations || recs.recommendations.length === 0) {
      return { recommendations: [], totalCount: 0, criticalCount: 0 };
    }

    const sorted = [...recs.recommendations].sort((a, b) => {
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
      return (priorityOrder[a.priority] ?? 5) - (priorityOrder[b.priority] ?? 5);
    });

    const top5 = sorted.slice(0, 5);

    const items: RecommendationDisplayItem[] = top5.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      category: r.category,
      priority: r.priority,
      estimatedBenefit: r.benefits.estimatedBenefit,
      estimatedTime: r.benefits.estimatedTime,
      safetyScore: r.scores.safetyScore,
      riskLevel: r.safety.riskLevel,
      confidence: r.scores.confidenceScore,
      requiresPro: r.requiresPro,
    }));

    const criticalCount = recs.recommendations.filter(
      (r) => r.priority === 'critical' || r.priority === 'high',
    ).length;

    return {
      recommendations: items,
      totalCount: recs.recommendations.length,
      criticalCount,
    };
  }

  async refresh(context: WidgetProviderContext): Promise<RecommendationData> {
    return this.load(context);
  }

  async dispose(): Promise<void> {
    this._initialized = false;
  }

  validate(): boolean {
    return this._initialized;
  }
}
