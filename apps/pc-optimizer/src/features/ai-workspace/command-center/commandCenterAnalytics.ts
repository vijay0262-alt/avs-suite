/**
 * AI Command Center — Analytics
 *
 * EPIC 5 PHASE A PART 3
 *
 * Aggregate analytics for dashboard usage. No personal data.
 */
import type { CommandCenterAnalytics as CommandCenterAnalyticsData } from './types';

export class CommandCenterAnalytics {
  private _totalDashboardLoads: number = 0;
  private _totalWidgetRefreshes: number = 0;
  private _totalLayoutSaves: number = 0;
  private _totalLayoutLoads: number = 0;
  private _byWidget: Map<string, number> = new Map();
  private _loadTimeSum: number = 0;
  private _refreshTimeSum: number = 0;

  recordDashboardLoad(loadTimeMs: number): void {
    this._totalDashboardLoads++;
    this._loadTimeSum += loadTimeMs;
  }

  recordWidgetRefresh(widgetId: string, refreshTimeMs: number): void {
    this._totalWidgetRefreshes++;
    this._byWidget.set(widgetId, (this._byWidget.get(widgetId) ?? 0) + 1);
    this._refreshTimeSum += refreshTimeMs;
  }

  recordLayoutSave(): void {
    this._totalLayoutSaves++;
  }

  recordLayoutLoad(): void {
    this._totalLayoutLoads++;
  }

  getAnalytics(): CommandCenterAnalyticsData {
    const byWidget: Record<string, number> = {};
    for (const [key, val] of this._byWidget) byWidget[key] = val;

    return {
      totalDashboardLoads: this._totalDashboardLoads,
      totalWidgetRefreshes: this._totalWidgetRefreshes,
      totalLayoutSaves: this._totalLayoutSaves,
      totalLayoutLoads: this._totalLayoutLoads,
      byWidget,
      averageLoadTimeMs: this._totalDashboardLoads > 0 ? this._loadTimeSum / this._totalDashboardLoads : 0,
      averageRefreshTimeMs: this._totalWidgetRefreshes > 0 ? this._refreshTimeSum / this._totalWidgetRefreshes : 0,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  reset(): void {
    this._totalDashboardLoads = 0;
    this._totalWidgetRefreshes = 0;
    this._totalLayoutSaves = 0;
    this._totalLayoutLoads = 0;
    this._byWidget.clear();
    this._loadTimeSum = 0;
    this._refreshTimeSum = 0;
  }
}
