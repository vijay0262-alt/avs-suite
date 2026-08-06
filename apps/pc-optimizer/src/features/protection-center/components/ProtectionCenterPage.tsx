import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardSection, LoadingState, EmptyState } from '@avs/ui';
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
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ProtectionCenterViewModel } from '../ProtectionCenterViewModel';
import { useIsPro } from '../../sync/syncStore';
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

export function ProtectionCenterPage() {
  const navigate = useNavigate();
  const isPro = useIsPro();
  const vmRef = useRef<ProtectionCenterViewModel | null>(null);

  if (!vmRef.current) {
    vmRef.current = new ProtectionCenterViewModel(navigate, isPro);
  }
  const vm = vmRef.current;
  const state = useViewModel(vm);

  useEffect(() => {
    void vm.init();
    return () => vm.dispose();
  }, [vm]);

  const handleNavigate = useMemo(
    () => (path: string) => navigate(path),
    [navigate],
  );

  if (state.loading && !state.protectionState) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <LoadingState message="Loading AI Protection Center…" />
      </div>
    );
  }

  if (state.error && !state.protectionState) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <EmptyState
          icon={<ShieldCheckIcon className="h-12 w-12" />}
          title="Unable to load Protection Center"
          description={state.error}
        />
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6"
      role="main"
      aria-label="AI Protection Center"
    >
      {/* Top Status Banner */}
      <ProtectionBanner
        state={state.protectionState!}
        onRefresh={() => vm.refresh()}
        lastRefresh={state.lastRefresh}
      />

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
        <div className="lg:col-span-2 space-y-6">
          {/* Live Activity Timeline */}
          <DashboardSection
            title="Live Activity"
            icon={<ClockIcon className="h-5 w-5" />}
            actions={
              <span className="flex items-center gap-1.5 text-xs text-[var(--avs-text-muted)]">
                <span className="h-2 w-2 rounded-full bg-[var(--avs-success)] animate-pulse" />
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
        <div className="space-y-6">
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
            <ProtectionHealth coverage={state.coverage} />
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
    </div>
  );
}

export default ProtectionCenterPage;
