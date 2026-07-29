/**
 * Prediction Timeline — tracks prediction events over time.
 *
 * Supports daily, weekly, monthly, yearly periods.
 */
import type {
  PredictionTimelineEntry,
  PredictionTimelinePeriod,
  PredictionTimeline as Timeline,
  Prediction,
  PredictionConfiguration,
} from './types';
import { generatePredictionTimelineEntryId } from './types';

export class PredictionTimelineManager {
  private _entries: PredictionTimelineEntry[] = [];
  private _config: PredictionConfiguration;

  constructor(config: PredictionConfiguration) {
    this._config = config;
  }

  updateConfig(config: PredictionConfiguration): void {
    this._config = config;
  }

  addEntry(entry: PredictionTimelineEntry): void {
    if (!this._config.enableTimeline) return;
    this._entries.push(entry);
    this._trim();
  }

  addPrediction(prediction: Prediction): void {
    if (!this._config.enableTimeline) return;
    this.addEntry({
      id: generatePredictionTimelineEntryId(),
      timestamp: prediction.generatedAt,
      type: 'prediction',
      title: prediction.title,
      description: prediction.summary,
      category: prediction.category,
      confidence: prediction.confidenceScore,
      riskLevel: prediction.riskLevel,
      metadata: { predictionId: prediction.id, type: prediction.predictionType },
    });
  }

  addFulfillment(prediction: Prediction, actualValue: number | string): void {
    if (!this._config.enableTimeline) return;
    this.addEntry({
      id: generatePredictionTimelineEntryId(),
      timestamp: new Date().toISOString(),
      type: 'fulfillment',
      title: `Fulfilled: ${prediction.title}`,
      description: `Predicted ${prediction.predictedValue}, actual ${actualValue}`,
      category: prediction.category,
      confidence: prediction.confidenceScore,
      riskLevel: prediction.riskLevel,
      metadata: { predictionId: prediction.id, predicted: prediction.predictedValue, actual: actualValue },
    });
  }

  addExpiration(predictionId: string, title: string, category: Prediction['category']): void {
    if (!this._config.enableTimeline) return;
    this.addEntry({
      id: generatePredictionTimelineEntryId(),
      timestamp: new Date().toISOString(),
      type: 'expiration',
      title: `Expired: ${title}`,
      description: 'Prediction has expired',
      category,
      confidence: 0,
      riskLevel: 'none',
      metadata: { predictionId },
    });
  }

  addTrendChange(predictionId: string, title: string, oldTrend: string, newTrend: string, category: Prediction['category']): void {
    if (!this._config.enableTimeline) return;
    this.addEntry({
      id: generatePredictionTimelineEntryId(),
      timestamp: new Date().toISOString(),
      type: 'trend_change',
      title: `Trend changed: ${title}`,
      description: `Trend changed from ${oldTrend} to ${newTrend}`,
      category,
      confidence: 0,
      riskLevel: 'none',
      metadata: { predictionId, oldTrend, newTrend },
    });
  }

  getTimeline(period: PredictionTimelinePeriod = 'daily', startDate?: string, endDate?: string): Timeline {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (period) {
      case 'daily':
        start = new Date(now);
        start.setDate(start.getDate() - 1);
        break;
      case 'weekly':
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        break;
      case 'monthly':
        start = new Date(now);
        start.setMonth(start.getMonth() - 1);
        break;
      case 'yearly':
        start = new Date(now);
        start.setFullYear(start.getFullYear() - 1);
        break;
      default:
        start = new Date(0);
    }

    if (startDate) start = new Date(startDate);
    if (endDate) end = new Date(endDate);

    const entries = this._entries.filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      return ts >= start.getTime() && ts <= end.getTime();
    });

    return {
      entries: entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalEntries: entries.length,
    };
  }

  getEntries(): PredictionTimelineEntry[] {
    return [...this._entries];
  }

  getEntriesByType(type: PredictionTimelineEntry['type']): PredictionTimelineEntry[] {
    return this._entries.filter((e) => e.type === type);
  }

  clear(): void {
    this._entries = [];
  }

  get count(): number {
    return this._entries.length;
  }

  // ── Private ────────────────────────────────────────────────

  private _trim(): void {
    if (this._entries.length > this._config.maxTimelineEntries) {
      this._entries = this._entries.slice(-this._config.maxTimelineEntries);
    }
  }
}
