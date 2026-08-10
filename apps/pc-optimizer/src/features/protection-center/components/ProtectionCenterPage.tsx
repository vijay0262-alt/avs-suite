import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardSection, LoadingState, EmptyState, Button, Card, CollapsibleSection } from '@avs/ui';
import {
  ShieldCheckIcon,
  HeartIcon,
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

  // Refresh protection state when dashboard scan completes
  useEffect(() => {
    if (dashState.healthScanStep === 'complete') {
      void dashboardService.refreshCache();
      void vm.refreshAll();
    }
  }, [dashState.healthScanStep, vm]);

  const handleNavigate = useMemo(
    () => (path: string) => navigate(path),
    [navigate],
  );

  const handleScanNow = useCallback(() => {
    dashVm.startHealthScan('protection', isPro);
  }, [dashVm, isPro]);

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
      className="space-y-5"
      role="main"
      aria-label="AI Protection Center"
    >
      {/* ── ABOVE THE FOLD ─────────────────────────────────────────── */}
      {/* Protection Status + Scan Now */}
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

      {/* Unified Scan Flow — shown near top so user can see scan running */}
      {dashState.healthScanStep !== 'idle' && (
        <UnifiedOptimizeFlow
          vm={dashVm}
          isPro={isPro}
          onClose={() => dashVm.closeHealthScan()}
        />
      )}

      {/* Primary: Live Protection + Last Scan (2 compact cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="glass" className="p-4" data-testid="protection-live-status">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="h-5 w-5 text-text-muted shrink-0" />
              <div>
                <div className="text-caption text-text-muted">Live Protection</div>
                <div className="text-small font-medium text-text-primary">
                  {state.cards.filter(c => c.status === 'active').length} active monitors
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-caption text-text-muted">Coverage</div>
              <div className="text-small font-bold text-text-primary">
                {state.coverage.filter(c => c.covered).length}/{state.coverage.length}
              </div>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="p-4" data-testid="protection-last-scan">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-text-muted shrink-0" />
              <div>
                <div className="text-caption text-text-muted">Last Scan</div>
                <div className="text-small font-medium text-text-primary">
                  {dashState.healthScanHistory[0] ? `${dashState.healthScanHistory[0].result === 'success' ? 'Optimized' : 'Partial'} · ${new Date(dashState.healthScanHistory[0].date).toLocaleDateString()}` : 'No scans yet'}
                </div>
              </div>
            </div>
            {dashState.healthScanHistory[0] && (
              <div className="text-right">
                <div className="text-caption text-text-muted">Score</div>
                <div className="text-small font-bold text-text-primary tabular-nums">{dashState.healthScanHistory[0].healthAfter}</div>
              </div>
            )}
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
