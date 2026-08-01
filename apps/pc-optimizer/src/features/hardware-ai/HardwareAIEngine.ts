/**
 * HardwareAIEngine — top-level orchestrator for the AI Hardware Health Engine.
 *
 * Consumes HardwareSnapshot data (never queries hardware directly) and
 * produces a comprehensive HardwareAIReport with:
 *   - Per-component analyses (health, performance, efficiency, reliability, trend)
 *   - Human-readable insights with evidence chains
 *   - Evidence-based recommendations
 *   - System-wide risk assessment
 *   - Trend summaries from historical data
 *   - Thermal analysis with anomaly detection
 *
 * Core principle: Every insight is traceable to sensor evidence.
 * No hallucinated information. No direct hardware modification.
 */
import type {
  HardwareAIReport,
  HardwareAIConfiguration,
  ComponentAnalysis,
  AIInsight,
  AIRecommendation,
  HardwareRiskAssessment,
  TrendSummary,
  ThermalAnalysisResult,
} from './types';
import { DEFAULT_AI_CONFIG } from './types';
import type { HardwareSnapshot } from '../hardware-center/types';
import { HardwareAnalyzer } from './HardwareAnalyzer';
import { HealthScoringEngine } from './HealthScoringEngine';
import { TrendAnalyzer } from './TrendAnalyzer';
import { HardwareTrendHistory } from './HardwareTrendHistory';
import { HardwareInsightBuilder } from './HardwareInsightBuilder';
import { HardwareRecommendationEngine } from './HardwareRecommendationEngine';
import { HardwareRiskAssessmentEngine } from './HardwareRiskAssessment';
import { ThermalAnalyzer } from './HardwareAnalyzers';
import { HardwareExplanationEngine } from './HardwareExplanationEngine';
import { hardwareAIEventBus } from './HardwareAIEvents';

export class HardwareAIEngine {
  private config: HardwareAIConfiguration;
  private analyzer: HardwareAnalyzer;
  private scoringEngine: HealthScoringEngine;
  private trendAnalyzer: TrendAnalyzer;
  private trendHistory: HardwareTrendHistory;
  private insightBuilder: HardwareInsightBuilder;
  private recommendationEngine: HardwareRecommendationEngine;
  private riskEngine: HardwareRiskAssessmentEngine;
  private thermalAnalyzer: ThermalAnalyzer;
  private explanationEngine: HardwareExplanationEngine;
  private lastReport: HardwareAIReport | null = null;

  constructor(config: HardwareAIConfiguration = DEFAULT_AI_CONFIG) {
    this.config = config;
    this.trendHistory = new HardwareTrendHistory(config.trendHistorySize, config.trendMinDataPoints);
    this.analyzer = new HardwareAnalyzer(config, this.trendHistory);
    this.scoringEngine = new HealthScoringEngine();
    this.trendAnalyzer = new TrendAnalyzer(config);
    this.insightBuilder = new HardwareInsightBuilder(config);
    this.recommendationEngine = new HardwareRecommendationEngine(config);
    this.riskEngine = new HardwareRiskAssessmentEngine();
    this.thermalAnalyzer = new ThermalAnalyzer(config);
    this.explanationEngine = new HardwareExplanationEngine(config);
  }

  /**
   * Analyze a hardware snapshot and produce a full AI report.
   * This is the main entry point — consume only the snapshot, never query hardware.
   */
  analyze(snapshot: HardwareSnapshot): HardwareAIReport {
    if (!this.config.enabled) {
      return this.emptyReport(snapshot);
    }

    hardwareAIEventBus.emitAnalysisStarted(snapshot.id);

    // Record snapshot in trend history
    this.trendHistory.recordSnapshot(snapshot);
    this.trendAnalyzer.recordSnapshot(snapshot);

    // Analyze all components
    const componentAnalyses = this.analyzer.analyzeAll(snapshot);

    // Compute overall scores
    const overallScore = this.scoringEngine.computeOverallScore(componentAnalyses);
    const overallHealth = this.scoringEngine.computeOverallHealth(overallScore);
    const overallConfidence = this.scoringEngine.computeOverallConfidence(componentAnalyses);
    const issueCount = this.scoringEngine.countIssues(componentAnalyses);

    // Build insights
    const insights: AIInsight[] = this.config.enabled
      ? this.insightBuilder.build(componentAnalyses, snapshot)
      : [];

    // Generate recommendations
    const recommendations: AIRecommendation[] = this.config.enableRecommendations
      ? this.recommendationEngine.generate(componentAnalyses)
      : [];

    // Assess risk
    const riskAssessment: HardwareRiskAssessment = this.config.enableRiskAssessment
      ? this.riskEngine.assess(componentAnalyses)
      : this.emptyRiskAssessment();

    // Get trend summaries
    const trendSummaries: TrendSummary[] = this.config.enableTrendAnalysis
      ? this.trendAnalyzer.getTrendSummaries()
      : [];

    // Thermal analysis
    const thermalAnalyses: ThermalAnalysisResult[] = this.config.enableThermalAnalysis
      ? this.thermalAnalyzer.analyze(snapshot.components)
      : [];

    // System summary
    const systemSummary = this.explanationEngine.explainSystemSummary(overallScore, snapshot.components.length, issueCount);
    const systemExplanation = this.buildSystemExplanation(overallHealth, overallScore, componentAnalyses, riskAssessment);

    const report: HardwareAIReport = {
      timestamp: Date.now(),
      snapshotId: snapshot.id,
      overallHealth,
      overallScore,
      overallConfidence,
      componentAnalyses,
      insights,
      recommendations,
      riskAssessment,
      trendSummaries,
      thermalAnalyses,
      systemSummary,
      systemExplanation,
    };

    this.lastReport = report;

    // Emit events
    hardwareAIEventBus.emitAnalysisCompleted(report.timestamp.toString(), snapshot.id);
    for (const insight of insights) {
      hardwareAIEventBus.emitInsightGenerated(insight.id, insight.category);
    }
    if (riskAssessment.overallRisk !== 'none') {
      hardwareAIEventBus.emitRiskDetected(riskAssessment.overallRisk, 'system');
    }

    return report;
  }

  getLastReport(): HardwareAIReport | null {
    return this.lastReport;
  }

  getConfiguration(): HardwareAIConfiguration {
    return this.config;
  }

  updateConfiguration(updates: Partial<HardwareAIConfiguration>): void {
    this.config = { ...this.config, ...updates };
  }

  getTrendHistory(): HardwareTrendHistory {
    return this.trendHistory;
  }

  dispose(): void {
    this.trendHistory.clear();
    this.trendAnalyzer.clear();
    this.lastReport = null;
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private buildSystemExplanation(
    health: string,
    score: number,
    analyses: ComponentAnalysis[],
    risk: HardwareRiskAssessment,
  ): string {
    const parts: string[] = [];

    parts.push(`The system health analysis evaluated ${analyses.length} hardware components and produced an overall health score of ${score}/100 (${health}).`);

    const criticalComponents = analyses.filter((a) => a.risk === 'severe' || a.risk === 'high');
    if (criticalComponents.length > 0) {
      parts.push(`${criticalComponents.length} component${criticalComponents.length > 1 ? 's require' : ' requires'} immediate attention: ${criticalComponents.map((c) => c.category.toUpperCase()).join(', ')}.`);
    }

    const healthyComponents = analyses.filter((a) => a.risk === 'none');
    if (healthyComponents.length > 0) {
      parts.push(`${healthyComponents.length} component${healthyComponents.length > 1 ? 's are' : ' is'} operating normally.`);
    }

    if (risk.systemRiskFactors.length > 0) {
      parts.push(`Key risk factors: ${risk.systemRiskFactors.join('; ')}.`);
    }

    if (risk.mitigatingFactors.length > 0) {
      parts.push(`Positive indicators: ${risk.mitigatingFactors.join('; ')}.`);
    }

    return parts.join(' ');
  }

  private emptyReport(snapshot: HardwareSnapshot): HardwareAIReport {
    return {
      timestamp: Date.now(),
      snapshotId: snapshot.id,
      overallHealth: 'unknown',
      overallScore: 100,
      overallConfidence: 0,
      componentAnalyses: [],
      insights: [],
      recommendations: [],
      riskAssessment: this.emptyRiskAssessment(),
      trendSummaries: [],
      thermalAnalyses: [],
      systemSummary: 'AI analysis is disabled.',
      systemExplanation: 'The Hardware AI Engine is currently disabled. Enable it in configuration to receive hardware health insights.',
    };
  }

  private emptyRiskAssessment(): HardwareRiskAssessment {
    return {
      overallRisk: 'none',
      overallUrgency: 'none',
      componentRisks: {},
      systemRiskFactors: [],
      mitigatingFactors: [],
      estimatedTimeToAction: 'No action needed',
    };
  }
}
