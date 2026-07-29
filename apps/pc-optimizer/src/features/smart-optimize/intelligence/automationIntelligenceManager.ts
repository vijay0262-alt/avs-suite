/**
 * Automation Intelligence Manager — top-level orchestrator.
 *
 * Public APIs:
 *   analyzeHistory()
 *   detectPatterns()
 *   generateInsights()
 *   rankRecommendations()
 *   predictSuccess()
 *   getAutomationStatistics()
 *   getAutomationInsights()
 *   on() / off()
 */
import type {
  IntelligenceInput,
  IntelligenceConfiguration,
  LearningResult,
  DetectedPattern,
  IntelligenceInsight,
  IntelligenceRecommendation,
  IntelligenceStatistics,
  SuccessPrediction,
  PredictionContext,
  IntelligenceEventType,
  IntelligenceEventListener,
  AutomationHistoryEntry,
  MaintenanceHistoryEntry,
  AdaptiveHistoryEntry,
  SystemState,
  PatternAnalyzerPlugin,
  SuccessPredictorPlugin,
  RankingPlugin,
  RecommendationPlugin,
  InsightPlugin,
} from './types';
import { createDefaultIntelligenceInput } from './types';
import { AutomationLearningEngine } from './automationLearningEngine';
import { IntelligenceEvents } from './intelligenceEvents';
import { IntelligenceValidator } from './intelligenceValidator';
import { createIntelligenceConfiguration, type DeepPartial } from './intelligenceConfiguration';

export class AutomationIntelligenceManager {
  private _config: IntelligenceConfiguration;
  private _learningEngine: AutomationLearningEngine;
  private _events: IntelligenceEvents;
  private _validator: IntelligenceValidator;
  private _input: IntelligenceInput;
  private _lastResult: LearningResult | null = null;

  constructor(config?: IntelligenceConfiguration | DeepPartial<IntelligenceConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as IntelligenceConfiguration;
    } else {
      this._config = createIntelligenceConfiguration(config as DeepPartial<IntelligenceConfiguration>);
    }
    this._learningEngine = new AutomationLearningEngine(this._config);
    this._events = new IntelligenceEvents();
    this._validator = new IntelligenceValidator();
    this._input = createDefaultIntelligenceInput();
  }

  setHistory(
    automationHistory: AutomationHistoryEntry[],
    maintenanceHistory: MaintenanceHistoryEntry[] = [],
    adaptiveHistory: AdaptiveHistoryEntry[] = [],
  ): void {
    this._input = {
      ...this._input,
      automationHistory,
      maintenanceHistory,
      adaptiveHistory,
    };
  }

  setSystemState(state: SystemState): void {
    this._input = { ...this._input, systemState: state };
  }

  setDeviceProfileType(type: string): void {
    this._input = { ...this._input, deviceProfileType: type };
  }

  setHealthScore(score: number): void {
    this._input = { ...this._input, healthScore: score };
  }

  analyzeHistory(input?: IntelligenceInput): LearningResult {
    const useInput = input ?? this._input;
    const result = this._learningEngine.learn(useInput);
    this._lastResult = result;

    if (this._config.enableEvents) {
      this._events.emitHistoryAnalyzed({ entriesAnalyzed: result.statistics.totalHistoryEntries });
      if (result.patterns.length > 0) {
        this._events.emitPatternsDetected({ patterns: result.patterns.length });
      }
      if (result.insights.insights.length > 0) {
        this._events.emitInsightsGenerated({ insights: result.insights.insights.length });
      }
      if (result.recommendations.recommendations.length > 0) {
        this._events.emitRecommendationsRanked({ recommendations: result.recommendations.recommendations.length });
      }
      if (result.predictions.length > 0) {
        this._events.emitPredictionUpdated({ predictions: result.predictions.length });
      }
      this._events.emitIntelligenceUpdated({ duration: result.analysisDurationMs });
    }

    return result;
  }

  detectPatterns(input?: IntelligenceInput): DetectedPattern[] {
    const useInput = input ?? this._input;
    return this._learningEngine.detectPatterns(useInput);
  }

  generateInsights(input?: IntelligenceInput): IntelligenceInsight[] {
    const useInput = input ?? this._input;
    if (!this._lastResult) {
      this.analyzeHistory(useInput);
    }
    const result = this._lastResult!;
    return result.insights.insights;
  }

  rankRecommendations(
    recommendations: IntelligenceRecommendation[],
    input?: IntelligenceInput,
  ): IntelligenceRecommendation[] {
    const useInput = input ?? this._input;
    const ranked = this._learningEngine.rankRecommendations(recommendations, useInput);
    return ranked.recommendations;
  }

  predictSuccess(context: PredictionContext, input?: IntelligenceInput): SuccessPrediction {
    const useInput = input ?? this._input;
    return this._learningEngine.predictSuccess(context, useInput);
  }

  getAutomationStatistics(input?: IntelligenceInput): IntelligenceStatistics {
    const useInput = input ?? this._input;
    if (this._lastResult) return this._lastResult.statistics;
    return this._learningEngine.getStatistics(useInput);
  }

  getAutomationInsights(input?: IntelligenceInput): IntelligenceInsight[] {
    return this.generateInsights(input);
  }

  getRecommendations(): IntelligenceRecommendation[] {
    if (!this._lastResult) return [];
    return this._lastResult.recommendations.recommendations;
  }

  getLastResult(): LearningResult | null {
    return this._lastResult;
  }

  validate(result?: LearningResult) {
    return this._learningEngine.validate(result ?? this._lastResult ?? this.analyzeHistory());
  }

  registerPatternPlugin(plugin: PatternAnalyzerPlugin): void {
    this._learningEngine.patternAnalyzer.registerPlugin(plugin);
  }

  registerPredictorPlugin(plugin: SuccessPredictorPlugin): void {
    this._learningEngine.successPredictor.registerPlugin(plugin);
  }

  registerRankingPlugin(plugin: RankingPlugin): void {
    this._learningEngine.rankingEngine.registerPlugin(plugin);
  }

  registerRecommendationPlugin(plugin: RecommendationPlugin): void {
    this._learningEngine.recommendationEngine.registerPlugin(plugin);
  }

  registerInsightPlugin(plugin: InsightPlugin): void {
    this._learningEngine.insights.registerPlugin(plugin);
  }

  on(event: IntelligenceEventType, listener: IntelligenceEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: IntelligenceEventType, listener: IntelligenceEventListener): void {
    this._events.off(event, listener);
  }

  get config(): IntelligenceConfiguration { return this._config; }

  updateConfig(overrides: DeepPartial<IntelligenceConfiguration>): void {
    this._config = createIntelligenceConfiguration(overrides);
    this._learningEngine = new AutomationLearningEngine(this._config);
  }

  clear(): void {
    this._lastResult = null;
    this._input = createDefaultIntelligenceInput();
    this._events.clear();
  }
}
