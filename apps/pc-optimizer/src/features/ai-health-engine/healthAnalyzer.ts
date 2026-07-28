/**
 * HealthAnalyzer — the main orchestrator for the AI Health Engine.
 *
 * Coordinates all components:
 *   - Category analyzers (via registry)
 *   - Score calculator
 *   - Insight generator
 *   - Recommendation engine
 *   - Trend analyzer
 *   - Report builder
 *   - Cache
 *   - Events
 *
 * The analyzer NEVER modifies the system. It reads metrics and
 * history, produces a report, and emits events.
 *
 * This module is read-only with respect to all other systems.
 */
import type {
  HealthReport,
  HealthAnalysisInput,
  CategoryResult,
  CategoryWeights,
} from './types';
import { healthEvents } from './healthEvents';
import { HealthScoreCalculator } from './healthScoreCalculator';
import { createDefaultRegistry } from './healthCategoryAnalyzers';
import type { AnalyzerRegistry } from './healthCategoryAnalyzers';
import { HealthInsightGenerator } from './healthInsightGenerator';
import { RecommendationEngine } from './recommendationEngine';
import { TrendAnalyzer, type HealthSnapshot } from './trendAnalyzer';
import { HealthReportBuilder } from './healthReportBuilder';
import { HealthCache } from './healthCache';

export class HealthAnalyzer {
  private _registry: AnalyzerRegistry;
  private _scoreCalculator: HealthScoreCalculator;
  private _insightGenerator: HealthInsightGenerator;
  private _recommendationEngine: RecommendationEngine;
  private _trendAnalyzer: TrendAnalyzer;
  private _reportBuilder: HealthReportBuilder;
  private _cache: HealthCache;
  private _snapshots: HealthSnapshot[] = [];
  private _maxSnapshots = 1000;

  constructor(options?: {
    registry?: AnalyzerRegistry;
    scoreCalculator?: HealthScoreCalculator;
    insightGenerator?: HealthInsightGenerator;
    recommendationEngine?: RecommendationEngine;
    trendAnalyzer?: TrendAnalyzer;
    reportBuilder?: HealthReportBuilder;
    cache?: HealthCache;
  }) {
    this._registry = options?.registry ?? createDefaultRegistry();
    this._scoreCalculator = options?.scoreCalculator ?? new HealthScoreCalculator();
    this._insightGenerator = options?.insightGenerator ?? new HealthInsightGenerator();
    this._recommendationEngine = options?.recommendationEngine ?? new RecommendationEngine();
    this._trendAnalyzer = options?.trendAnalyzer ?? new TrendAnalyzer();
    this._reportBuilder = options?.reportBuilder ?? new HealthReportBuilder();
    this._cache = options?.cache ?? new HealthCache();
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Run a full health analysis and return a complete report.
   *
   * This is the main entry point. It:
   *   1. Checks cache for a valid result
   *   2. Runs all category analyzers
   *   3. Calculates the overall score
   *   4. Generates insights
   *   5. Generates recommendations
   *   6. Analyzes trends
   *   7. Builds and caches the report
   *   8. Emits events
   */
  async analyze(input: HealthAnalysisInput): Promise<HealthReport> {
    // Check cache first
    const cached = this._cache.get(input);
    if (cached) {
      healthEvents.emit('analysis_completed', { report: cached });
      return cached;
    }

    const startTime = new Date().toISOString();
    healthEvents.emit('health_analysis_started', { timestamp: startTime });

    try {
      // 1. Run all category analyzers
      const categoryResults: CategoryResult[] = [];
      for (const analyzer of this._registry.getAll()) {
        try {
          const result = analyzer.analyze(input);
          categoryResults.push(result);
          healthEvents.emit('category_completed', {
            categoryId: result.categoryId,
            result,
          });
        } catch (err) {
          console.error(`[HealthAnalyzer] Category ${analyzer.categoryId} failed:`, err);
        }
      }

      // 2. Calculate overall score
      const overallScore = this._scoreCalculator.calculate(categoryResults);
      healthEvents.emit('health_score_updated', { score: overallScore });

      // 3. Generate insights
      const insights = this._insightGenerator.generate(categoryResults, input);

      // 4. Generate recommendations
      const recommendations = this._recommendationEngine.generate(categoryResults, input);
      healthEvents.emit('recommendations_generated', { recommendations });

      // 5. Analyze trends
      const trends = this._trendAnalyzer.analyze(
        this._snapshots,
        overallScore.score,
        overallScore.categoryScores.map((cs) => ({
          categoryId: cs.categoryId,
          score: cs.score,
        })),
      );

      // 6. Build report
      const report = this._reportBuilder.build(
        overallScore,
        categoryResults,
        insights,
        recommendations,
        trends,
        false,
      );

      // 7. Store snapshot for future trend analysis
      const snapshot = this._trendAnalyzer.createSnapshot(overallScore);
      this._addSnapshot(snapshot);

      // 8. Cache the result
      this._cache.set(report, input);

      // 9. Emit completion
      healthEvents.emit('analysis_completed', { report });

      return report;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown analysis error';
      healthEvents.emit('analysis_failed', {
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }

  /**
   * Get the last cached report without running analysis.
   */
  getCachedReport(): HealthReport | null {
    if (!this._cache.isValid()) return null;
    // Return the cached entry with fromCache=true
    // We need to reconstruct by calling get with a dummy input
    // But since we don't have the original input, we return null
    // unless the caller uses analyze() which checks cache internally
    return null;
  }

  /**
   * Invalidate the cache, forcing a fresh analysis on next call.
   */
  invalidateCache(): void {
    this._cache.invalidate();
  }

  /**
   * Register a custom category analyzer.
   * Future modules use this to plug in without architecture changes.
   */
  registerAnalyzer(analyzer: { categoryId: string; categoryName: string; analyze(input: HealthAnalysisInput): CategoryResult }): void {
    this._registry.register(analyzer as never);
    this.invalidateCache();
  }

  /**
   * Unregister a category analyzer.
   */
  unregisterAnalyzer(categoryId: string): void {
    this._registry.unregister(categoryId as never);
    this.invalidateCache();
  }

  /**
   * Update category weights for score calculation.
   */
  setWeights(weights: Partial<CategoryWeights>): void {
    this._scoreCalculator.setWeights(weights);
    this.invalidateCache();
  }

  /**
   * Get all historical snapshots.
   */
  getSnapshots(): HealthSnapshot[] {
    return [...this._snapshots];
  }

  /**
   * Load historical snapshots (e.g., from persistent storage).
   */
  loadSnapshots(snapshots: HealthSnapshot[]): void {
    this._snapshots = [...snapshots].slice(-this._maxSnapshots);
  }

  /**
   * Set the cache TTL.
   */
  setCacheTtl(ttlMs: number): void {
    this._cache.setTtl(ttlMs);
  }

  // ── Internal ────────────────────────────────────────────────

  private _addSnapshot(snapshot: HealthSnapshot): void {
    this._snapshots.push(snapshot);
    if (this._snapshots.length > this._maxSnapshots) {
      this._snapshots = this._snapshots.slice(-this._maxSnapshots);
    }
  }
}

/**
 * Default singleton instance.
 */
export const healthAnalyzer = new HealthAnalyzer();
