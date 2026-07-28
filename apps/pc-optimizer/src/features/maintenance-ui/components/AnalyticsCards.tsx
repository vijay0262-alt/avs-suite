/**
 * AnalyticsCards — summary cards showing key maintenance statistics.
 *
 * Cards:
 *   Total Executions, Success Rate, Total Space Recovered,
 *   Average Duration, Last Maintenance Run, Largest Cleanup
 *
 * Automatically updates when statistics change (via useMaintenanceHistory).
 */
import React from 'react';
import { StatTile } from '@avs/ui';
import {
  ChartBarIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  CalendarDaysIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { formatBytes } from '@avs/shared/utils';
import type { ExecutionStatistics } from '../../maintenance-history';

export interface AnalyticsCardsProps {
  statistics: ExecutionStatistics;
  loading?: boolean;
}

export const AnalyticsCards = React.memo(function AnalyticsCards({
  statistics,
  loading,
}: AnalyticsCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4" data-testid="analytics-cards">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)]"
          />
        ))}
      </div>
    );
  }

  const lastRunText = statistics.lastRunAt
    ? new Date(statistics.lastRunAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Never';

  const largestCleanupText =
    statistics.largestCleanupBytes > 0
      ? formatBytes(statistics.largestCleanupBytes)
      : '—';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4" data-testid="analytics-cards">
      <StatTile
        label="Total Runs"
        value={statistics.totalExecutions}
        icon={<ChartBarIcon className="h-5 w-5" />}
        data-testid="card-total-executions"
      />
      <StatTile
        label="Success Rate"
        value={`${statistics.successRate.toFixed(0)}%`}
        icon={<CheckCircleIcon className="h-5 w-5" />}
        hint={`${statistics.successfulExecutions} succeeded`}
        data-testid="card-success-rate"
      />
      <StatTile
        label="Space Recovered"
        value={formatBytes(statistics.totalSpaceRecovered)}
        icon={<ArrowDownTrayIcon className="h-5 w-5" />}
        data-testid="card-space-recovered"
      />
      <StatTile
        label="Avg Duration"
        value={formatDuration(statistics.averageDurationMs)}
        icon={<ClockIcon className="h-5 w-5" />}
        data-testid="card-avg-duration"
      />
      <StatTile
        label="Last Run"
        value={lastRunText}
        icon={<CalendarDaysIcon className="h-5 w-5" />}
        data-testid="card-last-run"
      />
      <StatTile
        label="Largest Cleanup"
        value={largestCleanupText}
        icon={<TrophyIcon className="h-5 w-5" />}
        data-testid="card-largest-cleanup"
      />
    </div>
  );
});

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
