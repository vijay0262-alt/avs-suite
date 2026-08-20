import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardSection, LoadingState, EmptyState, Card, CollapsibleSection } from '@avs/ui';
import {
  ShieldCheckIcon,
  HeartIcon,
  BellAlertIcon,
  ArrowPathIcon,
  EyeIcon,
  FireIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ProtectionCenterViewModel } from '../ProtectionCenterViewModel';
import { useIsPro } from '../../sync/syncStore';
import { DashboardViewModel } from '../../dashboard/DashboardViewModel';
import { dashboardService } from '../../dashboard/dashboard.service';
import { ScanView } from '../../scan';
import { ProStatusBanner, ProStatusPill } from '../../licensing/ProStatusBadge';
import { ProtectionBanner } from './ProtectionBanner';
import { ProtectionCards } from './ProtectionCards';
import { LiveActivityTimeline } from './LiveActivityTimeline';
import { BackgroundMonitors } from './BackgroundMonitors';
import { ProtectionHealth } from './ProtectionHealth';
import { SystemHealthSnapshot } from './SystemHealthSnapshot';
import { WhatChanged } from './WhatChanged';
import { UpcomingAutomation } from './UpcomingAutomation';
import { QuickActions } from './QuickActions';
import { AlertsPanel } from './AlertsPanel';
import { ProcessOptimizer } from './ProcessOptimizer';

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

  // If we have protection state, render immediately even if still loading.
  // Show a subtle indicator for values being refreshed.

  return (
    <div
      className="space-y-5"
      role="main"
      aria-label="AI Protection Center"
    >
      <ProStatusBanner compact />

      {/* ── ABOVE THE FOLD ─────────────────────────────────────────── */}
      {/* Protection Status + Scan Now */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <ProtectionBanner
            state={state.protectionState!}
            onRefresh={() => vm.refresh()}
            lastRefresh={state.lastRefresh}
          />
          {state.loading && (
            <div className="mt-1 flex items-center gap-1.5 text-caption text-text-muted">
              <ArrowPathIcon className="h-3 w-3 animate-spin" />
              <span>Refreshing…</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ProStatusPill />
          <ScanView
            module="protection"
            mode="full"
            buttonLabel="Scan Now"
            onClose={() => {}}
            className="shrink-0 w-full max-w-sm"
          />
        </div>
      </div>

      {/* Active Alerts (only show if there are any) */}
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

      {/* Primary: 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Protection Score */}
        <Card variant="glass" className="p-4" data-testid="protection-score">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-brand-primary/10">
              <ShieldCheckIcon className="h-5 w-5 text-brand-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">Protection Score</div>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {state.coverage.filter(c => c.covered).length}/{state.coverage.length}
              </div>
              <div className="text-caption text-text-muted">Coverage areas</div>
            </div>
          </div>
        </Card>

        {/* Card 2: Real-Time Protection */}
        <Card variant="glass" className="p-4" data-testid="protection-realtime">
          <div className="flex items-center gap-3">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
              state.cards.filter(c => c.status === 'active').length > 0 ? 'bg-semantic-success/10' : 'bg-surface-muted'
            }`}>
              <EyeIcon className={`h-5 w-5 ${
                state.cards.filter(c => c.status === 'active').length > 0 ? 'text-semantic-success' : 'text-text-muted'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">Real-Time Protection</div>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {state.cards.filter(c => c.status === 'active').length}
              </div>
              <div className="text-caption text-text-muted">
                {state.cards.filter(c => c.status === 'active').length > 0 ? 'Monitoring' : 'Standby'}
              </div>
            </div>
          </div>
        </Card>

        {/* Card 3: Firewall Status */}
        <Card variant="glass" className="p-4" data-testid="protection-firewall">
          <div className="flex items-center gap-3">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
              state.cards.find(c => c.id === 'firewall')?.status === 'active' ? 'bg-semantic-success/10' : 'bg-semantic-danger/10'
            }`}>
              <FireIcon className={`h-5 w-5 ${
                state.cards.find(c => c.id === 'firewall')?.status === 'active' ? 'text-semantic-success' : 'text-semantic-danger'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">Firewall Status</div>
              <div className="text-small font-semibold text-text-primary">
                {state.cards.find(c => c.id === 'firewall')?.status === 'active' ? 'Active' : 'Inactive'}
              </div>
              <div className="text-caption text-text-muted">
                {state.cards.find(c => c.id === 'firewall')?.status === 'active' ? 'Protected' : 'Check settings'}
              </div>
            </div>
          </div>
        </Card>

        {/* Card 4: Last Security Scan */}
        <Card variant="glass" className="p-4" data-testid="protection-last-scan">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-surface-muted">
              <ClockIcon className="h-5 w-5 text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">Last Security Scan</div>
              <div className="text-small font-semibold text-text-primary">
                {dashState.healthScanHistory[0] ? `${dashState.healthScanHistory[0].result === 'success' ? 'Completed' : 'Partial'} · ${new Date(dashState.healthScanHistory[0].date).toLocaleDateString()}` : 'No scans yet'}
              </div>
              {dashState.healthScanHistory[0] && (
                <div className="text-caption text-text-muted">Score: {dashState.healthScanHistory[0].healthAfter}</div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ── COLLAPSIBLE SECONDARY CONTENT (2 panels) ────────────── */}

      {/* Panel 1: Protection & Activity */}
      <CollapsibleSection title="Protection & Activity" icon={<ShieldCheckIcon className="h-5 w-5" />} storageKey="pc-protection-activity">
        <div className="space-y-5">
          <ProtectionCards cards={state.cards} onNavigate={handleNavigate} />
          <LiveActivityTimeline activities={state.activities} />
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="text-caption font-semibold uppercase tracking-wide text-text-muted mb-2">Background Monitors</h4>
              <BackgroundMonitors monitors={state.monitors} />
            </div>
            <div>
              <h4 className="text-caption font-semibold uppercase tracking-wide text-text-muted mb-2">What Changed</h4>
              <WhatChanged changes={state.changes} />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Panel 2: System Health & Automation */}
      <CollapsibleSection title="System Health & Automation" icon={<HeartIcon className="h-5 w-5" />} storageKey="pc-health-automation">
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <SystemHealthSnapshot data={state.systemHealth} />
            <ProtectionHealth coverage={state.coverage} onFix={handleFixCoverage} />
            <ProcessOptimizer onOptimize={(kill) => vm.optimizeProcesses(kill)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <UpcomingAutomation tasks={state.scheduledTasks} isPro={state.isPro} />
            <QuickActions actions={state.quickActions} onNavigate={handleNavigate} isPro={state.isPro} />
          </div>
        </div>
      </CollapsibleSection>

    </div>
  );
}

export default ProtectionCenterPage;
