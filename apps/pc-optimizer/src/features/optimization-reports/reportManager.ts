/**
 * Optimization Report Manager — top-level orchestrator.
 *
 * Public APIs:
 *   generateReport()
 *   getReport()
 *   getReports()
 *   exportReport()
 *   compareReports()
 *   getReportStatistics()
 *   on() / off()
 */
import type { PipelineExecution } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';
import type {
  OptimizationReport,
  ReportStatistics,
  ReportConfiguration,
  ReportComparison,
  ReportEventType,
  ReportEventListener,
  ExportFormat,
  ExportResult,
  ReportValidationResult,
} from './types';
import { generateComparisonId } from './types';
import { ReportEvents } from './reportEvents';
import { ReportHistory } from './reportHistory';
import { OptimizationReportBuilder } from './reportBuilder';
import { ReportExporter } from './reportExporter';
import { ReportValidator } from './reportValidator';
import { createReportConfiguration, type DeepPartial } from './reportConfiguration';

export class OptimizationReportManager {
  private _config: ReportConfiguration;
  private _reports: Map<string, OptimizationReport> = new Map();
  private _events: ReportEvents;
  private _history: ReportHistory;
  private _builder: OptimizationReportBuilder;
  private _exporter: ReportExporter;
  private _validator: ReportValidator;
  private _comparisons: Map<string, ReportComparison> = new Map();

  constructor(config?: ReportConfiguration | DeepPartial<ReportConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as ReportConfiguration;
    } else {
      this._config = createReportConfiguration(config as DeepPartial<ReportConfiguration>);
    }

    this._events = new ReportEvents();
    this._history = new ReportHistory();
    this._builder = new OptimizationReportBuilder(this._config);
    this._exporter = new ReportExporter(this._config);
    this._validator = new ReportValidator();
  }

  generateReport(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): OptimizationReport {
    const report = this._builder.build(execution, plan);
    this._reports.set(report.id, report);

    if (this._config.enableEvents) {
      this._events.emitGenerated(report.id, { executionId: report.executionId });
    }
    this._history.record(report.id, 'generated', { executionId: report.executionId });

    return report;
  }

  getReport(reportId: string): OptimizationReport | undefined {
    return this._reports.get(reportId);
  }

  getReports(): OptimizationReport[] {
    return Array.from(this._reports.values());
  }

  getReportByExecution(executionId: string): OptimizationReport | undefined {
    for (const report of this._reports.values()) {
      if (report.executionId === executionId) return report;
    }
    return undefined;
  }

  exportReport(reportId: string, format: ExportFormat): ExportResult | null {
    const report = this._reports.get(reportId);
    if (!report) return null;

    const result = this._exporter.export(report, format);

    if (this._config.enableEvents) {
      this._events.emitExported(reportId, { format });
    }
    this._history.record(reportId, 'exported', { format });

    return result;
  }

  compareReports(reportAId: string, reportBId: string): ReportComparison | null {
    const reportA = this._reports.get(reportAId);
    const reportB = this._reports.get(reportBId);
    if (!reportA || !reportB) return null;

    const rules = this._config.comparisonRules;
    const healthDelta = rules.compareHealthDelta
      ? (reportA.healthDelta ?? 0) - (reportB.healthDelta ?? 0)
      : null;
    const storageDelta = rules.compareStorage
      ? reportA.storageRecovered - reportB.storageRecovered
      : 0;
    const performanceDelta = rules.comparePerformance
      ? reportA.performanceImprovement - reportB.performanceImprovement
      : 0;
    const privacyDelta = rules.comparePrivacy
      ? reportA.privacyImprovement - reportB.privacyImprovement
      : 0;
    const startupDelta = rules.compareStartup
      ? reportA.startupImprovement - reportB.startupImprovement
      : 0;
    const durationDelta = rules.compareDuration
      ? reportA.duration - reportB.duration
      : 0;

    const winner = this._determineWinner(healthDelta, storageDelta, performanceDelta, privacyDelta, startupDelta, durationDelta);
    const summary = this._generateComparisonSummary(reportA, reportB, healthDelta, storageDelta);

    const comparison: ReportComparison = {
      id: generateComparisonId(),
      reportAId,
      reportBId,
      generatedAt: new Date().toISOString(),
      healthDelta,
      storageDelta,
      performanceDelta,
      privacyDelta,
      startupDelta,
      durationDelta,
      summary,
      winner,
    };

    this._comparisons.set(comparison.id, comparison);

    if (this._config.enableEvents) {
      this._events.emitComparisonGenerated(comparison.id, { reportAId, reportBId });
    }
    this._history.record(reportAId, 'compared', { reportBId, comparisonId: comparison.id });

    return comparison;
  }

  getReportStatistics(): ReportStatistics {
    const all = this.getReports();
    const byResult: Record<string, number> = {};
    let totalHealthDelta = 0;
    let healthDeltaCount = 0;
    let totalStorageRecovered = 0;
    let totalStartupSaved = 0;
    let totalDuration = 0;
    let totalConfidence = 0;
    let totalRecsResolved = 0;

    for (const report of all) {
      byResult[report.overallResult] = (byResult[report.overallResult] ?? 0) + 1;
      if (report.healthDelta !== null) {
        totalHealthDelta += report.healthDelta;
        healthDeltaCount++;
      }
      totalStorageRecovered += report.storageRecovered;
      totalStartupSaved += report.startupImprovement;
      totalDuration += report.duration;
      totalConfidence += report.confidence;
      totalRecsResolved += report.recommendationsResolved;
    }

    const count = all.length || 1;

    return {
      totalReports: all.length,
      byResult,
      averageHealthDelta: healthDeltaCount > 0 ? totalHealthDelta / healthDeltaCount : 0,
      totalStorageRecovered,
      totalStartupSaved,
      averageDuration: totalDuration / count,
      averageConfidence: all.length > 0 ? totalConfidence / all.length : 0,
      totalRecommendationsResolved: totalRecsResolved,
    };
  }

  validateReport(reportId: string): ReportValidationResult | null {
    const report = this._reports.get(reportId);
    if (!report) return null;
    return this._validator.validate(report);
  }

  markViewed(reportId: string): boolean {
    const report = this._reports.get(reportId);
    if (!report) return false;

    report.status = 'viewed';
    if (this._config.enableEvents) {
      this._events.emitViewed(reportId);
    }
    this._history.record(reportId, 'viewed');
    return true;
  }

  on(event: ReportEventType, listener: ReportEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: ReportEventType, listener: ReportEventListener): void {
    this._events.off(event, listener);
  }

  get config(): ReportConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<ReportConfiguration>): void {
    this._config = createReportConfiguration(overrides);
    this._builder.updateConfig(this._config);
    this._exporter.updateConfig(this._config);
  }

  get history(): ReportHistory {
    return this._history;
  }

  get comparisons(): ReportComparison[] {
    return Array.from(this._comparisons.values());
  }

  clear(): void {
    this._reports.clear();
    this._comparisons.clear();
    this._history.clear();
    this._events.clear();
  }

  private _determineWinner(
    healthDelta: number | null,
    storageDelta: number,
    performanceDelta: number,
    privacyDelta: number,
    startupDelta: number,
    durationDelta: number,
  ): 'a' | 'b' | 'tie' {
    let scoreA = 0;
    let scoreB = 0;

    if (healthDelta !== null) {
      if (healthDelta > 0) scoreA++;
      else if (healthDelta < 0) scoreB++;
    }
    if (storageDelta > 0) scoreA++;
    else if (storageDelta < 0) scoreB++;
    if (performanceDelta > 0) scoreA++;
    else if (performanceDelta < 0) scoreB++;
    if (privacyDelta > 0) scoreA++;
    else if (privacyDelta < 0) scoreB++;
    if (startupDelta > 0) scoreA++;
    else if (startupDelta < 0) scoreB++;
    if (durationDelta < 0) scoreA++;
    else if (durationDelta > 0) scoreB++;

    if (scoreA > scoreB) return 'a';
    if (scoreB > scoreA) return 'b';
    return 'tie';
  }

  private _generateComparisonSummary(
    reportA: OptimizationReport,
    reportB: OptimizationReport,
    healthDelta: number | null,
    storageDelta: number,
  ): string {
    const parts: string[] = [];
    parts.push(`Comparing "${reportA.title}" vs "${reportB.title}".`);
    if (healthDelta !== null) {
      const sign = healthDelta >= 0 ? '+' : '';
      parts.push(`Health delta difference: ${sign}${healthDelta}.`);
    }
    if (storageDelta !== 0) {
      parts.push(`Storage difference: ${Math.abs(storageDelta)} bytes ${storageDelta > 0 ? 'more' : 'less'} in report A.`);
    }
    return parts.join(' ');
  }
}
