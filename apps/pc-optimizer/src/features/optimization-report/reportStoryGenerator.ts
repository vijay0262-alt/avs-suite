/**
 * Report Story Generator — generates human-readable optimization narratives.
 *
 * Instead of "Optimization Complete", produces a story like:
 * "Your system health improved by 6 points after cleaning temporary files,
 *  optimizing browser cache, and streamlining startup entries."
 */
import type {
  OptimizationStory,
  ReportConfiguration,
} from './types';
import type { ExecutionReport } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';

export class ReportStoryGenerator {
  private _config: ReportConfiguration;

  constructor(config: ReportConfiguration) {
    this._config = config;
  }

  updateConfig(config: ReportConfiguration): void {
    this._config = config;
  }

  generate(
    executionReport: ExecutionReport,
    plan: OptimizationPlanV2,
  ): OptimizationStory {
    const outcome = this._determineOutcome(executionReport);
    const highlights = this._generateHighlights(executionReport, plan);
    const narrative = this._generateNarrative(executionReport, plan, outcome);
    const title = this._generateTitle(outcome, executionReport);
    const confidenceScore = this._computeConfidence(executionReport, plan);

    return {
      title,
      narrative,
      highlights: highlights.slice(0, this._config.formattingRules.maxHighlights),
      outcome,
      confidenceScore,
    };
  }

  private _determineOutcome(report: ExecutionReport): OptimizationStory['outcome'] {
    if (report.failedSteps.length > 0 && report.completedSteps.length === 0) return 'failed';
    if (report.failedSteps.length > 0) return 'partial';
    if (report.completedSteps.length === 0) return 'failed';
    return 'success';
  }

  private _generateTitle(outcome: OptimizationStory['outcome'], report: ExecutionReport): string {
    switch (outcome) {
      case 'success':
        if (report.healthDelta !== null && report.healthDelta > 0) {
          return `Optimization Complete — Health +${report.healthDelta}`;
        }
        return 'Optimization Complete';
      case 'partial':
        return `Optimization Partially Complete — ${report.completedSteps.length} of ${report.completedSteps.length + report.failedSteps.length} actions succeeded`;
      case 'failed':
        return 'Optimization Failed';
      case 'rolled_back':
        return 'Optimization Rolled Back';
    }
  }

  private _generateHighlights(report: ExecutionReport, plan: OptimizationPlanV2): string[] {
    const highlights: string[] = [];

    if (report.healthDelta !== null && report.healthDelta > 0) {
      highlights.push(`Health score improved by ${report.healthDelta} points`);
    }

    if (report.storageRecovered > 0) {
      highlights.push(`${this._formatBytes(report.storageRecovered)} of storage recovered`);
    }

    if (plan.estimatedStartupGain > 0) {
      highlights.push(`Startup improved by ${plan.estimatedStartupGain} seconds`);
    }

    if (plan.estimatedPrivacyGain > 0) {
      highlights.push(`Privacy score improved by ${plan.estimatedPrivacyGain} points`);
    }

    if (plan.estimatedPerformanceGain > 0) {
      highlights.push(`Performance improved by ${plan.estimatedPerformanceGain} points`);
    }

    if (report.completedSteps.length > 0) {
      highlights.push(`${report.completedSteps.length} action${report.completedSteps.length !== 1 ? 's' : ''} completed successfully`);
    }

    if (report.rollbackAvailable) {
      highlights.push(`Rollback available for ${this._config.rollbackDurationHours} hours`);
    }

    return highlights;
  }

  private _generateNarrative(
    report: ExecutionReport,
    plan: OptimizationPlanV2,
    outcome: OptimizationStory['outcome'],
  ): string {
    const parts: string[] = [];

    if (outcome === 'success') {
      parts.push('Your system optimization completed successfully.');
    } else if (outcome === 'partial') {
      parts.push(`Your system optimization completed with ${report.completedSteps.length} successful actions and ${report.failedSteps.length} failures.`);
    } else {
      parts.push('Your system optimization could not be completed.');
    }

    if (report.healthDelta !== null && report.healthDelta > 0) {
      parts.push(`Health score improved from ${report.healthBefore} to ${report.healthAfter}, a gain of ${report.healthDelta} points.`);
    } else if (report.healthDelta !== null && report.healthDelta === 0) {
      parts.push('Health score remained stable.');
    }

    if (report.storageRecovered > 0) {
      parts.push(`${this._formatBytes(report.storageRecovered)} of storage space was recovered.`);
    }

    const actionNames = report.completedSteps.map((s: { stepTitle: string }) => s.stepTitle.toLowerCase());
    if (actionNames.length > 0) {
      if (actionNames.length <= 3) {
        parts.push(`Actions performed: ${actionNames.join(', ')}.`);
      } else {
        parts.push(`${actionNames.length} actions were performed including ${actionNames.slice(0, 2).join(', ')}, and more.`);
      }
    }

    if (report.skippedSteps.length > 0) {
      parts.push(`${report.skippedSteps.length} action${report.skippedSteps.length !== 1 ? 's' : ''} were skipped.`);
    }

    if (report.rollbackAvailable) {
      parts.push(`Changes can be rolled back for ${this._config.rollbackDurationHours} hours.`);
    }

    let narrative = parts.join(' ');
    if (narrative.length > this._config.storyRules.maxNarrativeLength) {
      narrative = narrative.slice(0, this._config.storyRules.maxNarrativeLength - 3) + '...';
    }

    return narrative;
  }

  private _computeConfidence(report: ExecutionReport, plan: OptimizationPlanV2): number {
    const totalSteps = report.completedSteps.length + report.failedSteps.length + report.skippedSteps.length;
    if (totalSteps === 0) return plan.confidenceScore;
    const successRate = report.completedSteps.length / totalSteps;
    return Math.round((successRate * 0.7 + plan.confidenceScore * 0.3) * 100) / 100;
  }

  private _formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, unitIndex);
    if (value >= 100) return `${Math.round(value)} ${units[unitIndex]}`;
    if (value >= 10) return `${value.toFixed(1)} ${units[unitIndex]}`;
    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }
}
