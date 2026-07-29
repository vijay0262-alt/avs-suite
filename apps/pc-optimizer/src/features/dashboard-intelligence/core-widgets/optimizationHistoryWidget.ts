/**
 * Optimization History Widget Provider — extracts optimization activity.
 *
 * Displays: Recent optimizations, History, Rollback availability,
 * Time saved, Health improvements, Trend.
 */
import type { WidgetProvider, WidgetProviderContext } from '../widgets/types';
import type { OptimizationActivityData, OptimizationEntry, CoreWidgetDataBundle } from './types';
import { getHealthTrend } from './types';

export class OptimizationHistoryProvider implements WidgetProvider {
  private _initialized = false;

  async initialize(): Promise<void> {
    this._initialized = true;
  }

  async load(context: WidgetProviderContext): Promise<OptimizationActivityData> {
    const bundle = (context as unknown as { dataBundle: CoreWidgetDataBundle }).dataBundle;
    const history = bundle?.aiContext?.history;

    if (!history) {
      return this._emptyData();
    }

    const recentOptimizations: OptimizationEntry[] = (history.optimizationHistory ?? []).slice(0, 10).map((entry) => ({
      timestamp: entry.timestamp,
      type: entry.type,
      itemsProcessed: entry.itemsProcessed,
      spaceFreedMB: entry.spaceFreedMB,
      durationSec: entry.durationSec,
      rollbackAvailable: true,
    }));

    const totalTimeSavedSec = recentOptimizations.reduce((sum, opt) => sum + opt.durationSec, 0);

    const trends = bundle.knowledge?.trends ?? [];
    const trend = trends.length > 0 ? getHealthTrend(trends[0]?.direction) : 'unknown';

    return {
      recentOptimizations,
      totalOptimizations: history.totalOptimizations,
      totalCleanedMB: history.totalCleanedMB,
      totalIssuesFixed: history.totalIssuesFixed,
      rollbackAvailable: true,
      totalTimeSavedSec,
      healthImprovements: history.totalIssuesFixed,
      trend,
    };
  }

  async refresh(context: WidgetProviderContext): Promise<OptimizationActivityData> {
    return this.load(context);
  }

  async dispose(): Promise<void> {
    this._initialized = false;
  }

  validate(): boolean {
    return this._initialized;
  }

  private _emptyData(): OptimizationActivityData {
    return {
      recentOptimizations: [],
      totalOptimizations: 0,
      totalCleanedMB: 0,
      totalIssuesFixed: 0,
      rollbackAvailable: false,
      totalTimeSavedSec: 0,
      healthImprovements: 0,
      trend: 'unknown',
    };
  }
}
