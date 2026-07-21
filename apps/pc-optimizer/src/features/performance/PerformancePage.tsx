/**
 * PerformancePage - Main Performance Monitor page
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { PerformanceViewModel } from './PerformanceViewModel';
import { performanceService } from './performance.service';
import { BoltIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function PerformancePage() {
  const vm = useMemo(() => new PerformanceViewModel(performanceService), []);
  const state = useViewModel(vm);
  const [sortBy, setSortBy] = useState('cpu');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleRefresh = () => {
    void vm.loadMetrics();
    void vm.loadAlerts();
  };

  const handleLoadProcesses = () => {
    void vm.loadTopProcesses(sortBy, 10, searchTerm);
  };

  const handleClearHistory = () => {
    void vm.clearGraphHistory();
  };

  const handleOptimize = () => {
    void vm.optimizeMemory();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500';
      case 'warning': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div data-testid="page-performance">
      <PageHeader
        title="Performance Monitor"
        description="Real-time system performance monitoring and analysis"
      />

      {state.bootstrap === 'loading' && (
        <Card>
          <div className="text-center py-8">
            <p className="text-text-secondary">Loading performance metrics...</p>
          </div>
        </Card>
      )}

      {state.bootstrap === 'error' && (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{state.bootstrapError}</p>
            <Button onClick={() => vm.bootstrap()}>Retry</Button>
          </div>
        </Card>
      )}

      {state.bootstrap === 'ready' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">System Metrics</h2>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleOptimize}
                disabled={state.optimizing}
                leftIcon={<BoltIcon className={`h-4 w-4 ${state.optimizing ? 'animate-spin' : ''}`} />}
                data-testid="perf-optimize-btn"
              >
                {state.optimizing ? 'Optimizing...' : 'Optimize'}
              </Button>
              <Button variant="secondary" onClick={handleRefresh} disabled={state.loading}>
                {state.loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card title="CPU Usage">
              <p className="text-3xl font-bold text-text-primary">
                {state.metrics?.cpu.usage.toFixed(1)}%
              </p>
              <p className="text-sm text-text-secondary mb-2">
                {state.metrics?.cpu.processorName}
              </p>
              <p className="text-xs text-text-muted">
                {vm.formatFrequency(state.metrics?.cpu.clockSpeed || 0)}
              </p>
            </Card>

            <Card title="Memory Usage">
              <p className="text-3xl font-bold text-text-primary">
                {state.metrics?.memory.usage.toFixed(1)}%
              </p>
              <p className="text-sm text-text-secondary mb-2">
                {vm.formatBytes(state.metrics?.memory.used || 0)} / {vm.formatBytes(state.metrics?.memory.total || 0)}
              </p>
              <p className="text-xs text-text-muted">
                Cached: {vm.formatBytes(state.metrics?.memory.cached || 0)}
              </p>
            </Card>

            <Card title="Disk Activity">
              <p className="text-3xl font-bold text-text-primary">
                {state.metrics?.disk.activeTime.toFixed(1)}%
              </p>
              <p className="text-sm text-text-secondary mb-2">
                Read: {vm.formatBytes(state.metrics?.disk.readSpeed || 0)}/s
              </p>
              <p className="text-xs text-text-muted">
                Write: {vm.formatBytes(state.metrics?.disk.writeSpeed || 0)}/s
              </p>
            </Card>

            <Card title="Network Activity">
              <p className="text-3xl font-bold text-text-primary">
                {vm.formatBytes(state.metrics?.network.downloadSpeed || 0)}/s
              </p>
              <p className="text-sm text-text-secondary mb-2">
                Upload: {vm.formatBytes(state.metrics?.network.uploadSpeed || 0)}/s
              </p>
              <p className="text-xs text-text-muted">
                Total: {vm.formatBytes((state.metrics?.network.totalBytesReceived || 0) + (state.metrics?.network.totalBytesSent || 0))}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card title="System Information">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Uptime</span>
                  <span className="text-sm text-text-primary">{vm.formatUptime(state.metrics?.system.uptime || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Processes</span>
                  <span className="text-sm text-text-primary">{state.metrics?.system.runningProcesses}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Threads</span>
                  <span className="text-sm text-text-primary">{state.metrics?.system.threads}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Handles</span>
                  <span className="text-sm text-text-primary">{state.metrics?.system.handles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">User</span>
                  <span className="text-sm text-text-primary">{state.metrics?.system.loggedInUser}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">OS</span>
                  <span className="text-sm text-text-primary">{state.metrics?.system.windowsVersion}</span>
                </div>
              </div>
            </Card>

            <Card title="CPU Temperature">
              <p className="text-3xl font-bold text-text-primary mb-2">
                {state.metrics?.cpu.temperatureCelsius.toFixed(1)}°C
              </p>
              <p className="text-sm text-text-secondary mb-4">
                Processor temperature
              </p>
              <div className="space-y-1">
                <p className="text-xs text-text-muted">Per-Core Usage:</p>
                {state.metrics?.cpu.perCoreUsage.slice(0, 8).map((usage, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-8">Core {i}</span>
                    <div className="flex-1 h-2 bg-bg-secondary rounded overflow-hidden">
                      <div 
                        className="h-full bg-brand-primary transition-all"
                        style={{ width: `${usage}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-primary w-12 text-right">{usage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Alerts" className="mb-6">
            {state.alerts.length === 0 ? (
              <p className="text-text-secondary">No alerts</p>
            ) : (
              <div className="space-y-2">
                {state.alerts.map((alert, index) => (
                  <div key={index} className={`p-3 rounded border ${getSeverityColor(alert.severity)}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{alert.type}</p>
                        <p className="text-sm">{alert.message}</p>
                      </div>
                      <p className="text-sm">
                        {alert.value.toFixed(1)} / {alert.threshold}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Top Processes">
            <div className="mb-4 flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary"
              >
                <option value="cpu">Sort by CPU</option>
                <option value="memory">Sort by Memory</option>
              </select>
              <input
                type="text"
                placeholder="Search processes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary"
              />
              <Button variant="secondary" onClick={handleLoadProcesses}>
                Load
              </Button>
            </div>

            {state.topProcesses.length === 0 ? (
              <p className="text-text-secondary">No processes loaded</p>
            ) : (
              <div className="space-y-2">
                {state.topProcesses.map((process) => (
                  <div key={process.pid} className="flex items-center justify-between p-2 border border-border rounded">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-text-primary truncate">{process.name}</p>
                      <p className="text-xs text-text-muted">PID: {process.pid}</p>
                    </div>
                    <div className="flex gap-4 text-right">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{process.cpuPercent.toFixed(1)}%</p>
                        <p className="text-xs text-text-muted">CPU</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{vm.formatBytes(process.memoryBytes)}</p>
                        <p className="text-xs text-text-muted">Memory</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="mt-4 flex items-center gap-3">
            <Button variant="secondary" onClick={handleClearHistory}>
              Clear Graph History
            </Button>
          </div>

          {state.optimizeError && (
            <Card className="mt-4">
              <div className="flex items-start gap-3 py-1 text-sm text-semantic-danger">
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
                <span>{state.optimizeError}</span>
              </div>
            </Card>
          )}

          {state.optimizeResult && (
            <Card title="Optimization Result" className="mt-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-semantic-success">
                  <CheckCircleIcon className="h-5 w-5" />
                  <span className="font-medium">Optimization completed successfully</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-text-muted">Memory Freed</p>
                    <p className="text-sm font-semibold text-text-primary mt-1">
                      {vm.formatBytes(state.optimizeResult.memoryFreed)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Processes Optimized</p>
                    <p className="text-sm font-semibold text-text-primary mt-1">
                      {state.optimizeResult.processesOptimized}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Time Taken</p>
                    <p className="text-sm font-semibold text-text-primary mt-1">
                      {(state.optimizeResult.optimizationTimeMs / 1000).toFixed(2)}s
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Health Improvement</p>
                    <p className="text-sm font-semibold text-text-primary mt-1">
                      +{state.optimizeResult.healthImprovement.toFixed(1)}%
                    </p>
                  </div>
                </div>
                {state.optimizeResult.beforeMemory && state.optimizeResult.afterMemory && (
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div>
                      <p className="text-xs text-text-muted">Memory Before</p>
                      <p className="text-sm text-text-primary mt-1">
                        {vm.formatBytes(state.optimizeResult.beforeMemory.usedRam)} ({state.optimizeResult.beforeMemory.memoryLoadPercent.toFixed(1)}%)
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Memory After</p>
                      <p className="text-sm text-text-primary mt-1">
                        {vm.formatBytes(state.optimizeResult.afterMemory.usedRam)} ({state.optimizeResult.afterMemory.memoryLoadPercent.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                )}
                {state.optimizeResult.errors.length > 0 && (
                  <div className="text-xs text-semantic-warning">
                    {state.optimizeResult.errors.length} warning(s) during optimization
                  </div>
                )}
                <Button variant="ghost" onClick={() => vm.clearOptimizeResult()}>
                  Dismiss
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
