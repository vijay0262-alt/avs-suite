/**
 * SecurityDashboardViewModel — manages the AI Active Protection dashboard state.
 *
 * Aggregates data from:
 *   - RealTimeProtectionEngine (protection status, monitors, events, telemetry)
 *   - SecurityManager (security score, threats, providers, scans)
 *   - ProtectionHistory, ProtectionStatistics, ProtectionTelemetry
 *
 * Exposes a unified dashboard state for the UI with:
 *   - Overview metrics (score, status, confidence, threat level, mode, uptime)
 *   - Live monitoring counts (processes, files, registry, browser, etc.)
 *   - AI insights (top insights, emerging risks, behavior trends)
 *   - Threat timeline (detection → investigation → resolution)
 *   - Provider health (all security providers with latency and status)
 *   - Reports (security, weekly, threat, investigation, remediation summaries)
 *   - Search across threats, processes, investigations, evidence, timeline
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { RealTimeProtectionEngine } from '../realtime-protection';
import { ProtectionFactory } from '../realtime-protection';
import { protectionEventBus } from '../realtime-protection';
import type {
  ProtectionDashboardData,
  ProtectionStatistics,
  ProtectionHealthReport,
  ProtectionDiagnosticsReport,
  ProtectionSession,
  ProtectionNotification,
  MonitorInfo,
  SystemEvent,
  ProtectionMode,
  ProtectionState,
  ProtectionHistoryEntry,
  ProtectionTelemetry,
} from '../realtime-protection';

// Re-export types for sub-components
export type {
  ProtectionStatistics,
  ProtectionHealthReport,
  ProtectionDiagnosticsReport,
  ProtectionSession,
  ProtectionNotification,
  MonitorInfo,
  SystemEvent,
  ProtectionMode,
  ProtectionState,
  ProtectionHistoryEntry,
  ProtectionTelemetry,
};
export type { HealthIssue } from '../realtime-protection';
export type { HealthStatus } from '../realtime-protection';

// ── Dashboard Types ──────────────────────────────────────────────────

export type DashboardTab = 'overview' | 'protection' | 'timeline' | 'providers' | 'analytics' | 'reports' | 'search';

export interface SecurityOverview {
  securityScore: number;
  protectionStatus: ProtectionState;
  protectionMode: ProtectionMode;
  aiConfidenceScore: number;
  threatLevel: 'none' | 'low' | 'moderate' | 'high' | 'critical';
  definitionsStatus: 'up_to_date' | 'outdated' | 'unknown';
  protectionUptime: number;
  lastScan: number | null;
  lastThreat: number | null;
  realTimeStatus: 'active' | 'paused' | 'inactive' | 'error';
  activeMonitors: number;
  totalMonitors: number;
  eventsToday: number;
  threatsBlocked: number;
  threatsInvestigated: number;
  pendingApprovals: number;
  cpuUsage: number;
  memoryUsage: number;
}

export interface LiveMonitoringCounts {
  processesMonitored: number;
  filesMonitored: number;
  registryEvents: number;
  browserEvents: number;
  startupEvents: number;
  usbEvents: number;
  networkEvents: number;
  threatsInvestigatedToday: number;
  threatsBlocked: number;
  threatsQuarantined: number;
  falsePositives: number;
}

export interface AIInsight {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  source: string;
  timestamp: number;
  actionable: boolean;
  recommendation?: string;
}

export interface ThreatTimelineEntry {
  id: string;
  threatId: string;
  threatName: string;
  stage: 'detection' | 'investigation' | 'evidence' | 'correlation' | 'recommendation' | 'decision' | 'quarantine' | 'rollback' | 'resolution';
  timestamp: number;
  description: string;
  actor: 'system' | 'ai' | 'user';
}

export interface ProviderHealthInfo {
  id: string;
  name: string;
  type: string;
  status: 'healthy' | 'degraded' | 'error' | 'inactive';
  latency: number;
  lastRun: number | null;
  enabled: boolean;
  description: string;
}

export interface SecurityReportData {
  type: 'security' | 'weekly' | 'threat_summary' | 'investigation_summary' | 'remediation_summary' | 'protection_history';
  title: string;
  generatedAt: number;
  period: { start: number; end: number };
  summary: string;
  metrics: Record<string, number | string>;
  details: string[];
}

export interface SecurityDashboardState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  activeTab: DashboardTab;
  overview: SecurityOverview | null;
  liveCounts: LiveMonitoringCounts;
  insights: AIInsight[];
  timeline: ThreatTimelineEntry[];
  providers: ProviderHealthInfo[];
  statistics: ProtectionStatistics | null;
  health: ProtectionHealthReport | null;
  diagnostics: ProtectionDiagnosticsReport | null;
  telemetry: ProtectionTelemetry | null;
  session: ProtectionSession | null;
  notifications: ProtectionNotification[];
  monitors: MonitorInfo[];
  recentEvents: SystemEvent[];
  history: ProtectionHistoryEntry[];
  reports: SecurityReportData[];
  searchQuery: string;
  searchResults: SearchResult[] | null;
  isPolling: boolean;
  lastUpdated: number;
}

export interface SearchResult {
  id: string;
  type: 'threat' | 'process' | 'investigation' | 'evidence' | 'timeline' | 'report' | 'provider';
  title: string;
  description: string;
  timestamp: number;
  relevance: number;
}

const MAX_TIMELINE_ENTRIES = 100;
const MAX_INSIGHTS = 20;
const MAX_EVENTS_DISPLAY = 50;
const DEFAULT_POLL_MS = 5000;

export class SecurityDashboardViewModel extends ViewModel<SecurityDashboardState> {
  private engine: RealTimeProtectionEngine;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private eventUnsub: (() => void) | null = null;

  constructor(engine?: RealTimeProtectionEngine) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      activeTab: 'overview',
      overview: null,
      liveCounts: {
        processesMonitored: 0,
        filesMonitored: 0,
        registryEvents: 0,
        browserEvents: 0,
        startupEvents: 0,
        usbEvents: 0,
        networkEvents: 0,
        threatsInvestigatedToday: 0,
        threatsBlocked: 0,
        threatsQuarantined: 0,
        falsePositives: 0,
      },
      insights: [],
      timeline: [],
      providers: [],
      statistics: null,
      health: null,
      diagnostics: null,
      telemetry: null,
      session: null,
      notifications: [],
      monitors: [],
      recentEvents: [],
      history: [],
      reports: [],
      searchQuery: '',
      searchResults: null,
      isPolling: false,
      lastUpdated: 0,
    });

    this.engine = engine ?? new RealTimeProtectionEngine(ProtectionFactory.createDefaultConfig());
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async bootstrap(): Promise<void> {
    this.setState({ bootstrap: 'loading', bootstrapError: null });
    try {
      this.engine.start();
      this.subscribeToEvents();
      this.refresh();
      this.startPolling();
      this.generateInitialReports();
      this.setState({ bootstrap: 'ready' });
    } catch (e) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: e instanceof Error ? e.message : 'Failed to initialize security dashboard',
      });
    }
  }

  dispose(): void {
    this.stopPolling();
    this.eventUnsub?.();
    this.eventUnsub = null;
    this.engine.dispose();
    super.dispose();
  }

  // ── Tab Management ────────────────────────────────────────────────

  setActiveTab(tab: DashboardTab): void {
    this.setState({ activeTab: tab });
  }

  // ── Protection Controls ───────────────────────────────────────────

  pauseProtection(): void {
    this.engine.pause();
    this.refresh();
  }

  resumeProtection(): void {
    this.engine.resume();
    this.refresh();
  }

  setProtectionMode(mode: ProtectionMode): void {
    this.engine.setMode(mode);
    this.refresh();
  }

  enableMonitor(type: MonitorInfo['type']): void {
    this.engine.enableMonitor(type);
    this.refresh();
  }

  disableMonitor(type: MonitorInfo['type']): void {
    this.engine.disableMonitor(type);
    this.refresh();
  }

  // ── Notifications ─────────────────────────────────────────────────

  markNotificationRead(id: string): void {
    this.engine.markNotificationRead(id);
    this.refresh();
  }

  dismissNotification(id: string): void {
    this.engine.dismissNotification(id);
    this.refresh();
  }

  // ── Search ────────────────────────────────────────────────────────

  setSearchQuery(query: string): void {
    this.setState({ searchQuery: query });
    if (!query.trim()) {
      this.setState({ searchResults: null });
      return;
    }
    this.performSearch(query);
  }

  private performSearch(query: string): void {
    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    // Search threats in history
    for (const entry of this.state.history) {
      if (entry.threatDetected && (entry.target.toLowerCase().includes(q) || entry.eventType.toLowerCase().includes(q))) {
        results.push({
          id: entry.id,
          type: 'threat',
          title: entry.target,
          description: `${entry.eventType} — ${entry.severity}`,
          timestamp: entry.timestamp,
          relevance: 1.0,
        });
      }
    }

    // Search timeline
    for (const entry of this.state.timeline) {
      if (entry.threatName.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q)) {
        results.push({
          id: entry.id,
          type: 'timeline',
          title: entry.threatName,
          description: entry.description,
          timestamp: entry.timestamp,
          relevance: 0.9,
        });
      }
    }

    // Search providers
    for (const provider of this.state.providers) {
      if (provider.name.toLowerCase().includes(q) || provider.id.toLowerCase().includes(q)) {
        results.push({
          id: provider.id,
          type: 'provider',
          title: provider.name,
          description: provider.description,
          timestamp: provider.lastRun ?? Date.now(),
          relevance: 0.8,
        });
      }
    }

    // Search reports
    for (const report of this.state.reports) {
      if (report.title.toLowerCase().includes(q) || report.summary.toLowerCase().includes(q)) {
        results.push({
          id: report.type,
          type: 'report',
          title: report.title,
          description: report.summary,
          timestamp: report.generatedAt,
          relevance: 0.7,
        });
      }
    }

    // Search events
    for (const event of this.state.recentEvents) {
      if (event.target.name.toLowerCase().includes(q) || event.type.toLowerCase().includes(q)) {
        results.push({
          id: event.id,
          type: 'evidence',
          title: event.target.name,
          description: `${event.type} — ${event.category}`,
          timestamp: event.timestamp,
          relevance: 0.6,
        });
      }
    }

    this.setState({ searchResults: results.sort((a, b) => b.relevance - a.relevance) });
  }

  // ── Reports ───────────────────────────────────────────────────────

  generateReport(type: SecurityReportData['type']): SecurityReportData {
    const now = Date.now();
    const stats = this.engine.getStatistics();
    const health = this.engine.getHealth();
    const telemetry = this.engine.getTelemetry();
    const session = this.engine.getSession();
    const history = this.engine.getHistory();

    const periodStart = now - 7 * 24 * 60 * 60 * 1000; // 7 days ago

    const report: SecurityReportData = {
      type,
      generatedAt: now,
      period: { start: periodStart, end: now },
      summary: '',
      metrics: {},
      details: [],
    };

    switch (type) {
      case 'security':
        report.title = 'Security Report';
        report.summary = `Security score: ${this.state.overview?.securityScore ?? 'N/A'}, Threats blocked: ${stats.threatsBlocked}, Events processed: ${stats.totalEvents}`;
        report.metrics = {
          securityScore: this.state.overview?.securityScore ?? 0,
          threatsBlocked: stats.threatsBlocked,
          threatsInvestigated: stats.investigationsTriggered,
          eventsProcessed: stats.totalEvents,
          activeMonitors: stats.activeMonitors,
          uptime: session?.uptime ?? 0,
          cpuUsage: telemetry.cpuUsage,
          memoryUsage: telemetry.memoryUsage,
        };
        report.details = health.issues.map((i) => `[${i.severity}] ${i.component}: ${i.description}`);
        break;

      case 'weekly':
        report.title = 'Weekly AI Security Report';
        report.summary = `Week overview: ${stats.totalEvents} events, ${stats.threatsDetected} threats detected, ${stats.threatsBlocked} blocked`;
        report.metrics = {
          totalEvents: stats.totalEvents,
          threatsDetected: stats.threatsDetected,
          threatsBlocked: stats.threatsBlocked,
          investigations: stats.investigationsTriggered,
          remediations: stats.remediationsTriggered,
          notifications: stats.notificationsSent,
          avgProcessingTime: stats.averageProcessingTime,
          maxProcessingTime: stats.maxProcessingTime,
        };
        report.details = [
          `Average processing time: ${stats.averageProcessingTime.toFixed(0)}ms`,
          `Peak processing time: ${stats.maxProcessingTime.toFixed(0)}ms`,
          `Events filtered: ${stats.eventsFiltered}`,
          `Events dropped: ${stats.eventsDropped}`,
        ];
        break;

      case 'threat_summary':
        report.title = 'Threat Summary';
        report.summary = `${stats.threatsDetected} threats detected, ${stats.threatsBlocked} blocked`;
        report.metrics = {
          threatsDetected: stats.threatsDetected,
          threatsBlocked: stats.threatsBlocked,
          threatsInvestigated: stats.investigationsTriggered,
        };
        report.details = history.entries.filter((e) => e.threatDetected).map((e) => `${new Date(e.timestamp).toISOString()}: ${e.target} — ${e.action}`);
        break;

      case 'investigation_summary':
        report.title = 'Investigation Summary';
        report.summary = `${stats.investigationsTriggered} investigations triggered`;
        report.metrics = {
          investigations: stats.investigationsTriggered,
          eventsProcessed: stats.eventsProcessed,
        };
        report.details = history.entries.filter((e) => e.action === 'investigate').map((e) => `${new Date(e.timestamp).toISOString()}: ${e.target}`);
        break;

      case 'remediation_summary':
        report.title = 'Remediation Summary';
        report.summary = `${stats.remediationsTriggered} remediations performed`;
        report.metrics = {
          remediations: stats.remediationsTriggered,
          threatsBlocked: stats.threatsBlocked,
        };
        report.details = history.entries.filter((e) => e.action === 'block' || e.action === 'quarantine').map((e) => `${new Date(e.timestamp).toISOString()}: ${e.target} — ${e.action}`);
        break;

      case 'protection_history':
        report.title = 'Protection History';
        report.summary = `${history.totalEvents} total events in history`;
        report.metrics = {
          totalEvents: history.totalEvents,
          totalThreats: history.totalThreats,
          totalBlocked: history.totalBlocked,
          totalInvestigations: history.totalInvestigations,
          avgProcessingTime: history.averageProcessingTime,
        };
        report.details = history.entries.slice(-20).map((e) => `${new Date(e.timestamp).toISOString()}: ${e.target} — ${e.action}`);
        break;
    }

    this.setState((prev) => ({
      ...prev,
      reports: [...prev.reports.filter((r) => r.type !== type), report],
    }));

    return report;
  }

  exportReport(type: SecurityReportData['type'], format: 'json' | 'csv' | 'txt'): string {
    const report = this.state.reports.find((r) => r.type === type) ?? this.generateReport(type);

    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    if (format === 'csv') {
      const lines = ['Field,Value'];
      lines.push(`Title,${report.title}`);
      lines.push(`Generated,${new Date(report.generatedAt).toISOString()}`);
      lines.push(`Period Start,${new Date(report.period.start).toISOString()}`);
      lines.push(`Period End,${new Date(report.period.end).toISOString()}`);
      lines.push(`Summary,${report.summary}`);
      for (const [key, value] of Object.entries(report.metrics)) {
        lines.push(`${key},${value}`);
      }
      for (const detail of report.details) {
        lines.push(`Detail,${detail}`);
      }
      return lines.join('\n');
    }

    // txt format
    const lines = [
      report.title,
      '='.repeat(report.title.length),
      '',
      `Generated: ${new Date(report.generatedAt).toISOString()}`,
      `Period: ${new Date(report.period.start).toISOString()} — ${new Date(report.period.end).toISOString()}`,
      '',
      'Summary:',
      report.summary,
      '',
      'Metrics:',
    ];
    for (const [key, value] of Object.entries(report.metrics)) {
      lines.push(`  ${key}: ${value}`);
    }
    lines.push('', 'Details:');
    for (const detail of report.details) {
      lines.push(`  • ${detail}`);
    }
    return lines.join('\n');
  }

  // ── Polling ───────────────────────────────────────────────────────

  startPolling(): void {
    if (this.pollTimer) return;
    this.setState({ isPolling: true });
    this.pollTimer = setInterval(() => this.refresh(), DEFAULT_POLL_MS);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.setState({ isPolling: false });
  }

  // ── Refresh ───────────────────────────────────────────────────────

  refresh(): void {
    const dashboard = this.engine.getDashboard();
    const stats = this.engine.getStatistics();
    const health = this.engine.getHealth();
    const diagnostics = this.engine.runDiagnostics();
    const telemetry = this.engine.getTelemetry();
    const session = this.engine.getSession();
    const notifications = this.engine.getNotifications();
    const monitors = this.engine.getMonitors();
    const recentEvents = this.engine.getRecentEvents().slice(-MAX_EVENTS_DISPLAY);
    const history = this.engine.getHistory();

    const overview = this.buildOverview(dashboard, stats, telemetry, session);
    const liveCounts = this.buildLiveCounts(stats, monitors, history);
    const insights = this.buildInsights(stats, health, telemetry, recentEvents);
    const timeline = this.buildTimeline(history);
    const providers = this.buildProviders(monitors, health);

    this.setState({
      overview,
      liveCounts,
      insights,
      timeline,
      providers,
      statistics: stats,
      health,
      diagnostics,
      telemetry,
      session,
      notifications,
      monitors,
      recentEvents,
      history: history.entries,
      lastUpdated: Date.now(),
    });
  }

  // ── Private Builders ──────────────────────────────────────────────

  private buildOverview(
    dashboard: ProtectionDashboardData,
    stats: ProtectionStatistics,
    telemetry: ProtectionTelemetry,
    session: ProtectionSession | null,
  ): SecurityOverview {
    const score = this.computeSecurityScore(stats, dashboard.health);
    const threatLevel = this.computeThreatLevel(stats);
    const confidence = this.computeConfidenceScore(stats, telemetry);

    return {
      securityScore: score,
      protectionStatus: dashboard.summary.protectionStatus,
      protectionMode: dashboard.summary.mode,
      aiConfidenceScore: confidence,
      threatLevel,
      definitionsStatus: 'up_to_date',
      protectionUptime: session?.uptime ?? 0,
      lastScan: null,
      lastThreat: stats.threatsDetected > 0 ? this.state.overview?.lastThreat ?? Date.now() : null,
      realTimeStatus: dashboard.summary.protectionStatus === 'running' ? 'active' : dashboard.summary.protectionStatus === 'paused' ? 'paused' : dashboard.summary.protectionStatus === 'error' ? 'error' : 'inactive',
      activeMonitors: dashboard.summary.activeMonitors,
      totalMonitors: dashboard.summary.totalMonitors,
      eventsToday: dashboard.summary.eventsToday,
      threatsBlocked: dashboard.summary.threatsBlocked,
      threatsInvestigated: dashboard.summary.threatsInvestigated,
      pendingApprovals: dashboard.summary.pendingApprovals,
      cpuUsage: telemetry.cpuUsage,
      memoryUsage: telemetry.memoryUsage,
    };
  }

  private buildLiveCounts(
    stats: ProtectionStatistics,
    monitors: MonitorInfo[],
    history: { entries: ProtectionHistoryEntry[] },
  ): LiveMonitoringCounts {
    const processMonitor = monitors.find((m) => m.type === 'process');
    const fileMonitor = monitors.find((m) => m.type === 'file_system');

    const registryEvents = history.entries.filter((e) => e.eventCategory === 'registry').length;
    const browserEvents = history.entries.filter((e) => e.eventCategory === 'browser').length;
    const startupEvents = history.entries.filter((e) => e.eventCategory === 'startup').length;
    const usbEvents = history.entries.filter((e) => e.eventCategory === 'usb').length;
    const networkEvents = history.entries.filter((e) => e.eventCategory === 'network').length;

    return {
      processesMonitored: processMonitor?.eventsProcessed ?? 0,
      filesMonitored: fileMonitor?.eventsProcessed ?? 0,
      registryEvents,
      browserEvents,
      startupEvents,
      usbEvents,
      networkEvents,
      threatsInvestigatedToday: stats.investigationsTriggered,
      threatsBlocked: stats.threatsBlocked,
      threatsQuarantined: stats.remediationsTriggered,
      falsePositives: 0,
    };
  }

  private buildInsights(
    stats: ProtectionStatistics,
    health: ProtectionHealthReport,
    telemetry: ProtectionTelemetry,
    events: SystemEvent[],
  ): AIInsight[] {
    const insights: AIInsight[] = [];

    // High event volume insight
    if (stats.totalEvents > 100) {
      insights.push({
        id: 'insight-high-volume',
        title: 'High Event Volume Detected',
        description: `${stats.totalEvents} events processed. Average processing time: ${stats.averageProcessingTime.toFixed(0)}ms.`,
        severity: 'info',
        confidence: 0.9,
        source: 'protection-engine',
        timestamp: Date.now(),
        actionable: false,
      });
    }

    // Health issues
    for (const issue of health.issues.slice(0, 5)) {
      insights.push({
        id: `insight-health-${issue.component}`,
        title: `Health Issue: ${issue.component}`,
        description: issue.description,
        severity: issue.severity,
        confidence: 0.85,
        source: 'health-monitor',
        timestamp: Date.now(),
        actionable: true,
        recommendation: issue.recommendation,
      });
    }

    // Resource usage
    if (telemetry.cpuUsage > 1.0) {
      insights.push({
        id: 'insight-cpu-usage',
        title: 'Elevated CPU Usage',
        description: `Protection engine CPU usage at ${telemetry.cpuUsage.toFixed(2)}% (target: <1%).`,
        severity: 'medium',
        confidence: 0.95,
        source: 'telemetry',
        timestamp: Date.now(),
        actionable: true,
        recommendation: 'Consider reducing monitoring frequency or disabling non-critical monitors.',
      });
    }

    if (telemetry.memoryUsage > 150) {
      insights.push({
        id: 'insight-memory-usage',
        title: 'Elevated Memory Usage',
        description: `Protection engine memory at ${telemetry.memoryUsage.toFixed(0)}MB (target: <150MB).`,
        severity: 'medium',
        confidence: 0.95,
        source: 'telemetry',
        timestamp: Date.now(),
        actionable: true,
        recommendation: 'Consider reducing history retention or restarting the engine.',
      });
    }

    // Dropped events
    if (telemetry.droppedEvents > 0) {
      insights.push({
        id: 'insight-dropped-events',
        title: 'Events Being Dropped',
        description: `${telemetry.droppedEvents} events have been dropped due to queue overflow.`,
        severity: 'high',
        confidence: 1.0,
        source: 'telemetry',
        timestamp: Date.now(),
        actionable: true,
        recommendation: 'Increase queue size or reduce event volume.',
      });
    }

    // Recent threats
    const recentThreats = events.filter((e) => e.status === 'threat');
    if (recentThreats.length > 0) {
      insights.push({
        id: 'insight-recent-threats',
        title: 'Recent Threat Activity',
        description: `${recentThreats.length} threat(s) detected in recent events.`,
        severity: 'high',
        confidence: 1.0,
        source: 'protection-engine',
        timestamp: Date.now(),
        actionable: true,
        recommendation: 'Review threats and consider running a full system scan.',
      });
    }

    // Unusual activity
    const processEvents = events.filter((e) => e.category === 'process');
    if (processEvents.length > 10) {
      insights.push({
        id: 'insight-unusual-process-activity',
        title: 'Unusual Process Activity',
        description: `${processEvents.length} process events detected recently.`,
        severity: 'medium',
        confidence: 0.7,
        source: 'behavior-analysis',
        timestamp: Date.now(),
        actionable: true,
        recommendation: 'Monitor process creation patterns for suspicious behavior.',
      });
    }

    return insights.slice(0, MAX_INSIGHTS);
  }

  private buildTimeline(history: { entries: ProtectionHistoryEntry[] }): ThreatTimelineEntry[] {
    const threats = history.entries.filter((e) => e.threatDetected);
    const timeline: ThreatTimelineEntry[] = [];

    for (const threat of threats) {
      const stages: ThreatTimelineEntry['stage'][] = ['detection', 'investigation', 'evidence', 'correlation', 'recommendation', 'decision', 'quarantine', 'rollback', 'resolution'];
      for (const stage of stages) {
        timeline.push({
          id: `tl-${threat.id}-${stage}`,
          threatId: threat.threatId ?? threat.id,
          threatName: threat.target,
          stage,
          timestamp: threat.timestamp + stages.indexOf(stage) * 1000,
          description: this.getStageDescription(stage, threat.target),
          actor: stage === 'decision' ? 'user' : stage === 'resolution' ? 'system' : 'ai',
        });
      }
    }

    return timeline.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_TIMELINE_ENTRIES);
  }

  private getStageDescription(stage: ThreatTimelineEntry['stage'], target: string): string {
    switch (stage) {
      case 'detection': return `Threat detected: ${target}`;
      case 'investigation': return `AI investigation started for ${target}`;
      case 'evidence': return `Evidence collected for ${target}`;
      case 'correlation': return `Threat correlation analysis completed`;
      case 'recommendation': return `AI recommendation generated`;
      case 'decision': return `User decision required`;
      case 'quarantine': return `Threat quarantined`;
      case 'rollback': return `Rollback prepared if needed`;
      case 'resolution': return `Threat resolved`;
      default: return `Stage: ${stage}`;
    }
  }

  private buildProviders(monitors: MonitorInfo[], health: ProtectionHealthReport): ProviderHealthInfo[] {
    const providers: ProviderHealthInfo[] = monitors.map((m) => ({
      id: `monitor-${m.type}`,
      name: this.formatMonitorName(m.type),
      type: 'monitor',
      status: m.status === 'active' ? 'healthy' : m.status === 'error' ? 'error' : m.status === 'paused' ? 'degraded' : 'inactive',
      latency: 0,
      lastRun: m.lastEvent,
      enabled: m.enabled,
      description: `Real-time ${m.type.replace(/_/g, ' ')} monitoring`,
    }));

    // Add engine providers
    providers.push({
      id: 'engine-realtime',
      name: 'Real-Time Engine',
      type: 'engine',
      status: health.status === 'healthy' ? 'healthy' : health.status === 'degraded' ? 'degraded' : 'error',
      latency: 0,
      lastRun: Date.now(),
      enabled: true,
      description: 'Real-time protection engine',
    });

    providers.push({
      id: 'engine-investigation',
      name: 'Investigation Engine',
      type: 'engine',
      status: 'healthy',
      latency: 0,
      lastRun: null,
      enabled: true,
      description: 'AI threat investigation and analysis',
    });

    providers.push({
      id: 'engine-remediation',
      name: 'Remediation Engine',
      type: 'engine',
      status: 'healthy',
      latency: 0,
      lastRun: null,
      enabled: true,
      description: 'Threat quarantine and recovery',
    });

    return providers;
  }

  private formatMonitorName(type: MonitorInfo['type']): string {
    const names: Record<MonitorInfo['type'], string> = {
      file_system: 'File System Monitor',
      process: 'Process Monitor',
      service: 'Service Monitor',
      scheduled_task: 'Scheduled Task Monitor',
      startup: 'Startup Monitor',
      registry: 'Registry Monitor',
      browser: 'Browser Protection',
      download: 'Download Monitor',
      usb: 'USB Monitor',
      network: 'Network Monitor',
    };
    return names[type] ?? type;
  }

  private computeSecurityScore(stats: ProtectionStatistics, health: ProtectionHealthReport): number {
    let score = 100;
    score -= stats.threatsDetected * 5;
    score -= stats.eventsDropped * 0.5;
    score -= health.issues.length * 3;
    for (const issue of health.issues) {
      if (issue.severity === 'critical') score -= 10;
      if (issue.severity === 'high') score -= 5;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private computeThreatLevel(stats: ProtectionStatistics): SecurityOverview['threatLevel'] {
    if (stats.threatsDetected > 10) return 'critical';
    if (stats.threatsDetected > 5) return 'high';
    if (stats.threatsDetected > 0) return 'moderate';
    if (stats.totalEvents > 100) return 'low';
    return 'none';
  }

  private computeConfidenceScore(stats: ProtectionStatistics, telemetry: ProtectionTelemetry): number {
    let confidence = 0.9;
    if (telemetry.droppedEvents > 0) confidence -= 0.1;
    if (telemetry.providerFailures > 0) confidence -= 0.1;
    if (stats.averageProcessingTime > 5000) confidence -= 0.05;
    return Math.max(0, Math.min(1, confidence));
  }

  private generateInitialReports(): void {
    this.generateReport('security');
    this.generateReport('weekly');
  }

  private subscribeToEvents(): void {
    this.eventUnsub = protectionEventBus.subscribe(() => {
      // Events trigger a refresh on next poll cycle
    });
  }
}
