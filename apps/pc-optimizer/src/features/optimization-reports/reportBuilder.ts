/**
 * Report Builder — assembles OptimizationReport from execution results.
 *
 * Consumes PipelineExecution and OptimizationPlanV2.
 * Produces a complete OptimizationReport with all sections.
 */
import type { PipelineExecution } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';
import type {
  OptimizationReport,
  ReportConfiguration,
  ReportSection,
  OverallResult,
  ReportEvidence,
} from './types';
import { generateReportId } from './types';
import { OptimizationReportAnalyzer } from './reportAnalyzer';
import { ReportFormatter } from './reportFormatter';

export class OptimizationReportBuilder {
  private _config: ReportConfiguration;
  private _analyzer: OptimizationReportAnalyzer;
  private _formatter: ReportFormatter;

  constructor(config: ReportConfiguration) {
    this._config = config;
    this._analyzer = new OptimizationReportAnalyzer(config);
    this._formatter = new ReportFormatter(config);
  }

  updateConfig(config: ReportConfiguration): void {
    this._config = config;
    this._analyzer.updateConfig(config);
    this._formatter.updateConfig(config);
  }

  build(execution: PipelineExecution, plan: OptimizationPlanV2): OptimizationReport {
    const analysis = this._analyzer.analyzeAll(execution, plan);
    const summary = this._formatter.formatExecutionSummary(execution);
    const completedActions = this._formatter.formatCompletedActions(execution, plan);
    const skippedActions = this._formatter.formatSkippedActions(execution, plan);
    const visualMetrics = this._formatter.formatVisualMetrics(execution, plan);
    const evidence = this._collectEvidence(execution);
    const sections = this._buildSections(execution, plan, analysis, summary, completedActions, skippedActions);
    const overallResult = this._determineOverallResult(execution);
    const duration = summary.duration;
    const recommendationsResolved = analysis.recommendations.resolved.length;
    const recommendationsRemaining = analysis.recommendations.remaining.length;
    const predictionsUpdated = analysis.predictions.length;

    return {
      id: generateReportId(),
      executionId: execution.id,
      planId: execution.planId,
      generatedAt: new Date().toISOString(),
      title: this._generateTitle(overallResult, analysis.health.delta),
      summary: this._generateSummary(execution, plan, overallResult),
      overallResult,
      duration,
      status: 'generated',
      healthBefore: execution.healthBefore,
      healthAfter: execution.healthAfter,
      healthDelta: analysis.health.delta,
      storageRecovered: analysis.benefits.storageRecovered,
      startupImprovement: analysis.benefits.startupImprovement,
      privacyImprovement: analysis.benefits.privacyImprovement,
      performanceImprovement: analysis.benefits.performanceImprovement,
      recommendationsResolved,
      recommendationsRemaining,
      predictionsUpdated,
      rollbackAvailable: execution.rollbackAvailable,
      confidence: analysis.health.confidence,
      sections,
      visualMetrics,
      nextBestActions: analysis.nextBestActions,
      evidence,
      futureMetadata: {},
    };
  }

  private _determineOverallResult(execution: PipelineExecution): OverallResult {
    const completed = execution.stepResults.filter((s) => s.status === 'completed').length;
    const failed = execution.stepResults.filter((s) => s.status === 'failed').length;
    if (execution.status === 'rolling_back' || execution.status === 'recovered') return 'rolled_back';
    if (failed > 0 && completed === 0) return 'failed';
    if (failed > 0) return 'partial';
    return 'success';
  }

  private _generateTitle(result: OverallResult, healthDelta: number | null): string {
    switch (result) {
      case 'success':
        return healthDelta !== null && healthDelta > 0
          ? `Optimization Complete — Health +${healthDelta}`
          : 'Optimization Complete';
      case 'partial':
        return 'Optimization Partially Complete';
      case 'failed':
        return 'Optimization Failed';
      case 'rolled_back':
        return 'Optimization Rolled Back';
    }
  }

  private _generateSummary(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
    result: OverallResult,
  ): string {
    const completed = execution.stepResults.filter((s) => s.status === 'completed').length;
    const failed = execution.stepResults.filter((s) => s.status === 'failed').length;
    const skipped = execution.stepResults.filter((s) => s.status === 'skipped').length;

    const parts: string[] = [];
    parts.push(`${result === 'success' ? 'Completed' : result === 'partial' ? 'Partially completed' : 'Failed'}: ${completed} completed, ${skipped} skipped, ${failed} failed.`);
    if (execution.healthBefore !== null && execution.healthAfter !== null) {
      parts.push(`Health: ${execution.healthBefore} → ${execution.healthAfter}.`);
    }
    parts.push(`Plan: ${plan.title}.`);
    return parts.join(' ');
  }

  private _buildSections(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
    analysis: ReturnType<OptimizationReportAnalyzer['analyzeAll']>,
    summary: ReturnType<ReportFormatter['formatExecutionSummary']>,
    completedActions: ReturnType<ReportFormatter['formatCompletedActions']>,
    skippedActions: ReturnType<ReportFormatter['formatSkippedActions']>,
  ): ReportSection[] {
    const sections: ReportSection[] = [];

    if (this._config.sections.execution_summary.enabled) {
      sections.push({
        type: 'execution_summary',
        title: 'Execution Summary',
        visible: this._config.sections.execution_summary.visible,
        data: { ...summary },
      });
    }

    if (this._config.sections.health_delta.enabled) {
      sections.push({
        type: 'health_delta',
        title: 'Health Delta',
        visible: this._config.sections.health_delta.visible,
        data: { ...analysis.health },
      });
    }

    if (this._config.sections.benefits.enabled) {
      sections.push({
        type: 'benefits',
        title: 'Benefits',
        visible: this._config.sections.benefits.visible,
        data: { ...analysis.benefits },
      });
    }

    if (this._config.sections.completed_actions.enabled) {
      sections.push({
        type: 'completed_actions',
        title: 'Completed Actions',
        visible: this._config.sections.completed_actions.visible,
        data: { actions: completedActions },
      });
    }

    if (this._config.sections.skipped_actions.enabled) {
      sections.push({
        type: 'skipped_actions',
        title: 'Skipped Actions',
        visible: this._config.sections.skipped_actions.visible,
        data: { actions: skippedActions },
      });
    }

    if (this._config.sections.updated_predictions.enabled) {
      sections.push({
        type: 'updated_predictions',
        title: 'Updated Predictions',
        visible: this._config.sections.updated_predictions.visible,
        data: { predictions: analysis.predictions },
      });
    }

    if (this._config.sections.updated_recommendations.enabled) {
      sections.push({
        type: 'updated_recommendations',
        title: 'Updated Recommendations',
        visible: this._config.sections.updated_recommendations.visible,
        data: { ...analysis.recommendations },
      });
    }

    if (this._config.sections.next_best_actions.enabled) {
      sections.push({
        type: 'next_best_actions',
        title: 'Next Best Actions',
        visible: this._config.sections.next_best_actions.visible,
        data: { actions: analysis.nextBestActions },
      });
    }

    return sections;
  }

  private _collectEvidence(execution: PipelineExecution): ReportEvidence[] {
    const evidence: ReportEvidence[] = [];

    for (const step of execution.stepResults) {
      if (step.status === 'completed') {
        evidence.push({
          source: 'execution_pipeline',
          metric: 'step_status',
          value: step.status,
          timestamp: step.completedAt ?? new Date().toISOString(),
          description: `Step "${step.stepTitle}" completed`,
        });
      }
    }

    if (execution.healthBefore !== null && execution.healthAfter !== null) {
      evidence.push({
        source: 'health_engine',
        metric: 'health_delta',
        value: execution.healthAfter - execution.healthBefore,
        timestamp: execution.completedAt ?? new Date().toISOString(),
        description: `Health changed from ${execution.healthBefore} to ${execution.healthAfter}`,
      });
    }

    return evidence;
  }
}
