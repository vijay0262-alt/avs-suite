import { useEffect, useMemo, useState, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Card, RecommendationCard, ChartCard, TimelineCard, Sparkline, EmptyState, LoadingState, CollapsibleSection } from '@avs/ui';
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
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { DashboardViewModel } from './DashboardViewModel';
import { dashboardService } from './dashboard.service';
import { generateRecommendations } from './dashboard.utils';
import type { DashboardMetrics, LiveMetrics, HardwareSensorReading } from './dashboard.types';
import { UnifiedOptimizeFlow } from './components/UnifiedOptimizeFlow';
import { useIsPro } from '../sync/syncStore';
import { useEditionLimits } from '../licensing/editionLimits';
import { ProStatusBanner, ProStatusPill } from '../licensing/ProStatusBadge';

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
  const location = useLocation();
  const isPro = useIsPro();
  const limits = useEditionLimits();

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  // Auto-trigger health scan when navigated from FirstScanDialog
  useEffect(() => {
    if (state.bootstrap === 'ready' && state.healthScanStep === 'idle') {
      const navState = location.state as { action?: string } | null;
      if (navState?.action === 'auto-scan') {
        vm.startHealthScan('dashboard', isPro);
        // Clear the location state so it doesn't re-trigger
        navigate('/dashboard', { replace: true, state: {} });
      }
    }
  }, [state.bootstrap, state.healthScanStep, location.state, navigate, vm, isPro]);

  const isScanning = state.healthScanStep !== 'idle' && state.healthScanStep !== 'complete';

  const buttonLabel = (() => {
    switch (state.healthScanStep) {
      case 'preparing': return 'Preparing...';
      case 'scanning': return 'Analyzing...';
      case 'optimizing': return 'Optimizing...';
      case 'verifying': return 'Verifying...';
      case 'updating_dashboard': return 'Updating Dashboard...';
      default: return 'Optimize Now';
    }
  })();

  const healthScore = state.healthScore?.overallScore ?? 0;
  const securityTone = useMemo(() => getSecurityTone(state.metrics), [state.metrics]);
  const securityLabel = useMemo(() => getSecurityLabel(state.metrics), [state.metrics]);
  const performanceValue = useMemo(() => getPerformanceValue(state.liveMetrics), [state.liveMetrics]);
  const storageValue = useMemo(() => getStorageValue(state.metrics), [state.metrics]);

  const recommendations = useMemo(
    () => state.healthScore
      ? generateRecommendations(state.healthScore, state.metrics, isPro ? 'professional' : 'free')
      : [],
    [state.healthScore, state.metrics, isPro],
  );
  const maxRecommendations = limits.getLimit('dashboardRecommendations') ?? recommendations.length;
  const visibleRecommendations = recommendations.slice(0, maxRecommendations);

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

      {/* ── ABOVE THE FOLD ─────────────────────────────────────────── */}
      {/* Greeting + Primary Action */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page-title text-text-primary">{getGreeting()}</h1>
          <p className="mt-1 text-caption text-text-secondary">
            {healthScore >= 80 ? 'Your PC is healthy.' : healthScore >= 60 ? 'Your PC needs minor attention.' : 'Your PC needs optimization.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ProStatusPill />
          <Button
            onClick={() => vm.startHealthScan('dashboard', isPro)}
            disabled={isScanning}
            size="lg"
            leftIcon={isScanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
            data-testid="improve-health-button"
          >
            {buttonLabel}
          </Button>
        </div>
      </div>

      {/* Primary: Health Score + Protection Status (2 large cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card variant="glass" className="lg:col-span-2 p-5" data-testid="primary-health-card">
          <div className="flex items-center gap-6">
            <div className="shrink-0">
              <div className={`relative inline-flex items-center justify-center h-24 w-24 rounded-full ${
                healthScore >= 80 ? 'bg-semantic-success/10' : healthScore >= 60 ? 'bg-semantic-warning/10' : 'bg-semantic-danger/10'
              }`}>
                <HeartIcon className={`h-10 w-10 ${
                  healthScore >= 80 ? 'text-semantic-success' : healthScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger'
                }`} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted uppercase tracking-wide">Health Score</div>
              <div className="text-4xl font-bold text-text-primary tabular-nums">{healthScore}<span className="text-lg text-text-muted">/100</span></div>
              <div className={`text-small font-medium ${
                healthScore >= 80 ? 'text-semantic-success' : healthScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger'
              }`}>
                {healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : 'Needs Attention'}
              </div>
              {state.healthScore && state.healthScore.issues.length > 0 && (
                <div className="mt-1 text-caption text-text-muted">
                  {state.healthScore.issues.length} issues detected
                </div>
              )}
            </div>
            <div className="hidden sm:block shrink-0">
              <div className="text-right">
                <div className="text-caption text-text-muted">Performance</div>
                <div className="text-statistic text-text-primary tabular-nums">{performanceValue}</div>
                <div className="mt-2 text-caption text-text-muted">Storage</div>
                <div className="text-small font-semibold text-text-primary tabular-nums">{storageValue}</div>
              </div>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="p-5" data-testid="primary-protection-card">
          <div className="flex items-center gap-4">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              securityTone === 'success' ? 'bg-semantic-success/10' : securityTone === 'warning' ? 'bg-semantic-warning/10' : 'bg-semantic-danger/10'
            }`}>
              <ShieldExclamationIcon className={`h-7 w-7 ${
                securityTone === 'success' ? 'text-semantic-success' : securityTone === 'warning' ? 'text-semantic-warning' : 'text-semantic-danger'
              }`} />
            </div>
            <div>
              <div className="text-caption text-text-muted uppercase tracking-wide">Protection</div>
              <div className="text-section-title font-bold text-text-primary">{securityLabel}</div>
              <div className="text-caption text-text-secondary mt-0.5">
                {state.metrics?.security?.realTimeProtection ? 'Real-time active' : 'Check settings'}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Secondary: Last Scan + Top Recommendation (2 compact cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="glass" className="p-4" data-testid="primary-last-scan">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-text-muted shrink-0" />
              <div>
                <div className="text-caption text-text-muted">Last Scan</div>
                {state.healthScanHistory[0] ? (
                  <div className="text-small font-medium text-text-primary">
                    {state.healthScanHistory[0].result === 'success' ? 'Optimized' : 'Partial'} · {new Date(state.healthScanHistory[0].date).toLocaleDateString()}
                  </div>
                ) : (
                  <div className="text-small text-text-muted">No scans yet</div>
                )}
              </div>
            </div>
            {state.healthScanHistory[0] && (
              <div className="text-right">
                <div className="text-caption text-text-muted">Score</div>
                <div className="text-small font-bold text-text-primary tabular-nums">{state.healthScanHistory[0].healthAfter}</div>
              </div>
            )}
          </div>
        </Card>

        {visibleRecommendations[0] ? (
          <Card variant="glass" className="p-4" data-testid="primary-recommendation">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <SparklesIcon className="h-5 w-5 text-brand-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-caption text-text-muted">Recommended Action</div>
                  <div className="text-small font-medium text-text-primary truncate">{visibleRecommendations[0].title}</div>
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(visibleRecommendations[0]?.actionPath ?? '/')}
                className="shrink-0"
              >
                {visibleRecommendations[0].actionLabel}
              </Button>
            </div>
          </Card>
        ) : (
          <Card variant="glass" className="p-4" data-testid="primary-recommendation">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-semantic-success shrink-0" />
              <div>
                <div className="text-caption text-text-muted">Recommendation</div>
                <div className="text-small font-medium text-text-primary">No actions needed</div>
              </div>
            </div>
          </Card>
        )}
      </div>

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
            const ramSpeed = state.liveMetrics?.cpu?.frequency
              ? { current: state.liveMetrics.cpu.frequency, unit: 'mhz', name: 'RAM' }
              : undefined;
            const battery = hw.battery;
            const power = hw.power;
            const metrics: { label: string; value: string; icon: React.ReactNode; supported: boolean }[] = [
              { label: 'CPU Temp', value: cpuTemp ? formatSensorValue(cpuTemp, '°C') : 'Unsupported', icon: <CpuChipIcon className="h-5 w-5" />, supported: !!cpuTemp },
              { label: 'GPU Temp', value: gpuTemp ? formatSensorValue(gpuTemp, '°C') : 'Unsupported', icon: <FireIcon className="h-5 w-5" />, supported: !!gpuTemp },
              { label: 'Motherboard Temp', value: motherboardTemp ? formatSensorValue(motherboardTemp, '°C') : 'Unsupported', icon: <CpuChipIcon className="h-5 w-5" />, supported: !!motherboardTemp },
              { label: 'SSD Temp', value: ssdTemp ? formatSensorValue(ssdTemp, '°C') : 'Unsupported', icon: <CircleStackIcon className="h-5 w-5" />, supported: !!ssdTemp },
              { label: 'HDD Temp', value: hddTemp ? formatSensorValue(hddTemp, '°C') : 'Unsupported', icon: <CircleStackIcon className="h-5 w-5" />, supported: !!hddTemp },
              { label: 'CPU Fan RPM', value: cpuFan ? formatSensorValue(cpuFan, ' RPM') : 'Unsupported', icon: <ArrowPathIcon className="h-5 w-5" />, supported: !!cpuFan },
              { label: 'GPU Fan RPM', value: gpuFan ? formatSensorValue(gpuFan, ' RPM') : 'Unsupported', icon: <ArrowPathIcon className="h-5 w-5" />, supported: !!gpuFan },
              { label: 'System Fan RPM', value: systemFan ? formatSensorValue(systemFan, ' RPM') : 'Unsupported', icon: <ArrowPathIcon className="h-5 w-5" />, supported: !!systemFan },
              { label: 'CPU Clock', value: formatClockValue(cpuClock), icon: <BoltIcon className="h-5 w-5" />, supported: !!cpuClock },
              { label: 'GPU Clock', value: formatClockValue(gpuClock), icon: <BoltIcon className="h-5 w-5" />, supported: !!gpuClock },
              { label: 'RAM Speed', value: ramSpeed ? formatClockValue(ramSpeed) : 'Unsupported', icon: <CpuChipIcon className="h-5 w-5" />, supported: !!ramSpeed },
              { label: 'Battery Health', value: battery.supported && battery.percent !== null ? `${battery.percent}%${battery.powerPlugged ? ' (Plugged)' : ''}` : 'No Battery', icon: <Battery50Icon className="h-5 w-5" />, supported: battery.supported },
              { label: 'Power Usage', value: power.supported ? 'Available' : 'Unsupported', icon: <BoltIcon className="h-5 w-5" />, supported: power.supported },
            ];
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4" data-testid="hardware-monitoring-grid">
                {metrics.map((m) => (
                  <Card key={m.label} variant="gradient" className="flex items-center gap-3">
                    <div className={`p-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] ${m.supported ? 'text-text-muted' : 'text-text-muted/40'}`}>
                      {m.icon}
                    </div>
                    <div>
                      <div className="text-caption text-text-muted">{m.label}</div>
                      <div className={`text-statistic-sm tabular-nums ${m.supported ? 'text-text-primary' : 'text-text-muted/60'}`}>
                        {m.value}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            );
          })()
        ) : (
          <EmptyState
            icon={<CpuChipIcon className="h-8 w-8" />}
            title="No hardware sensor data"
            description="Hardware sensors are not available on this system."
            data-testid="hardware-sensors-empty"
          />
        )}
        </div>
      </CollapsibleSection>

      {/* Panel 2: Recommendations & History */}
      <CollapsibleSection title="Recommendations & History" icon={<ClockIcon className="h-5 w-5" />} storageKey="dash-recommendations-history">
        {visibleRecommendations.length > 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {visibleRecommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                icon={<SparklesIcon className="h-5 w-5" />}
                title={rec.title}
                description={rec.description}
                priority={rec.severity === 'danger' ? 'high' : rec.severity === 'warning' ? 'medium' : 'low'}
                action={{ label: rec.actionLabel, onClick: () => navigate(rec.actionPath) }}
                data-testid={`recommendation-${rec.id}`}
              />
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TimelineCard
            title="Recent Activity"
            icon={<ClockIcon className="h-4 w-4" />}
            items={(state.healthScanHistory || []).slice(0, 5).map((h) => ({
              title: h.result === 'success' ? 'Smart Optimize Completed' : 'Optimization Partial',
              description: `Health: ${h.healthBefore} → ${h.healthAfter}. Recovered ${Math.round(h.recoveredSpace / 1_000_000)} MB.`,
              timestamp: new Date(h.date).toLocaleDateString(),
              severity: h.result === 'success' ? 'success' : 'warning',
            }))}
            data-testid="recent-activity"
          />
          <TimelineCard
            title="Security Events"
            icon={<ShieldExclamationIcon className="h-4 w-4" />}
            items={[
              {
                title: securityLabel,
                description: state.metrics?.security?.defender?.enabled
                  ? 'Windows Defender is active.'
                  : 'Windows Defender is not active.',
                timestamp: 'Now',
                severity: securityTone,
              },
              ...(state.metrics?.security?.updates?.pendingUpdates
                ? [{
                    title: `${state.metrics.security.updates.pendingUpdates} Pending Updates`,
                    description: 'Install updates to stay secure.',
                    timestamp: 'Today',
                    severity: 'warning' as const,
                  }]
                : []),
            ]}
            data-testid="security-events"
          />
        </div>
      </CollapsibleSection>

      {/* Unified Scan + Optimize + Verify Flow */}
      {state.healthScanStep !== 'idle' && (
        <UnifiedOptimizeFlow
          vm={vm}
          isPro={isPro}
          onClose={() => vm.closeHealthScan()}
        />
      )}
    </div>
  );
}
