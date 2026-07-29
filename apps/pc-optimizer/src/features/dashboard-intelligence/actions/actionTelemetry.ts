/**
 * Action Telemetry — tracks action usage, latency, errors, success rate.
 *
 * All tracking is optional and configurable via telemetry rules.
 */
import type {
  ActionTelemetryData,
  ActionTelemetryStatistics,
  ActionTelemetryRules,
  DashboardActionType,
  ActionRoute,
} from './types';

export class ActionTelemetry {
  private _records: ActionTelemetryData[] = [];
  private _rules: ActionTelemetryRules;
  private _maxRecords: number;

  constructor(rules: ActionTelemetryRules, maxRecords: number = 1000) {
    this._rules = rules;
    this._maxRecords = maxRecords;
  }

  updateRules(rules: ActionTelemetryRules): void {
    this._rules = rules;
  }

  recordInvocation(
    actionId: string,
    actionType: DashboardActionType,
    widgetId: string,
  ): void {
    if (!this._rules.enabled || !this._rules.trackUsage) return;
    this._records.push({
      actionId,
      actionType,
      widgetId,
      invokedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: 0,
      success: false,
      error: null,
      route: null,
    });
    this._trim();
  }

  recordCompletion(
    actionId: string,
    durationMs: number,
    success: boolean,
    error: string | null,
    route: ActionRoute | null,
  ): void {
    if (!this._rules.enabled) return;
    const record = this._records.find((r) => r.actionId === actionId && r.completedAt === null);
    if (record) {
      record.completedAt = new Date().toISOString();
      record.durationMs = this._rules.trackLatency ? durationMs : 0;
      record.success = success;
      record.error = this._rules.trackErrors ? error : null;
      record.route = route;
    }
  }

  getStatistics(): ActionTelemetryStatistics {
    const total = this._records.length;
    const completed = this._records.filter((r) => r.completedAt !== null);
    const successes = completed.filter((r) => r.success);
    const failures = completed.filter((r) => !r.success);
    const cancellations = completed.filter((r) => r.error === 'cancelled');

    const byActionType: Record<string, number> = {};
    const byWidget: Record<string, number> = {};
    const actionCounts: Map<string, number> = new Map();

    for (const r of this._records) {
      byActionType[r.actionType] = (byActionType[r.actionType] ?? 0) + 1;
      byWidget[r.widgetId] = (byWidget[r.widgetId] ?? 0) + 1;
      actionCounts.set(r.actionId, (actionCounts.get(r.actionId) ?? 0) + 1);
    }

    const popularActions = this._rules.trackPopularActions
      ? Array.from(actionCounts.entries())
          .map(([actionId, count]) => ({ actionId, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      : [];

    const avgDuration = completed.length > 0
      ? completed.reduce((sum, r) => sum + r.durationMs, 0) / completed.length
      : 0;

    return {
      totalInvocations: total,
      totalCompletions: completed.length,
      totalFailures: failures.length,
      totalCancellations: cancellations.length,
      averageDurationMs: avgDuration,
      successRate: completed.length > 0 ? successes.length / completed.length : 0,
      byActionType,
      byWidget,
      popularActions,
    };
  }

  getRecords(): ActionTelemetryData[] {
    return [...this._records];
  }

  clear(): void {
    this._records = [];
  }

  get count(): number {
    return this._records.length;
  }

  private _trim(): void {
    if (this._records.length > this._maxRecords) {
      this._records = this._records.slice(-this._maxRecords);
    }
  }
}
