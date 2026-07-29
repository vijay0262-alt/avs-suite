/**
 * Widget Telemetry — tracks widget performance and usage metrics.
 *
 * Tracks:
 *   Load Time, Refresh Time, Errors, Interactions,
 *   Action Usage, Widget Visibility, Performance Metrics.
 *
 * Telemetry is optional and configurable.
 */
import type {
  WidgetTelemetryData,
  TelemetryRules,
  WidgetFrameworkConfiguration,
} from './types';
import { createTelemetryData } from './types';

export class WidgetTelemetry {
  private _rules: TelemetryRules;
  private _data: Map<string, WidgetTelemetryData> = new Map();
  private _totalLoadTime: number = 0;
  private _totalRefreshTime: number = 0;
  private _loadCount: number = 0;
  private _refreshCount: number = 0;

  constructor(config: WidgetFrameworkConfiguration) {
    this._rules = config.telemetryRules;
  }

  updateConfig(config: WidgetFrameworkConfiguration): void {
    this._rules = config.telemetryRules;
  }

  initWidget(widgetId: string): void {
    if (!this._rules.enabled) return;
    this._data.set(widgetId, createTelemetryData());
  }

  recordLoad(widgetId: string, loadTimeMs: number): void {
    if (!this._rules.enabled || !this._rules.trackLoadTime) return;
    const data = this._data.get(widgetId);
    if (!data) return;
    data.loadTimeMs = loadTimeMs;
    this._totalLoadTime += loadTimeMs;
    this._loadCount++;
  }

  recordRefresh(widgetId: string, refreshTimeMs: number): void {
    if (!this._rules.enabled || !this._rules.trackRefreshTime) return;
    const data = this._data.get(widgetId);
    if (!data) return;
    data.refreshTimeMs = refreshTimeMs;
    this._totalRefreshTime += refreshTimeMs;
    this._refreshCount++;
  }

  recordError(widgetId: string): void {
    if (!this._rules.enabled || !this._rules.trackErrors) return;
    const data = this._data.get(widgetId);
    if (!data) return;
    data.errorCount++;
  }

  recordInteraction(widgetId: string): void {
    if (!this._rules.enabled || !this._rules.trackInteractions) return;
    const data = this._data.get(widgetId);
    if (!data) return;
    data.interactionCount++;
  }

  recordActionUsage(widgetId: string, actionId: string): void {
    if (!this._rules.enabled || !this._rules.trackActionUsage) return;
    const data = this._data.get(widgetId);
    if (!data) return;
    data.actionUsage[actionId] = (data.actionUsage[actionId] ?? 0) + 1;
  }

  recordVisibilityChange(widgetId: string, visible: boolean): void {
    if (!this._rules.enabled || !this._rules.trackVisibility) return;
    const data = this._data.get(widgetId);
    if (!data) return;
    data.visibilityChanges++;
    if (visible) {
      data.lastVisibleAt = new Date().toISOString();
    } else {
      data.lastHiddenAt = new Date().toISOString();
    }
  }

  recordPerformance(widgetId: string, metric: string, value: number): void {
    if (!this._rules.enabled || !this._rules.trackPerformance) return;
    const data = this._data.get(widgetId);
    if (!data) return;
    data.performanceMetrics[metric] = value;
  }

  getWidgetTelemetry(widgetId: string): WidgetTelemetryData | undefined {
    return this._data.get(widgetId);
  }

  get averageLoadTimeMs(): number {
    return this._loadCount > 0 ? this._totalLoadTime / this._loadCount : 0;
  }

  get averageRefreshTimeMs(): number {
    return this._refreshCount > 0 ? this._totalRefreshTime / this._refreshCount : 0;
  }

  get totalErrors(): number {
    let total = 0;
    for (const data of this._data.values()) {
      total += data.errorCount;
    }
    return total;
  }

  get totalInteractions(): number {
    let total = 0;
    for (const data of this._data.values()) {
      total += data.interactionCount;
    }
    return total;
  }

  get totalRefreshes(): number {
    return this._refreshCount;
  }

  removeWidget(widgetId: string): void {
    this._data.delete(widgetId);
  }

  clear(): void {
    this._data.clear();
    this._totalLoadTime = 0;
    this._totalRefreshTime = 0;
    this._loadCount = 0;
    this._refreshCount = 0;
  }
}
