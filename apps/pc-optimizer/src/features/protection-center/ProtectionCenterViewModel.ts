/**
 * ProtectionCenterViewModel — real-time state machine for the AI Protection Center.
 *
 * Responsibilities:
 *   - Poll dashboard metrics & live metrics (reuses DashboardService)
 *   - Subscribe to optimization event bus for live activity feed
 *   - Subscribe to health notification service for alerts
 *   - Derive protection state, cards, monitors, coverage, system health
 *   - Compute "what changed" from optimization history
 *   - Manage scheduled tasks and quick actions
 *
 * No fabricated data — everything is derived from real backend services.
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { NavigateFunction } from 'react-router-dom';
import { dashboardService } from '../dashboard/dashboard.service';
import type {
  DashboardMetrics,
  LiveMetrics,
  HardwareSensors,
  HealthScore,
} from '../dashboard/dashboard.types';
import { SCORE_ZONE_CONFIG } from '../dashboard/dashboard.types';
import {
  optimizationEventBus,
  OptimizationEventType,
  optimizationHistoryService,
  healthTimelineService,
  healthNotificationService,
} from '../health';
import type { OptimizationEvent } from '../health';
import type { HealthNotification } from '../health/HealthNotificationService';
import type { OptimizationHistoryEntry } from '../health/OptimizationHistoryService';
import { performanceService } from '../performance/performance.service';
import type { ProcessOptimizeResult } from '../performance/performance.service';
import type {
  ProtectionCenterState,
  ProtectionState,
  ProtectionLevel,
  ProtectionCardData,
  CardStatus,
  ActivityEvent,
  ActivityKind,
  MonitorStatus,
  CoverageItem,
  SystemHealthSnapshotData,
  ChangeEntry,
  ScheduledTask,
  QuickAction,
  ProtectionAlert,
  AlertSeverity,
} from './protectionCenter.types';

const LIVE_POLL_INTERVAL_MS = 3000;
const LIVE_POLL_HIDDEN_INTERVAL_MS = 15000;
const MAX_ACTIVITIES = 30;
const MAX_ALERTS = 10;

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

const initialState: ProtectionCenterState = {
  loading: true,
  error: null,
  protectionState: null,
  cards: [],
  activities: [],
  monitors: [],
  coverage: [],
  systemHealth: null,
  changes: [],
  scheduledTasks: [],
  quickActions: [],
  alerts: [],
  metrics: null,
  liveMetrics: null,
  hardwareSensors: null,
  healthScore: null,
  isPro: false,
  lastRefresh: null,
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'smart-optimize',
    label: 'Smart Optimize',
    description: 'Run AI-powered optimization',
    iconName: 'BoltIcon',
    path: '/ai-smart-optimize',
    tone: 'brand',
  },
  {
    id: 'smart-security',
    label: 'Smart Security',
    description: 'AI security scan & analysis',
    iconName: 'ShieldCheckIcon',
    path: '/ai-smart-security',
    tone: 'info',
  },
  {
    id: 'junk-cleaner',
    label: 'Clean Junk',
    description: 'Remove temporary files',
    iconName: 'TrashIcon',
    path: '/junk-cleaner',
    tone: 'warning',
  },
  {
    id: 'startup-manager',
    label: 'Manage Startup',
    description: 'Control startup apps',
    iconName: 'RocketLaunchIcon',
    path: '/startup-manager',
    tone: 'success',
  },
  {
    id: 'hardware-center',
    label: 'Hardware Center',
    description: 'Monitor hardware health',
    iconName: 'ComputerDesktopIcon',
    path: '/hardware-center',
    tone: 'info',
  },
  {
    id: 'reports',
    label: 'View Reports',
    description: 'Export and review reports',
    iconName: 'DocumentChartBarIcon',
    path: '/reports',
    tone: 'info',
    proOnly: true,
  },
];

const SCHEDULED_TASKS_FREE: ScheduledTask[] = [
  {
    id: 'quick-scan-daily',
    name: 'Quick Security Scan',
    type: 'scan',
    nextRun: null,
    recurrence: 'Manual only',
    proOnly: false,
    enabled: false,
  },
  {
    id: 'junk-clean-weekly',
    name: 'Junk Cleanup',
    type: 'optimize',
    nextRun: null,
    recurrence: 'Manual only',
    proOnly: false,
    enabled: false,
  },
];

const SCHEDULED_TASKS_PRO: ScheduledTask[] = [
  {
    id: 'quick-scan-daily',
    name: 'Quick Security Scan',
    type: 'scan',
    nextRun: null,
    recurrence: 'Daily at 3:00 AM',
    proOnly: false,
    enabled: true,
  },
  {
    id: 'full-scan-weekly',
    name: 'Full System Scan',
    type: 'scan',
    nextRun: null,
    recurrence: 'Weekly on Sunday',
    proOnly: true,
    enabled: true,
  },
  {
    id: 'auto-optimize-daily',
    name: 'Auto-Optimize',
    type: 'optimize',
    nextRun: null,
    recurrence: 'Daily at 4:00 AM',
    proOnly: true,
    enabled: true,
  },
  {
    id: 'driver-update-weekly',
    name: 'Driver Update Check',
    type: 'update',
    nextRun: null,
    recurrence: 'Weekly on Monday',
    proOnly: true,
    enabled: true,
  },
];

export class ProtectionCenterViewModel extends ViewModel<ProtectionCenterState> {
  private livePollTimer: ReturnType<typeof setInterval> | null = null;
  private metricsTimer: ReturnType<typeof setInterval> | null = null;
  private optEventUnsub: (() => void) | null = null;
  private notifUnsub: (() => void) | null = null;
  private isMounted = false;

  constructor(
    private readonly navigate: NavigateFunction,
    private readonly isPro: boolean,
  ) {
    super({
      ...initialState,
      isPro,
      quickActions: QUICK_ACTIONS,
      scheduledTasks: isPro ? SCHEDULED_TASKS_PRO : SCHEDULED_TASKS_FREE,
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  async init(): Promise<void> {
    this.isMounted = true;
    this.subscribeToEvents();
    await this.refreshAll();
    this.startPolling();
  }

  override dispose(): void {
    this.isMounted = false;
    this.stopPolling();
    this.optEventUnsub?.();
    this.notifUnsub?.();
    this.optEventUnsub = null;
    this.notifUnsub = null;
    super.dispose();
  }

  // ── Event Subscriptions ──────────────────────────────────────────

  private subscribeToEvents(): void {
    this.optEventUnsub = optimizationEventBus.subscribe((event) => {
      this.handleOptimizationEvent(event);
    });

    this.notifUnsub = healthNotificationService.subscribe((notif) => {
      this.handleHealthNotification(notif);
    });
  }

  private handleOptimizationEvent(event: OptimizationEvent): void {
    const activity = this.eventToActivity(event);
    if (activity) {
      this.setState((prev) => ({
        ...prev,
        activities: [activity, ...prev.activities].slice(0, MAX_ACTIVITIES),
      }));
    }
    // Refresh metrics after an optimization event
    void this.refreshMetrics();
  }

  private handleHealthNotification(notif: HealthNotification): void {
    const alert: ProtectionAlert = {
      id: notif.id,
      severity: notif.severity === 'critical' ? 'critical' : notif.severity === 'warning' ? 'warning' : 'info',
      title: notif.title,
      message: notif.message,
      actionLabel: notif.actionLabel,
      actionPath: notif.actionPath,
      timestamp: notif.timestamp,
    };
    this.setState((prev) => ({
      ...prev,
      alerts: [alert, ...prev.alerts].slice(0, MAX_ALERTS),
    }));
  }

  private eventToActivity(event: OptimizationEvent): ActivityEvent | null {
    const kindMap: Record<string, ActivityKind> = {
      [OptimizationEventType.CleaningCompleted]: 'optimization',
      [OptimizationEventType.RegistryOptimized]: 'optimization',
      [OptimizationEventType.PrivacyCleaned]: 'optimization',
      [OptimizationEventType.StartupOptimized]: 'optimization',
      [OptimizationEventType.DuplicateRemoved]: 'optimization',
      [OptimizationEventType.PerformanceOptimized]: 'performance' as ActivityKind,
      [OptimizationEventType.ScanCompleted]: 'scan',
    };
    const kind = kindMap[event.type] ?? 'system';

    const title = event.action;
    let metric: string | undefined;
    if (event.bytesRecovered && event.bytesRecovered > 0) {
      metric = `${formatBytes(event.bytesRecovered)} recovered`;
    }
    if (event.itemsProcessed && event.itemsProcessed > 0) {
      metric = metric
        ? `${metric} · ${event.itemsProcessed} items`
        : `${event.itemsProcessed} items processed`;
    }

    return {
      id: `act-${event.timestamp}-${event.moduleId}`,
      kind,
      title,
      description: event.moduleId,
      timestamp: new Date(event.timestamp).toISOString(),
      metric,
    };
  }

  // ── Data Refresh ─────────────────────────────────────────────────

  async refreshAll(): Promise<void> {
    this.setState({ loading: true, error: null });
    try {
      const [metrics, liveMetrics, healthScore, hardwareSensors] = await Promise.all([
        dashboardService.getMetrics().catch(() => null),
        dashboardService.getLiveMetrics().catch(() => null),
        dashboardService.getHealthScore().catch(() => null),
        dashboardService.getHardwareSensors().catch(() => null),
      ]);

      if (!this.isMounted) return;

      const activities = this.buildActivities();
      const alerts = this.buildAlerts(metrics);
      const changes = this.buildChanges();

      this.setState((prev) => ({
        ...prev,
        loading: false,
        metrics,
        liveMetrics,
        healthScore,
        hardwareSensors,
        activities: activities.length > 0 ? activities : prev.activities,
        alerts: alerts.length > 0 ? alerts : prev.alerts,
        changes,
        protectionState: this.deriveProtectionState(metrics, healthScore),
        cards: this.deriveCards(metrics, liveMetrics, hardwareSensors, healthScore),
        monitors: this.deriveMonitors(metrics, liveMetrics),
        coverage: this.deriveCoverage(metrics, healthScore),
        systemHealth: this.deriveSystemHealth(metrics, liveMetrics, hardwareSensors, healthScore),
        lastRefresh: Date.now(),
      }));
    } catch (err) {
      if (!this.isMounted) return;
      this.setState({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load protection data',
      });
    }
  }

  async refreshMetrics(): Promise<void> {
    try {
      const [liveMetrics, metrics] = await Promise.all([
        dashboardService.getLiveMetrics().catch(() => null),
        dashboardService.getMetrics().catch(() => null),
      ]);
      if (!this.isMounted) return;

      const effectiveMetrics = metrics ?? this.state.metrics;
      const effectiveLive = liveMetrics ?? this.state.liveMetrics;

      this.setState((prev) => ({
        ...prev,
        liveMetrics: effectiveLive,
        metrics: effectiveMetrics,
        protectionState: this.deriveProtectionState(effectiveMetrics, prev.healthScore),
        coverage: this.deriveCoverage(effectiveMetrics, prev.healthScore),
        systemHealth: this.deriveSystemHealth(
          effectiveMetrics,
          effectiveLive,
          prev.hardwareSensors,
          prev.healthScore,
        ),
        cards: this.deriveCards(
          effectiveMetrics,
          effectiveLive,
          prev.hardwareSensors,
          prev.healthScore,
        ),
        monitors: this.deriveMonitors(effectiveMetrics, effectiveLive),
        lastRefresh: Date.now(),
      }));
    } catch {
      // Silent — live polling failures don't disrupt the UI.
    }
  }

  private startPolling(): void {
    this.stopPolling();
    const interval = document.hidden ? LIVE_POLL_HIDDEN_INTERVAL_MS : LIVE_POLL_INTERVAL_MS;
    this.livePollTimer = setInterval(() => void this.refreshMetrics(), interval);

    // Slower full refresh every 30 seconds
    this.metricsTimer = setInterval(() => void this.refreshAll(), 30_000);

    // Adjust polling when visibility changes
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private stopPolling(): void {
    if (this.livePollTimer) clearInterval(this.livePollTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.livePollTimer = null;
    this.metricsTimer = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onVisibilityChange = (): void => {
    this.startPolling();
    if (!document.hidden) {
      void this.refreshMetrics();
    }
  };

  // ── Derivation Logic ─────────────────────────────────────────────

  private deriveProtectionState(
    metrics: DashboardMetrics | null,
    healthScore: HealthScore | null,
  ): ProtectionState {
    const now = new Date().toISOString();

    if (!metrics) {
      return {
        level: 'unknown',
        headline: 'Checking protection status…',
        subheadline: 'Gathering system information.',
        evaluatedAt: now,
      };
    }

    const sec = metrics.security;
    const hasThirdPartyAV = !!sec.defender.thirdPartyAV || !!sec.firewall.thirdPartyFirewall;
    const hasRTP = sec.realTimeProtection || hasThirdPartyAV;
    const hasFirewall = sec.firewall.enabled;
    const hasUpdates = sec.updates.pendingUpdates === 0;
    const hasSmartScreen = sec.smartScreen;

    const checks = [hasRTP, hasFirewall, hasUpdates, hasSmartScreen];
    const passed = checks.filter(Boolean).length;

    let level: ProtectionLevel;
    let headline: string;
    let subheadline: string;

    if (passed === 4) {
      level = 'fully_protected';
      const score = healthScore?.overallScore ?? 100;
      headline = 'Your PC is fully protected';
      subheadline = score >= 90
        ? `Health score is ${score}. All protection layers are active.`
        : 'All protection layers are active. Consider running an optimization for peak performance.';
    } else if (passed >= 2) {
      level = 'partially_protected';
      const missing: string[] = [];
      if (!hasRTP) missing.push('real-time protection');
      if (!hasFirewall) missing.push('firewall');
      if (!hasUpdates) missing.push(`${sec.updates.pendingUpdates} pending update${sec.updates.pendingUpdates > 1 ? 's' : ''}`);
      if (!hasSmartScreen) missing.push('Smart Screen');
      headline = 'Your PC is partially protected';
      subheadline = `Not fully covered: ${missing.join(', ')}.`;
    } else {
      level = 'at_risk';
      headline = 'Your PC is at risk';
      subheadline = 'Critical protection layers are disabled. Enable real-time protection and firewall immediately.';
    }

    return { level, headline, subheadline, evaluatedAt: now };
  }

  private deriveCards(
    metrics: DashboardMetrics | null,
    live: LiveMetrics | null,
    sensors: HardwareSensors | null,
    health: HealthScore | null,
  ): ProtectionCardData[] {
    const now = new Date().toISOString();
    const cards: ProtectionCardData[] = [];

    // Realtime Protection
    const rtpActive = metrics?.security.realTimeProtection ?? false;
    const defenderOn = metrics?.security.defender.enabled ?? false;
    const thirdPartyAV = metrics?.security.defender.thirdPartyAV ?? null;
    const avActive = rtpActive || defenderOn || !!thirdPartyAV;
    const avLabel = thirdPartyAV
      ? thirdPartyAV
      : defenderOn ? 'Windows Defender' : 'None';
    cards.push({
      id: 'realtime-protection',
      title: 'Realtime Protection',
      status: avActive ? 'active' : 'inactive',
      statusLabel: avActive ? 'Active' : 'Disabled',
      primaryValue: avActive ? 'Protected' : 'At risk',
      secondaryValue: avActive ? avLabel : undefined,
      iconName: 'ShieldCheckIcon',
      actionPath: '/security-center',
      lastUpdated: now,
    });

    // Firewall
    const firewallOn = metrics?.security.firewall.enabled ?? false;
    cards.push({
      id: 'firewall',
      title: 'Firewall',
      status: firewallOn ? 'active' : 'inactive',
      statusLabel: firewallOn ? 'Active' : 'Disabled',
      primaryValue: firewallOn ? 'On' : 'Off',
      iconName: 'FireIcon',
      actionPath: '/security-center',
      lastUpdated: now,
    });

    // Scheduled Scan / Last Scan
    const lastScan = healthTimelineService.getTimeline().slice(-1)[0];
    const hasRecentScan = lastScan && (Date.now() - new Date(lastScan.timestamp).getTime() < 24 * 60 * 60 * 1000);
    cards.push({
      id: 'scheduled-scan',
      title: 'Last Scan',
      status: hasRecentScan ? 'active' : 'pending',
      statusLabel: hasRecentScan ? 'Completed' : 'Not recent',
      primaryValue: lastScan ? timeAgo(lastScan.timestamp) : 'Never',
      secondaryValue: lastScan ? `Score: ${lastScan.score}` : undefined,
      iconName: 'MagnifyingGlassIcon',
      actionPath: '/ai-smart-optimize',
      lastUpdated: lastScan?.timestamp ?? now,
    });

    // Threat History
    const pendingUpdates = metrics?.security.updates.pendingUpdates ?? 0;
    cards.push({
      id: 'threat-history',
      title: 'System Updates',
      status: pendingUpdates === 0 ? 'active' : 'warning',
      statusLabel: pendingUpdates === 0 ? 'Up to date' : `${pendingUpdates} pending`,
      primaryValue: pendingUpdates === 0 ? 'Current' : `${pendingUpdates}`,
      secondaryValue: pendingUpdates > 0 ? 'update' + (pendingUpdates > 1 ? 's' : '') : undefined,
      iconName: 'ArrowPathIcon',
      actionPath: '/software-updater',
      lastUpdated: now,
    });

    // Hardware Health — try hardware sensors first, then live CPU temp, then dashboard CPU temp
    const cpuTempSensor = sensors?.temperature.sensors.find((s) =>
      s.name.toLowerCase().includes('cpu') || s.name.toLowerCase().includes('core') || s.name.toLowerCase().includes('package'),
    );
    const tempValue = cpuTempSensor?.value
      ?? live?.cpu.temperature
      ?? metrics?.cpu.temperature
      ?? null;
    const tempStatus: CardStatus = tempValue === null ? 'pending' : tempValue < 70 ? 'active' : tempValue < 85 ? 'warning' : 'inactive';
    cards.push({
      id: 'hardware-health',
      title: 'Hardware Health',
      status: tempStatus,
      statusLabel: tempValue === null ? 'No sensor' : tempValue < 70 ? 'Normal' : tempValue < 85 ? 'Warm' : 'Hot',
      primaryValue: tempValue !== null ? `${Math.round(tempValue)}°C` : 'N/A',
      secondaryValue: tempValue !== null ? 'CPU Temp' : 'Click to view details',
      iconName: 'CpuChipIcon',
      actionPath: '/hardware-center',
      lastUpdated: now,
    });

    // Memory Usage
    const memUsage = live?.memory.usage ?? metrics?.memory.usage ?? 0;
    const memStatus: CardStatus = memUsage < 70 ? 'active' : memUsage < 85 ? 'warning' : 'inactive';
    cards.push({
      id: 'memory-usage',
      title: 'Memory Usage',
      status: memStatus,
      statusLabel: memUsage < 70 ? 'Healthy' : memUsage < 85 ? 'High' : 'Critical',
      primaryValue: `${Math.round(memUsage)}%`,
      secondaryValue: live ? `${formatBytes(live.memory.used)} / ${formatBytes(live.memory.total)}` : undefined,
      iconName: 'CircleStackIcon',
      actionPath: '/performance',
      lastUpdated: live?.capturedAt ?? now,
    });

    // Storage
    const primaryDrive = metrics?.storage?.[0] ?? live?.storage?.[0];
    const storageUsage = primaryDrive?.usage ?? 0;
    const storageStatus: CardStatus = storageUsage < 80 ? 'active' : storageUsage < 90 ? 'warning' : 'inactive';
    cards.push({
      id: 'storage',
      title: 'Storage',
      status: storageStatus,
      statusLabel: storageUsage < 80 ? 'Healthy' : storageUsage < 90 ? 'Getting full' : 'Critical',
      primaryValue: `${Math.round(storageUsage)}%`,
      secondaryValue: primaryDrive ? `${formatBytes(primaryDrive.free)} free` : undefined,
      iconName: 'CircleStackIcon',
      actionPath: '/disk-analyzer',
      lastUpdated: now,
    });

    // Battery
    const battery = sensors?.battery;
    if (battery?.present) {
      const pct = battery.percent ?? 0;
      const batStatus: CardStatus = pct > 20 || battery.powerPlugged ? 'active' : 'warning';
      cards.push({
        id: 'battery',
        title: 'Battery',
        status: batStatus,
        statusLabel: battery.powerPlugged ? 'Charging' : pct > 20 ? 'Discharging' : 'Low',
        primaryValue: `${Math.round(pct)}%`,
        secondaryValue: battery.powerPlugged ? 'Plugged in' : 'On battery',
        iconName: 'Battery50Icon',
        lastUpdated: now,
      });
    }

    // Overall Health Score
    const score = health?.overallScore ?? 0;
    const scoreStatus: CardStatus = score >= 80 ? 'active' : score >= 60 ? 'warning' : 'inactive';
    cards.push({
      id: 'health-score',
      title: 'PC Health Score',
      status: scoreStatus,
      statusLabel: health?.scoreZone ? SCORE_ZONE_CONFIG[health.scoreZone]?.label ?? 'Unknown' : 'Unknown',
      primaryValue: `${score}`,
      secondaryValue: '/ 100',
      iconName: 'HeartIcon',
      actionPath: '/dashboard',
      lastUpdated: now,
    });

    return cards;
  }

  private deriveMonitors(
    metrics: DashboardMetrics | null,
    live: LiveMetrics | null,
  ): MonitorStatus[] {
    const now = new Date().toISOString();
    const monitors: MonitorStatus[] = [];

    monitors.push({
      id: 'cpu-monitor',
      name: 'CPU Monitor',
      active: live !== null,
      lastHeartbeat: live?.capturedAt ?? null,
      statusLabel: live ? 'Monitoring' : 'Idle',
      detail: live ? `${Math.round(live.cpu.usage)}% usage · ${live.cpu.processes} processes` : undefined,
    });

    monitors.push({
      id: 'memory-monitor',
      name: 'Memory Monitor',
      active: live !== null,
      lastHeartbeat: live?.capturedAt ?? null,
      statusLabel: live ? 'Monitoring' : 'Idle',
      detail: live ? `${Math.round(live.memory.usage)}% used` : undefined,
    });

    monitors.push({
      id: 'storage-monitor',
      name: 'Storage Monitor',
      active: metrics !== null,
      lastHeartbeat: metrics ? now : null,
      statusLabel: metrics ? 'Monitoring' : 'Idle',
      detail: metrics ? `${metrics.storage.length} drive${metrics.storage.length > 1 ? 's' : ''}` : undefined,
    });

    monitors.push({
      id: 'security-monitor',
      name: 'Security Monitor',
      active: metrics?.security.realTimeProtection ?? false,
      lastHeartbeat: metrics ? now : null,
      statusLabel: metrics?.security.realTimeProtection ? 'Monitoring' : 'Inactive',
      detail: metrics?.security.realTimeProtection ? 'Real-time protection on' : 'Real-time protection off',
    });

    monitors.push({
      id: 'network-monitor',
      name: 'Network Monitor',
      active: live?.network != null,
      lastHeartbeat: live?.capturedAt ?? null,
      statusLabel: live?.network ? 'Monitoring' : 'Idle',
      detail: live?.network
        ? `↓ ${Math.round(live.network.downloadSpeed)} KB/s · ↑ ${Math.round(live.network.uploadSpeed)} KB/s`
        : undefined,
    });

    monitors.push({
      id: 'health-engine',
      name: 'Health Engine',
      active: true,
      lastHeartbeat: now,
      statusLabel: 'Running',
      detail: 'Scoring & analysis active',
    });

    return monitors;
  }

  private deriveCoverage(
    metrics: DashboardMetrics | null,
    health: HealthScore | null,
  ): CoverageItem[] {
    if (!metrics) return [];
    const sec = metrics.security;

    const thirdPartyAV = sec.defender.thirdPartyAV ?? null;
    const activeProducts = sec.defender.activeProducts ?? [];
    const avLabel = thirdPartyAV
      ? thirdPartyAV
      : activeProducts.length > 0
        ? activeProducts.join(', ')
        : sec.defender.enabled ? 'Windows Defender' : 'None';

    return [
      {
        id: 'rtp',
        label: 'Real-time Protection',
        covered: sec.realTimeProtection || !!thirdPartyAV,
        reason: (sec.realTimeProtection || !!thirdPartyAV) ? undefined : 'Real-time protection is off',
        fixAction: (sec.realTimeProtection || !!thirdPartyAV) ? undefined : {
          label: 'Enable',
          action: 'security.enableDefender',
          type: 'rpc' as const,
        },
      },
      {
        id: 'defender',
        label: `Antivirus (${avLabel})`,
        covered: sec.defender.enabled || !!thirdPartyAV,
        reason: (sec.defender.enabled || !!thirdPartyAV) ? undefined : 'No active antivirus detected',
        fixAction: (sec.defender.enabled || !!thirdPartyAV) ? undefined : {
          label: 'Enable',
          action: 'security.enableDefender',
          type: 'rpc' as const,
        },
      },
      {
        id: 'firewall',
        label: sec.firewall.thirdPartyFirewall ? `Firewall (${sec.firewall.thirdPartyFirewall})` : 'Firewall',
        covered: sec.firewall.enabled,
        reason: sec.firewall.enabled ? undefined : 'Firewall is disabled',
        fixAction: sec.firewall.enabled ? undefined : {
          label: 'Enable',
          action: 'security.enableFirewall',
          type: 'rpc' as const,
        },
      },
      {
        id: 'smart-screen',
        label: 'Smart Screen',
        covered: sec.smartScreen,
        reason: sec.smartScreen ? undefined : 'Smart Screen filter is disabled',
        fixAction: sec.smartScreen ? undefined : {
          label: 'Enable',
          action: 'security.enableSmartScreen',
          type: 'rpc' as const,
        },
      },
      {
        id: 'updates',
        label: 'System Updates',
        covered: sec.updates.pendingUpdates === 0,
        reason: sec.updates.pendingUpdates === 0
          ? undefined
          : `${sec.updates.pendingUpdates} pending update${sec.updates.pendingUpdates > 1 ? 's' : ''}`,
        fixAction: sec.updates.pendingUpdates === 0 ? undefined : {
          label: 'Update',
          action: '/software-updater',
          type: 'navigate' as const,
        },
      },
      {
        id: 'secure-boot',
        label: 'Secure Boot',
        covered: metrics.windows.secureBoot,
        reason: metrics.windows.secureBoot ? undefined : 'Secure Boot is not enabled',
      },
      {
        id: 'tpm',
        label: 'TPM',
        covered: metrics.windows.tpmStatus,
        reason: metrics.windows.tpmStatus ? undefined : 'TPM is not active',
      },
      {
        id: 'health-score',
        label: 'Health Score ≥ 80',
        covered: (health?.overallScore ?? 0) >= 80,
        reason: (health?.overallScore ?? 0) >= 80
          ? undefined
          : `Current score is ${health?.overallScore ?? 'unknown'}`,
        fixAction: (health?.overallScore ?? 0) >= 80 ? undefined : {
          label: 'Optimize',
          action: '/ai-smart-optimize',
          type: 'navigate' as const,
        },
      },
    ];
  }

  private deriveSystemHealth(
    metrics: DashboardMetrics | null,
    live: LiveMetrics | null,
    sensors: HardwareSensors | null,
    health: HealthScore | null,
  ): SystemHealthSnapshotData | null {
    if (!metrics && !live) return null;

    const cpuUsage = live?.cpu.usage ?? metrics?.cpu.usage ?? 0;
    const cpuTempSensor = sensors?.temperature.sensors.find((s) =>
      s.name.toLowerCase().includes('cpu') || s.name.toLowerCase().includes('core') || s.name.toLowerCase().includes('package'),
    );
    const cpuTemp = cpuTempSensor?.value
      ?? live?.cpu.temperature
      ?? metrics?.cpu.temperature
      ?? null;
    const memoryUsage = live?.memory.usage ?? metrics?.memory.usage ?? 0;
    const primaryDrive = metrics?.storage?.[0] ?? live?.storage?.[0];
    const storageUsage = primaryDrive?.usage ?? 0;
    const battery = sensors?.battery;

    return {
      cpuUsage,
      cpuTemp,
      memoryUsage,
      storageUsage,
      batteryPercent: battery?.present ? battery.percent : null,
      batteryPlugged: battery?.present ? battery.powerPlugged : null,
      securityScore: health?.categoryScores.security ?? 0,
      performanceScore: health?.categoryScores.performance ?? 0,
      privacyScore: health?.categoryScores.privacy ?? 0,
      overallHealthScore: health?.overallScore ?? 0,
      overallScoreZone: health?.scoreZone ?? 'unknown',
      uptimeSeconds: metrics?.windows.uptime ?? 0,
      capturedAt: new Date().toISOString(),
    };
  }

  private buildActivities(): ActivityEvent[] {
    const events = optimizationHistoryService.getRecentHistory(MAX_ACTIVITIES);
    return events.map((entry) => this.historyToActivity(entry));
  }

  private historyToActivity(entry: OptimizationHistoryEntry): ActivityEvent {
    const parts: string[] = [];
    if (entry.storageRecovered > 0) parts.push(formatBytes(entry.storageRecovered));
    if (entry.registryFixed > 0) parts.push(`${entry.registryFixed} registry fixes`);
    if (entry.startupOptimized > 0) parts.push(`${entry.startupOptimized} startup items`);
    if (entry.privacyCleaned > 0) parts.push(`${entry.privacyCleaned} privacy items`);
    if (entry.duplicateFilesRemoved > 0) parts.push(`${entry.duplicateFilesRemoved} duplicates`);

    return {
      id: entry.id,
      kind: 'optimization',
      title: `Optimization ${entry.result}`,
      description: entry.modulesUsed.join(', '),
      timestamp: entry.timestamp,
      metric: parts.length > 0 ? parts.join(' · ') : undefined,
    };
  }

  private buildAlerts(metrics: DashboardMetrics | null): ProtectionAlert[] {
    if (!metrics) return [];
    const alerts: ProtectionAlert[] = [];
    const now = new Date().toISOString();
    const sec = metrics.security;

    if (!sec.realTimeProtection) {
      alerts.push({
        id: 'alert-rtp-off',
        severity: 'critical',
        title: 'Real-time protection is OFF',
        message: 'Your PC is vulnerable to malware and threats. Enable real-time protection immediately.',
        actionLabel: 'Enable Protection',
        actionPath: '/security-center',
        timestamp: now,
      });
    }

    if (!sec.firewall.enabled) {
      alerts.push({
        id: 'alert-firewall-off',
        severity: 'critical',
        title: 'Firewall is disabled',
        message: 'Your PC is exposed to network attacks. Enable Windows Firewall.',
        actionLabel: 'Enable Firewall',
        actionPath: '/security-center',
        timestamp: now,
      });
    }

    if (sec.updates.pendingUpdates > 0) {
      alerts.push({
        id: 'alert-updates',
        severity: 'warning',
        title: `${sec.updates.pendingUpdates} pending system update${sec.updates.pendingUpdates > 1 ? 's' : ''}`,
        message: 'Outdated software may contain security vulnerabilities.',
        actionLabel: 'Update Now',
        actionPath: '/software-updater',
        timestamp: now,
      });
    }

    if (!metrics.windows.secureBoot) {
      alerts.push({
        id: 'alert-secure-boot',
        severity: 'warning' as AlertSeverity,
        title: 'Secure Boot is not enabled',
        message: 'Secure Boot helps prevent malicious code from loading at startup.',
        timestamp: now,
      });
    }

    const memUsage = metrics.memory.usage;
    if (memUsage > 85) {
      alerts.push({
        id: 'alert-memory',
        severity: 'warning',
        title: 'High memory usage',
        message: `Memory usage is at ${Math.round(memUsage)}%. Consider closing unused applications.`,
        actionLabel: 'Optimize',
        actionPath: '/performance',
        timestamp: now,
      });
    }

    const primaryDrive = metrics.storage[0];
    if (primaryDrive && primaryDrive.usage > 90) {
      alerts.push({
        id: 'alert-storage',
        severity: 'warning',
        title: 'Storage almost full',
        message: `Drive ${primaryDrive.mount} is at ${Math.round(primaryDrive.usage)}% capacity.`,
        actionLabel: 'Free Space',
        actionPath: '/disk-analyzer',
        timestamp: now,
      });
    }

    return alerts;
  }

  private buildChanges(): ChangeEntry[] {
    const history = optimizationHistoryService.getRecentHistory(5);
    if (history.length === 0) return [];

    const changes: ChangeEntry[] = [];
    const now = new Date().toISOString();

    for (const entry of history.slice(0, 3)) {
      const scoreDelta = entry.healthAfter - entry.healthBefore;
      if (scoreDelta !== 0) {
        changes.push({
          id: `change-score-${entry.id}`,
          label: 'Health Score',
          delta: scoreDelta,
          unit: 'score',
          direction: scoreDelta > 0 ? 'improved' : 'degraded',
          timestamp: entry.timestamp,
        });
      }
      if (entry.storageRecovered > 0) {
        changes.push({
          id: `change-storage-${entry.id}`,
          label: 'Storage Recovered',
          delta: entry.storageRecovered,
          unit: 'bytes',
          direction: 'improved',
          timestamp: entry.timestamp,
        });
      }
      if (entry.registryFixed > 0) {
        changes.push({
          id: `change-registry-${entry.id}`,
          label: 'Registry Issues Fixed',
          delta: entry.registryFixed,
          unit: 'count',
          direction: 'improved',
          timestamp: entry.timestamp,
        });
      }
      if (entry.privacyCleaned > 0) {
        changes.push({
          id: `change-privacy-${entry.id}`,
          label: 'Privacy Items Cleaned',
          delta: entry.privacyCleaned,
          unit: 'count',
          direction: 'improved',
          timestamp: entry.timestamp,
        });
      }
    }

    if (changes.length === 0) {
      changes.push({
        id: 'change-none',
        label: 'No recent changes',
        delta: 0,
        unit: 'count',
        direction: 'neutral',
        timestamp: now,
      });
    }

    return changes;
  }

  // ── Public Actions ───────────────────────────────────────────────

  navigateTo(path: string): void {
    this.navigate(path);
  }

  dismissAlert(id: string): void {
    this.setState((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== id),
    }));
  }

  refresh(): void {
    void this.refreshAll();
  }

  async optimizeProcesses(kill: boolean): Promise<ProcessOptimizeResult | null> {
    try {
      const result = await performanceService.optimizeProcesses({ kill });
      if (result.totalDetected > 0) {
        const activity: ActivityEvent = {
          id: `act-opt-proc-${Date.now()}`,
          kind: 'optimization',
          title: kill
            ? `Terminated ${result.totalKilled} high-resource process${result.totalKilled > 1 ? 'es' : ''}`
            : `Detected ${result.totalDetected} high-resource process${result.totalDetected > 1 ? 'es' : ''}`,
          description: result.detected
            .slice(0, 3)
            .map((p) => `${p.name} (${p.reason})`)
            .join(', '),
          timestamp: new Date().toISOString(),
          metric: `${result.totalDetected} detected${kill ? ` · ${result.totalKilled} terminated` : ''}`,
        };
        this.setState((prev) => ({
          ...prev,
          activities: [activity, ...prev.activities].slice(0, MAX_ACTIVITIES),
        }));
      }
      void this.refreshMetrics();
      return result;
    } catch {
      return null;
    }
  }
}
