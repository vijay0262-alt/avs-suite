/**
 * Trend Analyzer — analyzes trends in fact values over time.
 *
 * Supports: increasing, decreasing, stable, oscillating, unknown.
 * Trend calculations only. No predictions.
 */
import type {
  KnowledgeFact,
  KnowledgeTrend,
  TrendDirection,
  TrendDataPoint,
  ContextSnapshot,
} from './types';
import { generateTrendId } from './types';
import type { EvidenceBuilder } from './evidenceBuilder';

export class TrendAnalyzer {
  private _evidenceBuilder: EvidenceBuilder;
  private _snapshots: ContextSnapshot[] = [];

  constructor(evidenceBuilder: EvidenceBuilder) {
    this._evidenceBuilder = evidenceBuilder;
  }

  /**
   * Add a snapshot for trend analysis.
   */
  addSnapshot(snapshot: ContextSnapshot): void {
    this._snapshots.push(snapshot);
    // Keep only the most recent snapshots
    if (this._snapshots.length > 20) {
      this._snapshots = this._snapshots.slice(-20);
    }
  }

  /**
   * Set snapshots directly (e.g. from storage).
   */
  setSnapshots(snapshots: ContextSnapshot[]): void {
    this._snapshots = [...snapshots].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /**
   * Get all snapshots.
   */
  getSnapshots(): ContextSnapshot[] {
    return [...this._snapshots];
  }

  /**
   * Analyze trends for all numeric facts.
   */
  analyzeTrends(facts: KnowledgeFact[]): KnowledgeTrend[] {
    const trends: KnowledgeTrend[] = [];

    for (const fact of facts) {
      if (fact.dataType !== 'number') continue;
      const numericValue = typeof fact.value === 'number' ? fact.value : null;
      if (numericValue === null) continue;

      const dataPoints = this._collectDataPoints(fact.id);
      if (dataPoints.length < 2) continue;

      const direction = this._determineDirection(dataPoints);
      const slope = this._calculateSlope(dataPoints);
      const variability = this._calculateVariability(dataPoints);

      trends.push({
        id: generateTrendId(fact.id),
        factId: fact.id,
        factName: fact.name,
        direction,
        dataPoints,
        slope,
        variability,
        evidence: this._evidenceBuilder.forFact(
          `${fact.name} trend is ${direction}`,
          direction,
          fact.sourceProvider,
          fact.extractedAt,
          fact.confidence,
        ),
        analyzedAt: new Date().toISOString(),
      });
    }

    return trends;
  }

  /**
   * Clear all snapshots.
   */
  clearSnapshots(): void {
    this._snapshots = [];
  }

  // ── Private ────────────────────────────────────────────────

  private _collectDataPoints(factId: string): TrendDataPoint[] {
    const points: TrendDataPoint[] = [];

    for (const snapshot of this._snapshots) {
      const snapFact = snapshot.facts.find((f) => f.id === factId);
      if (snapFact && typeof snapFact.value === 'number') {
        points.push({
          timestamp: snapFact.timestamp,
          value: snapFact.value,
        });
      }
    }

    return points;
  }

  private _determineDirection(points: TrendDataPoint[]): TrendDirection {
    if (points.length < 2) return 'unknown';

    const values = points.map((p) => p.value);
    const slope = this._calculateSlope(points);
    if (slope === null) return 'unknown';

    const threshold = 0.01; // 1% change threshold
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    if (avg === 0) return 'stable';
    const relativeSlope = Math.abs(slope) / Math.abs(avg);

    if (relativeSlope < threshold) {
      // Check for oscillation
      const variability = this._calculateVariability(points);
      if (variability !== null && variability > 0.1) {
        return 'oscillating';
      }
      return 'stable';
    }

    return slope > 0 ? 'increasing' : 'decreasing';
  }

  private _calculateSlope(points: TrendDataPoint[]): number | null {
    if (points.length < 2) return null;

    const n = points.length;
    const xMean = (n - 1) / 2;
    const yMean = points.reduce((sum, p) => sum + p.value, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (points[i]!.value - yMean);
      denominator += (i - xMean) ** 2;
    }

    if (denominator === 0) return null;
    return numerator / denominator;
  }

  private _calculateVariability(points: TrendDataPoint[]): number | null {
    if (points.length < 2) return null;

    const values = points.map((p) => p.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    if (mean === 0) return 0;

    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance) / Math.abs(mean);
  }
}
