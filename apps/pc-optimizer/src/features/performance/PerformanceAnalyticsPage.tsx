/**
 * PerformanceAnalyticsPage — standalone performance analytics page.
 *
 * Uses the PerformanceViewModel to show:
 *   - CPU, Memory, Disk, Network metrics
 *   - Graph history with sparklines
 *   - Top processes
 *   - System alerts
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleLoadingState, ModuleErrorState } from '../../components/ModuleStates';
import { PerformanceViewModel } from '../performance/PerformanceViewModel';
import { performanceService } from '../performance/performance.service';
import {
  BoltIcon,
  ChartBarIcon,
  CpuChipIcon,
  CircleStackIcon,
  WifiIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export default function PerformanceAnalyticsPage() {
  const vm = useMemo(() => new PerformanceViewModel(performanceService), []);
  const state = useViewModel(vm);
  const [sortBy, setSortBy] = useState('cpu');

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleRefresh = () => {
    void vm.loadMetrics();
    void vm.loadAlerts();
  };

  const handleLoadProcesses = () => {
    void vm.loadTopProcesses(sortBy, 15, '');
  };

  if (state.bootstrap === 'loading') {
    return (
      <div className="p-6">
        <PageHeader title="Performance Analytics" description="Real-time performance monitoring and trend analysis" />
        <ModuleLoadingState message="Loading performance metrics..." />
      </div>
    );
  }

  if (state.bootstrap === 'error') {
    return (
      <div className="p-6">
        <PageHeader title="Performance Analytics" description="Real-time performance monitoring and trend analysis" />
        <ModuleErrorState message={state.bootstrapError ?? 'Unknown error'} onRetry={() => vm.bootstrap()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Analytics"
        description="Real-time performance monitoring with historical trends and process analysis"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => vm.optimizeMemory()} disabled={state.optimizing} leftIcon={<BoltIcon className={`h-4 w-4 ${state.optimizing ? 'animate-spin' : ''}`} />}>
              {state.optimizing ? 'Optimizing...' : 'Optimize Memory'}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleRefresh} disabled={state.loading} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
              {state.loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        }
      />

      {/* Metrics Grid */}
      {state.metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card variant="glass">
            <div className="flex items-center gap-2">
              <CpuChipIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
              <span className="text-sm font-medium text-[var(--avs-text-primary)]">CPU</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-[var(--avs-text-primary)]">{state.metrics.cpu.usage.toFixed(1)}%</p>
            <p className="text-xs text-[var(--avs-text-muted)]">{state.metrics.cpu.processorName}</p>
            <p className="text-xs text-[var(--avs-text-muted)]">{vm.formatFrequency(state.metrics.cpu.clockSpeed)} · {state.metrics.cpu.temperatureCelsius}°C</p>
          </Card>

          <Card variant="glass">
            <div className="flex items-center gap-2">
              <CircleStackIcon className="h-5 w-5 text-[var(--avs-success)]" />
              <span className="text-sm font-medium text-[var(--avs-text-primary)]">Memory</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-[var(--avs-text-primary)]">{state.metrics.memory.usage.toFixed(1)}%</p>
            <p className="text-xs text-[var(--avs-text-muted)]">{vm.formatBytes(state.metrics.memory.used)} / {vm.formatBytes(state.metrics.memory.total)}</p>
            <p className="text-xs text-[var(--avs-text-muted)]">Cached: {vm.formatBytes(state.metrics.memory.cached)}</p>
          </Card>

          <Card variant="glass">
            <div className="flex items-center gap-2">
              <ChartBarIcon className="h-5 w-5 text-[var(--avs-warning)]" />
              <span className="text-sm font-medium text-[var(--avs-text-primary)]">Disk</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-[var(--avs-text-primary)]">{state.metrics.disk.activeTime.toFixed(1)}%</p>
            <p className="text-xs text-[var(--avs-text-muted)]">Read: {vm.formatBytes(state.metrics.disk.readSpeed)}/s</p>
            <p className="text-xs text-[var(--avs-text-muted)]">Write: {vm.formatBytes(state.metrics.disk.writeSpeed)}/s</p>
          </Card>

          <Card variant="glass">
            <div className="flex items-center gap-2">
              <WifiIcon className="h-5 w-5 text-[var(--avs-info)]" />
              <span className="text-sm font-medium text-[var(--avs-text-primary)]">Network</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-[var(--avs-text-primary)]">{vm.formatBytes(state.metrics.network.downloadSpeed)}/s</p>
            <p className="text-xs text-[var(--avs-text-muted)]">Upload: {vm.formatBytes(state.metrics.network.uploadSpeed)}/s</p>
            <p className="text-xs text-[var(--avs-text-muted)]">Total: {vm.formatBytes(state.metrics.network.totalBytesReceived + state.metrics.network.totalBytesSent)}</p>
          </Card>
        </div>
      )}

      {/* Graph History */}
      {state.graphHistory && (
        <Card title="Performance Trends" variant="glass">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-[var(--avs-text-secondary)] mb-2">CPU Usage History</p>
              <Sparkline data={state.graphHistory.cpu} color="var(--avs-brand-primary)" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--avs-text-secondary)] mb-2">Memory Usage History</p>
              <Sparkline data={state.graphHistory.memory} color="var(--avs-success)" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--avs-text-secondary)] mb-2">Disk Read History</p>
              <Sparkline data={state.graphHistory.diskRead} color="var(--avs-warning)" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--avs-text-secondary)] mb-2">Network Download History</p>
              <Sparkline data={state.graphHistory.networkDownload} color="var(--avs-info)" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => vm.clearGraphHistory()}>Clear History</Button>
          </div>
        </Card>
      )}

      {/* Top Processes */}
      <Card title="Top Processes" variant="glass">
        <div className="flex items-center gap-2 mb-3">
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); handleLoadProcesses(); }}
            className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2 py-1 text-xs text-[var(--avs-text-primary)]"
          >
            <option value="cpu">Sort by CPU</option>
            <option value="memory">Sort by Memory</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
        {state.topProcesses.length > 0 ? (
          <div className="space-y-1">
            {state.topProcesses.map((proc) => (
              <div key={proc.pid} className="flex items-center gap-3 rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <span className="text-xs text-[var(--avs-text-muted)] w-12">{proc.pid}</span>
                <span className="text-sm text-[var(--avs-text-primary)] flex-1 truncate">{proc.name}</span>
                <span className="text-xs text-[var(--avs-text-secondary)]">{proc.cpuPercent.toFixed(1)}% CPU</span>
                <span className="text-xs text-[var(--avs-text-secondary)]">{vm.formatBytes(proc.memoryBytes)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--avs-text-muted)] py-4 text-center">No process data available</p>
        )}
      </Card>

      {/* Alerts */}
      {state.alerts.length > 0 && (
        <Card title="Performance Alerts" variant="glass">
          <div className="space-y-2">
            {state.alerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-3">
                <ExclamationTriangleIcon className={`h-4 w-4 ${alert.severity === 'critical' ? 'text-[var(--avs-danger)]' : alert.severity === 'warning' ? 'text-[var(--avs-warning)]' : 'text-[var(--avs-info)]'}`} />
                <div className="flex-1">
                  <p className="text-sm text-[var(--avs-text-primary)]">{alert.message}</p>
                  <p className="text-xs text-[var(--avs-text-muted)]">Value: {alert.value} / Threshold: {alert.threshold}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Optimize Result */}
      {state.optimizeResult && (
        <Card title="Optimization Result" variant="glass">
          <div className="space-y-2 text-sm">
            <p className="text-[var(--avs-text-primary)]">Memory freed: {vm.formatBytes(state.optimizeResult.memoryFreed)}</p>
            <p className="text-[var(--avs-text-secondary)]">Processes optimized: {state.optimizeResult.processesOptimized}</p>
            <p className="text-[var(--avs-text-secondary)]">Health improvement: +{state.optimizeResult.healthImprovement} points</p>
            <p className="text-[var(--avs-text-muted)]">Time: {state.optimizeResult.optimizationTimeMs}ms</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return <div className="h-12 text-xs text-[var(--avs-text-muted)] flex items-center">No data</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 200;
  const height = 40;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="w-full">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}
