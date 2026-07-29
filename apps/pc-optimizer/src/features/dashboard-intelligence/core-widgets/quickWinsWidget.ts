/**
 * Quick Wins Widget Provider — extracts safe, fast optimizations.
 *
 * Displays: Safe optimizations, Execution time, Expected improvement,
 * Estimated storage recovery, Estimated performance gain,
 * Future Smart Optimize compatibility.
 */
import type { WidgetProvider, WidgetProviderContext } from '../widgets/types';
import type { QuickWinsData, QuickWinItem, CoreWidgetDataBundle } from './types';

export class QuickWinsProvider implements WidgetProvider {
  private _initialized = false;

  async initialize(): Promise<void> {
    this._initialized = true;
  }

  async load(context: WidgetProviderContext): Promise<QuickWinsData> {
    const bundle = (context as unknown as { dataBundle: CoreWidgetDataBundle }).dataBundle;
    const recs = bundle?.recommendations;

    if (!recs || !recs.recommendations) {
      return this._emptyData();
    }

    const quickWins = recs.recommendations
      .filter((r) => {
        const isSafe = r.safety.riskLevel === 'none' || r.safety.riskLevel === 'low';
        const isFast = r.benefits.estimatedTime <= 60;
        return isSafe && isFast;
      })
      .map((r): QuickWinItem => ({
        id: r.id,
        title: r.title,
        category: r.category,
        executionTime: r.benefits.estimatedTime,
        expectedImprovement: r.scores.impactScore,
        storageRecovery: r.benefits.estimatedSpaceRecovered ?? 0,
        performanceGain: r.benefits.estimatedPerformanceGain ?? 0,
        safetyScore: r.scores.safetyScore,
        smartOptimizeCompatible: r.safety.automaticExecutionAllowed,
      }));

    const totalEstimatedImprovement = quickWins.reduce((sum, qw) => sum + qw.expectedImprovement, 0);
    const totalStorageRecovery = quickWins.reduce((sum, qw) => sum + qw.storageRecovery, 0);
    const totalPerformanceGain = quickWins.reduce((sum, qw) => sum + qw.performanceGain, 0);
    const smartOptimizeCompatible = quickWins.length > 0 && quickWins.every((qw) => qw.smartOptimizeCompatible);

    return {
      quickWins,
      totalCount: quickWins.length,
      totalEstimatedImprovement,
      totalStorageRecovery,
      totalPerformanceGain,
      smartOptimizeCompatible,
    };
  }

  async refresh(context: WidgetProviderContext): Promise<QuickWinsData> {
    return this.load(context);
  }

  async dispose(): Promise<void> {
    this._initialized = false;
  }

  validate(): boolean {
    return this._initialized;
  }

  private _emptyData(): QuickWinsData {
    return {
      quickWins: [],
      totalCount: 0,
      totalEstimatedImprovement: 0,
      totalStorageRecovery: 0,
      totalPerformanceGain: 0,
      smartOptimizeCompatible: false,
    };
  }
}
