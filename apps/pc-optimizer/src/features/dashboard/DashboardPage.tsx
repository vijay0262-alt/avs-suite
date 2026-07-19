import { useEffect, useMemo, useState } from 'react';
import { Card } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { DashboardViewModel } from './DashboardViewModel';
import { dashboardService } from './dashboard.service';
import { HealthScoreCard } from './components/HealthScoreCard';
import { LiveChart } from './components/LiveChart';
import { QuickActions } from './components/QuickActions';
import { OneClickOptimize } from './components/OneClickOptimize';

const MAX_CHART_POINTS = 30;

export default function DashboardPage() {
  const vm = useMemo(() => new DashboardViewModel(dashboardService), []);
  const state = useViewModel(vm);
  
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  // Update chart history when metrics update
  useEffect(() => {
    if (state.metrics) {
      setCpuHistory((prev) => {
        const next = [...prev, state.metrics!.cpu.usage];
        return next.slice(-MAX_CHART_POINTS);
      });
      setMemoryHistory((prev) => {
        const next = [...prev, state.metrics!.memory.usage];
        return next.slice(-MAX_CHART_POINTS);
      });
    }
  }, [state.metrics]);

  return (
    <div data-testid="page-dashboard">
      <PageHeader
        title="Dashboard"
        description="Real-time system health monitoring and optimization"
      />

      {state.bootstrap === 'loading' && (
        <Card>
          <div className="py-6 text-sm text-text-muted" data-testid="dashboard-loading">
            Loading dashboard...
          </div>
        </Card>
      )}

      {state.bootstrap === 'error' && (
        <Card>
          <div className="py-6 text-sm text-semantic-danger" data-testid="dashboard-error">
            {state.bootstrapError || 'Failed to load dashboard'}
          </div>
        </Card>
      )}

      {state.bootstrap === 'ready' && (
        <div className="space-y-6">
          {/* Health Score and Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <HealthScoreCard
                healthScore={state.healthScore}
                loading={state.healthScoreLoading}
              />
            </div>
            <div className="lg:col-span-2">
              <QuickActions onNavigate={(path) => console.log('Navigate to:', path)} />
            </div>
          </div>

          {/* Quick Scan Button */}
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Quick Scan</h3>
                <p className="text-sm text-text-secondary mt-1">Scan your system for junk files and temporary data</p>
              </div>
              <button
                onClick={() => vm.startQuickScan()}
                className="px-6 py-2.5 bg-brand-primary hover:bg-brand-primary/90 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-surface"
                data-testid="quick-scan-button"
              >
                Start Quick Scan
              </button>
            </div>
          </Card>

          {/* Live Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <LiveChart
              title="CPU Usage"
              data={cpuHistory}
              maxDataPoints={MAX_CHART_POINTS}
              color="rgb(59, 130, 246)"
              unit="%"
              height={100}
            />
            <LiveChart
              title="Memory Usage"
              data={memoryHistory}
              maxDataPoints={MAX_CHART_POINTS}
              color="rgb(16, 185, 129)"
              unit="%"
              height={100}
            />
            <LiveChart
              title="Disk Usage"
              data={state.metrics?.storage.map((d) => d.usage) || []}
              maxDataPoints={MAX_CHART_POINTS}
              color="rgb(245, 158, 11)"
              unit="%"
              height={100}
            />
          </div>

          {/* System Information Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {state.metrics && (
              <>
                <InfoCard
                  title="CPU"
                  value={`${state.metrics.cpu.usage.toFixed(1)}%`}
                  subtitle={`${state.metrics.cpu.logicalProcessors} cores`}
                />
                <InfoCard
                  title="Memory"
                  value={`${state.metrics.memory.usage.toFixed(1)}%`}
                  subtitle={`${(state.metrics.memory.used / 1024 / 1024 / 1024).toFixed(1)} GB used`}
                />
                <InfoCard
                  title="Storage"
                  value={`${(state.metrics.storage[0]?.usage ?? 0).toFixed(1)}%`}
                  subtitle={`${state.metrics.storage[0] ? ((state.metrics.storage[0].free / 1024 / 1024 / 1024).toFixed(1)) : '0'} GB free`}
                />
                <InfoCard
                  title="Processes"
                  value={state.metrics.cpu.processes.toString()}
                  subtitle={`${state.metrics.cpu.threads} threads`}
                />
              </>
            )}
          </div>

          {/* One Click Optimize */}
          <OneClickOptimize
            preview={state.optimizePreview}
            previewLoading={state.optimizePreviewLoading}
            previewError={state.optimizePreviewError}
            result={state.optimizeResult}
            optimizeError={state.optimizeError}
            onPreview={() => vm.openOptimizePreview()}
            onConfirm={() => vm.advanceToOptimizeConfirm()}
            onCancel={() => vm.cancelOptimizeFlow()}
            onClose={() => vm.closeOptimizeResult()}
            step={state.optimizeStep}
          />
        </div>
      )}
    </div>
  );
}

function InfoCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <Card title={title}>
      <div className="space-y-1">
        <div className="text-2xl font-bold text-text-primary tabular-nums">{value}</div>
        <div className="text-sm text-text-secondary">{subtitle}</div>
      </div>
    </Card>
  );
}
