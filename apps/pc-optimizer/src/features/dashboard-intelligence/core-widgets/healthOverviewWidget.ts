/**
 * Health Overview Widget Provider — extracts health data from AI Context.
 *
 * Displays: Overall Health Score, Health Trend, Health Confidence,
 * Last Scan, Health Status, Recent Changes, Health Summary,
 * Health Category Breakdown.
 */
import type { WidgetProvider, WidgetProviderContext } from '../widgets/types';
import type { HealthOverviewData, HealthCategoryEntry, CoreWidgetDataBundle } from './types';
import { getHealthStatus, getHealthTrend } from './types';

export class HealthOverviewProvider implements WidgetProvider {
  private _initialized = false;

  async initialize(): Promise<void> {
    this._initialized = true;
  }

  async load(context: WidgetProviderContext): Promise<HealthOverviewData> {
    const bundle = (context as unknown as { dataBundle: CoreWidgetDataBundle }).dataBundle;
    const health = bundle?.aiContext?.health;

    if (!health) {
      return this._emptyData();
    }

    const overallScore = health.overallScore;
    const healthStatus = getHealthStatus(overallScore);

    const trends = bundle.knowledge?.trends ?? [];
    const healthTrend = trends.length > 0 ? getHealthTrend(trends[0]?.direction) : 'unknown';

    const confidence = health.provenance?.confidence ?? 0;

    const changes = bundle.knowledge?.changes ?? [];
    const recentChanges = changes.slice(0, 5).map((c) => c.deltaDescription);

    const summaries = bundle.knowledge?.summaries ?? [];
    const healthSummary = summaries.find((s) => s.type === 'health')?.title ??
      `Overall health score is ${overallScore}. Status: ${healthStatus}.`;

    const categoryBreakdown: HealthCategoryEntry[] = [
      { category: 'cpu', label: 'CPU', score: health.cpuScore, status: getHealthStatus(health.cpuScore) },
      { category: 'ram', label: 'RAM', score: health.ramScore, status: getHealthStatus(health.ramScore) },
      { category: 'disk', label: 'Disk', score: health.diskScore, status: getHealthStatus(health.diskScore) },
      { category: 'stability', label: 'Stability', score: health.stabilityScore, status: getHealthStatus(health.stabilityScore) },
      { category: 'security', label: 'Security', score: health.securityScore, status: getHealthStatus(health.securityScore) },
    ];

    return {
      overallScore,
      cpuScore: health.cpuScore,
      ramScore: health.ramScore,
      diskScore: health.diskScore,
      stabilityScore: health.stabilityScore,
      securityScore: health.securityScore,
      healthTrend,
      healthConfidence: confidence,
      lastScanAt: health.provenance?.collectedAt ?? null,
      healthStatus,
      recentChanges,
      healthSummary,
      categoryBreakdown,
    };
  }

  async refresh(context: WidgetProviderContext): Promise<HealthOverviewData> {
    return this.load(context);
  }

  async dispose(): Promise<void> {
    this._initialized = false;
  }

  validate(): boolean {
    return this._initialized;
  }

  private _emptyData(): HealthOverviewData {
    return {
      overallScore: 0,
      cpuScore: 0,
      ramScore: 0,
      diskScore: 0,
      stabilityScore: 0,
      securityScore: 0,
      healthTrend: 'unknown',
      healthConfidence: 0,
      lastScanAt: null,
      healthStatus: 'unknown',
      recentChanges: [],
      healthSummary: 'No health data available.',
      categoryBreakdown: [],
    };
  }
}
