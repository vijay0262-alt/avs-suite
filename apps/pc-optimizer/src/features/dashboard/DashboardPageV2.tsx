import { useEffect, useMemo, useState, memo } from 'react';
import { Button, Card, ChartCard, Sparkline, EmptyState, LoadingState, CollapsibleSection } from '@avs/ui';
import { ModuleErrorBanner } from '../../components/ModuleStates';
import {
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
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { DashboardViewModel } from './DashboardViewModel';
import { dashboardService } from './dashboard.service';
import type { DashboardMetrics, LiveMetrics, HardwareSensorReading } from './dashboard.types';
import { DashboardScanStatusCard } from '../scan/components/DashboardScanStatusCard';
import { useDashboardScan } from '../scan/useDashboardScan';
import { ProStatusBanner, ProStatusPill } from '../licensing/ProStatusBadge';
import { useIsPro } from '../sync/syncStore';
import { ScanView } from '../scan';
import { Modal } from './components/Modal';
import { optimizationEventBus, OptimizationEventType } from '../health/OptimizationEventBus';

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
  const { snapshot } = useDashboardScan();
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const isPro = useIsPro();
  // V1.0: When set, the modal shows previous scan results (Review Findings)
  // instead of auto-starting a new scan. null = start a new scan.
  const [reviewPlanId, setReviewPlanId] = useState<string | null>(null);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  // V1.0: Refresh dashboard metrics after cleanup completes.
  // The ViewModel already listens via dashboardRefreshManager, but
  // that has a 500ms debounce. This direct subscription triggers
  // an immediate metrics reload so cards update right away when
  // the user clicks Done on the cleanup results.
  useEffect(() => {
    return optimizationEventBus.subscribe((event) => {
      if (event.type === OptimizationEventType.CleaningCompleted) {
        void vm.loadMetrics();
      }
    });
  }, [vm]);

  const isScanning = snapshot.scanStatus === 'preparing' || snapshot.scanStatus === 'scanning';
  const hasCompletedScan = snapshot.scanStatus === 'complete';
  const hasScanError = snapshot.scanStatus === 'error';
  // V1.0: Detect initialization errors and show a friendlier message.
  // The backend may return "Scan engine is still initializing" when the
  // orchestrator hasn't finished booting. This is transient, not a real
  // scan failure — show "AVS is preparing the scanner" instead of "Scan
  // could not be completed".
  const isInitializationError =
    hasScanError &&
    Boolean(snapshot.error) &&
    /initializing|still init|not ready|not available/i.test(snapshot.error ?? '');

  const healthScore = state.healthScore?.overallScore ?? 0;
  const securityTone = useMemo(() => getSecurityTone(state.metrics), [state.metrics]);
  const securityLabel = useMemo(() => getSecurityLabel(state.metrics), [state.metrics]);
  const performanceValue = useMemo(() => getPerformanceValue(state.liveMetrics), [state.liveMetrics]);
  const storageValue = useMemo(() => getStorageValue(state.metrics), [state.metrics]);

  // ── V1.0 Dashboard: No plan review redirect. The single modal handles
  // the full Scan → Clean → Verify → Results workflow. ──────────────

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
                        // V1.0 Disk Cleanup style: After cleanup, show files cleaned,
                        // folders cleaned, space recovered, and health before → after.
                        const hasCleanup = snapshot.cleanupResult != null;
                        if (hasCleanup) {
                          const cleaned = snapshot.cleanupResult!.cleaned ?? 0;
                          const foldersCleaned = snapshot.cleanupResult!.foldersCleaned ?? 0;
                          const space = snapshot.cleanupResult!.spaceRecovered ?? 0;
                          const healthBefore = snapshot.cleanupResult!.healthBefore;
                          const healthAfter = snapshot.cleanupResult!.healthAfter;
                          if (cleaned > 0 || foldersCleaned > 0) {
                            const parts: string[] = [];
                            parts.push(`${cleaned.toLocaleString()} files cleaned`);
                            if (foldersCleaned > 0) {
                              parts.push(`${foldersCleaned.toLocaleString()} folders cleaned`);
                            }
                            if (space > 0) {
                              const mb = space / 1024 / 1024;
                              if (mb >= 1024) {
                                parts.push(`${(mb / 1024).toFixed(1)} GB recovered`);
                              } else {
                                parts.push(`${mb.toFixed(1)} MB recovered`);
                              }
                            }
                            const healthStr = (healthBefore != null && healthAfter != null)
                              ? ` · Health ${healthBefore} → ${healthAfter}`
                              : '';
                            return (
                              <span className="text-semantic-success font-medium">
                                {parts.join(' · ')}{healthStr}
                              </span>
                            );
                          }
                          return <span className="text-semantic-success">PC is clean</span>;
                        }
                        const issueCount = snapshot.issuesFound;
                        if (issueCount > 0) {
                          return (
                            <span className="text-semantic-warning font-medium">
                              {issueCount} files found
                            </span>
                          );
                        }
                        return <span className="text-semantic-success">No issues found</span>;
                      })()}
                    </div>
                  </>
                ) : hasScanError ? (
                  <>
                    <div className="text-caption text-text-muted uppercase tracking-wide">Scan Status</div>
                    {isInitializationError ? (
                      <>
                        <div className="text-section-title font-semibold text-semantic-warning">
                          AVS is preparing the scanner
                        </div>
                        <div className="mt-1 text-small text-text-secondary">
                          The scan engine is warming up. Please try again in a moment.
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-section-title font-semibold text-semantic-danger">Scan could not be completed</div>
                        <div className="mt-1 text-small text-text-secondary">
                          {snapshot.error || 'An error occurred during the scan.'}
                        </div>
                      </>
                    )}
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

              {/* Primary Scan CTA — V1.0 Dashboard: single Scan Now button.
                  V1.0: Removed "View Progress" — the 4 scan modules are
                  independent. The Dashboard scan is its own scan; it does
                  not redirect to or show progress of other modules' scans. */}
              <div className="shrink-0">
                <Button
                  onClick={() => {
                    setReviewPlanId(null);
                    setScanModalOpen(true);
                  }}
                  disabled={isScanning}
                  size="lg"
                  leftIcon={isScanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
                  data-testid="dashboard-scan-cta"
                >
                  {isScanning ? 'Scanning...' : hasScanError ? 'Try Again' : 'Scan Now'}
                </Button>
                {!isPro && (
                  <p className="text-xs text-white/40 mt-1.5 text-right" data-testid="dashboard-free-limit-hint">
                    Free edition: up to 500 MB per scan
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── SECONDARY: QUICK METRICS ───────────────────────────────
          V1.0: Removed "Issues" card — after scan and optimize there
          should be no issues shown. The 3 remaining metrics are
          Protection, CPU Usage, and Storage. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

      {/* ── SECONDARY ACTION: REMOVED — V1.0 Dashboard uses single Scan Now → Clean → Results modal ── */}

      {/* Latest unified scan/remediation status from scan_core */}
      <DashboardScanStatusCard
        onOpenScan={() => {
          // V1.0: If the previous scan has reviewable findings, show them.
          // Otherwise, start a new scan.
          if (snapshot.canReview && snapshot.planId) {
            setReviewPlanId(snapshot.planId);
          } else {
            setReviewPlanId(null);
          }
          setScanModalOpen(true);
        }}
      />

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

      {/* Scan modal — V1.0 Dashboard: single modal handles Scan → Clean → Verify → Results */}
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
          source="dashboard"
          onClose={() => {
            setScanModalOpen(false);
            setReviewPlanId(null);
          }}
          buttonLabel="Scan Now"
          autoStart={!reviewPlanId}
          reviewPlanId={reviewPlanId}
        />
      </Modal>

    </div>
  );
}
