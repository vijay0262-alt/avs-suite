/**
 * Prediction Widget Provider — extracts prediction summary.
 *
 * Displays: Health trend, Storage prediction, Startup prediction,
 * Maintenance forecast, Upcoming concerns, Prediction confidence.
 */
import type { WidgetProvider, WidgetProviderContext } from '../widgets/types';
import type { PredictionData, PredictionDisplayItem, CoreWidgetDataBundle } from './types';
import { getHealthTrend } from './types';

export class PredictionProvider implements WidgetProvider {
  private _initialized = false;

  async initialize(): Promise<void> {
    this._initialized = true;
  }

  async load(context: WidgetProviderContext): Promise<PredictionData> {
    const bundle = (context as unknown as { dataBundle: CoreWidgetDataBundle }).dataBundle;
    const predictions = bundle?.predictions;

    if (!predictions || !predictions.predictions || predictions.predictions.length === 0) {
      return this._emptyData();
    }

    const items: PredictionDisplayItem[] = predictions.predictions.map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.summary,
      category: p.category,
      predictionType: p.predictionType,
      currentValue: String(p.currentValue),
      predictedValue: String(p.predictedValue),
      unit: p.unit,
      confidenceScore: p.confidenceScore,
      trend: p.trend,
      riskLevel: p.riskLevel,
      timeHorizon: p.timeHorizon,
    }));

    const trends = bundle.knowledge?.trends ?? [];
    const healthTrend = trends.length > 0 ? getHealthTrend(trends[0]?.direction) : 'unknown';

    const storagePred = predictions.predictions.find((p) => p.predictionType === 'storage_capacity' || p.predictionType === 'disk_consumption');
    const startupPred = predictions.predictions.find((p) => p.predictionType === 'startup_growth');
    const maintenancePred = predictions.predictions.find((p) => p.predictionType === 'maintenance_requirement' || p.predictionType === 'windows_maintenance');

    const upcomingConcerns = predictions.predictions
      .filter((p) => p.riskLevel === 'high' || p.riskLevel === 'critical')
      .map((p) => p.title);

    const avgConfidence = predictions.predictions.reduce((sum, p) => sum + p.confidenceScore, 0) /
      (predictions.predictions.length || 1);

    return {
      predictions: items,
      healthTrend,
      storagePrediction: storagePred?.summary ?? null,
      startupPrediction: startupPred?.summary ?? null,
      maintenanceForecast: maintenancePred?.summary ?? null,
      upcomingConcerns,
      predictionConfidence: avgConfidence,
    };
  }

  async refresh(context: WidgetProviderContext): Promise<PredictionData> {
    return this.load(context);
  }

  async dispose(): Promise<void> {
    this._initialized = false;
  }

  validate(): boolean {
    return this._initialized;
  }

  private _emptyData(): PredictionData {
    return {
      predictions: [],
      healthTrend: 'unknown',
      storagePrediction: null,
      startupPrediction: null,
      maintenanceForecast: null,
      upcomingConcerns: [],
      predictionConfidence: 0,
    };
  }
}
