/**
 * Prediction Model — builds individual prediction objects.
 *
 * Combines trend analysis results with knowledge facts to produce
 * structured, evidence-based predictions.
 *
 * NEVER fabricates forecasts. Every prediction is derived from
 * historical data and trend analysis.
 */
import type {
  Prediction,
  PredictionType,
  PredictionCategory,
  RiskLevel,
  ImpactLevel,
  TimeHorizon,
  PredictionConfiguration,
  KnowledgeObject,
  KnowledgeFact,
  KnowledgeTrend,
  TrendAnalysisResult,
  TrendDataPoint,
} from './types';
import {
  generatePredictionId,
  clampScore,
  createPredictionEvidence,
  getTimeHorizonHours,
  formatDateForHorizon,
} from './types';

export class PredictionModel {
  private _config: PredictionConfiguration;

  constructor(config: PredictionConfiguration) {
    this._config = config;
  }

  updateConfig(config: PredictionConfiguration): void {
    this._config = config;
  }

  /**
   * Build a prediction from trend analysis.
   */
  buildPrediction(
    type: PredictionType,
    category: PredictionCategory,
    title: string,
    summary: string,
    description: string,
    currentValue: number,
    predictedValue: number,
    unit: string | null,
    horizon: TimeHorizon,
    analysis: TrendAnalysisResult,
    facts: KnowledgeFact[],
    trends: KnowledgeTrend[],
    knowledge: KnowledgeObject,
    assumptions: string[],
  ): Prediction | null {
    // Never generate predictions without sufficient history
    if (analysis.sampleCount < this._config.confidenceRules.minSamples) return null;

    const confidence = this._calculatePredictionConfidence(analysis);
    if (confidence < this._config.minConfidenceThreshold) return null;

    const riskLevel = this._deriveRiskLevel(confidence, predictedValue, currentValue, category);
    const impactLevel = this._deriveImpactLevel(predictedValue, currentValue, category);
    const predictionDate = formatDateForHorizon(horizon);
    const expiresAt = this._getExpirationDate(horizon);

    const dataFreshness = this._calculateDataFreshness(analysis.dataPoints);
    const sourceProviders = [...new Set(facts.map((f) => f.sourceProvider))];

    const evidence = createPredictionEvidence(
      facts,
      trends,
      [knowledge.metadata.knowledgeId],
      analysis.dataPoints,
      sourceProviders,
      confidence,
      analysis.sampleCount,
      dataFreshness,
      this._config.modelSettings.modelVersion,
      assumptions,
    );

    return {
      id: generatePredictionId(type, title),
      title,
      summary,
      description,
      category,
      predictionType: type,
      currentValue,
      predictedValue,
      unit,
      predictionDate,
      timeHorizon: horizon,
      confidenceScore: clampScore(confidence),
      trend: analysis.direction,
      trendSlope: analysis.slope,
      riskLevel,
      impactLevel,
      evidence,
      relatedKnowledge: [knowledge.metadata.knowledgeId],
      relatedInsights: [],
      generatedAt: new Date().toISOString(),
      expiresAt,
      status: 'active',
      futureMetadata: {},
    };
  }

  /**
   * Build a storage capacity prediction.
   */
  buildStoragePrediction(
    analysis: TrendAnalysisResult,
    facts: KnowledgeFact[],
    trends: KnowledgeTrend[],
    knowledge: KnowledgeObject,
    horizon: TimeHorizon,
  ): Prediction | null {
    const usedFact = facts.find((f) => f.name === 'used_space' || f.name === 'used_mb');
    const totalFact = facts.find((f) => f.name === 'total_capacity' || f.name === 'total_mb');
    const currentUsed = usedFact && typeof usedFact.value === 'number' ? usedFact.value : 0;
    const totalCapacity = totalFact && typeof totalFact.value === 'number' ? totalFact.value : 0;

    if (totalCapacity === 0) return null;

    const projectedUsed = analysis.projectedValues.length > 0
      ? analysis.projectedValues[0]!.value
      : currentUsed;

    const daysToFull = analysis.slope && analysis.slope > 0
      ? Math.ceil((totalCapacity - currentUsed) / (analysis.slope * 24 * 60 * 60 * 1000))
      : null;

    const summary = `Based on the current trend, storage usage is ${analysis.direction}. ${daysToFull !== null ? `Disk may reach capacity in approximately ${daysToFull} days.` : 'No immediate capacity risk detected.'}`;

    const description = [
      '## Storage Capacity Prediction',
      '',
      `**Current usage:** ${currentUsed}MB of ${totalCapacity}MB`,
      `**Projected usage:** ${Math.round(projectedUsed)}MB`,
      `**Trend:** ${analysis.direction}`,
      `**Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`,
      '',
      daysToFull !== null && daysToFull > 0
        ? `At the current rate, disk may reach capacity in approximately **${daysToFull} days**.`
        : 'No immediate capacity risk detected.',
      '',
      '**Assumptions:**',
      `- Storage growth continues at the current rate`,
      `- No large files are manually removed`,
      `- No optimization is performed`,
    ].join('\n');

    return this.buildPrediction(
      'storage_capacity', 'storage',
      'Storage Capacity Forecast', summary, description,
      currentUsed, Math.round(projectedUsed), 'MB',
      horizon, analysis, facts, trends, knowledge,
      [
        'Storage growth continues at the current rate',
        'No large files are manually removed',
        'No optimization is performed',
      ],
    );
  }

  /**
   * Build a health score trend prediction.
   */
  buildHealthPrediction(
    analysis: TrendAnalysisResult,
    facts: KnowledgeFact[],
    trends: KnowledgeTrend[],
    knowledge: KnowledgeObject,
    horizon: TimeHorizon,
  ): Prediction | null {
    const scoreFact = facts.find((f) => f.name === 'overall_score');
    const currentScore = scoreFact && typeof scoreFact.value === 'number' ? scoreFact.value : 0;

    const projectedScore = analysis.projectedValues.length > 0
      ? Math.max(0, Math.min(100, analysis.projectedValues[0]!.value))
      : currentScore;

    const direction = analysis.direction;
    const summary = `Health score is ${direction === 'increasing' ? 'improving' : direction === 'decreasing' ? 'declining' : 'stable'}. Current: ${currentScore}, projected: ${Math.round(projectedScore)}.`;

    const description = [
      '## Health Score Trend Prediction',
      '',
      `**Current score:** ${currentScore}`,
      `**Projected score:** ${Math.round(projectedScore)}`,
      `**Trend:** ${direction}`,
      `**Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`,
      '',
      direction === 'increasing'
        ? 'Your system health is steadily improving. Keep up the good work!'
        : direction === 'decreasing'
          ? 'Your system health is declining. Consider running optimizations soon.'
          : 'Your system health is stable.',
    ].join('\n');

    return this.buildPrediction(
      'health_score_trend', 'health',
      'Health Score Trend', summary, description,
      currentScore, Math.round(projectedScore), null,
      horizon, analysis, facts, trends, knowledge,
      [
        'Health score trend continues at the current rate',
        'No major system changes occur',
      ],
    );
  }

  /**
   * Build a startup growth prediction.
   */
  buildStartupGrowthPrediction(
    analysis: TrendAnalysisResult,
    facts: KnowledgeFact[],
    trends: KnowledgeTrend[],
    knowledge: KnowledgeObject,
    horizon: TimeHorizon,
  ): Prediction | null {
    const enabledFact = facts.find((f) => f.name === 'enabled_items');
    const currentCount = enabledFact && typeof enabledFact.value === 'number' ? enabledFact.value : 0;

    const projectedCount = analysis.projectedValues.length > 0
      ? Math.max(0, Math.round(analysis.projectedValues[0]!.value))
      : currentCount;

    const growthPercent = currentCount > 0
      ? Math.round(((projectedCount - currentCount) / currentCount) * 100)
      : 0;

    const summary = `Startup applications have ${analysis.direction === 'increasing' ? 'increased' : analysis.direction === 'decreasing' ? 'decreased' : 'remained stable'}. ${growthPercent > 0 ? `Projected growth: +${growthPercent}%` : ''}.`;

    const description = [
      '## Startup Growth Prediction',
      '',
      `**Current startup items:** ${currentCount}`,
      `**Projected startup items:** ${projectedCount}`,
      `**Growth:** ${growthPercent > 0 ? '+' : ''}${growthPercent}%`,
      `**Trend:** ${analysis.direction}`,
      `**Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`,
    ].join('\n');

    return this.buildPrediction(
      'startup_growth', 'startup',
      'Startup Growth Forecast', summary, description,
      currentCount, projectedCount, 'items',
      horizon, analysis, facts, trends, knowledge,
      [
        'Startup item growth continues at the current rate',
        'No manual startup management is performed',
      ],
    );
  }

  /**
   * Build a browser cache growth prediction.
   */
  buildBrowserCachePrediction(
    analysis: TrendAnalysisResult,
    facts: KnowledgeFact[],
    trends: KnowledgeTrend[],
    knowledge: KnowledgeObject,
    horizon: TimeHorizon,
  ): Prediction | null {
    const cacheFact = facts.find((f) => f.name === 'total_cache' || f.name === 'cache_mb');
    const currentCache = cacheFact && typeof cacheFact.value === 'number' ? cacheFact.value : 0;

    const projectedCache = analysis.projectedValues.length > 0
      ? Math.max(0, analysis.projectedValues[0]!.value)
      : currentCache;

    const growthRate = analysis.slope ? analysis.slope * 24 * 60 * 60 * 1000 : 0;

    const summary = `Browser cache is ${analysis.direction === 'increasing' ? 'growing' : analysis.direction === 'decreasing' ? 'shrinking' : 'stable'}. ${growthRate > 0 ? `Growing ~${growthRate.toFixed(1)}MB/day.` : ''}`;

    const description = [
      '## Browser Cache Growth Prediction',
      '',
      `**Current cache size:** ${currentCache}MB`,
      `**Projected cache size:** ${Math.round(projectedCache)}MB`,
      `**Growth rate:** ${growthRate > 0 ? '+' : ''}${growthRate.toFixed(1)}MB/day`,
      `**Trend:** ${analysis.direction}`,
      `**Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`,
      '',
      growthRate > 5
        ? 'Browser cache is growing faster than normal. Consider clearing cache periodically.'
        : 'Cache growth is within normal range.',
    ].join('\n');

    return this.buildPrediction(
      'browser_cache_growth', 'browser',
      'Browser Cache Growth', summary, description,
      currentCache, Math.round(projectedCache), 'MB',
      horizon, analysis, facts, trends, knowledge,
      [
        'Browser usage patterns remain similar',
        'No manual cache clearing is performed',
      ],
    );
  }

  /**
   * Build a generic prediction from trend analysis for a given type.
   */
  buildGenericPrediction(
    type: PredictionType,
    category: PredictionCategory,
    title: string,
    unit: string | null,
    analysis: TrendAnalysisResult,
    facts: KnowledgeFact[],
    trends: KnowledgeTrend[],
    knowledge: KnowledgeObject,
    horizon: TimeHorizon,
    assumptions: string[],
  ): Prediction | null {
    const currentValue = analysis.dataPoints.length > 0
      ? analysis.dataPoints[analysis.dataPoints.length - 1]!.value
      : 0;

    const projectedValue = analysis.projectedValues.length > 0
      ? analysis.projectedValues[0]!.value
      : currentValue;

    const summary = `${title}: currently ${currentValue}${unit ? ' ' + unit : ''}, projected ${Math.round(projectedValue)}${unit ? ' ' + unit : ''}. Trend: ${analysis.direction}.`;

    const description = [
      `## ${title}`,
      '',
      `**Current value:** ${currentValue}${unit ? ' ' + unit : ''}`,
      `**Projected value:** ${Math.round(projectedValue)}${unit ? ' ' + unit : ''}`,
      `**Trend:** ${analysis.direction}`,
      `**Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`,
      '',
      '**Assumptions:**',
      ...assumptions.map((a) => `- ${a}`),
    ].join('\n');

    return this.buildPrediction(
      type, category, title, summary, description,
      currentValue, Math.round(projectedValue), unit,
      horizon, analysis, facts, trends, knowledge, assumptions,
    );
  }

  // ── Private ────────────────────────────────────────────────

  private _calculatePredictionConfidence(analysis: TrendAnalysisResult): number {
    let confidence = analysis.confidence;

    // Reduce confidence for unknown trends
    if (analysis.direction === 'unknown') confidence *= 0.5;

    // Reduce confidence for high variability
    if (analysis.variability !== null && analysis.variability > 0) {
      const values = analysis.dataPoints.map((d) => d.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      if (mean !== 0) {
        const cv = analysis.variability / Math.abs(mean);
        confidence *= clampScore(1 - cv * 0.3);
      }
    }

    return clampScore(confidence);
  }

  private _deriveRiskLevel(
    confidence: number,
    predictedValue: number,
    currentValue: number,
    _category: PredictionCategory,
  ): RiskLevel {
    const rules = this._config.riskRules;
    const delta = Math.abs(predictedValue - currentValue);
    const percentChange = currentValue !== 0 ? delta / Math.abs(currentValue) : 0;

    // Combine confidence and impact for risk
    const riskScore = clampScore(confidence * 0.4 + percentChange * 0.6);

    if (riskScore >= rules.criticalThreshold) return 'critical';
    if (riskScore >= rules.highThreshold) return 'high';
    if (riskScore >= rules.mediumThreshold) return 'medium';
    if (riskScore >= rules.lowThreshold) return 'low';
    return 'none';
  }

  private _deriveImpactLevel(
    predictedValue: number,
    currentValue: number,
    _category: PredictionCategory,
  ): ImpactLevel {
    const delta = Math.abs(predictedValue - currentValue);
    const percentChange = currentValue !== 0 ? delta / Math.abs(currentValue) : 0;

    if (percentChange >= 0.5) return 'critical';
    if (percentChange >= 0.3) return 'high';
    if (percentChange >= 0.15) return 'medium';
    if (percentChange >= 0.05) return 'low';
    return 'none';
  }

  private _getExpirationDate(horizon: TimeHorizon): string {
    const hours = getTimeHorizonHours(horizon);
    const expirationHours = hours <= 24
      ? this._config.expirationConfig.shortTermExpirationHours
      : hours >= 720
        ? this._config.expirationConfig.longTermExpirationHours
        : this._config.expirationConfig.defaultExpirationHours;

    return new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();
  }

  private _calculateDataFreshness(dataPoints: TrendDataPoint[]): number {
    if (dataPoints.length === 0) return 0;
    const latest = new Date(dataPoints[dataPoints.length - 1]!.timestamp).getTime();
    const now = Date.now();
    const hoursSinceLatest = (now - latest) / (60 * 60 * 1000);
    return Math.max(0, hoursSinceLatest);
  }
}
