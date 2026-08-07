import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardSection, LoadingState, EmptyState, Button } from '@avs/ui';
import {
  ShieldCheckIcon,
  ClockIcon,
  EyeIcon,
  HeartIcon,
  ArrowTrendingUpIcon,
  CalendarDaysIcon,
  BoltIcon,
  InformationCircleIcon,
  BellAlertIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ProtectionCenterViewModel } from '../ProtectionCenterViewModel';
import { useIsPro } from '../../sync/syncStore';
import { DashboardViewModel } from '../../dashboard/DashboardViewModel';
import { dashboardService } from '../../dashboard/dashboard.service';
import { UnifiedOptimizeFlow } from '../../dashboard/components/UnifiedOptimizeFlow';
import { ProtectionBanner } from './ProtectionBanner';
import { ProtectionCards } from './ProtectionCards';
import { LiveActivityTimeline } from './LiveActivityTimeline';
import { BackgroundMonitors } from './BackgroundMonitors';
import { ProtectionHealth } from './ProtectionHealth';
import { SystemHealthSnapshot } from './SystemHealthSnapshot';
import { WhatChanged } from './WhatChanged';
import { UpcomingAutomation } from './UpcomingAutomation';
import { QuickActions } from './QuickActions';
import { ProtectionStatus } from './ProtectionStatus';
import { AlertsPanel } from './AlertsPanel';
import { ProcessOptimizer } from './ProcessOptimizer';
import { LastScanResults } from './LastScanResults';

export function ProtectionCenterPage() {
  const navigate = useNavigate();
  const isPro = useIsPro();
  const vmRef = useRef<ProtectionCenterViewModel | null>(null);

  if (!vmRef.current) {
    vmRef.current = new ProtectionCenterViewModel(navigate, isPro);
  }
  const vm = vmRef.current;
  const state = useViewModel(vm);

  // Dashboard ViewModel for unified scan flow
  const dashVmRef = useRef<DashboardViewModel | null>(null);
  if (!dashVmRef.current) {
    dashVmRef.current = new DashboardViewModel(dashboardService);
  }
  const dashVm = dashVmRef.current;
  const dashState = useViewModel(dashVm);

  useEffect(() => {
    void vm.init();
    void dashVm.bootstrap();
    return () => {
      vm.dispose();
      dashVm.dispose();
    };
  }, [vm, dashVm]);

  const handleNavigate = useMemo(
    () => (path: string) => navigate(path),
    [navigate],
  );

  const handleScanNow = useCallback(() => {
    dashVm.startHealthScan();
  }, [dashVm]);

  const handleFixCoverage = useCallback(
    (item: { id: string; fixAction?: { action: string; type: 'navigate' | 'rpc' } }) => {
      if (!item.fixAction) return;
      if (item.fixAction.type === 'navigate') {
        navigate(item.fixAction.action);
      } else if (item.fixAction.type === 'rpc') {
        const action = item.fixAction.action;
        const rpcCall =
          action === 'security.enableSmartScreen'
            ? dashboardService.enableSmartScreen()
            : action === 'security.enableDefender'
              ? dashboardService.enableDefender()
              : action === 'security.enableFirewall'
                ? dashboardService.enableFirewall()
                : null;
        if (rpcCall) {
          void rpcCall.then(() => {
            void dashboardService.refreshCache();
            void vm.refreshAll();
          });
        }
      }
    },
    [navigate, vm],
  );

  const isScanning = dashState.healthScanStep !== 'idle' && dashState.healthScanStep !== 'complete';

  if (state.loading && !state.protectionState) {
    return (
      <LoadingState message="Loading AI Protection Center…" data-testid="protection-center-loading" />
    );
  }

  if (state.error && !state.protectionState) {
    return (
      <EmptyState
        icon={<ShieldCheckIcon className="h-10 w-10" />}
        title="Unable to load Protection Center"
        description={state.error}
        action={{ label: 'Retry', onClick: () => vm.refresh() }}
        data-testid="protection-center-error"
      />
    );
  }

  return (
    <div
      className="space-y-7"
      role="main"
      aria-label="AI Protection Center"
    >
      {/* Top Status Banner with Scan Now button */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <ProtectionBanner
            state={state.protectionState!}
            onRefresh={() => vm.refresh()}
            lastRefresh={state.lastRefresh}
          />
        </div>
        <Button
          onClick={handleScanNow}
          disabled={isScanning}
          loading={isScanning}
          leftIcon={isScanning ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ShieldCheckIcon className="h-4 w-4" />}
          size="lg"
          data-testid="protection-center-scan-now"
        >
          {isScanning ? 'Scanning...' : 'Scan Now'}
        </Button>
      </div>

      {/* Alerts (only show if there are any) */}
      {state.alerts.length > 0 && (
        <DashboardSection
          title="Active Alerts"
          icon={<BellAlertIcon className="h-5 w-5" />}
        >
          <AlertsPanel
            alerts={state.alerts}
            onDismiss={(id) => vm.dismissAlert(id)}
            onNavigate={handleNavigate}
          />
        </DashboardSection>
      )}

      {/* Live Protection Cards */}
      <DashboardSection
        title="Live Protection"
        icon={<ShieldCheckIcon className="h-5 w-5" />}
      >
        <ProtectionCards cards={state.cards} onNavigate={handleNavigate} />
      </DashboardSection>

      {/* Main grid: Activity Timeline + System Health */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-7">
          {/* Live Activity Timeline */}
          <DashboardSection
            title="Live Activity"
            icon={<ClockIcon className="h-5 w-5" />}
            actions={
              <span className="flex items-center gap-1.5 text-caption text-[var(--avs-text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--avs-success)] animate-pulse" />
                Live
              </span>
            }
          >
            <LiveActivityTimeline activities={state.activities} />
          </DashboardSection>

          {/* Background Monitors */}
          <DashboardSection
            title="Background Monitors"
            icon={<EyeIcon className="h-5 w-5" />}
          >
            <BackgroundMonitors monitors={state.monitors} />
          </DashboardSection>

          {/* What Changed */}
          <DashboardSection
            title="What Changed"
            icon={<ArrowTrendingUpIcon className="h-5 w-5" />}
          >
            <WhatChanged changes={state.changes} />
          </DashboardSection>
        </div>

        {/* Right column */}
        <div className="space-y-7">
          {/* Last Scan Results */}
          <DashboardSection
            title="Last Scan Results"
            icon={<CheckCircleIcon className="h-5 w-5" />}
          >
            <LastScanResults
              lastScan={dashState.healthScanHistory[0] ?? null}
              lastOptimizeResult={dashState.healthScanResult}
            />
          </DashboardSection>

          {/* System Health Snapshot */}
          <DashboardSection
            title="System Health"
            icon={<HeartIcon className="h-5 w-5" />}
          >
            <SystemHealthSnapshot data={state.systemHealth} />
          </DashboardSection>

          {/* Protection Coverage */}
          <DashboardSection
            title="Protection Coverage"
            icon={<ShieldCheckIcon className="h-5 w-5" />}
          >
            <ProtectionHealth coverage={state.coverage} onFix={handleFixCoverage} />
          </DashboardSection>

          {/* Process Optimizer */}
          <DashboardSection
            title="Process Optimizer"
            icon={<BoltIcon className="h-5 w-5" />}
          >
            <ProcessOptimizer onOptimize={(kill) => vm.optimizeProcesses(kill)} />
          </DashboardSection>
        </div>
      </div>

      {/* Bottom grid: Upcoming Automation + Quick Actions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardSection
          title="Upcoming Automation"
          icon={<CalendarDaysIcon className="h-5 w-5" />}
        >
          <UpcomingAutomation tasks={state.scheduledTasks} isPro={state.isPro} />
        </DashboardSection>

        <DashboardSection
          title="Quick Actions"
          icon={<BoltIcon className="h-5 w-5" />}
        >
          <QuickActions
            actions={state.quickActions}
            onNavigate={handleNavigate}
            isPro={state.isPro}
          />
        </DashboardSection>
      </div>

      {/* Protection Status Explanation */}
      <DashboardSection
        title="Understanding Your Status"
        icon={<InformationCircleIcon className="h-5 w-5" />}
      >
        <ProtectionStatus state={state.protectionState!} coverage={state.coverage} />
      </DashboardSection>

      {/* Unified Scan Flow — triggered by Scan Now button */}
      {dashState.healthScanStep !== 'idle' && (
        <UnifiedOptimizeFlow
          vm={dashVm}
          isPro={isPro}
          onClose={() => dashVm.closeHealthScan()}
        />
      )}
    </div>
  );
}

export default ProtectionCenterPage;
