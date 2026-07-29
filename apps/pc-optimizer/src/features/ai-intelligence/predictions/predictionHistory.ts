/**
 * Prediction History — tracks prediction lifecycle and accuracy.
 *
 * Supports:
 *   History tracking, expiry detection, accuracy tracking, deduplication.
 */
import type {
  Prediction,
  PredictionHistoryEntry,
  PredictionAccuracyRecord,
  PredictionConfiguration,
} from './types';
import { generatePredictionHistoryId, clampScore } from './types';

export class PredictionHistory {
  private _entries: PredictionHistoryEntry[] = [];
  private _accuracyRecords: PredictionAccuracyRecord[] = [];
  private _seenIds: Map<string, string> = new Map();
  private _config: PredictionConfiguration;

  constructor(config: PredictionConfiguration) {
    this._config = config;
  }

  updateConfig(config: PredictionConfiguration): void {
    this._config = config;
  }

  recordGenerated(predictions: Prediction[]): void {
    if (!this._config.enableHistory) return;
    const now = new Date().toISOString();
    for (const pred of predictions) {
      this._seenIds.set(pred.id, now);
      this._addEntry({
        id: generatePredictionHistoryId(),
        predictionId: pred.id,
        action: 'generated',
        timestamp: now,
        metadata: { type: pred.predictionType, category: pred.category },
      });
    }
    this._trim();
  }

  recordUpdated(predictionId: string, changes: Record<string, unknown> = {}): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: generatePredictionHistoryId(),
      predictionId,
      action: 'updated',
      timestamp: new Date().toISOString(),
      metadata: changes,
    });
  }

  recordExpired(predictionId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: generatePredictionHistoryId(),
      predictionId,
      action: 'expired',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  recordFulfilled(predictionId: string, actualValue: number | string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: generatePredictionHistoryId(),
      predictionId,
      action: 'fulfilled',
      timestamp: new Date().toISOString(),
      metadata: { actualValue },
    });
  }

  recordInvalidated(predictionId: string, reason: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: generatePredictionHistoryId(),
      predictionId,
      action: 'invalidated',
      timestamp: new Date().toISOString(),
      metadata: { reason },
    });
  }

  recordDismissed(predictionId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: generatePredictionHistoryId(),
      predictionId,
      action: 'dismissed',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  recordAccuracy(prediction: Prediction, actualValue: number | string): PredictionAccuracyRecord | null {
    if (!this._config.enableAccuracyTracking) return null;

    const predicted = typeof prediction.predictedValue === 'number'
      ? prediction.predictedValue
      : parseFloat(String(prediction.predictedValue));
    const actual = typeof actualValue === 'number'
      ? actualValue
      : parseFloat(String(actualValue));

    if (isNaN(predicted) || isNaN(actual)) return null;

    const variance = Math.abs(predicted - actual);
    const accuracyScore = predicted !== 0
      ? clampScore(1 - variance / Math.abs(predicted))
      : actual === 0 ? 1 : 0;

    const record: PredictionAccuracyRecord = {
      predictionId: prediction.id,
      predictionType: prediction.predictionType,
      predictedValue: prediction.predictedValue,
      actualValue,
      variance,
      accuracyScore,
      generatedAt: prediction.generatedAt,
      fulfilledAt: new Date().toISOString(),
    };

    this._accuracyRecords.push(record);
    if (this._accuracyRecords.length > this._config.maxAccuracyRecords) {
      this._accuracyRecords = this._accuracyRecords.slice(-this._config.maxAccuracyRecords);
    }

    return record;
  }

  checkExpired(predictions: Prediction[]): string[] {
    if (!this._config.enableHistory) return [];
    const expired: string[] = [];
    const now = Date.now();

    for (const pred of predictions) {
      if (pred.status === 'expired') {
        expired.push(pred.id);
        continue;
      }
      if (pred.expiresAt) {
        const expiryTime = new Date(pred.expiresAt).getTime();
        if (expiryTime <= now) {
          pred.status = 'expired';
          expired.push(pred.id);
          this._addEntry({
            id: generatePredictionHistoryId(),
            predictionId: pred.id,
            action: 'expired',
            timestamp: new Date().toISOString(),
            metadata: {},
          });
        }
      }
    }

    return expired;
  }

  deduplicate(predictions: Prediction[]): Prediction[] {
    const seen = new Set<string>();
    const result: Prediction[] = [];
    for (const pred of predictions) {
      if (!seen.has(pred.id)) {
        seen.add(pred.id);
        result.push(pred);
      }
    }
    return result;
  }

  getEntries(): PredictionHistoryEntry[] {
    return [...this._entries];
  }

  getEntriesFor(predictionId: string): PredictionHistoryEntry[] {
    return this._entries.filter((e) => e.predictionId === predictionId);
  }

  getAccuracyRecords(): PredictionAccuracyRecord[] {
    return [...this._accuracyRecords];
  }

  getAccuracyFor(predictionId: string): PredictionAccuracyRecord | null {
    return this._accuracyRecords.find((r) => r.predictionId === predictionId) ?? null;
  }

  getAverageAccuracy(): number {
    if (this._accuracyRecords.length === 0) return 0;
    const sum = this._accuracyRecords.reduce((a, r) => a + r.accuracyScore, 0);
    return clampScore(sum / this._accuracyRecords.length);
  }

  hasSeen(predictionId: string): boolean {
    return this._seenIds.has(predictionId);
  }

  clear(): void {
    this._entries = [];
    this._accuracyRecords = [];
    this._seenIds.clear();
  }

  get count(): number {
    return this._entries.length;
  }

  get accuracyCount(): number {
    return this._accuracyRecords.length;
  }

  // ── Private ────────────────────────────────────────────────

  private _addEntry(entry: PredictionHistoryEntry): void {
    this._entries.push(entry);
    this._trim();
  }

  private _trim(): void {
    if (this._entries.length > this._config.maxHistoryEntries) {
      this._entries = this._entries.slice(-this._config.maxHistoryEntries);
    }
  }
}
