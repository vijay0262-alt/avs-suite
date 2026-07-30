/**
 * Multimodal AI Interaction Platform — Analytics
 *
 * EPIC 5 PHASE A PART 6
 *
 * Aggregates usage analytics for multimodal interactions.
 * No personal data. Tracks modality usage, processing times, errors.
 */
import type {
  MultimodalAnalyticsData,
  InputModality,
  InputSource,
  ProcessingResult,
  MultimodalInput,
} from './types';

export class MultimodalAnalytics {
  private _totalInputs: number = 0;
  private _byModality: Map<string, number> = new Map();
  private _bySource: Map<string, number> = new Map();
  private _processingTimes: number[] = [];
  private _totalAttachments: number = 0;
  private _totalVoiceSessions: number = 0;
  private _totalErrors: number = 0;
  private _confidences: number[] = [];

  recordInput(input: MultimodalInput): void {
    this._totalInputs++;
    this._byModality.set(input.modality, (this._byModality.get(input.modality) ?? 0) + 1);
    this._bySource.set(input.source, (this._bySource.get(input.source) ?? 0) + 1);
  }

  recordProcessing(result: ProcessingResult): void {
    this._processingTimes.push(result.processingTimeMs);
    if (this._processingTimes.length > 1000) this._processingTimes.shift();
    if (result.errors.length > 0) this._totalErrors += result.errors.length;
    this._confidences.push(result.normalizedInput.confidence);
    if (this._confidences.length > 1000) this._confidences.shift();
  }

  recordAttachment(): void {
    this._totalAttachments++;
  }

  recordVoiceSession(): void {
    this._totalVoiceSessions++;
  }

  getAnalytics(): MultimodalAnalyticsData {
    const avgProcessingTime = this._processingTimes.length > 0
      ? this._processingTimes.reduce((a, b) => a + b, 0) / this._processingTimes.length
      : 0;
    const avgConfidence = this._confidences.length > 0
      ? this._confidences.reduce((a, b) => a + b, 0) / this._confidences.length
      : 0;

    return {
      totalInputs: this._totalInputs,
      byModality: Object.fromEntries(this._byModality),
      bySource: Object.fromEntries(this._bySource),
      averageProcessingTimeMs: avgProcessingTime,
      totalAttachments: this._totalAttachments,
      totalVoiceSessions: this._totalVoiceSessions,
      totalErrors: this._totalErrors,
      averageConfidence: avgConfidence,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  getByModality(modality: InputModality): number {
    return this._byModality.get(modality) ?? 0;
  }

  getBySource(source: InputSource): number {
    return this._bySource.get(source) ?? 0;
  }

  reset(): void {
    this._totalInputs = 0;
    this._byModality.clear();
    this._bySource.clear();
    this._processingTimes = [];
    this._totalAttachments = 0;
    this._totalVoiceSessions = 0;
    this._totalErrors = 0;
    this._confidences = [];
  }
}
