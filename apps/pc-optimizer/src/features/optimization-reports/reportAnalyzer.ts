/**
 * Report Analyzer — orchestrates all delta analyzers and benefit analysis.
 *
 * Coordinates: HealthDeltaAnalyzer, PerformanceDeltaAnalyzer, StorageDeltaAnalyzer,
 * PrivacyDeltaAnalyzer, PredictionDeltaAnalyzer, RecommendationDeltaAnalyzer,
 * BenefitAnalyzer.
 */
import type {
  HealthDeltaAnalysis,
  BenefitAnalysis,
  PredictionDelta,
  RecommendationDelta,
  NextBestAction,
  ReportConfiguration,
} from './types';
import type { PipelineExecution } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';
import { HealthDeltaAnalyzer } from './healthDeltaAnalyzer';
import { PerformanceDeltaAnalyzer } from './performanceDeltaAnalyzer';
import { StorageDeltaAnalyzer } from './storageDeltaAnalyzer';
import { PrivacyDeltaAnalyzer } from './privacyDeltaAnalyzer';
import { PredictionDeltaAnalyzer } from './predictionDeltaAnalyzer';
import { RecommendationDeltaAnalyzer } from './recommendationDeltaAnalyzer';
import { BenefitAnalyzer } from './benefitAnalyzer';

export class OptimizationReportAnalyzer {
  private _config: ReportConfiguration;
  private _healthAnalyzer: HealthDeltaAnalyzer;
  private _performanceAnalyzer: PerformanceDeltaAnalyzer;
  private _storageAnalyzer: StorageDeltaAnalyzer;
  private _privacyAnalyzer: PrivacyDeltaAnalyzer;
  private _predictionAnalyzer: PredictionDeltaAnalyzer;
  private _recommendationAnalyzer: RecommendationDeltaAnalyzer;
  private _benefitAnalyzer: BenefitAnalyzer;

  constructor(config: ReportConfiguration) {
    this._config = config;
    this._healthAnalyzer = new HealthDeltaAnalyzer();
    this._performanceAnalyzer = new PerformanceDeltaAnalyzer();
    this._storageAnalyzer = new StorageDeltaAnalyzer();
    this._privacyAnalyzer = new PrivacyDeltaAnalyzer();
    this._predictionAnalyzer = new PredictionDeltaAnalyzer();
    this._recommendationAnalyzer = new RecommendationDeltaAnalyzer();
    this._benefitAnalyzer = new BenefitAnalyzer();
  }

  updateConfig(config: ReportConfiguration): void {
    this._config = config;
  }

  analyzeHealth(execution: PipelineExecution): HealthDeltaAnalysis {
    return this._healthAnalyzer.analyze(execution);
  }

  analyzeBenefits(execution: PipelineExecution, plan: OptimizationPlanV2): BenefitAnalysis {
    return this._benefitAnalyzer.analyze(execution, plan);
  }

  analyzePredictions(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
    healthDelta: number | null,
  ): PredictionDelta[] {
    if (!this._config.featureFlags.enablePredictions) return [];
    return this._predictionAnalyzer.analyze(execution, plan, healthDelta);
  }

  analyzeRecommendations(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): RecommendationDelta {
    if (!this._config.featureFlags.enableRecommendations) {
      return { resolved: [], remaining: [], newRecommendations: [] };
    }
    return this._recommendationAnalyzer.analyze(execution, plan);
  }

  generateNextBestActions(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): NextBestAction[] {
    if (!this._config.featureFlags.enableNextBestActions) return [];

    const recDelta = this._recommendationAnalyzer.analyze(execution, plan);
    return recDelta.remaining
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        title: r.title,
        estimatedImpact: r.estimatedImpact,
        estimatedTime: 30,
        safety: 'low',
        confidence: 0.7,
      }));
  }

  analyzeAll(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): {
    health: HealthDeltaAnalysis;
    benefits: BenefitAnalysis;
    predictions: PredictionDelta[];
    recommendations: RecommendationDelta;
    nextBestActions: NextBestAction[];
  } {
    const health = this.analyzeHealth(execution);
    const benefits = this.analyzeBenefits(execution, plan);
    const predictions = this.analyzePredictions(execution, plan, health.delta);
    const recommendations = this.analyzeRecommendations(execution, plan);
    const nextBestActions = this.generateNextBestActions(execution, plan);

    return { health, benefits, predictions, recommendations, nextBestActions };
  }
}
