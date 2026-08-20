import { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ChartCard, Sparkline, EmptyState, LoadingState, CollapsibleSection } from '@avs/ui';
import { ModuleErrorBanner } from '../../components/ModuleStates';
import {
  SparklesIcon,
  ShieldExclamationIcon,
  CpuChipIcon,
  CircleStackIcon,
  HeartIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  BoltIcon,
  ChartBarIcon,
  FireIcon,
  Battery50Icon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { DashboardViewModel } from './DashboardViewModel';
import { dashboardService } from './dashboard.service';
import type { DashboardMetrics, LiveMetrics, HardwareSensorReading } from './dashboard.types';
import { DashboardScanStatusCard } from '../scan/components/DashboardScanStatusCard';
import { useDashboardScan } from '../scan/useDashboardScan';
import { ProStatusBanner, ProStatusPill } from '../licensing/ProStatusBadge';
import { PlanReviewView, useDashboardOptimizationPlan, ScanView } from '../scan';
import { dashboardPreviewToRpcPayload } from './dashboardOptimizationSerializer';
import { Modal } from './components/Modal';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function getSecurityTone(metrics: DashboardMetrics | null): 'success' | 'warning' | 'danger' {
  if (!metrics) return 'warning';
  if (metrics.security.realTimeProtection && metrics.security.defender.enabled) return 'success';
  if (metrics.security.defender.enabled || metrics.security.firewall.enabled) return 'warning';
  return 'danger';
}

function getSecurityLabel(metrics: DashboardMetrics | null): string {
  if (!metrics) return 'Checking...';
  if (metrics.security.realTimeProtection && metrics.security.defender.enabled) return 'Protected';
  if (metrics.security.defender.enabled || metrics.security.firewall.enabled) return 'At Risk';
  return 'Unprotected';
}

function getStorageValue(metrics: DashboardMetrics | null): string {
  if (!metrics?.storage?.length) return '—';
  const drive = metrics.storage[0];
  if (!drive) return '—';
  return `${Math.round(drive.usage)}%`;
}

function getPerformanceValue(live: LiveMetrics | null): string {
  if (!live) return '—';
  return `${Math.round(live.cpu.usage)}%`;
}

function findSensor(sensors: HardwareSensorReading[] | undefined, ...keywords: string[]): HardwareSensorReading | undefined {
  if (!sensors) return undefined;
  return sensors.find((s) => keywords.some((kw) => s.name.toLowerCase().includes(kw)));
}

function formatSensorValue(sensor: HardwareSensorReading | undefined, suffix: string): string {
  if (!sensor) return 'Unsupported';
  return `${Math.round(sensor.value)}${suffix}`;
}

function formatClockValue(clock: { current: number; unit: string; name: string } | undefined): string {
  if (!clock) return 'Unsupported';
  return `${Math.round(clock.current)} ${clock.unit === 'mhz' ? 'MHz' : clock.unit}`;
}

const LiveMetricsMonitor = memo(function LiveMetricsMonitor({ liveMetrics }: { liveMetrics: LiveMetrics | null }) {
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);

  useEffect(() => {
    if (liveMetrics) {
      setCpuHistory((prev) => [...prev.slice(-19), liveMetrics.cpu.usage]);
      setMemHistory((prev) => [...prev.slice(-19), liveMetrics.memory.usage]);
    }
  }, [liveMetrics]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
      <ChartCard title="CPU Usage" icon={<CpuChipIcon className="h-4 w-4" />}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-statistic text-text-primary tabular-nums">
            {liveMetrics ? `${Math.round(liveMetrics.cpu.usage)}%` : '—'}
          </span>
          <span className="text-caption text-text-muted">
            {liveMetrics ? `${liveMetrics.cpu.logicalProcessors} cores` : ''}
          </span>
        </div>
        <Sparkline data={cpuHistory.length > 1 ? cpuHistory : [0, 0]} width={280} height={60} />
      </ChartCard>
      <ChartCard title="Memory Usage" icon={<CircleStackIcon className="h-4 w-4" />}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-statistic text-text-primary tabular-nums">
            {liveMetrics ? `${Math.round(liveMetrics.memory.usage)}%` : '—'}
          </span>
          <span className="text-caption text-text-muted">
            {liveMetrics ? `${Math.round(liveMetrics.memory.used / 1_000_000_000)} / ${Math.round(liveMetrics.memory.total / 1_000_000_000)} GB` : ''}
          </span>
        </div>
        <Sparkline data={memHistory.length > 1 ? memHistory : [0, 0]} width={280} height={60} stroke="var(--avs-success)" fill="var(--avs-success)" />
      </ChartCard>
    </div>
  );
});

export default function DashboardPage() {
  const vm = useMemo(() => new DashboardViewModel(dashboardService), []);
  const state = useViewModel(vm);
  const navigate = useNavigate();
  const { snapshot } = useDashboardScan();
  const dashPlan = useDashboardOptimizationPlan();
  const [optimizePreviewLoading, setOptimizePreviewLoading] = useState(false);
  const [optimizePreviewError, setOptimizePreviewError] = useState<string | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const isScanning = snapshot.scanStatus === 'preparing' || snapshot.scanStatus === 'scanning';
  const hasCompletedScan = snapshot.scanStatus === 'complete';
  const hasScanError = snapshot.scanStatus === 'error';

  const healthScore = state.healthScore?.overallScore ?? 0;
  const securityTone = useMemo(() => getSecurityTone(state.metrics), [state.metrics]);
  const securityLabel = useMemo(() => getSecurityLabel(state.metrics), [state.metrics]);
  const performanceValue = useMemo(() => getPerformanceValue(state.liveMetrics), [state.liveMetrics]);
  const storageValue = useMemo(() => getStorageValue(state.metrics), [state.metrics]);

  // ── Canonical Dashboard Optimization plan creation handoff ──────────────
  // Fetches a read-only optimize preview, maps actions to the backend format,
  // and creates a canonical ActionPlan via scan_core.dashboard_optimization.plan.
  // The plan_id is then handed off to PlanReviewView for the canonical
  // prepare → validate → approve → execute → rollback flow.
  // This NEVER executes remediation directly.
  const handleReviewOptimize = useCallback(async () => {
    if (dashPlan.isCreating) return;
    setOptimizePreviewLoading(true);
    setOptimizePreviewError(null);
    try {
      const preview = await dashboardService.getOptimizePreview();
      if (!preview.actions || preview.actions.length === 0) {
        setOptimizePreviewError('No optimization actions available.');
        return;
      }
      const payload = dashboardPreviewToRpcPayload(preview.actions);
      await dashPlan.createPlan(payload);
    } catch (err) {
      setOptimizePreviewError(err instanceof Error ? err.message : 'Failed to load optimization preview');
    } finally {
      setOptimizePreviewLoading(false);
    }
  }, [dashPlan]);

  const handlePlanClose = useCallback(() => {
    dashPlan.reset();
    setOptimizePreviewError(null);
  }, [dashPlan]);

  // ── Canonical plan review handoff ────────────────────────────────────────
  // If the RPC returned a plan_id, hand off to the canonical review flow.
  if (dashPlan.planId) {
    return (
      <div className="px-6 py-6" data-testid="dashboard-opt-plan-review">
        <PlanReviewView
          planId={dashPlan.planId}
          module="optimize"
          onClose={handlePlanClose}
        />
      </div>
    );
  }

  if (state.bootstrap === 'loading') {
    return <LoadingState message="Loading dashboard..." data-testid="dashboard-loading" />;
  }

  if (state.bootstrap === 'error') {
    return (
      <EmptyState
        icon={<CheckCircleIcon className="h-8 w-8" />}
        title="Failed to load dashboard"
        description={state.bootstrapError || 'An error occurred while loading the dashboard.'}
        action={{ label: 'Retry', onClick: () => vm.bootstrap() }}
        data-testid="dashboard-error"
      />
    );
  }

  return (
    <div className="space-y-5" data-testid="page-dashboard">
      {/* Error banners for data load failures */}
      {state.metricsError && (
        <ModuleErrorBanner
          message={`Failed to load system metrics: ${state.metricsError}`}
          onRetry={() => vm.loadMetrics()}
          onDismiss={() => vm.clearMetricsError()}
          testId="dashboard-metrics-error"
        />
      )}
      {state.liveMetricsError && (
        <ModuleErrorBanner
          message={`Failed to load live metrics: ${state.liveMetricsError}`}
          onRetry={() => vm.loadLiveMetrics()}
          onDismiss={() => vm.clearLiveMetricsError()}
          testId="dashboard-live-metrics-error"
        />
      )}

      {/* Pro Status Banner */}
      <ProStatusBanner />

      {/* ── PAGE HEADER ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page-title text-text-primary">{getGreeting()}</h1>
          <p className="mt-1 text-caption text-text-secondary">
            {healthScore >= 80 ? 'Your PC is healthy.' : healthScore >= 60 ? 'Your PC needs minor attention.' : 'Your PC needs optimization.'}
          </p>
        </div>
        <ProStatusPill />
      </div>

      {/* Dashboard optimization plan creation error */}
      {(dashPlan.error || optimizePreviewError) && (
        <div className="flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-semantic-danger/10 p-3" data-testid="dashboard-opt-plan-error">
          <ExclamationTriangleIcon className="h-4 w-4 text-semantic-danger shrink-0" />
          <span className="text-caption text-semantic-danger">{dashPlan.error ?? optimizePreviewError}</span>
        </div>
      )}

      {/* ── PRIMARY: SYSTEM HEALTH + SCAN ─────────────────────────── */}
      <Card variant="glass" className="p-6" data-testid="primary-system-health">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Health Score */}
          <div className="flex items-center gap-4">
            <div className={`relative inline-flex items-center justify-center h-20 w-20 rounded-full ${
              healthScore >= 80 ? 'bg-semantic-success/10' : healthScore >= 60 ? 'bg-semantic-warning/10' : 'bg-semantic-danger/10'
            }`}>
              <HeartIcon className={`h-9 w-9 ${
                healthScore >= 80 ? 'text-semantic-success' : healthScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted uppercase tracking-wide">System Health</div>
              <div className="text-3xl font-bold text-text-primary tabular-nums">{healthScore}<span className="text-base text-text-muted">/100</span></div>
              <div className={`text-small font-medium ${
                healthScore >= 80 ? 'text-semantic-success' : healthScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger'
              }`}>
                {healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : 'Needs Attention'}
              </div>
            </div>
          </div>

          {/* Scan Status & CTA */}
          <div className="lg:col-span-2 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                {isScanning ? (
                  <>
                    <div className="text-caption text-text-muted uppercase tracking-wide">Scan Status</div>
                    <div className="text-section-title font-semibold text-text-primary">
                      {snapshot.scanStatus === 'preparing' ? 'Preparing scanner...' : 'Scanning your PC'}
                    </div>
                    <div className="mt-1 text-small text-text-secondary">
                      Analyzing system...
                    </div>
                  </>
                ) : hasCompletedScan ? (
                  <>
                    <div className="text-caption text-text-muted uppercase tracking-wide">Last Scan</div>
                    <div className="text-section-title font-semibold text-text-primary">
                      {snapshot.completedAt ? new Date(snapshot.completedAt).toLocaleString() : 'Recently completed'}
                    </div>
                    <div className="mt-1 text-small text-text-secondary">
                      {(() => {
                        // PART 4: Distinguish detected from remaining
                        // If cleanup_result exists, show remaining issues (current state)
                        // Otherwise show detected issues (scan result)
                        const hasCleanup = snapshot.cleanupResult != null;
                        const issueCount = hasCleanup 
                          ? snapshot.cleanupResult!.remaining 
                          : snapshot.issuesFound;
                        const label = hasCleanup 
                          ? (issueCount === 1 ? 'issue remaining' : 'issues remaining')
                          : (issueCount === 1 ? 'issue found' : 'issues found');
                        
                        if (issueCount > 0) {
                          return (
                            <>
                              <span className="text-semantic-warning font-medium">{issueCount} {label}</span>
                              {hasCleanup && snapshot.cleanupResult!.cleaned > 0 && (
                                <span className="text-text-muted"> · {snapshot.cleanupResult!.cleaned} cleaned</span>
                              )}
                            </>
                          );
                        }
                        return <span className="text-semantic-success">No issues {hasCleanup ? 'remaining' : 'found'}</span>;
                      })()}
                      {snapshot.actionableCount > 0 && !snapshot.cleanupResult && ` · ${snapshot.actionableCount} actionable`}
                    </div>
                  </>
                ) : hasScanError ? (
                  <>
                    <div className="text-caption text-text-muted uppercase tracking-wide">Scan Status</div>
                    <div className="text-section-title font-semibold text-semantic-danger">Scan could not be completed</div>
                    <div className="mt-1 text-small text-text-secondary">
                      {snapshot.error?.includes('initializing') 
                        ? 'AVS is preparing the scanner. Please try again in a moment.'
                        : snapshot.error || 'An error occurred during the scan.'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-caption text-text-muted uppercase tracking-wide">Scan Status</div>
                    <div className="text-section-title font-semibold text-text-primary">Ready to scan</div>
                    <div className="mt-1 text-small text-text-secondary">
                      {snapshot.hasActiveSession && snapshot.completedAt 
                        ? `Last scan: ${new Date(snapshot.completedAt).toLocaleDateString()}`
                        : 'Scan your PC to detect issues and optimize performance'}
                    </div>
                  </>
                )}
              </div>

              {/* Primary Scan CTA */}
              <div className="shrink-0">
                {isScanning ? (
                  <Button
                    onClick={() => setScanModalOpen(true)}
                    size="lg"
                    variant="secondary"
                    leftIcon={<ArrowPathIcon className="h-5 w-5 animate-spin" />}
                    data-testid="dashboard-scan-cta"
                  >
                    View Progress
                  </Button>
                ) : hasCompletedScan && snapshot.issuesFound > 0 ? (
                  <Button
                    onClick={() => {
                      // Navigate to the completed scan results using the stored planId.
                      // This shows PlanReviewView with the completed scan, NOT a new scan.
                      if (snapshot.planId) {
                        navigate(`${snapshot.moduleRoute}?planId=${encodeURIComponent(snapshot.planId)}`);
                      } else {
                        // Fallback: open scan modal if no planId (shouldn't happen)
                        setScanModalOpen(true);
                      }
                    }}
                    size="lg"
                    leftIcon={<BoltIcon className="h-5 w-5" />}
                    data-testid="dashboard-scan-cta"
                  >
                    Review Results
                  </Button>
                ) : (
                  <Button
                    onClick={() => setScanModalOpen(true)}
                    disabled={isScanning}
                    size="lg"
                    leftIcon={<BoltIcon className="h-5 w-5" />}
                    data-testid="dashboard-scan-cta"
                  >
                    {hasScanError ? 'Try Again' : 'Scan Now'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── SECONDARY: QUICK METRICS ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="glass" className="p-4" data-testid="metric-protection">
          <div className="flex items-center gap-3">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
              securityTone === 'success' ? 'bg-semantic-success/10' : securityTone === 'warning' ? 'bg-semantic-warning/10' : 'bg-semantic-danger/10'
            }`}>
              <ShieldExclamationIcon className={`h-5 w-5 ${
                securityTone === 'success' ? 'text-semantic-success' : securityTone === 'warning' ? 'text-semantic-warning' : 'text-semantic-danger'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">Protection</div>
              <div className="text-small font-semibold text-text-primary truncate">{securityLabel}</div>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="p-4" data-testid="metric-performance">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-surface-muted">
              <CpuChipIcon className="h-5 w-5 text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">CPU Usage</div>
              <div className="text-small font-semibold text-text-primary tabular-nums">{performanceValue}</div>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="p-4" data-testid="metric-storage">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-surface-muted">
              <CircleStackIcon className="h-5 w-5 text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">Storage</div>
              <div className="text-small font-semibold text-text-primary tabular-nums">{storageValue}</div>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="p-4" data-testid="metric-issues">
          <div className="flex items-center gap-3">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
              state.healthScore && state.healthScore.issues.length > 0 ? 'bg-semantic-warning/10' : 'bg-semantic-success/10'
            }`}>
              <ExclamationTriangleIcon className={`h-5 w-5 ${
                state.healthScore && state.healthScore.issues.length > 0 ? 'text-semantic-warning' : 'text-semantic-success'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">Issues</div>
              <div className="text-small font-semibold text-text-primary tabular-nums">
                {state.healthScore?.issues.length ?? 0}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── SECONDARY ACTION: REVIEW & OPTIMIZE ─────────────────── */}
      {snapshot.canReview && snapshot.actionableCount > 0 && (
        <Card variant="glass" className="p-4" data-testid="actionable-recommendation">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <SparklesIcon className="h-5 w-5 text-brand-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-small font-medium text-text-primary">
                  {snapshot.actionableCount} actionable {snapshot.actionableCount === 1 ? 'issue' : 'issues'} ready for review
                </div>
                <div className="text-caption text-text-secondary">
                  Review findings and approve fixes
                </div>
              </div>
            </div>
            <Button
              size="md"
              onClick={() => navigate(`${snapshot.moduleRoute}?planId=${encodeURIComponent(snapshot.planId!)}`)}
              leftIcon={<SparklesIcon className="h-4 w-4" />}
              data-testid="review-actionable-btn"
            >
              Review & Fix
            </Button>
          </div>
        </Card>
      )}

      {/* Alternative: Review & Optimize (when no scan results) */}
      {!isScanning && !hasCompletedScan && !hasScanError && (
        <Card variant="glass" className="p-4" data-testid="optimize-preview-card">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <SparklesIcon className="h-5 w-5 text-brand-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-small font-medium text-text-primary">
                  Quick optimization available
                </div>
                <div className="text-caption text-text-secondary">
                  Review recommended optimizations without scanning
                </div>
              </div>
            </div>
            <Button
              onClick={handleReviewOptimize}
              disabled={dashPlan.isCreating || optimizePreviewLoading}
              size="md"
              variant="secondary"
              leftIcon={
                dashPlan.isCreating || optimizePreviewLoading
                  ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  : <SparklesIcon className="h-4 w-4" />
              }
              data-testid="dashboard-review-optimize-btn"
            >
              {dashPlan.isCreating ? 'Creating...' : optimizePreviewLoading ? 'Analyzing...' : 'Review & Optimize'}
            </Button>
          </div>
        </Card>
      )}

      {/* Latest unified scan/remediation status from scan_core */}
      <DashboardScanStatusCard />

      {/* ── COLLAPSIBLE SECONDARY CONTENT (2 panels) ─────────────── */}

      {/* Panel 1: System Health (live metrics + hardware sensors) */}
      <CollapsibleSection title="System Health" icon={<ChartBarIcon className="h-5 w-5" />} storageKey="dash-system-health">
        <div className="space-y-4">
          <LiveMetricsMonitor liveMetrics={state.liveMetrics} />
          {state.hardwareSensorsError && (
            <ModuleErrorBanner
              message={`Failed to load hardware sensors: ${state.hardwareSensorsError}`}
              onRetry={() => vm.loadHardwareSensors()}
              onDismiss={() => vm.clearHardwareSensorsError()}
              testId="dashboard-hardware-sensors-error"
            />
          )}
          {state.hardwareSensorsLoading && !state.hardwareSensors ? (
            <LoadingState message="Loading hardware sensors..." data-testid="hardware-sensors-loading" />
          ) : state.hardwareSensors ? (
          (() => {
            const hw = state.hardwareSensors!;
            const temps = hw.temperature.sensors;
            const fans = hw.fans.sensors;
            const clocks = hw.clocks.clocks;
            const cpuTemp = findSensor(temps, 'cpu', 'core');
            const gpuTemp = findSensor(temps, 'gpu');
            const motherboardTemp = findSensor(temps, 'motherboard', 'board', 'system');
            const ssdTemp = findSensor(temps, 'ssd', 'solid');
            const hddTemp = findSensor(temps, 'hdd', 'hard');
            const cpuFan = findSensor(fans, 'cpu', 'processor');
            const gpuFan = findSensor(fans, 'gpu');
            const systemFan = findSensor(fans, 'system', 'case', 'chassis');
            const cpuClock = clocks.find((c) => c.name.toLowerCase().includes('cpu'));
            const gpuClock = clocks.find((c) => c.name.toLowerCase().includes('gpu'));

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <ChartCard title="Temperatures" icon={<FireIcon className="h-4 w-4" />}>
                  <div className="space-y-2 text-small">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">CPU</span>
                      <span className="text-text-primary font-medium tabular-nums">{formatSensorValue(cpuTemp, '°C')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">GPU</span>
                      <span className="text-text-primary font-medium tabular-nums">{formatSensorValue(gpuTemp, '°C')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Motherboard</span>
                      <span className="text-text-primary font-medium tabular-nums">{formatSensorValue(motherboardTemp, '°C')}</span>
                    </div>
                    {(ssdTemp || hddTemp) && (
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Storage</span>
                        <span className="text-text-primary font-medium tabular-nums">{formatSensorValue(ssdTemp || hddTemp, '°C')}</span>
                      </div>
                    )}
                  </div>
                </ChartCard>

                <ChartCard title="Fan Speeds" icon={<Battery50Icon className="h-4 w-4" />}>
                  <div className="space-y-2 text-small">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">CPU Fan</span>
                      <span className="text-text-primary font-medium tabular-nums">{formatSensorValue(cpuFan, ' RPM')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">GPU Fan</span>
                      <span className="text-text-primary font-medium tabular-nums">{formatSensorValue(gpuFan, ' RPM')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">System Fan</span>
                      <span className="text-text-primary font-medium tabular-nums">{formatSensorValue(systemFan, ' RPM')}</span>
                    </div>
                  </div>
                </ChartCard>

                <ChartCard title="Clock Speeds" icon={<CpuChipIcon className="h-4 w-4" />}>
                  <div className="space-y-2 text-small">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">CPU</span>
                      <span className="text-text-primary font-medium tabular-nums">{formatClockValue(cpuClock)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">GPU</span>
                      <span className="text-text-primary font-medium tabular-nums">{formatClockValue(gpuClock)}</span>
                    </div>
                  </div>
                </ChartCard>
              </div>
            );
          })()
          ) : null}
        </div>
      </CollapsibleSection>

      {/* Panel 2: Recent Activity - Placeholder for future implementation */}
      <CollapsibleSection title="Recent Activity" icon={<ClockIcon className="h-5 w-5" />} storageKey="dash-recent-activity">
        <div className="space-y-4">
          <EmptyState
            icon={<ClockIcon className="h-6 w-6" />}
            title="No recent activity"
            description="System events and actions will appear here."
            data-testid="recent-activity-empty"
          />
        </div>
      </CollapsibleSection>

      {/* Scan modal — opens in-modal scan instead of redirecting */}
      <Modal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        title="System Scan"
        size="xl"
        testId="dashboard-scan-modal"
      >
        <ScanView
          module="optimize"
          mode="quick"
          onClose={() => setScanModalOpen(false)}
          buttonLabel="Start Scan"
        />
      </Modal>

    </div>
  );
}
