/**
 * PredictionHistory — tracks past predictions for accuracy validation
 * and learning.
 *
 * Stores prediction history locally. Never uploads data.
 * Used to validate prediction accuracy over time and improve
 * future forecasts.
 */
import type {
  PredictionHistoryEntry,
  PredictionHistoryData,
  Prediction,
  ForecastDomain,
} from './types';

export class PredictionHistory {
  private entries: PredictionHistoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  recordPrediction(prediction: Prediction): void {
    const entry: PredictionHistoryEntry = {
      id: `history-${prediction.id}`,
      predictionId: prediction.id,
      timestamp: prediction.createdAt,
      domain: prediction.domain,
      title: prediction.title,
      projectedValue: prediction.projectedValue,
      actualValue: null,
      accuracy: null,
      wasCorrect: null,
      confidence: prediction.confidence,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  validatePrediction(predictionId: string, actualValue: number): void {
    const entry = this.entries.find((e) => e.predictionId === predictionId);
    if (!entry) return;

    entry.actualValue = actualValue;
    const error = Math.abs(actualValue - entry.projectedValue);
    const percentError = entry.projectedValue !== 0
      ? (error / Math.abs(entry.projectedValue)) * 100
      : 0;
    entry.accuracy = Math.max(0, 1 - percentError / 100);
    entry.wasCorrect = percentError < 20;
  }

  getHistoryData(): PredictionHistoryData {
    const validated = this.entries.filter((e) => e.actualValue !== null);
    const correct = validated.filter((e) => e.wasCorrect === true).length;
    const incorrect = validated.filter((e) => e.wasCorrect === false).length;
    const pending = this.entries.filter((e) => e.actualValue === null).length;
    const avgAccuracy = validated.length > 0
      ? validated.reduce((sum, e) => sum + (e.accuracy ?? 0), 0) / validated.length
      : 0;

    const accuracyByDomain: Record<string, number> = {};
    const domains = new Set(validated.map((e) => e.domain));
    for (const domain of domains) {
      const domainEntries = validated.filter((e) => e.domain === domain);
      if (domainEntries.length > 0) {
        accuracyByDomain[domain] = domainEntries.reduce((sum, e) => sum + (e.accuracy ?? 0), 0) / domainEntries.length;
      }
    }

    return {
      entries: [...this.entries],
      totalPredictions: this.entries.length,
      correctPredictions: correct,
      incorrectPredictions: incorrect,
      pendingValidation: pending,
      averageAccuracy: Math.round(avgAccuracy * 100) / 100,
      accuracyByDomain,
    };
  }

  getEntriesByDomain(domain: ForecastDomain): PredictionHistoryEntry[] {
    return this.entries.filter((e) => e.domain === domain);
  }

  getLatestEntry(): PredictionHistoryEntry | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1]! : null;
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}
