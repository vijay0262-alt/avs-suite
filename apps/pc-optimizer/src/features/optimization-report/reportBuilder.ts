/**
 * Report Builder — assembles IntelligenceReport from execution results.
 *
 * Consumes ExecutionReport from the Execution Pipeline and
 * OptimizationPlanV2 from the Optimization Plan Engine.
 * Produces a complete IntelligenceReport with all display components.
 */
import type { ExecutionReport } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';
import type {
  IntelligenceReport,
  ReportConfiguration,
  ActionDisplay,
  ReportEvidence,
  PredictionUpdateDisplay,
  RecommendationRemainingDisplay,
} from './types';
import { generateReportId } from './types';
import { ReportFormatter } from './reportFormatter';
import { ReportEvidenceCollector } from './reportEvidenceCollector';
import { ReportStoryGenerator } from './reportStoryGenerator';
import { ReportHealthDelta } from './reportHealthDelta';

export class ReportBuilder {
  private _config: ReportConfiguration;
  private _formatter: ReportFormatter;
  private _evidenceCollector: ReportEvidenceCollector;
  private _storyGenerator: ReportStoryGenerator;
  private _healthDelta: ReportHealthDelta;

  constructor(config: ReportConfiguration) {
    this._config = config;
    this._formatter = new ReportFormatter(config);
    this._evidenceCollector = new ReportEvidenceCollector();
    this._storyGenerator = new ReportStoryGenerator(config);
    this._healthDelta = new ReportHealthDelta();
  }

  updateConfig(config: ReportConfiguration): void {
    this._config = config;
    this._formatter.updateConfig(config);
    this._storyGenerator.updateConfig(config);
  }

  build(
    executionReport: ExecutionReport,
    plan: OptimizationPlanV2,
    options?: {
      healthAfter?: number | null;
      recommendationsRemaining?: number;
      recommendationPriorityBreakdown?: Record<string, number>;
    },
  ): IntelligenceReport {
    const healthAfter = options?.healthAfter ?? executionReport.healthAfter;
    const healthBefore = executionReport.healthBefore;

    const healthDelta = this._config.featureFlags.enableHealthDelta
      ? this._formatter.formatHealthDelta(healthBefore, healthAfter)
      : { before: healthBefore, after: healthAfter, delta: null, formatted: 'N/A', trend: 'unknown' as const };

    const storageRecovered = this._config.featureFlags.enableStorageDisplay
      ? this._formatter.formatStorage(executionReport.storageRecovered)
      : { bytes: 0, formatted: 'N/A' };

    const startupImprovement = this._config.featureFlags.enableStartupDisplay
      ? this._formatter.formatStartup(plan.estimatedStartupGain)
      : { secondsSaved: 0, formatted: 'N/A' };

    const privacyImprovement = this._config.featureFlags.enablePrivacyDisplay
      ? this._formatter.formatPrivacy(plan.estimatedPrivacyGain)
      : { pointsImproved: 0, formatted: 'N/A' };

    const performanceImprovement = this._config.featureFlags.enablePerformanceDisplay
      ? this._formatter.formatPerformance(plan.estimatedPerformanceGain)
      : { pointsImproved: 0, formatted: 'N/A' };

    const actionsCompleted: ActionDisplay[] = this._formatter.formatActions(
      executionReport.completedSteps,
      plan,
      'check',
    );

    const actionsSkipped: ActionDisplay[] = this._formatter.formatActions(
      executionReport.skippedSteps,
      plan,
      'skip',
    );

    const actionsFailed: ActionDisplay[] = this._formatter.formatActions(
      executionReport.failedSteps,
      plan,
      'error',
    );

    const predictionsUpdated: PredictionUpdateDisplay[] = this._config.featureFlags.enablePredictions
      ? this._formatter.formatPredictions(plan, healthDelta.delta)
      : [];

    const recommendationsRemaining: RecommendationRemainingDisplay = this._config.featureFlags.enableRecommendations
      ? this._formatter.formatRecommendationsRemaining(
          options?.recommendationsRemaining ?? 0,
          options?.recommendationPriorityBreakdown ?? {},
        )
      : { count: 0, priorityBreakdown: {}, summary: 'N/A' };

    const rollbackableSteps = executionReport.completedSteps.filter((s) => s.rollbackAvailable).length;
    const rollbackInfo = this._config.featureFlags.enableRollbackInfo
      ? this._formatter.formatRollback(executionReport.rollbackAvailable, rollbackableSteps)
      : { available: false, durationHours: 0, formatted: 'N/A', stepsRollbackable: 0 };

    const evidence: ReportEvidence[] = this._config.featureFlags.enableEvidence
      ? this._evidenceCollector.collectFromExecution(executionReport)
      : [];

    const story = this._config.featureFlags.enableStories
      ? this._storyGenerator.generate(executionReport, plan)
      : {
          title: 'Optimization Complete',
          narrative: '',
          highlights: [],
          outcome: 'success' as const,
          confidenceScore: plan.confidenceScore,
        };

    const reportId = generateReportId();
    const totalSteps = actionsCompleted.length + actionsSkipped.length + actionsFailed.length;

    return {
      id: reportId,
      executionId: executionReport.executionId,
      planId: executionReport.planId,
      planType: plan.planType,
      generatedAt: new Date().toISOString(),

      headline: story.title,
      subtitle: story.narrative.slice(0, 100),

      executionTime: this._formatter.formatExecutionTime(executionReport.totalDurationMs),
      healthDelta,
      storageRecovered,
      startupImprovement,
      privacyImprovement,
      performanceImprovement,

      actionsCompleted,
      actionsSkipped,
      actionsFailed,

      predictionsUpdated,
      recommendationsRemaining,
      rollbackInfo,

      evidence,
      story,
      metadata: {
        planTitle: plan.title,
        planType: plan.planType,
        totalSteps,
        completedSteps: actionsCompleted.length,
        skippedSteps: actionsSkipped.length,
        failedSteps: actionsFailed.length,
        confidenceScore: story.confidenceScore,
        verificationStatus: executionReport.errors.length === 0 ? 'verified' : 'issues',
      },
      futureMetadata: {},
    };
  }
}
