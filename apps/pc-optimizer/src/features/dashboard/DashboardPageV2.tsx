import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, DashboardSection, StatCard, InsightCard, RecommendationCard, ChartCard, TimelineCard, Sparkline, EmptyState, LoadingState } from '@avs/ui';
import { ModuleErrorBanner } from '../../components/ModuleStates';
import {
  SparklesIcon,
  ShieldExclamationIcon,
  CpuChipIcon,
  CircleStackIcon,
  HeartIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  BoltIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ArrowRightIcon,
  StarIcon,
  EyeIcon,
  WrenchScrewdriverIcon,
  ChatBubbleLeftRightIcon,
  SunIcon,
  FireIcon,
  Battery50Icon,
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { DashboardViewModel } from './DashboardViewModel';
import { dashboardService } from './dashboard.service';
import { generateRecommendations } from './dashboard.utils';
import type { DashboardMetrics, LiveMetrics, HardwareSensorReading } from './dashboard.types';
import { HealthScanModal } from './components/HealthScanModal';
import { useIsPro } from '../sync/syncStore';
import { useEditionLimits } from '../licensing/editionLimits';
import { ProStatusBanner, ProStatusPill } from '../licensing/ProStatusBadge';
import { FreeUsageWidget } from '../licensing/FreeUsageWidget';

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

function getStorageTone(metrics: DashboardMetrics | null): 'success' | 'warning' | 'danger' {
  if (!metrics?.storage?.length) return 'warning';
  const firstDrive = metrics.storage[0];
  if (!firstDrive) return 'warning';
  if (firstDrive.usage > 90) return 'danger';
  if (firstDrive.usage > 75) return 'warning';
  return 'success';
}

function getStorageValue(metrics: DashboardMetrics | null): string {
  if (!metrics?.storage?.length) return '—';
  const drive = metrics.storage[0];
  if (!drive) return '—';
  return `${Math.round(drive.usage)}%`;
}

function getPerformanceTone(live: LiveMetrics | null): 'success' | 'warning' | 'danger' {
  if (!live) return 'warning';
  const cpu = live.cpu.usage;
  const mem = live.memory.usage;
  if (cpu > 85 || mem > 85) return 'danger';
  if (cpu > 65 || mem > 65) return 'warning';
  return 'success';
}

function getPerformanceValue(live: LiveMetrics | null): string {
  if (!live) return '—';
  return `${Math.round(live.cpu.usage)}%`;
}

function getHardwareTone(live: LiveMetrics | null): 'success' | 'warning' | 'danger' {
  if (!live) return 'warning';
  const temp = live.cpu.temperature;
  if (temp !== null && temp > 80) return 'danger';
  if (temp !== null && temp > 65) return 'warning';
  return 'success';
}

function getHardwareValue(live: LiveMetrics | null): string {
  if (!live) return '—';
  const temp = live.cpu.temperature;
  return temp !== null ? `${Math.round(temp)}°C` : 'N/A';
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

interface AIModuleCard {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  status: 'active' | 'available' | 'pro';
}

function getAIModules(isPro: boolean): AIModuleCard[] {
  return [
    { id: 'hardware-intelligence', name: 'AI Hardware Intelligence', description: 'Analyze, explain, and monitor hardware health', icon: <CpuChipIcon className="h-5 w-5" />, path: '/hardware-center', status: 'active' },
    { id: 'process-intelligence', name: 'AI Process Intelligence', description: 'Understand every running process and its impact', icon: <EyeIcon className="h-5 w-5" />, path: '/process-intelligence', status: 'active' },
    { id: 'smart-optimization', name: 'AI Smart Optimization', description: 'Evidence-based optimization recommendations', icon: <SparklesIcon className="h-5 w-5" />, path: '/ai-smart-optimize', status: 'active' },
    { id: 'predictive-health', name: 'AI Predictive Health', description: 'Detect degrading trends before they become problems', icon: <ChartBarIcon className="h-5 w-5" />, path: '/predictive-health', status: isPro ? 'active' : 'pro' },
    { id: 'security-center', name: 'AI Security Center', description: 'Comprehensive security analysis and monitoring', icon: <ShieldExclamationIcon className="h-5 w-5" />, path: '/security-center', status: 'active' },
    { id: 'active-protection', name: 'AI Active Protection', description: 'Real-time monitoring and behavior analysis', icon: <ShieldExclamationIcon className="h-5 w-5" />, path: '/ai-active-protection', status: 'active' },
    { id: 'threat-investigation', name: 'AI Threat Investigation', description: 'Explainable AI threat timeline and correlation', icon: <EyeIcon className="h-5 w-5" />, path: '/threat-investigation', status: isPro ? 'active' : 'pro' },
    { id: 'remediation', name: 'AI Remediation', description: 'Safe quarantine, rollback, and recovery', icon: <WrenchScrewdriverIcon className="h-5 w-5" />, path: '/quarantine', status: isPro ? 'active' : 'pro' },
    { id: 'ai-assistant', name: 'AVS AI Assistant', description: 'Your AI assistant for PC health and security', icon: <ChatBubbleLeftRightIcon className="h-5 w-5" />, path: '/ai-assistant', status: 'active' },
    { id: 'daily-briefing', name: 'AI Daily Briefing', description: 'Daily AI summary and system highlights', icon: <SunIcon className="h-5 w-5" />, path: '/ai-daily-briefing', status: 'active' },
  ];
}

export default function DashboardPage() {
  const vm = useMemo(() => new DashboardViewModel(dashboardService), []);
  const state = useViewModel(vm);
  const navigate = useNavigate();
  const isPro = useIsPro();
  const limits = useEditionLimits();

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const isScanning = state.healthScanStep !== 'idle' && state.healthScanStep !== 'complete';
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);

  useEffect(() => {
    if (state.liveMetrics) {
      setCpuHistory((prev) => [...prev.slice(-19), state.liveMetrics!.cpu.usage]);
      setMemHistory((prev) => [...prev.slice(-19), state.liveMetrics!.memory.usage]);
    }
  }, [state.liveMetrics]);

  const buttonLabel = (() => {
    switch (state.healthScanStep) {
      case 'preparing': return 'Preparing...';
      case 'scanning': return 'Analyzing...';
      case 'optimizing': return 'Optimizing...';
      case 'verifying': return 'Verifying...';
      case 'updating_dashboard': return 'Updating Dashboard...';
      default: return '✨ AI Smart Optimize';
    }
  })();

  if (state.bootstrap === 'loading') {
    return <LoadingState message="Loading dashboard..." data-testid="dashboard-loading" />;
  }

  if (state.bootstrap === 'error') {
    return (
      <EmptyState
        icon={<ExclamationTriangleIcon className="h-8 w-8" />}
        title="Failed to load dashboard"
        description={state.bootstrapError || 'An error occurred while loading the dashboard.'}
        action={{ label: 'Retry', onClick: () => vm.bootstrap() }}
        data-testid="dashboard-error"
      />
    );
  }

  const healthScore = state.healthScore?.overallScore ?? 0;
  const securityTone = getSecurityTone(state.metrics);
  const securityLabel = getSecurityLabel(state.metrics);
  const performanceTone = getPerformanceTone(state.liveMetrics);
  const performanceValue = getPerformanceValue(state.liveMetrics);
  const hardwareTone = getHardwareTone(state.liveMetrics);
  const hardwareValue = getHardwareValue(state.liveMetrics);
  const storageTone = getStorageTone(state.metrics);
  const storageValue = getStorageValue(state.metrics);

  const recommendations = state.healthScore
    ? generateRecommendations(state.healthScore, state.metrics, isPro ? 'professional' : 'free')
    : [];
  const maxRecommendations = limits.getLimit('dashboardRecommendations') ?? recommendations.length;
  const visibleRecommendations = recommendations.slice(0, maxRecommendations);

  return (
    <div className="space-y-8" data-testid="page-dashboard">
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

      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{getGreeting()}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Here&apos;s your AI-powered system overview for today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ProStatusPill />
          <Button
            onClick={() => vm.startHealthScan()}
            disabled={isScanning}
            size="lg"
            leftIcon={isScanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <SparklesIcon className="h-5 w-5" />}
            data-testid="improve-health-button"
          >
            {buttonLabel}
          </Button>
        </div>
      </div>

      {/* AI Score Cards Row */}
      <DashboardSection>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="AI Health Score"
            value={healthScore}
            unit="/ 100"
            icon={<HeartIcon className="h-5 w-5" />}
            tone={healthScore >= 80 ? 'success' : healthScore >= 60 ? 'warning' : 'danger'}
            description={healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : 'Needs Attention'}
            progress={healthScore}
            onClick={() => navigate('/system-health')}
            data-testid="stat-health"
          />
          <StatCard
            label="Security"
            value={securityLabel}
            icon={<ShieldExclamationIcon className="h-5 w-5" />}
            tone={securityTone}
            description={state.metrics?.security?.realTimeProtection ? 'Real-time active' : 'Check settings'}
            progress={securityTone === 'success' ? 100 : securityTone === 'warning' ? 50 : 20}
            onClick={() => navigate('/security-center')}
            data-testid="stat-security"
          />
          <StatCard
            label="Performance"
            value={performanceValue}
            icon={<BoltIcon className="h-5 w-5" />}
            tone={performanceTone}
            description={`CPU ${state.liveMetrics ? Math.round(state.liveMetrics.cpu.usage) : '—'}% · RAM ${state.liveMetrics ? Math.round(state.liveMetrics.memory.usage) : '—'}%`}
            progress={state.liveMetrics ? 100 - Math.round(state.liveMetrics.cpu.usage) : 0}
            onClick={() => navigate('/process-intelligence')}
            data-testid="stat-performance"
          />
          <StatCard
            label="Hardware"
            value={hardwareValue}
            icon={<CpuChipIcon className="h-5 w-5" />}
            tone={hardwareTone}
            description={`CPU ${state.liveMetrics ? state.liveMetrics.cpu.temperature !== null ? Math.round(state.liveMetrics.cpu.temperature) + '°C' : 'N/A' : '—'}`}
            progress={hardwareTone === 'success' ? 85 : hardwareTone === 'warning' ? 50 : 20}
            onClick={() => navigate('/hardware-center')}
            data-testid="stat-hardware"
          />
          <StatCard
            label="Storage"
            value={storageValue}
            icon={<CircleStackIcon className="h-5 w-5" />}
            tone={storageTone}
            description={state.metrics?.storage?.[0] ? `${Math.round(state.metrics.storage[0].free / 1_000_000_000)} GB free` : '—'}
            progress={state.metrics?.storage?.[0] ? 100 - Math.round(state.metrics.storage[0].usage) : 0}
            onClick={() => navigate('/disk-analyzer')}
            data-testid="stat-storage"
          />
        </div>
      </DashboardSection>

      {/* AI Daily Briefing */}
      <DashboardSection title="AI Daily Briefing" icon={<SparklesIcon className="h-5 w-5" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {healthScore >= 80 ? (
            <InsightCard
              icon={<CheckCircleIcon className="h-5 w-5" />}
              iconColor="text-semantic-success"
              title="System Health is Excellent"
              description={`Your PC health score is ${healthScore}/100. No critical issues detected.`}
              severity="success"
            />
          ) : healthScore >= 60 ? (
            <InsightCard
              icon={<ExclamationTriangleIcon className="h-5 w-5" />}
              iconColor="text-semantic-warning"
              title="System Health is Good"
              description={`Health score is ${healthScore}/100. ${state.healthScore?.issues.length ?? 0} issues found that could be optimized.`}
              action={{ label: 'Optimize Now', onClick: () => vm.startHealthScan() }}
              severity="warning"
            />
          ) : (
            <InsightCard
              icon={<ExclamationTriangleIcon className="h-5 w-5" />}
              iconColor="text-semantic-danger"
              title="System Health Needs Attention"
              description={`Health score is ${healthScore}/100. ${state.healthScore?.issues.length ?? 0} issues detected. AI Smart Optimize recommended.`}
              action={{ label: 'Run AI Smart Optimize', onClick: () => vm.startHealthScan() }}
              severity="danger"
            />
          )}
          <InsightCard
            icon={<ShieldExclamationIcon className="h-5 w-5" />}
            iconColor={securityTone === 'success' ? 'text-semantic-success' : 'text-semantic-warning'}
            title="AI Active Protection"
            description={securityTone === 'success'
              ? 'Real-time protection is active. Your system is being monitored.'
              : 'Real-time protection needs attention. Check security settings.'}
            action={{ label: 'View Security Center', onClick: () => navigate('/security-center') }}
            severity={securityTone === 'success' ? 'success' : 'warning'}
          />
        </div>
      </DashboardSection>

      {/* AI Recommendations */}
      {visibleRecommendations.length > 0 && (
        <DashboardSection title={`AI Recommendations${!isPro && recommendations.length > maxRecommendations ? ` (Top ${maxRecommendations})` : ''}`} icon={<ChartBarIcon className="h-5 w-5" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
        </DashboardSection>
      )}

      {/* Quick Actions */}
      <DashboardSection title="Quick Actions" icon={<BoltIcon className="h-5 w-5" />}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { id: 'ai-smart-optimize', name: 'AI Smart Optimize', icon: SparklesIcon, color: 'text-brand-primary', path: '/ai-smart-optimize', proEnhanced: false },
            { id: 'quick-scan', name: 'Quick Scan', icon: ShieldExclamationIcon, color: 'text-semantic-success', path: '/quick-scan', proEnhanced: false },
            { id: 'full-scan', name: 'Full Scan', icon: ShieldExclamationIcon, color: 'text-semantic-danger', path: '/full-scan', proEnhanced: false },
            { id: 'ai-assistant', name: 'AVS AI Assistant', icon: ChatBubbleLeftRightIcon, color: 'text-brand-primary', path: '/ai-assistant', proEnhanced: false },
            { id: 'junk-cleaner', name: 'Junk Cleaner', icon: CircleStackIcon, color: 'text-brand-primary', path: '/junk-cleaner', proEnhanced: false },
            { id: 'startup-manager', name: 'Startup Manager', icon: BoltIcon, color: 'text-semantic-success', path: '/startup-manager', proEnhanced: false },
            { id: 'privacy-cleaner', name: 'Privacy Cleaner', icon: ShieldExclamationIcon, color: 'text-semantic-warning', path: '/privacy-cleaner', proEnhanced: true },
            { id: 'disk-analyzer', name: 'Disk Analyzer', icon: ChartBarIcon, color: 'text-semantic-danger', path: '/disk-analyzer', proEnhanced: true },
            { id: 'duplicate-finder', name: 'Duplicate Finder', icon: DocumentTextIcon, color: 'text-semantic-info', path: '/duplicate-finder', proEnhanced: true },
            { id: 'process-intelligence', name: 'Process AI', icon: CpuChipIcon, color: 'text-brand-primary', path: '/process-intelligence', proEnhanced: false },
          ].map((action) => (
            <button
              key={action.id}
              onClick={() => navigate(action.path)}
              className="group flex flex-col items-center gap-3 p-4 rounded-[var(--avs-radius-xl)] bg-gradient-surface border border-[var(--avs-border)] hover:border-[var(--avs-border-hover)] hover:shadow-glow transition-all duration-[var(--avs-duration-normal)] ease-[var(--avs-easing)]"
              data-testid={`quick-action-${action.id}`}
            >
              <div className="p-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] group-hover:bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)] transition-colors relative">
                <action.icon className={`h-6 w-6 ${action.color}`} />
                {action.proEnhanced && !isPro && (
                  <StarIcon className="absolute -top-1 -right-1 h-3.5 w-3.5 text-semantic-warning/70" data-testid={`quick-action-pro-badge-${action.id}`} />
                )}
              </div>
              <span className="text-sm font-medium text-text-primary">{action.name}</span>
            </button>
          ))}
        </div>
      </DashboardSection>

      {/* AI Modules */}
      <DashboardSection title="AI Modules" icon={<SparklesIcon className="h-5 w-5" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {getAIModules(isPro).map((mod) => (
            <Card
              key={mod.id}
              variant="gradient"
              className="flex items-start gap-3 cursor-pointer hover:border-[var(--avs-border-hover)] transition-colors"
              onClick={() => navigate(mod.path)}
              data-testid={`ai-module-${mod.id}`}
            >
              <div className="p-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] shrink-0">
                {mod.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{mod.name}</span>
                  {mod.status === 'pro' && (
                    <StarIcon className="h-3.5 w-3.5 text-semantic-warning/70" data-testid={`ai-module-pro-badge-${mod.id}`} />
                  )}
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{mod.description}</p>
              </div>
              <ArrowRightIcon className="h-4 w-4 text-text-muted shrink-0 mt-1" />
            </Card>
          ))}
        </div>
      </DashboardSection>

      {/* Free Edition Usage Tracker */}
      {!isPro && (
        <DashboardSection title="Today's Usage" icon={<ChartBarIcon className="h-5 w-5" />}>
          <div className="max-w-sm">
            <FreeUsageWidget />
          </div>
        </DashboardSection>
      )}

      {/* Live Charts */}
      <DashboardSection title="Live System Monitor" icon={<ChartBarIcon className="h-5 w-5" />}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard title="CPU Usage" icon={<CpuChipIcon className="h-4 w-4" />}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl font-bold text-text-primary tabular-nums">
                {state.liveMetrics ? `${Math.round(state.liveMetrics.cpu.usage)}%` : '—'}
              </span>
              <span className="text-xs text-text-muted">
                {state.liveMetrics ? `${state.liveMetrics.cpu.logicalProcessors} cores` : ''}
              </span>
            </div>
            <Sparkline data={cpuHistory.length > 1 ? cpuHistory : [0, 0]} width={280} height={60} />
          </ChartCard>
          <ChartCard title="Memory Usage" icon={<CircleStackIcon className="h-4 w-4" />}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl font-bold text-text-primary tabular-nums">
                {state.liveMetrics ? `${Math.round(state.liveMetrics.memory.usage)}%` : '—'}
              </span>
              <span className="text-xs text-text-muted">
                {state.liveMetrics ? `${Math.round(state.liveMetrics.memory.used / 1_000_000_000)} / ${Math.round(state.liveMetrics.memory.total / 1_000_000_000)} GB` : ''}
              </span>
            </div>
            <Sparkline data={memHistory.length > 1 ? memHistory : [0, 0]} width={280} height={60} stroke="var(--avs-success)" fill="var(--avs-success)" />
          </ChartCard>
        </div>
      </DashboardSection>

      {/* Recent Activity & Security Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimelineCard
          title="Recent Activity"
          icon={<ClockIcon className="h-4 w-4" />}
          items={(state.healthScanHistory || []).slice(0, 5).map((h) => ({
            title: h.result === 'success' ? 'AI Smart Optimize Completed' : 'Optimization Partial',
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
                ? 'Windows Defender is active and protecting your system.'
                : 'Windows Defender is not active. Enable real-time protection.',
              timestamp: 'Now',
              severity: securityTone,
            },
            ...(state.metrics?.security?.updates?.pendingUpdates
              ? [{
                  title: `${state.metrics.security.updates.pendingUpdates} Pending Updates`,
                  description: 'Windows updates are available. Install them to keep your system secure.',
                  timestamp: 'Today',
                  severity: 'warning' as const,
                }]
              : []),
          ]}
          data-testid="security-events"
        />
      </div>

      {/* Hardware Monitoring */}
      <DashboardSection title="Hardware Monitoring" icon={<CpuChipIcon className="h-5 w-5" />}>
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
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3" data-testid="hardware-monitoring-grid">
                {metrics.map((m) => (
                  <Card key={m.label} variant="gradient" className="flex items-center gap-3">
                    <div className={`p-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] ${m.supported ? 'text-text-muted' : 'text-text-muted/40'}`}>
                      {m.icon}
                    </div>
                    <div>
                      <div className="text-xs text-text-muted">{m.label}</div>
                      <div className={`text-lg font-bold tabular-nums ${m.supported ? 'text-text-primary' : 'text-text-muted/60'}`}>
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
      </DashboardSection>

      {/* System Status */}
      <DashboardSection title="System Status" icon={<CheckCircleIcon className="h-5 w-5" />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'CPU Temp', value: state.liveMetrics?.cpu.temperature != null ? `${Math.round(state.liveMetrics.cpu.temperature)}°C` : 'Unsupported', icon: CpuChipIcon },
            { label: 'Memory', value: state.liveMetrics ? `${Math.round(state.liveMetrics.memory.usage)}%` : '—', icon: CircleStackIcon },
            { label: 'Disk', value: state.metrics?.storage?.[0] ? `${Math.round(state.metrics.storage[0].usage)}%` : '—', icon: CircleStackIcon },
            { label: 'Network', value: state.liveMetrics?.network ? `${(state.liveMetrics.network.downloadSpeed / 1_000_000).toFixed(1)} MB/s` : '—', icon: ArrowRightIcon },
          ].map((stat) => (
            <Card key={stat.label} variant="gradient" className="flex items-center gap-3">
              <div className="p-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)]">
                <stat.icon className="h-5 w-5 text-text-muted" />
              </div>
              <div>
                <div className="text-xs text-text-muted">{stat.label}</div>
                <div className="text-lg font-bold text-text-primary tabular-nums">{stat.value}</div>
              </div>
            </Card>
          ))}
        </div>
      </DashboardSection>

      {/* Health Scan Modal */}
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
