/**
 * Report Manager — top-level orchestrator for Optimization Intelligence Reports.
 *
 * Public APIs:
 *   generateReport()
 *   getReport()
 *   getReports()
 *   getReportByExecution()
 *   regenerateReport()
 *   getReportStatistics()
 *   shareReport()
 *   archiveReport()
 *   on() / off()
 */
import type { ExecutionReport } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';
import type {
  IntelligenceReport,
  ReportStatistics,
  ReportConfiguration,
  ReportEventType,
  ReportEventListener,
} from './types';
import { ReportEvents } from './reportEvents';
import { ReportHistory } from './reportHistory';
import { ReportRegistry } from './reportRegistry';
import { ReportBuilder } from './reportBuilder';
import { createReportConfiguration, type DeepPartial } from './reportConfiguration';

export class ReportManager {
  private _config: ReportConfiguration;
  private _registry: ReportRegistry;
  private _events: ReportEvents;
  private _history: ReportHistory;
  private _builder: ReportBuilder;

  constructor(config?: ReportConfiguration | DeepPartial<ReportConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as ReportConfiguration;
    } else {
      this._config = createReportConfiguration(config as DeepPartial<ReportConfiguration>);
    }

    this._registry = new ReportRegistry();
    this._events = new ReportEvents();
    this._history = new ReportHistory();
    this._builder = new ReportBuilder(this._config);
  }

  generateReport(
    executionReport: ExecutionReport,
    plan: OptimizationPlanV2,
    options?: {
      healthAfter?: number | null;
      recommendationsRemaining?: number;
      recommendationPriorityBreakdown?: Record<string, number>;
    },
  ): IntelligenceReport {
    const report = this._builder.build(executionReport, plan, options);
    this._registry.register(report);

    if (this._config.enableEvents) {
      this._events.emitGenerated(report.id, { executionId: report.executionId, planId: report.planId });
    }
    this._history.record(report.id, 'generated', { executionId: report.executionId });

    return report;
  }

  getReport(reportId: string): IntelligenceReport | undefined {
    return this._registry.get(reportId);
  }

  getReports(): IntelligenceReport[] {
    return this._registry.getAll();
  }

  getReportByExecution(executionId: string): IntelligenceReport | undefined {
    return this._registry.getByExecution(executionId);
  }

  regenerateReport(
    executionReport: ExecutionReport,
    plan: OptimizationPlanV2,
    options?: {
      healthAfter?: number | null;
      recommendationsRemaining?: number;
      recommendationPriorityBreakdown?: Record<string, number>;
    },
  ): IntelligenceReport {
    const existing = this._registry.getByExecution(executionReport.executionId);
    if (existing) {
      this._registry.unregister(existing.id);
    }

    const report = this._builder.build(executionReport, plan, options);
    this._registry.register(report);

    if (this._config.enableEvents) {
      this._events.emitRegenerated(report.id, { executionId: report.executionId });
    }
    this._history.record(report.id, 'regenerated', { executionId: report.executionId });

    return report;
  }

  getReportStatistics(): ReportStatistics {
    const all = this._registry.getAll();
    const byOutcome: Record<string, number> = {};
    let totalHealthDelta = 0;
    let healthDeltaCount = 0;
    let totalStorageRecovered = 0;
    let totalStartupSaved = 0;
    let totalExecutionTimeMs = 0;
    let totalConfidence = 0;

    for (const report of all) {
      byOutcome[report.story.outcome] = (byOutcome[report.story.outcome] ?? 0) + 1;

      if (report.healthDelta.delta !== null) {
        totalHealthDelta += report.healthDelta.delta;
        healthDeltaCount++;
      }

      totalStorageRecovered += report.storageRecovered.bytes;
      totalStartupSaved += report.startupImprovement.secondsSaved;
      totalExecutionTimeMs += report.executionTime.durationMs;
      totalConfidence += report.story.confidenceScore;
    }

    const count = all.length || 1;

    return {
      totalReports: all.length,
      byOutcome,
      averageHealthDelta: healthDeltaCount > 0 ? totalHealthDelta / healthDeltaCount : 0,
      totalStorageRecovered,
      totalStartupSaved,
      averageExecutionTimeMs: totalExecutionTimeMs / count,
      averageConfidence: all.length > 0 ? totalConfidence / all.length : 0,
    };
  }

  shareReport(reportId: string): boolean {
    const report = this._registry.get(reportId);
    if (!report) return false;

    if (this._config.enableEvents) {
      this._events.emitShared(reportId);
    }
    this._history.record(reportId, 'shared');
    return true;
  }

  archiveReport(reportId: string): boolean {
    const report = this._registry.get(reportId);
    if (!report) return false;

    if (this._config.enableEvents) {
      this._events.emitArchived(reportId);
    }
    this._history.record(reportId, 'archived');
    return true;
  }

  markViewed(reportId: string): boolean {
    const report = this._registry.get(reportId);
    if (!report) return false;

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
  }

  get history(): ReportHistory {
    return this._history;
  }

  get registry(): ReportRegistry {
    return this._registry;
  }

  clear(): void {
    this._registry.clear();
    this._history.clear();
    this._events.clear();
  }
}
