/**
 * ReportsView — generates and displays reports from the ExecutionReportBuilder.
 *
 * Supports:
 *   Today, Last 7 Days, Last 30 Days, Custom Date Range, Schedule-specific
 *
 * Displays:
 *   Summary, Performance Metrics, Recovered Space, Task Statistics, Overall Health
 */
import React, { useState, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import {
  CalendarDaysIcon,
  ChartBarIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { maintenanceHistoryService } from '../../maintenance-history';
import type { ExecutionReport, ReportHealthStatus } from '../../maintenance-history';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

type DateRange = 'today' | '7days' | '30days' | 'custom' | 'schedule';

const RANGE_OPTIONS: { id: DateRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7days', label: 'Last 7 Days' },
  { id: '30days', label: 'Last 30 Days' },
  { id: 'custom', label: 'Custom Range' },
  { id: 'schedule', label: 'By Schedule' },
];

const HEALTH_CONFIG: Record<ReportHealthStatus, { tone: 'success' | 'brand' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  excellent: { tone: 'success', label: 'Excellent' },
  good: { tone: 'brand', label: 'Good' },
  fair: { tone: 'warning', label: 'Fair' },
  poor: { tone: 'danger', label: 'Poor' },
  unknown: { tone: 'neutral', label: 'Unknown' },
};

export const ReportsView = React.memo(function ReportsView() {
  const [range, setRange] = useState<DateRange>('30days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [report, setReport] = useState<ExecutionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      let r: ExecutionReport;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      switch (range) {
        case 'today':
          r = maintenanceHistoryService.generateReportForRange(todayStart, now.toISOString());
          break;
        case '7days': {
          const start = new Date(now);
          start.setDate(start.getDate() - 7);
          r = maintenanceHistoryService.generateReportForRange(start.toISOString(), now.toISOString());
          break;
        }
        case '30days': {
          const start = new Date(now);
          start.setDate(start.getDate() - 30);
          r = maintenanceHistoryService.generateReportForRange(start.toISOString(), now.toISOString());
          break;
        }
        case 'custom':
          if (!customFrom || !customTo) {
            setError('Please select both start and end dates.');
            setLoading(false);
            return;
          }
          r = maintenanceHistoryService.generateReportForRange(
            new Date(customFrom).toISOString(),
            new Date(customTo + 'T23:59:59').toISOString(),
          );
          break;
        case 'schedule':
          if (!scheduleId.trim()) {
            setError('Please enter a schedule ID.');
            setLoading(false);
            return;
          }
          r = maintenanceHistoryService.generateReportForSchedule(scheduleId.trim());
          break;
      }
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [range, customFrom, customTo, scheduleId]);

  // Auto-generate on range change (except custom/schedule which need input)
  React.useEffect(() => {
    if (range === 'today' || range === '7days' || range === '30days') {
      generate();
    }
  }, [range, generate]);

  return (
    <div className="space-y-6" data-testid="reports-view">
      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-2" data-testid="reports-range-selector">
        {RANGE_OPTIONS.map((opt) => (
          <Button
            key={opt.id}
            variant={range === opt.id ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setRange(opt.id)}
            data-testid={`range-option-${opt.id}`}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Custom range inputs */}
      {range === 'custom' && (
        <div className="flex flex-wrap items-end gap-4" data-testid="custom-range-inputs">
          <div>
            <label className="block text-xs font-medium text-[var(--avs-text-muted)] mb-1">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-sm text-[var(--avs-text-primary)] outline-none focus:border-[var(--avs-brand-primary)]"
              aria-label="Start date"
              data-testid="custom-date-from"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--avs-text-muted)] mb-1">To</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-sm text-[var(--avs-text-primary)] outline-none focus:border-[var(--avs-brand-primary)]"
              aria-label="End date"
              data-testid="custom-date-to"
            />
          </div>
          <Button variant="primary" size="sm" onClick={generate} leftIcon={<ChartBarIcon className="h-4 w-4" />} data-testid="custom-generate-btn">
            Generate
          </Button>
        </div>
      )}

      {/* Schedule input */}
      {range === 'schedule' && (
        <div className="flex flex-wrap items-end gap-4" data-testid="schedule-inputs">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-[var(--avs-text-muted)] mb-1">Schedule ID</label>
            <input
              type="text"
              value={scheduleId}
              onChange={(e) => setScheduleId(e.target.value)}
              placeholder="e.g. daily-junk-clean"
              className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-sm text-[var(--avs-text-primary)] outline-none focus:border-[var(--avs-brand-primary)]"
              aria-label="Schedule ID"
              data-testid="schedule-id-input"
            />
          </div>
          <Button variant="primary" size="sm" onClick={generate} leftIcon={<ChartBarIcon className="h-4 w-4" />} data-testid="schedule-generate-btn">
            Generate
          </Button>
        </div>
      )}

      {/* Error */}
      {error && <ErrorState message={error} onRetry={generate} testId="reports-error" />}

      {/* Loading */}
      {loading && (
        <div className="space-y-4" data-testid="reports-loading">
          <div className="h-32 animate-pulse rounded-[var(--avs-radius-lg)] bg-[var(--avs-surface-muted)]" />
          <div className="h-48 animate-pulse rounded-[var(--avs-radius-lg)] bg-[var(--avs-surface-muted)]" />
        </div>
      )}

      {/* Report */}
      {!loading && !error && report && (
        <ReportContent report={report} />
      )}

      {/* Empty state */}
      {!loading && !error && !report && (
        <EmptyState
          icon={<ChartBarIcon className="h-8 w-8" />}
          title="No report generated"
          description="Select a date range above and generate a report to view maintenance analytics."
          testId="reports-empty"
        />
      )}
    </div>
  );
});

// ── Report Content ────────────────────────────────────────────

function ReportContent({ report }: { report: ExecutionReport }) {
  const health = HEALTH_CONFIG[report.overallHealth] ?? { tone: 'neutral' as const, label: 'Unknown' };

  return (
    <div className="space-y-6" data-testid="report-content">
      {/* Overall Health + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Overall Health" data-testid="report-health">
          <div className="flex flex-col items-center py-4">
            <Badge tone={health.tone} className="text-base px-4 py-1" data-testid="report-health-badge">
              {health.label}
            </Badge>
            <p className="mt-3 text-sm text-[var(--avs-text-secondary)] text-center">
              {report.summary.totalExecutions} executions in this period
            </p>
          </div>
        </Card>

        <Card title="Summary" className="lg:col-span-2" data-testid="report-summary">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryStat icon={<CheckCircleIcon className="h-4 w-4" />} label="Successful" value={report.summary.successful} />
            <SummaryStat icon={<ExclamationCircleIcon className="h-4 w-4" />} label="Failed" value={report.summary.failed} />
            <SummaryStat icon={<ClockIcon className="h-4 w-4" />} label="Avg Duration" value={formatDuration(report.summary.averageDurationMs)} />
            <SummaryStat icon={<TrophyIcon className="h-4 w-4" />} label="Success Rate" value={`${report.summary.successRate.toFixed(0)}%`} />
            <SummaryStat icon={<CalendarDaysIcon className="h-4 w-4" />} label="Total Runs" value={report.summary.totalExecutions} />
            <SummaryStat icon={<ArrowPathIcon className="h-4 w-4" />} label="Partial" value={report.summary.partial} />
            <SummaryStat icon={<ChartBarIcon className="h-4 w-4" />} label="Files Removed" value={report.summary.totalFilesRemoved} />
            <SummaryStat icon={<ArrowPathIcon className="h-4 w-4" />} label="Space Recovered" value={formatBytes(report.summary.totalSpaceRecovered)} />
          </div>
        </Card>
      </div>

      {/* Performance Metrics */}
      <Card title="Performance Metrics" data-testid="report-performance">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryStat label="Avg Duration" value={formatDuration(report.performanceMetrics.averageDurationMs)} />
          <SummaryStat label="Longest Run" value={formatDuration(report.performanceMetrics.longestRunMs)} />
          <SummaryStat label="Shortest Run" value={formatDuration(report.performanceMetrics.shortestRunMs)} />
          <SummaryStat label="Avg Space/Run" value={formatBytes(report.performanceMetrics.averageSpacePerExecution)} />
        </div>
      </Card>

      {/* Recovered Space */}
      <Card title="Recovered Space" data-testid="report-recovered-space">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryStat label="Total Space" value={formatBytes(report.recoveredSpace.totalBytes)} />
          <SummaryStat label="Total Files" value={report.recoveredSpace.totalFiles} />
          <SummaryStat label="Total Folders" value={report.recoveredSpace.totalFolders} />
          <SummaryStat label="Largest Cleanup" value={formatBytes(report.recoveredSpace.largestSingleCleanup)} />
          <SummaryStat label="Recycle Bin" value={report.recoveredSpace.totalRecycleBinItems} />
          <SummaryStat label="Temp Files" value={report.recoveredSpace.totalTempFiles} />
          <SummaryStat label="Browser Data" value={report.recoveredSpace.totalBrowserData} />
          <SummaryStat label="Registry" value={report.recoveredSpace.totalRegistryEntries} />
        </div>
      </Card>

      {/* Task Statistics */}
      <Card title="Task Statistics" data-testid="report-task-stats">
        {report.taskResults.length === 0 ? (
          <p className="text-sm text-[var(--avs-text-muted)]">No task data in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead className="bg-[var(--avs-surface-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-[var(--avs-text-secondary)]">Task</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--avs-text-secondary)]">Runs</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--avs-text-secondary)]">Success</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--avs-text-secondary)]">Failed</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--avs-text-secondary)]">Files</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--avs-text-secondary)]">Space</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--avs-text-secondary)]">Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {report.taskResults.map((task) => (
                  <tr key={task.taskId} className="border-t border-[var(--avs-border)]" data-testid={`report-task-row-${task.taskId}`}>
                    <td className="px-3 py-2 text-[var(--avs-text-primary)]">{task.taskName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--avs-text-secondary)]">{task.executionCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--avs-text-secondary)]">{task.successCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--avs-text-secondary)]">{task.failureCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--avs-text-secondary)]">{task.totalFilesRemoved}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--avs-text-secondary)] whitespace-nowrap">{formatBytes(task.totalSpaceRecovered)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--avs-text-secondary)] whitespace-nowrap">{formatDuration(task.averageDurationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Warnings & Errors */}
      {(report.warnings.length > 0 || report.errors.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.warnings.length > 0 && (
            <Card title={`Warnings (${report.warnings.length})`} data-testid="report-warnings">
              <div className="max-h-40 overflow-y-auto space-y-1 text-sm text-[var(--avs-warning)]">
                {report.warnings.slice(0, 20).map((w, i) => <div key={i}>• {w}</div>)}
                {report.warnings.length > 20 && <div className="text-xs">...and {report.warnings.length - 20} more</div>}
              </div>
            </Card>
          )}
          {report.errors.length > 0 && (
            <Card title={`Errors (${report.errors.length})`} data-testid="report-errors">
              <div className="max-h-40 overflow-y-auto space-y-1 text-sm text-[var(--avs-danger)]">
                {report.errors.slice(0, 20).map((e, i) => <div key={i}>• {e}</div>)}
                {report.errors.length > 20 && <div className="text-xs">...and {report.errors.length - 20} more</div>}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--avs-text-muted)]">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[var(--avs-text-primary)] tabular-nums">{value}</div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

