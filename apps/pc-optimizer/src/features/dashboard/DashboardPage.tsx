import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@avs/ui';
import { ArrowPathIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { DashboardViewModel } from './DashboardViewModel';
import { dashboardService } from './dashboard.service';
import { HealthScoreCard } from './components/HealthScoreCard';
import { HealthBreakdown } from './components/HealthBreakdown';
import { IssuesList } from './components/IssuesList';
import { LiveStatus } from './components/LiveStatus';
import { QuickActions } from './components/QuickActions';
import { HealthScanModal } from './components/HealthScanModal';

export default function DashboardPage() {
  const vm = useMemo(() => new DashboardViewModel(dashboardService), []);
  const state = useViewModel(vm);
  const navigate = useNavigate();

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const isScanning = state.healthScanStep !== 'idle';
  const isOptimizing = state.healthScanStep === 'optimizing';

  return (
    <div data-testid="page-dashboard">
      <PageHeader
        title="Dashboard"
        description="Real-time system health monitoring and optimization"
      />

      {state.bootstrap === 'loading' && (
        <div className="py-12 text-center text-sm text-text-muted" data-testid="dashboard-loading">
          Loading dashboard...
        </div>
      )}

      {state.bootstrap === 'error' && (
        <div className="py-12 text-center text-sm text-semantic-danger" data-testid="dashboard-error">
          {state.bootstrapError || 'Failed to load dashboard'}
        </div>
      )}

      {state.bootstrap === 'ready' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <HealthScoreCard
                healthScore={state.healthScore}
                loading={state.healthScoreLoading || state.metricsLoading}
                error={state.healthScoreError || state.metricsError}
              />
            </div>
            <div className="lg:col-span-2">
              <HealthBreakdown
                categories={state.healthScore?.categoryDetails}
                onAction={(path) => navigate(path)}
              />
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              onClick={() => vm.startHealthScan()}
              disabled={isScanning}
              size="lg"
              className="w-full md:w-auto min-w-[16rem]"
              leftIcon={
                isScanning ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <SparklesIcon className="h-5 w-5" />
                )
              }
              data-testid="improve-health-button"
            >
              {isScanning ? (isOptimizing ? 'Optimizing...' : 'Analyzing...') : 'Improve PC Health'}
            </Button>
          </div>

          <IssuesList
            issues={state.healthScore?.issues}
            onIssueClick={(issue) => navigate(issue.actionPath)}
          />

          <QuickActions onNavigate={(path) => navigate(path)} />

          <div>
            <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
              Live System Status
            </div>
            <LiveStatus metrics={state.liveMetrics} />
          </div>
        </div>
      )}

      {state.healthScanStep !== 'idle' && (
        <HealthScanModal
          step={state.healthScanStep}
          modules={state.healthScanModules}
          report={state.healthScanReport}
          execution={state.healthScanExecution}
          result={state.healthScanResult}
          error={state.healthScanError}
          onCancel={() => vm.cancelHealthScan()}
          onClose={() => vm.closeHealthScan()}
          onOptimize={() => vm.executeHealthScanOptimizations()}
          onCancelExecute={() => vm.cancelHealthScanOptimizations()}
        />
      )}
    </div>
  );
}
