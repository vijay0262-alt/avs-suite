/**
 * MaintenanceCharts — visualizations using recharts.
 *
 * Charts:
 *   1. Executions Over Time (area chart)
 *   2. Recovered Space Trend (area chart)
 *   3. Success Rate Trend (line chart)
 *   4. Most Frequently Executed Tasks (bar chart)
 *   5. Cleanup Duration Trend (line chart)
 *
 * Uses the existing `recharts` dependency (^2.12.4).
 */
import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Card } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { EmptyState } from './EmptyState';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import type { ChartDataPoint, TaskFrequencyData } from '../useMaintenanceHistory';

export interface MaintenanceChartsProps {
  chartData: ChartDataPoint[];
  taskFrequency: TaskFrequencyData[];
  loading?: boolean;
}

export const MaintenanceCharts = React.memo(function MaintenanceCharts({
  chartData,
  taskFrequency,
  loading,
}: MaintenanceChartsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="maintenance-charts">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)]"
          />
        ))}
      </div>
    );
  }

  if (chartData.length === 0 && taskFrequency.length === 0) {
    return (
      <Card title="Analytics">
        <EmptyState
          icon={<ChartBarIcon className="h-8 w-8" />}
          title="No analytics data yet"
          description="Maintenance analytics will appear here after your first automated cleanup."
          testId="charts-empty-state"
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="maintenance-charts">
      {/* Executions Over Time */}
      <Card title="Executions Over Time" data-testid="chart-executions">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorExecutions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--avs-brand-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--avs-brand-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--avs-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--avs-text-muted)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--avs-text-muted)" allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--avs-surface)',
                  border: '1px solid var(--avs-border)',
                  borderRadius: 'var(--avs-radius-md)',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="executions"
                stroke="var(--avs-brand-primary)"
                fill="url(#colorExecutions)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Recovered Space Trend */}
      <Card title="Recovered Space Trend" data-testid="chart-space-trend">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorSpace" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--avs-success)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--avs-success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--avs-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--avs-text-muted)" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--avs-text-muted)"
                tickFormatter={(v: number) => formatBytes(v)}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--avs-surface)',
                  border: '1px solid var(--avs-border)',
                  borderRadius: 'var(--avs-radius-md)',
                  fontSize: '12px',
                }}
                formatter={(v: number) => [formatBytes(v), 'Space Recovered']}
              />
              <Area
                type="monotone"
                dataKey="spaceRecovered"
                stroke="var(--avs-success)"
                fill="url(#colorSpace)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Success Rate Trend */}
      <Card title="Success Rate Trend" data-testid="chart-success-rate">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--avs-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--avs-text-muted)" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--avs-text-muted)"
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--avs-surface)',
                  border: '1px solid var(--avs-border)',
                  borderRadius: 'var(--avs-radius-md)',
                  fontSize: '12px',
                }}
                formatter={(v: number) => [`${v.toFixed(0)}%`, 'Success Rate']}
              />
              <Line
                type="monotone"
                dataKey="successRate"
                stroke="var(--avs-brand-primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Most Frequently Executed Tasks */}
      <Card title="Most Executed Tasks" data-testid="chart-task-frequency">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={taskFrequency}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--avs-border)" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--avs-text-muted)" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="taskName"
                tick={{ fontSize: 11 }}
                stroke="var(--avs-text-muted)"
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--avs-surface)',
                  border: '1px solid var(--avs-border)',
                  borderRadius: 'var(--avs-radius-md)',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="count" fill="var(--avs-brand-primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Cleanup Duration Trend */}
      <Card title="Cleanup Duration Trend" data-testid="chart-duration-trend">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--avs-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--avs-text-muted)" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--avs-text-muted)"
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}s` : `${v}ms`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--avs-surface)',
                  border: '1px solid var(--avs-border)',
                  borderRadius: 'var(--avs-radius-md)',
                  fontSize: '12px',
                }}
                formatter={(v: number) => [`${v}ms`, 'Avg Duration']}
              />
              <Line
                type="monotone"
                dataKey="avgDuration"
                stroke="var(--avs-warning)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
});
