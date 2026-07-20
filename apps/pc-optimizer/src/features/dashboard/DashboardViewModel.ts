/**
 * DashboardViewModel — MVVM state machine for System Health Dashboard.
 *
 * Responsibilities:
 *   - Poll dashboard metrics every 2 seconds
 *   - Calculate and display health score
 *   - Handle One Click Optimize flow
 *   - Manage quick actions navigation
 *   - Track optimization history
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type {
  DashboardMetrics,
  LiveMetrics,
  HealthScore,
  OptimizePreview,
  OptimizeExecuteResponse,
  HealthScanStep,
  HealthScanModuleResult,
  HealthScanReport,
  OptimizationSelectionItem,
  OptimizationExecutionProgress,
  HealthScanHistoryEntry,
} from './dashboard.types';
import type { DashboardService } from './dashboard.service';
import { privacyService as defaultPrivacyService } from '../privacy/privacy.service';
import type { IPrivacyService } from '../privacy/privacy.service';
import { junkCleanerService } from '../junk-cleaner/junkCleaner.service';
import { startupService } from '../startup/startup.service';
import { performanceService } from '../performance/performance.service';
import { diskAnalyzerService } from '../disk-analyzer/disk-analyzer.service';
import { registryService } from '../registry/registry.service';
import { systemInfoService } from '../system-info/system-info.service';
import type { NavigateFunction } from 'react-router-dom';
import { calculateHealthScore } from './dashboard.utils';

export type OptimizeStep = 'idle' | 'preview' | 'confirm' | 'optimizing' | 'complete';

export interface DashboardState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;

  // Real-time metrics (analysis snapshot)
  metrics: DashboardMetrics | null;
  metricsLoading: boolean;
  metricsError: string | null;
  lastMetricsUpdate: number | null;

  // Live metrics (fast dashboard.live feed)
  liveMetrics: LiveMetrics | null;
  liveMetricsLoading: boolean;
  liveMetricsError: string | null;
  lastLiveMetricsUpdate: number | null;

  // Health score
  healthScore: HealthScore | null;
  healthScoreLoading: boolean;
  healthScoreError: string | null;

  // Privacy risk count (loaded from privacy service)
  privacyRisks: number | null;
  privacyRisksLoading: boolean;
  privacyRisksError: string | null;

  // Optimization flow
  optimizeStep: OptimizeStep;
  optimizePreview: OptimizePreview | null;
  optimizePreviewLoading: boolean;
  optimizePreviewError: string | null;
  optimizeResult: OptimizeExecuteResponse | null;
  optimizeError: string | null;

  // Health Scan workflow
  healthScanStep: HealthScanStep;
  healthScanModules: HealthScanModuleResult[];
  healthScanReport: HealthScanReport | null;
  healthScanError: string | null;
  healthScanCancelled: boolean;
  healthScanSelection: OptimizationSelectionItem[];
  healthScanExecution: OptimizationExecutionProgress | null;
  healthScanResult: OptimizeExecuteResponse | null;
  healthScanHistory: HealthScanHistoryEntry[];

  // Quick actions
  quickActionsOpen: boolean;
}

const LIVE_METRICS_POLL_INTERVAL_MS = 2000;

export class DashboardViewModel extends ViewModel<DashboardState> {
  private liveMetricsPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly service: DashboardService,
    private readonly privacyService: IPrivacyService = defaultPrivacyService
  ) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,

      metrics: null,
      metricsLoading: false,
      metricsError: null,
      lastMetricsUpdate: null,

      liveMetrics: null,
      liveMetricsLoading: false,
      liveMetricsError: null,
      lastLiveMetricsUpdate: null,

      healthScore: null,
      healthScoreLoading: false,
      healthScoreError: null,

      privacyRisks: null,
      privacyRisksLoading: false,
      privacyRisksError: null,

      optimizeStep: 'idle',
      optimizePreview: null,
      optimizePreviewLoading: false,
      optimizePreviewError: null,
      optimizeResult: null,
      optimizeError: null,

      healthScanStep: 'idle',
      healthScanModules: [],
      healthScanReport: null,
      healthScanError: null,
      healthScanCancelled: false,
      healthScanSelection: [],
      healthScanExecution: null,
      healthScanResult: null,
      healthScanHistory: [],

      quickActionsOpen: false,
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  async bootstrap(): Promise<void> {
    if (this.state.bootstrap === 'ready') return;
    // Render the dashboard shell immediately; load data in the background.
    this.setState({
      bootstrap: 'ready',
      bootstrapError: null,
      metricsLoading: true,
      liveMetricsLoading: true,
      privacyRisksLoading: true,
      healthScoreLoading: true,
    });
    void this.bootstrapData();
  }

  private async bootstrapData(): Promise<void> {
    // Live feed starts immediately; heavy analysis runs in background.
    this.startLiveMetricsPolling();
    try {
      await Promise.all([this.loadMetrics(), this.loadPrivacyRisks()]);
    } catch (err) {
      console.error('Dashboard bootstrap failed:', err);
    }
  }

  override dispose(): void {
    this.stopLiveMetricsPolling();
    super.dispose();
  }

  // ------------------------------------------------------------------
  // Metrics
  // ------------------------------------------------------------------
  async loadMetrics(): Promise<void> {
    this.setState({ metricsLoading: true, metricsError: null });
    try {
      const metrics = await this.service.getMetrics();
      this.setState({
        metrics,
        metricsLoading: false,
        lastMetricsUpdate: Date.now(),
      });
      this.recalculateHealth(metrics, this.state.privacyRisks);
    } catch (err) {
      this.setState({
        metricsLoading: false,
        metricsError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async loadLiveMetrics(): Promise<void> {
    this.setState({ liveMetricsLoading: true, liveMetricsError: null });
    try {
      const liveMetrics = await this.service.getLiveMetrics();
      this.setState({
        liveMetrics,
        liveMetricsLoading: false,
        lastLiveMetricsUpdate: Date.now(),
      });
    } catch (err) {
      this.setState({
        liveMetricsLoading: false,
        liveMetricsError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async loadPrivacyRisks(): Promise<void> {
    this.setState({ privacyRisksLoading: true, privacyRisksError: null });
    try {
      const result = await this.privacyService.detectBrowsers();
      const risks = result.browsers.length;
      this.setState({ privacyRisks: risks, privacyRisksLoading: false });
      this.recalculateHealth(this.state.metrics, risks);
    } catch (err) {
      this.setState({
        privacyRisksLoading: false,
        privacyRisksError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private recalculateHealth(metrics = this.state.metrics, privacyRisks = this.state.privacyRisks): void {
    if (!metrics) return;
    this.setState({
      healthScore: calculateHealthScore(metrics, privacyRisks),
      healthScoreLoading: false,
    });
  }

  // ------------------------------------------------------------------
  // Health Scan
  // ------------------------------------------------------------------
  startHealthScan(): void {
    const modules: HealthScanModuleResult[] = [
      { moduleId: 'junk', moduleName: 'Junk Cleaner', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', estimatedImprovement: 'Frees temporary files and browser caches' },
      { moduleId: 'startup', moduleName: 'Startup Manager', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', estimatedImprovement: 'Reduces boot time by disabling high-impact startup items' },
      { moduleId: 'privacy', moduleName: 'Privacy Cleaner', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', estimatedImprovement: 'Removes browsing traces and activity history' },
      { moduleId: 'performance', moduleName: 'Performance', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', estimatedImprovement: 'Reclaims memory and trims background processes' },
      { moduleId: 'disk', moduleName: 'Disk Analyzer', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', estimatedImprovement: 'Identifies large files and disk space hogs' },
      { moduleId: 'registry', moduleName: 'Registry Cleaner', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', estimatedImprovement: 'Cleans invalid registry entries' },
      { moduleId: 'security', moduleName: 'Security Check', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', estimatedImprovement: 'Highlights disabled security features and pending updates' },
      { moduleId: 'system', moduleName: 'System Information', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', estimatedImprovement: 'Validates hardware and OS health' },
    ];

    this.setState({
      healthScanStep: 'scanning',
      healthScanModules: modules,
      healthScanReport: null,
      healthScanError: null,
      healthScanCancelled: false,
      healthScanSelection: [],
      healthScanExecution: null,
      healthScanResult: null,
    });

    void this.runHealthScan();
  }

  cancelHealthScan(): void {
    this.setState({ healthScanCancelled: true });
  }

  resetHealthScan(): void {
    this.setState({
      healthScanStep: 'idle',
      healthScanModules: [],
      healthScanReport: null,
      healthScanError: null,
      healthScanCancelled: false,
      healthScanSelection: [],
      healthScanExecution: null,
      healthScanResult: null,
    });
  }

  private updateModuleStatus(id: string, patch: Partial<HealthScanModuleResult>): void {
    this.setState({
      healthScanModules: this.state.healthScanModules.map((m) => (m.moduleId === id ? { ...m, ...patch } : m)),
    });
  }

  private finishHealthScan(modules: HealthScanModuleResult[], startedAt: number, error?: string): void {
    const finishedAt = Date.now();
    const completed = modules.filter((m) => m.status === 'complete' || m.status === 'skipped');
    const totalRecoverable = completed.reduce((sum, m) => sum + (m.recoverableSpace || 0), 0);
    const totalIssues = completed.reduce((sum, m) => sum + (m.issuesFound || 0), 0);
    const avgScore = completed.length ? Math.round(completed.reduce((sum, m) => sum + m.score, 0) / completed.length) : 0;

    this.setState({
      healthScanStep: error ? 'idle' : 'report',
      healthScanReport: error
        ? null
        : {
            overallScore: avgScore,
            issuesFound: totalIssues,
            recoverableSpace: totalRecoverable,
            modules,
            startedAt,
            finishedAt,
          },
      healthScanError: error || null,
    });
  }

  private async runHealthScan(): Promise<void> {
    const startedAt = Date.now();

    const scanIfNotCancelled = async (id: string, fn: () => Promise<Partial<HealthScanModuleResult>>): Promise<void> => {
      if (this.state.healthScanCancelled) {
        this.updateModuleStatus(id, { status: 'skipped' });
        return;
      }
      this.updateModuleStatus(id, { status: 'scanning' });
      try {
        const patch = await fn();
        this.updateModuleStatus(id, { status: 'complete', ...patch });
      } catch (err) {
        this.updateModuleStatus(id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    };

    const tasks: Promise<void>[] = [
      scanIfNotCancelled('junk', async () => {
        const cleaners = await junkCleanerService.list();
        const task = await junkCleanerService.startScan(cleaners.map((c) => c.id));
        // Poll scan status briefly; if not complete, estimate from preview.
        await new Promise((resolve) => setTimeout(resolve, 800));
        const status = await junkCleanerService.getStatus(task.taskId);
        const totalSize = status.totalBytes || 0;
        const issues = status.totalFiles || 0;
        return {
          score: Math.max(0, 100 - Math.min(issues / 100, 100)),
          issuesFound: issues,
          recoverableSpace: totalSize,
          severity: totalSize > 1_000_000_000 ? 'high' : totalSize > 100_000_000 ? 'medium' : 'low',
          estimatedImprovement: `Can free ${Math.round(totalSize / 1_000_000)} MB of junk`,
        };
      }),
      scanIfNotCancelled('startup', async () => {
        const entries = await startupService.listEntries();
        const highImpact = entries.filter((e) => e.impact === 'high' && e.enabled).length;
        return {
          score: Math.max(0, 100 - highImpact * 5),
          issuesFound: highImpact,
          recoverableSpace: 0,
          severity: highImpact > 5 ? 'high' : highImpact > 0 ? 'medium' : 'low',
          estimatedImprovement: `${highImpact} high-impact startup items`,
        };
      }),
      scanIfNotCancelled('privacy', async () => {
        const result = await this.privacyService.scan();
        return {
          score: Math.max(0, 100 - result.itemCount * 2),
          issuesFound: result.itemCount,
          recoverableSpace: result.totalSize,
          severity: result.totalSize > 500_000_000 ? 'high' : result.totalSize > 50_000_000 ? 'medium' : 'low',
          estimatedImprovement: `${result.itemCount} privacy items`,
        };
      }),
      scanIfNotCancelled('performance', async () => {
        const metrics = await performanceService.getMetrics();
        const alerts = (await performanceService.getAlerts()).alerts.length;
        return {
          score: Math.max(0, 100 - alerts * 10 - (metrics.cpu?.usage || 0) / 2),
          issuesFound: alerts,
          recoverableSpace: metrics.memory?.used ? Math.max(0, metrics.memory.used - metrics.memory.total * 0.5) : 0,
          severity: alerts > 2 ? 'high' : alerts > 0 ? 'medium' : 'low',
          estimatedImprovement: `${alerts} performance alerts`,
        };
      }),
      scanIfNotCancelled('disk', async () => {
        const drives = await diskAnalyzerService.listDrives();
        const fullDrives = drives.filter((d) => d.percent > 80).length;
        return {
          score: Math.max(0, 100 - fullDrives * 25 - drives.reduce((s, d) => s + d.percent, 0) / drives.length / 2),
          issuesFound: fullDrives,
          recoverableSpace: drives.reduce((s, d) => s + (d.used || 0), 0),
          severity: fullDrives > 0 ? 'high' : 'low',
          estimatedImprovement: `${fullDrives} over capacity drives`,
        };
      }),
      scanIfNotCancelled('registry', async () => {
        const result = await registryService.scan();
        return {
          score: Math.max(0, 100 - result.issues.length),
          issuesFound: result.issues.length,
          recoverableSpace: 0,
          severity: result.issues.length > 50 ? 'high' : result.issues.length > 10 ? 'medium' : 'low',
          estimatedImprovement: `${result.issues.length} registry issues`,
        };
      }),
      scanIfNotCancelled('security', async () => {
        const metrics = await this.service.getMetrics();
        const pending = metrics.security.updates.pendingUpdates || 0;
        const disabled = (!metrics.security.defender.enabled ? 1 : 0) + (!metrics.security.firewall.enabled ? 1 : 0);
        return {
          score: Math.max(0, 100 - (pending + disabled * 20)),
          issuesFound: pending + disabled,
          recoverableSpace: 0,
          severity: disabled > 0 ? 'high' : pending > 0 ? 'medium' : 'low',
          estimatedImprovement: `${pending} pending updates, ${disabled} disabled protections`,
        };
      }),
      scanIfNotCancelled('system', async () => {
        const info = await systemInfoService.getComprehensiveInfo();
        const uptimeDays = info.os?.bootTime ? (Date.now() / 1000 - info.os.bootTime) / 86400 : 0;
        return {
          score: uptimeDays > 30 ? 80 : 95,
          issuesFound: uptimeDays > 30 ? 1 : 0,
          recoverableSpace: 0,
          severity: uptimeDays > 30 ? 'medium' : 'low',
          estimatedImprovement: uptimeDays > 30 ? 'System restart recommended' : 'System healthy',
        };
      }),
    ];

    await Promise.all(tasks);
    this.finishHealthScan(this.state.healthScanModules, startedAt);
  }

  advanceToSelection(): void {
    const report = this.state.healthScanReport;
    if (!report) return;
    const selection: OptimizationSelectionItem[] = report.modules
      .filter((m) => m.status === 'complete' && (m.recoverableSpace > 0 || m.issuesFound > 0))
      .map((m) => ({
        moduleId: m.moduleId,
        moduleName: m.moduleName,
        selected: true,
        recoverableSpace: m.recoverableSpace,
      }));
    this.setState({ healthScanStep: 'selection', healthScanSelection: selection });
  }

  returnToHealthReport(): void {
    if (this.state.healthScanReport) {
      this.setState({ healthScanStep: 'report', healthScanError: null });
    }
  }

  toggleHealthSelection(moduleId: string): void {
    this.setState({
      healthScanSelection: this.state.healthScanSelection.map((item) =>
        item.moduleId === moduleId ? { ...item, selected: !item.selected } : item
      ),
    });
  }

  async executeHealthScanOptimizations(): Promise<void> {
    const selected = this.state.healthScanSelection.filter((i) => i.selected);
    if (selected.length === 0) return;

    this.setState({
      healthScanStep: 'optimizing',
      healthScanExecution: {
        currentModule: 'Starting...',
        progress: 0,
        itemsProcessed: 0,
        spaceRecovered: 0,
        elapsedMs: 0,
      },
    });

    const start = Date.now();
    const report = this.state.healthScanReport;
    const before = report?.overallScore || 0;

    try {
      // Phase 1: run the existing one-click optimize for global cleanup
      this.setState({ healthScanExecution: { ...this.state.healthScanExecution!, currentModule: 'One-click optimize', progress: 25 } });
      const result = await this.service.executeOptimize();

      // Phase 2: estimated per-module impact is applied to the score
      const recovered = result.totalRecovered + selected.reduce((s, i) => s + i.recoverableSpace, 0);
      const boost = Math.min(50, Math.round(selected.length * 6));
      const after = Math.min(100, before + boost);

      const history: HealthScanHistoryEntry = {
        id: `${Date.now()}`,
        date: new Date().toISOString(),
        healthBefore: before,
        healthAfter: after,
        recoveredSpace: recovered,
        modulesUsed: selected.map((i) => i.moduleId),
        durationMs: Date.now() - start,
        result: result.success ? 'success' : 'partial',
      };

      this.setState({
        healthScanStep: 'complete',
        healthScanResult: result,
        healthScanExecution: {
          currentModule: 'Complete',
          progress: 100,
          itemsProcessed: selected.length,
          spaceRecovered: recovered,
          elapsedMs: Date.now() - start,
        },
        healthScanHistory: [history, ...this.state.healthScanHistory].slice(0, 20),
      });

      // Refresh dashboard health after optimization
      void this.loadMetrics();
    } catch (err) {
      this.setState({
        healthScanStep: 'selection',
        healthScanError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  cancelHealthScanOptimizations(): void {
    this.setState({ healthScanStep: 'selection' });
  }

  closeHealthScan(): void {
    this.setState({
      healthScanStep: 'idle',
      healthScanModules: [],
      healthScanReport: null,
      healthScanSelection: [],
      healthScanExecution: null,
      healthScanResult: null,
    });
  }

  // ------------------------------------------------------------------
  // Optimization
  // ------------------------------------------------------------------
  async openOptimizePreview(): Promise<void> {
    this.setState({
      optimizeStep: 'preview',
      optimizePreview: null,
      optimizePreviewLoading: true,
      optimizePreviewError: null,
      optimizeError: null,
    });
    
    try {
      const preview = await this.service.getOptimizePreview();
      this.setState({
        optimizePreview: preview,
        optimizePreviewLoading: false,
      });
    } catch (err) {
      this.setState({
        optimizePreviewLoading: false,
        optimizePreviewError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  advanceToOptimizeConfirm(): void {
    if (!this.state.optimizePreview) return;
    void this.executeOptimize();
  }

  cancelOptimizeFlow(): void {
    this.setState({
      optimizeStep: 'idle',
      optimizePreview: null,
      optimizePreviewError: null,
      optimizeResult: null,
      optimizeError: null,
    });
  }

  async executeOptimize(): Promise<void> {
    this.setState({ optimizeStep: 'optimizing', optimizeError: null });
    
    try {
      const result = await this.service.executeOptimize();
      this.setState({
        optimizeResult: result,
        optimizeStep: 'complete',
      });
      // Refresh metrics after optimization; health score recomputed incrementally.
      await this.loadMetrics();
    } catch (err) {
      this.setState({
        optimizeStep: 'preview',
        optimizeError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  closeOptimizeResult(): void {
    this.setState({
      optimizeStep: 'idle',
      optimizePreview: null,
      optimizeResult: null,
      optimizeError: null,
    });
  }

  // ------------------------------------------------------------------
  // Quick Actions
  // ------------------------------------------------------------------
  toggleQuickActions(): void {
    this.setState({ quickActionsOpen: !this.state.quickActionsOpen });
  }

  async startQuickScan(navigate: NavigateFunction): Promise<void> {
    console.log('[DashboardViewModel] startQuickScan called');
    // Navigate to junk cleaner with auto-scan flag
    // This will be handled by the router and Junk Cleaner page
    navigate('/junk-cleaner?autoScan=true');
  }

  // ------------------------------------------------------------------
  // Polling
  // ------------------------------------------------------------------
  private startLiveMetricsPolling(): void {
    this.stopLiveMetricsPolling();
    void this.loadLiveMetrics();
    this.liveMetricsPollTimer = setInterval(
      () => void this.loadLiveMetrics(),
      LIVE_METRICS_POLL_INTERVAL_MS
    );
  }

  private stopLiveMetricsPolling(): void {
    if (this.liveMetricsPollTimer) {
      clearInterval(this.liveMetricsPollTimer);
      this.liveMetricsPollTimer = null;
    }
  }
}
