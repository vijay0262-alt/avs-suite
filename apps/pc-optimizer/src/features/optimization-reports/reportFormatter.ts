/**
 * Report Formatter — formats report data for display.
 *
 * Supports dashboard, full, printable, markdown, and JSON formats.
 */
import type {
  OptimizationReport,
  ReportConfiguration,
  ReportFormat,
  ExecutionSummary,
  CompletedAction,
  SkippedAction,
  VisualMetrics,
  TimelineEntry,
} from './types';
import { formatDuration, formatBytes, formatDelta } from './types';
import type { PipelineExecution } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';

export class ReportFormatter {
  private _config: ReportConfiguration;

  constructor(config: ReportConfiguration) {
    this._config = config;
  }

  updateConfig(config: ReportConfiguration): void {
    this._config = config;
  }

  formatExecutionSummary(execution: PipelineExecution): ExecutionSummary {
    const completed = execution.stepResults.filter((s) => s.status === 'completed').length;
    const skipped = execution.stepResults.filter((s) => s.status === 'skipped').length;
    const failed = execution.stepResults.filter((s) => s.status === 'failed').length;
    const duration = execution.stepResults.reduce((sum, s) => sum + s.durationMs, 0);

    return {
      status: execution.status,
      duration,
      completedSteps: completed,
      skippedSteps: skipped,
      failedSteps: failed,
      warnings: [...execution.warnings],
      errors: [...execution.errors],
    };
  }

  formatCompletedActions(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): CompletedAction[] {
    const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
    return execution.stepResults
      .filter((s) => s.status === 'completed')
      .map((s) => {
        const step = stepMap.get(s.stepId);
        return {
          stepId: s.stepId,
          title: s.stepTitle,
          description: step?.description ?? '',
          benefit: step?.estimatedBenefit ?? '',
          durationMs: s.durationMs,
          rollback: s.rollbackAvailable,
          confidence: step?.confidence ?? 0,
          category: step?.category ?? 'unknown',
        };
      });
  }

  formatSkippedActions(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): SkippedAction[] {
    const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
    return execution.stepResults
      .filter((s) => s.status === 'skipped')
      .map((s) => {
        const step = stepMap.get(s.stepId);
        return {
          stepId: s.stepId,
          title: s.stepTitle,
          reason: s.warnings[0] ?? 'Skipped during execution',
          risk: step?.riskLevel ?? 'low',
          userCancelled: false,
          permissionRequired: step?.riskLevel === 'critical',
          futureRecommendation: step?.estimatedBenefit ?? '',
        };
      });
  }

  formatVisualMetrics(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): VisualMetrics {
    return {
      healthDelta: {
        before: execution.healthBefore,
        after: execution.healthAfter,
        delta: execution.healthBefore !== null && execution.healthAfter !== null
          ? execution.healthAfter - execution.healthBefore
          : null,
        formatted: formatDelta(execution.healthBefore, execution.healthAfter),
        trend: execution.healthAfter !== null && execution.healthBefore !== null
          ? (execution.healthAfter > execution.healthBefore ? 'improved' : execution.healthAfter < execution.healthBefore ? 'declined' : 'unchanged')
          : 'unknown',
      },
      storageDelta: {
        before: null,
        after: null,
        delta: plan.estimatedStorageRecovery,
        formatted: formatBytes(plan.estimatedStorageRecovery),
        trend: plan.estimatedStorageRecovery > 0 ? 'improved' : 'unchanged',
      },
      performanceDelta: {
        before: null,
        after: plan.estimatedPerformanceGain,
        delta: plan.estimatedPerformanceGain,
        formatted: plan.estimatedPerformanceGain > 0 ? `+${plan.estimatedPerformanceGain}` : 'No change',
        trend: plan.estimatedPerformanceGain > 0 ? 'improved' : 'unchanged',
      },
      privacyDelta: {
        before: null,
        after: plan.estimatedPrivacyGain,
        delta: plan.estimatedPrivacyGain,
        formatted: plan.estimatedPrivacyGain > 0 ? `+${plan.estimatedPrivacyGain}` : 'No change',
        trend: plan.estimatedPrivacyGain > 0 ? 'improved' : 'unchanged',
      },
      startupDelta: {
        before: null,
        after: plan.estimatedStartupGain,
        delta: plan.estimatedStartupGain,
        formatted: plan.estimatedStartupGain > 0 ? `${plan.estimatedStartupGain.toFixed(1)} seconds` : 'No improvement',
        trend: plan.estimatedStartupGain > 0 ? 'improved' : 'unchanged',
      },
      executionTimeline: this._buildTimeline(execution),
      progressTimeline: this._buildProgressTimeline(execution),
    };
  }

  private _buildTimeline(execution: PipelineExecution): TimelineEntry[] {
    return execution.stepResults.map((s, i) => ({
      label: s.stepTitle,
      timestamp: s.completedAt ?? s.startedAt ?? new Date().toISOString(),
      progress: Math.round(((i + 1) / execution.stepResults.length) * 100),
    }));
  }

  private _buildProgressTimeline(execution: PipelineExecution): TimelineEntry[] {
    let cumulative = 0;
    const total = execution.stepResults.length;
    return execution.stepResults.map((s) => {
      cumulative++;
      return {
        label: s.stepTitle,
        timestamp: s.completedAt ?? s.startedAt ?? new Date().toISOString(),
        progress: Math.round((cumulative / total) * 100),
      };
    });
  }

  formatReport(report: OptimizationReport, format: ReportFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'markdown':
        return this._formatMarkdown(report);
      case 'dashboard':
        return this._formatDashboard(report);
      case 'full':
        return this._formatFull(report);
      case 'printable':
        return this._formatPrintable(report);
      case 'pdf_ready':
        return this._formatPrintable(report);
      case 'mobile':
        return this._formatDashboard(report);
      case 'email':
        return this._formatMarkdown(report);
      default:
        return JSON.stringify(report, null, 2);
    }
  }

  private _formatMarkdown(report: OptimizationReport): string {
    const lines: string[] = [];
    lines.push(`# ${report.title}`);
    lines.push('');
    lines.push(`**Status:** ${report.overallResult}`);
    lines.push(`**Duration:** ${formatDuration(report.duration)}`);
    lines.push(`**Generated:** ${report.generatedAt}`);
    lines.push('');
    if (report.healthDelta !== null) {
      lines.push(`## Health Delta`);
      lines.push(`Health Score: ${report.healthBefore} → ${report.healthAfter} (+${report.healthDelta})`);
      lines.push('');
    }
    if (report.storageRecovered > 0) {
      lines.push(`## Storage Recovered`);
      lines.push(`${formatBytes(report.storageRecovered)}`);
      lines.push('');
    }
    lines.push(`## Confidence: ${(report.confidence * 100).toFixed(0)}%`);
    if (report.rollbackAvailable) {
      lines.push(`## Rollback: Available for ${this._config.rollbackDurationHours} hours`);
    }
    return lines.join('\n');
  }

  private _formatDashboard(report: OptimizationReport): string {
    const lines: string[] = [];
    lines.push(report.title);
    lines.push(`Duration: ${formatDuration(report.duration)}`);
    if (report.healthDelta !== null) {
      lines.push(`Health: ${report.healthBefore} → ${report.healthAfter} (+${report.healthDelta})`);
    }
    if (report.storageRecovered > 0) {
      lines.push(`Storage: ${formatBytes(report.storageRecovered)}`);
    }
    return lines.join('\n');
  }

  private _formatFull(report: OptimizationReport): string {
    const lines: string[] = [];
    lines.push(`=== ${report.title} ===`);
    lines.push(`Result: ${report.overallResult}`);
    lines.push(`Duration: ${formatDuration(report.duration)}`);
    lines.push(`Generated: ${report.generatedAt}`);
    if (report.healthDelta !== null) {
      lines.push(`Health: ${report.healthBefore} → ${report.healthAfter} (+${report.healthDelta})`);
    }
    lines.push(`Storage Recovered: ${formatBytes(report.storageRecovered)}`);
    lines.push(`Startup Improvement: ${report.startupImprovement.toFixed(1)}s`);
    lines.push(`Privacy Improvement: +${report.privacyImprovement}`);
    lines.push(`Performance Improvement: +${report.performanceImprovement}`);
    lines.push(`Confidence: ${(report.confidence * 100).toFixed(0)}%`);
    lines.push(`Rollback: ${report.rollbackAvailable ? 'Available' : 'Not available'}`);
    return lines.join('\n');
  }

  private _formatPrintable(report: OptimizationReport): string {
    return this._formatFull(report);
  }
}
