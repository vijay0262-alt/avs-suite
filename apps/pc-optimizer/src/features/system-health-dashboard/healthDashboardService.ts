/**
 * Health Dashboard Service — the main orchestrator for the
 * System Health Dashboard.
 *
 * Ties together:
 *   • SystemMonitor (live metrics)
 *   • HealthTimeline (history)
 *   • HealthWidgetRegistry (pluggable widgets)
 *   • DashboardStateManager (state management)
 *   • Alert generation
 *
 * Consumes existing services:
 *   • dashboardService (metrics, health score)
 *   • healthAnalyzer (AI Health Engine)
 *   • executionHistoryRepository (maintenance history)
 *   • optimizationExecutionEvents (optimization sessions)
 *
 * This module does NOT modify any of the above services.
 */
import type {
  DashboardState,
  SystemLiveMetrics,
  CategoryCard,
  RealTimeStatus,
  TimelineRange,
  DashboardAlert,
  AlertType,
  AlertSeverity,
} from './types';
import {
  DEFAULT_QUICK_ACTIONS,
  extractLiveMetrics,
  buildCategoryCards,
  buildHealthScorePanel,
} from './types';
import { SystemMonitor } from './systemMonitor';
import { HealthTimeline } from './healthTimeline';
import { HealthWidgetRegistry } from './healthWidgetRegistry';
import { DashboardStateManager } from './dashboardStateManager';
import { dashboardService } from '../dashboard/dashboard.service';
import { healthAnalyzer } from '../ai-health-engine/healthAnalyzer';
import type { HealthReport } from '../ai-health-engine/types';
import type { DashboardMetrics } from '../dashboard/dashboard.types';
import { executionHistoryRepository } from '../maintenance-history/executionHistoryRepository';
import { executionStatisticsService } from '../maintenance-history/executionStatisticsService';
import { optimizationExecutionEvents } from '../optimization-execution/optimizationExecutionEvents';

let _alertCounter = 0;

function generateAlertId(): string {
  _alertCounter += 1;
  return `alert-${Date.now().toString(36)}-${_alertCounter}`;
}

export class HealthDashboardService {
  private _monitor: SystemMonitor;
  private _timeline: HealthTimeline;
  private _widgetRegistry: HealthWidgetRegistry;
  private _stateManager: DashboardStateManager;
  private _previousScore: number | null = null;
  private _lastReport: HealthReport | null = null;
  private _lastMetrics: DashboardMetrics | null = null;
  private _initialized: boolean = false;
  private _optEventUnsub: (() => void) | null = null;

  constructor(options?: {
    monitor?: SystemMonitor;
    timeline?: HealthTimeline;
    widgetRegistry?: HealthWidgetRegistry;
    stateManager?: DashboardStateManager;
  }) {
    this._monitor = options?.monitor ?? new SystemMonitor();
    this._timeline = options?.timeline ?? new HealthTimeline();
    this._widgetRegistry = options?.widgetRegistry ?? new HealthWidgetRegistry();
    this._stateManager = options?.stateManager ?? new DashboardStateManager();
  }

  // ── Lifecycle ───────────────────────────────────────────────

  /**
   * Initialize the dashboard service.
   */
  init(): void {
    if (this._initialized) return;
    this._initialized = true;

    // Load persisted timeline
    this._timeline.load();

    // Sync maintenance history into timeline
    this._timeline.syncFromMaintenanceHistory();

    // Subscribe to live metrics
    this._monitor.onMetrics((metrics) => this._onMetricsUpdated(metrics));
    this._monitor.onError((error) => this._onMonitorError(error));

    // Subscribe to optimization execution events
    this._optEventUnsub = optimizationExecutionEvents.on('optimization_completed', (payload: unknown) => {
      this._onOptimizationCompleted(payload);
    });

    // Start monitoring
    this._monitor.start();

    // Initial state with widgets and quick actions
    this._stateManager.setState({
      widgets: this._widgetRegistry.getEnabled(),
      quickActions: [...DEFAULT_QUICK_ACTIONS],
      timeline: this._timeline.getEntries('7days'),
      loading: true,
    });
  }

  /**
   * Shut down the dashboard service.
   */
  shutdown(): void {
    this._monitor.stop();
    if (this._optEventUnsub) {
      this._optEventUnsub();
      this._optEventUnsub = null;
    }
    this._initialized = false;
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Get the current dashboard state.
   */
  getState(): DashboardState {
    return this._stateManager.getState();
  }

  /**
   * Subscribe to state updates.
   */
  onStateChange(listener: (state: DashboardState) => void): () => void {
    return this._stateManager.on('dashboard_state_updated', (payload) => {
      listener((payload as { state: DashboardState }).state);
    });
  }

  /**
   * Run a full health analysis and refresh the dashboard.
   */
  async refreshHealth(): Promise<void> {
    this._stateManager.setState({ loading: true, error: null });

    try {
      // Refresh backend cache
      await dashboardService.refreshCache();

      // Get fresh metrics
      const metrics = await dashboardService.getMetrics();
      this._lastMetrics = metrics;

      // Run health analysis
      const report = await healthAnalyzer.analyze({
        metrics,
        executionHistory: executionHistoryRepository.getAll(),
        executionStatistics: executionStatisticsService.compute(executionHistoryRepository.getAll()),
      });

      this._lastReport = report;

      // Build dashboard data
      const scorePanel = buildHealthScorePanel(report, this._previousScore);
      const categoryCards = buildCategoryCards(report);

      // Sync to timeline
      this._timeline.syncFromHealthReport(report, this._previousScore);

      // Update previous score
      this._previousScore = report.overall.score;

      // Build real-time status
      const liveMetrics = extractLiveMetrics(metrics);
      const realTimeStatus = this._buildRealTimeStatus(liveMetrics);

      // Generate alerts
      const alerts = this._generateAlerts(liveMetrics, report, categoryCards);

      // Update state
      this._stateManager.setState({
        loading: false,
        healthScorePanel: scorePanel,
        categoryCards,
        realTimeStatus,
        alerts,
        timeline: this._timeline.getEntries(this._stateManager.getState().timelineRange),
        liveMetrics,
        lastUpdated: new Date().toISOString(),
      });

      this._stateManager.flush();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this._stateManager.setState({ loading: false, error: errorMsg });
      this._stateManager.flush();
    }
  }

  /**
   * Set the timeline range.
   */
  setTimelineRange(range: TimelineRange): void {
    this._stateManager.setState({
      timelineRange: range,
      timeline: this._timeline.getEntries(range),
    });
    this._stateManager.flush();
  }

  /**
   * Dismiss an alert.
   */
  dismissAlert(alertId: string): void {
    const state = this._stateManager.getState();
    const updated = state.alerts.map((a: DashboardAlert) =>
      a.id === alertId ? { ...a, dismissed: true } : a,
    );
    this._stateManager.setState({ alerts: updated });
    this._stateManager.flush();
  }

  /**
   * Get all active (non-dismissed) alerts.
   */
  getActiveAlerts(): DashboardAlert[] {
    return this._stateManager.getState().alerts.filter((a: DashboardAlert) => !a.dismissed);
  }

  /**
   * Get the widget registry.
   */
  getWidgetRegistry(): HealthWidgetRegistry {
    return this._widgetRegistry;
  }

  /**
   * Get the system monitor.
   */
  getMonitor(): SystemMonitor {
    return this._monitor;
  }

  /**
   * Get the timeline.
   */
  getTimeline(): HealthTimeline {
    return this._timeline;
  }

  /**
   * Force refresh of live metrics.
   */
  async refreshMetrics(): Promise<void> {
    await this._monitor.refresh();
  }

  // ── Internal ────────────────────────────────────────────────

  private _onMetricsUpdated(metrics: SystemLiveMetrics): void {
    const state = this._stateManager.getState();

    // Update real-time status
    const realTimeStatus = state.realTimeStatus
      ? { ...state.realTimeStatus, cpuUsage: metrics.cpuUsage, memoryUsage: metrics.memoryUsage, backgroundProcesses: metrics.runningProcesses, startupPrograms: metrics.startupPrograms }
      : this._buildRealTimeStatus(metrics);

    this._stateManager.setState({
      liveMetrics: metrics,
      realTimeStatus,
      lastUpdated: metrics.capturedAt,
    });
  }

  private _onMonitorError(error: string): void {
    this._stateManager.setState({ error });
  }

  private _onOptimizationCompleted(payload: unknown): void {
    const p = payload as { sessionId: string; result?: { status: string; tasksCompleted: number; storageRecovered: number } };
    if (p.result) {
      this._timeline.recordOptimization(
        p.sessionId,
        p.result.status,
        p.result.tasksCompleted,
        p.result.storageRecovered,
        new Date().toISOString(),
      );
      this._stateManager.setState({
        timeline: this._timeline.getEntries(this._stateManager.getState().timelineRange),
      });
    }
  }

  private _buildRealTimeStatus(metrics: SystemLiveMetrics): RealTimeStatus {
    const records = executionHistoryRepository.getAll();
    const recentMaintenance = records.length > 0
      ? {
          executionId: records[0]!.id,
          status: records[0]!.status,
          timestamp: records[0]!.endTime,
          filesCleaned: records[0]!.filesRemoved,
          bytesRecovered: records[0]!.totalSpaceRecovered,
        }
      : null;

    return {
      cpuUsage: metrics.cpuUsage,
      memoryUsage: metrics.memoryUsage,
      diskActivity: 0, // Not directly available from metrics
      backgroundProcesses: metrics.runningProcesses,
      startupPrograms: metrics.startupPrograms,
      recentMaintenance,
      lastOptimization: null, // Updated from optimization events
    };
  }

  private _generateAlerts(
    metrics: SystemLiveMetrics,
    report: HealthReport,
    cards: CategoryCard[],
  ): DashboardAlert[] {
    const alerts: DashboardAlert[] = [];
    const now = new Date().toISOString();

    // Critical health warning
    if (report.overall.score < 50) {
      alerts.push(this._createAlert(
        'critical_health',
        'critical',
        'Critical Health Warning',
        `Your PC health score is ${report.overall.score}. Immediate action recommended.`,
        now,
        '/dashboard',
        'Run Health Analysis',
      ));
    }

    // Low disk space
    if (metrics.diskFreeBytes < 5 * 1024 * 1024 * 1024 && metrics.diskTotalBytes > 0) {
      alerts.push(this._createAlert(
        'low_disk_space',
        'critical',
        'Low Disk Space',
        `Only ${(metrics.diskFreeBytes / 1024 / 1024 / 1024).toFixed(1)} GB free on primary drive.`,
        now,
        '/junk-cleaner',
        'Clean Junk Files',
      ));
    }

    // Startup degradation
    if (metrics.startupPrograms > 25) {
      alerts.push(this._createAlert(
        'startup_degradation',
        'warning',
        'High Startup Program Count',
        `${metrics.startupPrograms} programs start with Windows. This may slow boot time.`,
        now,
        '/startup-manager',
        'Manage Startup',
      ));
    }

    // Temp file growth
    const tempFilesCard = cards.find((c) => c.categoryId === 'temp_files');
    if (tempFilesCard && tempFilesCard.score < 60) {
      alerts.push(this._createAlert(
        'temp_file_growth',
        'warning',
        'Temporary File Growth',
        'Large accumulation of temporary files detected. Consider cleaning.',
        now,
        '/junk-cleaner',
        'Clean Temp Files',
      ));
    }

    // Repeated failures
    const recentRecords = executionHistoryRepository.getAll().slice(0, 5);
    const failedCount = recentRecords.filter((r) => r.status === 'failed').length;
    if (failedCount >= 3) {
      alerts.push(this._createAlert(
        'repeated_failures',
        'warning',
        'Repeated Maintenance Failures',
        `${failedCount} of the last 5 maintenance executions failed.`,
        now,
        '/reports',
        'View Reports',
      ));
    }

    // Capability limitations
    const lowConfidenceCats = cards.filter((c) => c.score < 50 && c.severity === 'high');
    for (const cat of lowConfidenceCats) {
      alerts.push(this._createAlert(
        'capability_limitation',
        'info',
        `${cat.categoryName} Needs Attention`,
        cat.quickRecommendation ?? `Review ${cat.categoryName} issues.`,
        now,
        null,
        null,
      ));
    }

    return alerts;
  }

  private _createAlert(
    type: AlertType,
    severity: AlertSeverity,
    title: string,
    description: string,
    timestamp: string,
    actionPath: string | null,
    actionLabel: string | null,
  ): DashboardAlert {
    return {
      id: generateAlertId(),
      type,
      severity,
      title,
      description,
      timestamp,
      actionPath,
      actionLabel,
      dismissed: false,
    };
  }
}

/**
 * Default singleton instance.
 */
export const healthDashboardService = new HealthDashboardService();
