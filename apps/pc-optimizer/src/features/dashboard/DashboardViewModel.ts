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
  HealthScanModuleActual,
  HealthScanReport,
  OptimizationExecutionProgress,
  HealthScanHistoryEntry,
  OptimizationDetails,
  VerificationLog,
} from './dashboard.types';
import type { DashboardService } from './dashboard.service';
import { privacyService as defaultPrivacyService } from '../privacy/privacy.service';
import type { IPrivacyService } from '../privacy/privacy.service';
import type { PrivacyItem } from '../privacy/privacy.types';
import { junkCleanerService } from '../junk-cleaner/junkCleaner.service';
import { startupService } from '../startup/startup.service';
import type { StartupEntry } from '../startup/startup.types';
import { performanceService } from '../performance/performance.service';
import { diskAnalyzerService } from '../disk-analyzer/disk-analyzer.service';
import { registryService } from '../registry/registry.service';
import type { RegistryIssue } from '../registry/registry.types';
import { systemInfoService } from '../system-info/system-info.service';
import type { NavigateFunction } from 'react-router-dom';
import { calculateHealthScore } from './dashboard.utils';
import { optimizationEventBus, invalidateMetricsCache } from '../health';
import type { OptimizationEvent } from '../health';

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
  healthScanBeforeReport: HealthScanReport | null;
  healthScanError: string | null;
  healthScanCancelled: boolean;
  healthScanExecution: OptimizationExecutionProgress | null;
  healthScanResult: OptimizeExecuteResponse | null;
  healthScanHistory: HealthScanHistoryEntry[];

  // Verification / developer logs
  verificationLogs: VerificationLog[];
  developerMode: boolean;

  // Quick actions
  quickActionsOpen: boolean;
}

const LIVE_METRICS_POLL_INTERVAL_MS = 2000;

export class DashboardViewModel extends ViewModel<DashboardState> {
  private liveMetricsPollTimer: ReturnType<typeof setInterval> | null = null;
  private optimizationUnsub: (() => void) | null = null;
  private optimizationRefreshTimer: ReturnType<typeof setTimeout> | null = null;

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
      healthScanBeforeReport: null,
      healthScanError: null,
      healthScanCancelled: false,
      healthScanExecution: null,
      healthScanResult: null,
      healthScanHistory: [],
      verificationLogs: [],
      developerMode: false,

      quickActionsOpen: false,
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  async bootstrap(): Promise<void> {
    if (this.state.bootstrap === 'ready') return;
    // Subscribe to optimization events from other modules
    this.optimizationUnsub = optimizationEventBus.subscribe((event: OptimizationEvent) => {
      this.handleOptimizationEvent(event);
    });
    // Render the dashboard shell immediately; load data in the background.
    // Don't set healthScoreLoading: true — instead, calculate a default
    // health score immediately from null metrics (all zeros) so the card
    // shows something right away, then update with real data when it arrives.
    this.setState({
      bootstrap: 'ready',
      bootstrapError: null,
      metricsLoading: true,
      liveMetricsLoading: true,
      privacyRisksLoading: true,
    });
    // Show a default health score immediately (all zeros / 'critical')
    this.recalculateHealth(null, null);
    void this.bootstrapData();
  }

  private async bootstrapData(): Promise<void> {
    this.startLiveMetricsPolling();
    this.loadDeveloperMode();
    try {
      await Promise.all([this.loadMetrics(), this.loadPrivacyRisks()]);
    } catch (err) {
      console.error('Dashboard bootstrap failed:', err);
    }
  }

  private loadDeveloperMode(): void {
    try {
      const enabled = typeof window !== 'undefined' && window.localStorage.getItem('avs-developer-mode') === 'true';
      this.setState({ developerMode: enabled });
    } catch {
      // localStorage may not be available in test/SSR environments
    }
  }

  override dispose(): void {
    this.stopLiveMetricsPolling();
    if (this.optimizationUnsub) {
      this.optimizationUnsub();
      this.optimizationUnsub = null;
    }
    if (this.optimizationRefreshTimer) {
      clearTimeout(this.optimizationRefreshTimer);
      this.optimizationRefreshTimer = null;
    }
    super.dispose();
  }

  // ------------------------------------------------------------------
  // Metrics
  // ------------------------------------------------------------------

  /**
   * Handle optimization events from other modules (junk cleaned, privacy
   * cleaned, registry fixed, startup disabled, etc.).
   *
   * Debounces refresh — if multiple events arrive in quick succession
   * (e.g. a batch operation), we only reload once after 500ms of quiet.
   */
  private handleOptimizationEvent(_event: OptimizationEvent): void {
    if (this.optimizationRefreshTimer) {
      clearTimeout(this.optimizationRefreshTimer);
    }
    this.optimizationRefreshTimer = setTimeout(() => {
      this.optimizationRefreshTimer = null;
      // Invalidate the backend metrics cache so we get fresh data
      try {
        void this.service.refreshCache();
      } catch {
        // Best-effort
      }
      // Invalidate the local health provider metrics cache
      invalidateMetricsCache();
      // Reload metrics + privacy risks, which triggers recalculateHealth
      void Promise.all([this.loadMetrics(), this.loadPrivacyRisks()]);
    }, 500);
  }

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
        healthScoreLoading: false,
        metricsError: err instanceof Error ? err.message : String(err),
        healthScoreError: err instanceof Error ? err.message : String(err),
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
    try {
      const score = calculateHealthScore(metrics, privacyRisks);
      this.setState({
        healthScore: score,
        healthScoreLoading: false,
        healthScoreError: null,
      });
    } catch (err) {
      this.setState({
        healthScoreLoading: false,
        healthScoreError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ------------------------------------------------------------------
  // Health Scan
  // ------------------------------------------------------------------
  startHealthScan(): void {
    const defaultDetails: OptimizationDetails = {
      summary: 'Scanning...',
      impact: 'low',
      safeToRemove: true,
      groups: [],
      notChanged: [
        'Personal files will not be deleted',
        'Documents, photos, and videos remain untouched',
        'Installed software will not be removed',
      ],
      why: 'This check helps identify optimization opportunities.',
    };

    const modules: HealthScanModuleResult[] = [
      { moduleId: 'junk', moduleName: 'Junk Cleaner', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', measuredDetail: 'Scanning temporary files and browser caches', details: defaultDetails, canAutoFix: true },
      { moduleId: 'startup', moduleName: 'Startup Manager', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', measuredDetail: 'Checking startup applications', details: defaultDetails, canAutoFix: true },
      { moduleId: 'privacy', moduleName: 'Privacy Cleaner', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', measuredDetail: 'Scanning browsing traces and activity history', details: defaultDetails, canAutoFix: true },
      { moduleId: 'performance', moduleName: 'Performance', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', measuredDetail: 'Checking memory and CPU usage', details: defaultDetails, canAutoFix: true },
      { moduleId: 'disk', moduleName: 'Disk Analyzer', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', measuredDetail: 'Analyzing disk space usage', details: defaultDetails, canAutoFix: false },
      { moduleId: 'registry', moduleName: 'Registry Cleaner', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', measuredDetail: 'Scanning for invalid registry entries', details: defaultDetails, canAutoFix: true },
      { moduleId: 'security', moduleName: 'Security Check', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', measuredDetail: 'Checking security features and updates', details: defaultDetails, canAutoFix: false },
      { moduleId: 'system', moduleName: 'System Information', status: 'pending', score: 0, issuesFound: 0, recoverableSpace: 0, severity: 'low', measuredDetail: 'Validating hardware and OS health', details: defaultDetails, canAutoFix: false },
    ];

    this.setState({
      healthScanStep: 'scanning',
      healthScanModules: modules,
      healthScanReport: null,
      healthScanError: null,
      healthScanCancelled: false,
      healthScanExecution: null,
      healthScanResult: null,
    });

    void this.runHealthScan('scan');
  }

  cancelHealthScan(): void {
    this.setState({ healthScanCancelled: true });
  }

  resetHealthScan(): void {
    this.setState({
      healthScanStep: 'idle',
      healthScanModules: [],
      healthScanReport: null,
      healthScanBeforeReport: null,
      healthScanError: null,
      healthScanCancelled: false,
      healthScanExecution: null,
      healthScanResult: null,
    });
  }

  private updateModuleStatus(id: string, patch: Partial<HealthScanModuleResult>): void {
    this.setState({
      healthScanModules: this.state.healthScanModules.map((m) => (m.moduleId === id ? { ...m, ...patch } : m)),
    });
  }

  private finishHealthScan(modules: HealthScanModuleResult[], startedAt: number, phase: 'scan' | 'verify' = 'scan', error?: string): void {
    const finishedAt = Date.now();
    const completed = modules.filter((m) => m.status === 'complete' || m.status === 'skipped');
    const totalRecoverable = completed.reduce((sum, m) => sum + (m.recoverableSpace || 0), 0);
    const totalIssues = completed.reduce((sum, m) => sum + (m.issuesFound || 0), 0);
    const avgScore = completed.length ? Math.round(completed.reduce((sum, m) => sum + m.score, 0) / completed.length) : 0;

    if (error) {
      this.setState({ healthScanStep: phase === 'verify' ? 'complete' : 'idle', healthScanError: error });
      return;
    }

    const report: HealthScanReport = {
      overallScore: avgScore,
      issuesFound: totalIssues,
      recoverableSpace: totalRecoverable,
      modules,
      startedAt,
      finishedAt,
    };

    if (phase === 'verify') {
      const beforeReport = this.state.healthScanBeforeReport;
      const beforeById = new Map(beforeReport?.modules.map((m) => [m.moduleId, m]));
      const verifiedModules = modules.map((m) => {
        const before = beforeById.get(m.moduleId);
        if (!before) return m;
        return {
          ...m,
          verification: {
            beforeScore: before.score,
            beforeIssues: before.issuesFound,
            beforeRecoverable: before.recoverableSpace,
            afterScore: m.score,
            afterIssues: m.issuesFound,
            afterRecoverable: m.recoverableSpace,
          },
        };
      });
      const verifiedReport = { ...report, modules: verifiedModules };
      const recovered = (beforeReport?.recoverableSpace || 0) - verifiedReport.recoverableSpace;
      const healthBefore = beforeReport?.overallScore || avgScore;
      const healthAfter = avgScore;
      const history: HealthScanHistoryEntry = {
        id: `${Date.now()}`,
        date: new Date().toISOString(),
        healthBefore,
        healthAfter,
        recoveredSpace: Math.max(0, recovered),
        modulesUsed: modules.filter((m) => m.actual).map((m) => m.moduleId),
        durationMs: finishedAt - startedAt,
        result: healthAfter > healthBefore && recovered >= 0 ? 'success' : 'partial',
      };
      this.setState({
        healthScanStep: 'complete',
        healthScanReport: verifiedReport,
        healthScanHistory: [history, ...this.state.healthScanHistory].slice(0, 20),
        healthScanError: null,
      });
      return;
    }

    this.setState({
      healthScanStep: 'report',
      healthScanReport: report,
      healthScanError: null,
    });
  }

  private async runHealthScan(phase: 'scan' | 'verify' = 'scan'): Promise<void> {
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

    const notChanged = {
      files: ['Personal files will not be deleted', 'Documents, photos, and videos remain untouched', 'Installed software will not be removed'],
      privacy: ['Passwords will not be removed', 'Browser bookmarks will not be removed', 'Saved logins will not be removed'],
      system: ['Windows system files will not be changed', 'Installed applications will not be removed'],
    };

    if (phase === 'verify') {
      this.setState({ healthScanStep: 'verifying' });
    }

    const tasks: Promise<void>[] = [
      scanIfNotCancelled('junk', async () => {
        const cleaners = await junkCleanerService.list();
        const task = await junkCleanerService.startScan(cleaners.map((c) => c.id));
        await new Promise((resolve) => setTimeout(resolve, 800));
        const status = await junkCleanerService.getStatus(task.taskId);
        const totalSize = status.totalBytes || 0;
        const issues = status.totalFiles || 0;
        const groups = (status.cleaners || cleaners).map((c) => ({
          title: (c as { name?: string }).name || String(c),
          totalSize: (c as { totalBytes?: number }).totalBytes,
          safeToRemove: true,
          why: 'Temporary files and caches are safe to remove and free disk space.',
          items: [] as { name: string; size?: number }[],
        }));
        return {
          score: Math.max(0, 100 - Math.min(issues / 100, 100)),
          issuesFound: issues,
          recoverableSpace: totalSize,
          severity: totalSize > 1_000_000_000 ? 'high' : totalSize > 100_000_000 ? 'medium' : 'low',
          measuredDetail: `Can free ${Math.round(totalSize / 1_000_000)} MB of junk`,
          details: {
            summary: `${issues} temporary files and caches found (${Math.round(totalSize / 1_000_000)} MB)`,
            impact: (totalSize > 1_000_000_000 ? 'high' : totalSize > 100_000_000 ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups,
            notChanged: notChanged.files,
            why: 'Temporary files accumulate over time and consume storage space. Removing them frees disk space but does not affect personal documents.',
          },
        };
      }),
      scanIfNotCancelled('startup', async () => {
        const entries = await startupService.listEntries();
        const high = entries.filter((e) => e.impact === 'high' && e.enabled);
        return {
          score: Math.max(0, 100 - high.length * 5),
          issuesFound: high.length,
          recoverableSpace: 0,
          severity: high.length > 5 ? 'high' : high.length > 0 ? 'medium' : 'low',
          measuredDetail: `${high.length} high-impact startup items`,
          rawContext: { entries },
          details: {
            summary: `${high.length} high-impact startup applications are enabled`,
            impact: (high.length > 5 ? 'high' : high.length > 0 ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups: [
              {
                title: 'Applications to disable',
                safeToRemove: true,
                why: 'Disabling unnecessary startup items reduces Windows boot delay.',
                items: high.slice(0, 10).map((e) => ({ name: e.name })),
              },
            ],
            notChanged: ['Startup entries are backed up and can be re-enabled', 'System startup files are not deleted'],
            why: 'Too many startup applications increase Windows boot time. Disabling unnecessary items reduces startup delay.',
          },
        };
      }),
      scanIfNotCancelled('privacy', async () => {
        const result = await this.privacyService.scan();
        const groups = result.categoriesFound.map((cat) => ({
          title: cat,
          safeToRemove: true,
          why: 'Removes browsing traces and application activity history.',
          items: result.items
            .filter((i) => i.category === cat)
            .slice(0, 5)
            .map((i) => ({ name: i.description || i.path, size: i.size })),
        }));
        return {
          score: Math.max(0, 100 - result.itemCount * 2),
          issuesFound: result.itemCount,
          recoverableSpace: result.totalSize,
          severity: result.totalSize > 500_000_000 ? 'high' : result.totalSize > 50_000_000 ? 'medium' : 'low',
          measuredDetail: `${result.itemCount} privacy items`,
          rawContext: { result },
          details: {
            summary: `${result.itemCount} privacy traces found across ${result.categoriesFound.length} categories`,
            impact: (result.totalSize > 500_000_000 ? 'high' : result.totalSize > 50_000_000 ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups,
            notChanged: notChanged.privacy,
            why: 'Browser cache, cookies, recent files, and DNS cache can reveal browsing history and activity. Cleaning them improves privacy without deleting personal data.',
          },
        };
      }),
      scanIfNotCancelled('performance', async () => {
        const metrics = await performanceService.getMetrics();
        const alertList = (await performanceService.getAlerts()).alerts;
        const ramRecovery = metrics.memory?.used ? Math.max(0, metrics.memory.used - metrics.memory.total * 0.5) : 0;
        return {
          score: Math.max(0, 100 - alertList.length * 10 - (metrics.cpu?.usage || 0) / 2),
          issuesFound: alertList.length,
          recoverableSpace: ramRecovery,
          severity: alertList.length > 2 ? 'high' : alertList.length > 0 ? 'medium' : 'low',
          measuredDetail: `${alertList.length} performance alerts`,
          details: {
            summary: `${alertList.length} performance alerts and ${metrics.memory?.usage || 0}% memory usage detected`,
            impact: (alertList.length > 2 ? 'high' : alertList.length > 0 ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups: alertList.slice(0, 5).map((a) => ({
              title: a.type,
              safeToRemove: true,
              why: a.message,
              items: [{ name: a.message }],
            })),
            notChanged: notChanged.system,
            why: 'High memory usage and background alerts can slow the system. Reclaiming memory and resolving alerts improves responsiveness.',
          },
        };
      }),
      scanIfNotCancelled('disk', async () => {
        const drives = await diskAnalyzerService.listDrives();
        const full = drives.filter((d) => d.percent > 80);
        return {
          score: Math.max(0, 100 - full.length * 25 - drives.reduce((s, d) => s + d.percent, 0) / drives.length / 2),
          issuesFound: full.length,
          recoverableSpace: drives.reduce((s, d) => s + (d.used || 0), 0),
          severity: full.length > 0 ? 'high' : 'low',
          measuredDetail: `${full.length} over capacity drives`,
          details: {
            summary: `${drives.length} drives scanned; ${full.length} over 80% capacity`,
            impact: (full.length > 0 ? 'high' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups: drives.map((d) => ({
              title: `${d.mountpoint || d.device} (${d.percent}% used)`,
              safeToRemove: true,
              why: 'Identifies large files and disk space usage for review.',
              items: [{ name: `Free: ${Math.round(d.free / 1_000_000)} MB` }],
            })),
            notChanged: notChanged.files,
            why: 'Low disk space slows the system and prevents updates. Identifying large files helps recover space without deleting personal data.',
          },
        };
      }),
      scanIfNotCancelled('registry', async () => {
        const result = await registryService.scan();
        const byCategory: Record<string, typeof result.issues> = {};
        result.issues.forEach((i) => {
          const list = (byCategory[i.category] ??= []);
          list.push(i);
        });
        const groups = Object.entries(byCategory).map(([cat, issues]) => ({
          title: cat,
          safeToRemove: true,
          why: 'Invalid or obsolete registry entries can slow Windows startup and operation.',
          items: issues.slice(0, 5).map((i) => ({ name: i.description })),
        }));
        return {
          score: Math.max(0, 100 - result.issues.length),
          issuesFound: result.issues.length,
          recoverableSpace: 0,
          severity: result.issues.length > 50 ? 'high' : result.issues.length > 10 ? 'medium' : 'low',
          measuredDetail: `${result.issues.length} registry issues`,
          rawContext: { result },
          details: {
            summary: `${result.issues.length} invalid or obsolete registry entries found`,
            impact: (result.issues.length > 50 ? 'high' : result.issues.length > 10 ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups,
            notChanged: ['Registry backups are created before changes', 'Installed software registrations are not removed'],
            why: 'Invalid registry entries can cause slowdowns. Cleaning them safely removes obsolete references while keeping backups.',
          },
        };
      }),
      scanIfNotCancelled('security', async () => {
        const metrics = await this.service.getMetrics();
        const pending = metrics.security.updates.pendingUpdates || 0;
        const thirdPartyAV = metrics.security.defender.thirdPartyAV || metrics.security.firewall.thirdPartyAV;
        const defender = (!thirdPartyAV && !metrics.security.defender.enabled) ? 1 : 0;
        const firewall = (!thirdPartyAV && !metrics.security.firewall.enabled) ? 1 : 0;
        return {
          score: Math.max(0, 100 - (pending + (defender + firewall) * 20)),
          issuesFound: pending + defender + firewall,
          recoverableSpace: 0,
          severity: defender + firewall > 0 ? 'high' : pending > 0 ? 'medium' : 'low',
          measuredDetail: thirdPartyAV
            ? `${thirdPartyAV} active, ${pending} pending updates`
            : `${pending} pending updates, ${defender + firewall} disabled protections`,
          details: {
            summary: thirdPartyAV
              ? `${thirdPartyAV} is protecting your system. ${pending} pending Windows updates.`
              : `${pending} pending Windows updates, ${defender + firewall} disabled protections`,
            impact: (defender + firewall > 0 ? 'high' : pending > 0 ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups: [
              {
                title: 'Security recommendations',
                safeToRemove: true,
                why: 'Security features keep the system protected from malware and network threats.',
                items: [
                  ...(thirdPartyAV ? [{ name: `${thirdPartyAV} antivirus active` }] : []),
                  ...(pending > 0 ? [{ name: `${pending} pending Windows updates` }] : []),
                  ...(defender > 0 ? [{ name: 'Windows Defender real-time protection disabled' }] : []),
                  ...(firewall > 0 ? [{ name: 'Windows Firewall disabled' }] : []),
                ],
              },
            ],
            notChanged: notChanged.system,
            why: thirdPartyAV
              ? 'Third-party antivirus is protecting your system. Keep it updated for best protection.'
              : 'Pending updates and disabled security features leave the system vulnerable. Applying updates and enabling protections improves safety.',
          },
        };
      }),
      scanIfNotCancelled('system', async () => {
        const info = await systemInfoService.getComprehensiveInfo();
        const uptimeDays = info.os?.bootTime ? (Date.now() / 1000 - info.os.bootTime) / 86400 : 0;
        const restart = uptimeDays > 30;
        return {
          score: restart ? 80 : 95,
          issuesFound: restart ? 1 : 0,
          recoverableSpace: 0,
          severity: restart ? 'medium' : 'low',
          measuredDetail: restart ? 'System restart recommended' : 'System healthy',
          details: {
            summary: restart ? `System uptime is ${Math.round(uptimeDays)} days` : 'System information is healthy',
            impact: (restart ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups: [
              {
                title: 'System status',
                safeToRemove: true,
                why: 'A restart refreshes system state and releases memory leaks.',
                items: [{ name: `Windows ${info.os?.release || 'unknown'}` }, { name: `${info.cpu?.name || ''}` }],
              },
            ],
            notChanged: notChanged.system,
            why: restart
              ? 'A long uptime can lead to memory leaks and slower performance. A restart refreshes the system.'
              : 'System hardware and OS are within healthy parameters.',
          },
        };
      }),
    ];

    await Promise.all(tasks);
    this.finishHealthScan(this.state.healthScanModules, startedAt, phase);
  }

  async executeHealthScanOptimizations(): Promise<void> {
    const beforeReport = this.state.healthScanReport;
    if (!beforeReport) return;

    const fixableModules = beforeReport.modules.filter(
      (m) => m.status === 'complete' && m.canAutoFix && (m.recoverableSpace > 0 || m.issuesFound > 0)
    );
    if (fixableModules.length === 0) return;

    this.setState({
      healthScanStep: 'optimizing',
      healthScanBeforeReport: beforeReport,
      healthScanExecution: {
        currentModule: 'Starting...',
        progress: 0,
        itemsProcessed: 0,
        spaceRecovered: 0,
        elapsedMs: 0,
      },
    });

    const start = Date.now();
    const actualMap = new Map<string, HealthScanModuleActual>();

    try {
      for (const item of fixableModules) {
        this.setState({
          healthScanExecution: {
            ...this.state.healthScanExecution!,
            currentModule: item.moduleName,
            progress: Math.max(10, Math.min(90, Math.round((actualMap.size / fixableModules.length) * 80))),
          },
        });
        const moduleResult = beforeReport.modules.find((m) => m.moduleId === item.moduleId);
        const actual = moduleResult ? await this.executeModuleAction(moduleResult) : { success: false, errors: ['Module not found in before report'] };
        actualMap.set(item.moduleId, actual);
      }

      this.setState({
        healthScanExecution: {
          ...this.state.healthScanExecution!,
          currentModule: 'Verifying',
          progress: 90,
        },
      });

      await this.runHealthScan('verify');
      const modulesWithActual = this.state.healthScanModules.map((m) => (actualMap.has(m.moduleId) ? { ...m, actual: actualMap.get(m.moduleId) } : m));
      this.setState({
        healthScanModules: modulesWithActual,
        healthScanResult: {
          success: [...actualMap.values()].every((a) => a.success),
          totalRecovered: [...actualMap.values()].reduce((s, a) => s + (a.bytesRecovered || 0), 0),
          results: {} as unknown as OptimizeExecuteResponse['results'],
          elapsedMs: Date.now() - start,
          completedAt: new Date().toISOString(),
        } as OptimizeExecuteResponse,
      });
      // Also update healthScanReport so the complete step can show actual results
      const currentReport = this.state.healthScanReport;
      if (currentReport) {
        // Update modules with actual results and fix modulesUsed in history
        const updatedModules = currentReport.modules.map((m) => {
          const updated = modulesWithActual.find((u) => u.moduleId === m.moduleId);
          return updated ? { ...m, actual: updated.actual } : m;
        });
        this.setState({
          healthScanReport: {
            ...currentReport,
            modules: updatedModules,
          },
        });
        // Fix the history entry to correctly list modules that were actually used
        const modulesUsed = [...actualMap.keys()];
        if (this.state.healthScanHistory.length > 0) {
          this.setState({
            healthScanHistory: this.state.healthScanHistory.map((h, i) =>
              i === 0 ? { ...h, modulesUsed } : h
            ),
          });
        }
      }

      // The backend caches dashboard.metrics for 15s. Real actions just
      // ran (junk cleaned, startup entries disabled, privacy items removed,
      // registry issues fixed), so explicitly invalidate that cache before
      // reloading — otherwise the Dashboard would keep showing the
      // pre-optimization snapshot for up to 15 more seconds. Both reloads
      // are awaited (not fire-and-forget) so the UI is guaranteed to reflect
      // verified, current data by the time this function resolves.
      try {
        await this.service.refreshCache();
      } catch (err) {
        console.error('Failed to invalidate dashboard cache:', err);
      }
      await Promise.all([this.loadMetrics(), this.loadPrivacyRisks()]);
    } catch (err) {
      this.setState({
        healthScanStep: 'complete',
        healthScanError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async executeModuleAction(module: HealthScanModuleResult): Promise<HealthScanModuleActual> {
    const ctx = module.rawContext || {};
    const start = Date.now();
    const log = (action: string, rpcMethod: string, before?: number, after?: number, success = true, message?: string) =>
      this.logVerification({
        id: `${Date.now()}-${module.moduleId}`,
        timestamp: Date.now(),
        moduleId: module.moduleId,
        action,
        rpcMethod,
        before,
        after,
        durationMs: Date.now() - start,
        success,
        message,
      });

    switch (module.moduleId) {
      case 'junk': {
        try {
          const result = await this.service.executeOptimize();
          log('executeOptimize', 'dashboard.optimize.execute', undefined, result.totalRecovered, result.success);
          return {
            success: result.success,
            bytesRecovered: result.totalRecovered,
            errors: Object.values(result.results)
              .filter((r) => r.error)
              .map((r) => r.error!),
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log('executeOptimize', 'dashboard.optimize.execute', undefined, undefined, false, msg);
          return { success: false, errors: [msg], reason: msg };
        }
      }
      case 'privacy': {
        const items = (ctx.result as { items?: { path: string; size: number; category: string; description: string; safeToDelete: boolean; riskLevel: string; canRestore: boolean }[] })?.items || [];
        if (!items.length) {
          log('clean', 'privacy.clean', module.issuesFound, 0, false, 'No items found in scan context');
          return { success: false, errors: ['No privacy items found in scan context'], reason: 'No items found' };
        }
        try {
          const result = await this.privacyService.clean(items as unknown as PrivacyItem[]);
          const removed = result.itemsCleaned || 0;
          log('clean', 'privacy.clean', module.issuesFound, module.issuesFound - removed, true);
          return {
            success: result.errors.length === 0,
            itemsRemoved: removed,
            bytesRecovered: result.spaceFreed || 0,
            errors: result.errors || [],
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log('clean', 'privacy.clean', module.issuesFound, undefined, false, msg);
          return { success: false, errors: [msg], reason: msg };
        }
      }
      case 'startup': {
        const entries = (ctx.entries as { name: string; publisher: string; status: string; impact: string; source: string; location: string; command: string; enabled: boolean }[]) || [];
        const toDisable = entries.filter((e) => e.enabled && e.impact === 'high');
        let disabled = 0;
        const errors: string[] = [];
        for (const entry of toDisable) {
          try {
            const res = await startupService.disableEntry(entry as unknown as StartupEntry);
            if (res.success) disabled += 1;
            else errors.push(res.reason || res.message || `Failed to disable ${entry.name}`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(`${entry.name}: ${msg}`);
          }
        }
        log('disable', 'startup.disable', module.issuesFound, module.issuesFound - disabled, errors.length === 0, errors.join('; ') || undefined);
        return { success: errors.length === 0, entriesDisabled: disabled, errors: errors.slice(0, 5) };
      }
      case 'registry': {
        const issues = (ctx.result as { issues?: { id: string; category: string; description: string; hive: string; subkey: string; valueName: string; valueData: string; severity: string }[] })?.issues || [];
        if (!issues.length) {
          log('clean', 'registry.clean', module.issuesFound, 0, false, 'No issues found in scan context');
          return { success: false, errors: ['No registry issues found in scan context'], reason: 'No issues found' };
        }
        try {
          const result = await registryService.clean(issues as unknown as RegistryIssue[]);
          log('clean', 'registry.clean', module.issuesFound, module.issuesFound - result.fixed, result.errors.length === 0);
          return { success: result.errors.length === 0, issuesFixed: result.fixed, errors: result.errors || [] };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log('clean', 'registry.clean', module.issuesFound, undefined, false, msg);
          return { success: false, errors: [msg], reason: msg };
        }
      }
      case 'performance': {
        try {
          const result = await performanceService.optimizeMemory();
          log('optimize', 'performance.memory.optimize', undefined, result.memoryFreed, result.status === 'completed');
          return {
            success: result.status === 'completed',
            bytesRecovered: result.memoryFreed,
            issuesFixed: result.processesOptimized,
            errors: result.errors || [],
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log('optimize', 'performance.memory.optimize', undefined, undefined, false, msg);
          return { success: false, errors: [msg], reason: msg };
        }
      }
      case 'disk':
        log('analyze', 'disk.listDrives', undefined, undefined, true, 'Disk Analyzer does not modify files — use Disk Analyzer page to review large files');
        return { success: true, errors: [], reason: 'No changes made — use Disk Analyzer to review' };
      case 'security':
        log('apply', 'security.apply', undefined, undefined, false, 'Security settings require manual action via Windows Security');
        return { success: false, errors: ['Security settings require manual action. Use the Security page to open Windows Security.'], reason: 'Requires manual action' };
      case 'system':
        log('info', 'system.getComprehensiveInfo', undefined, undefined, true, 'System Information does not modify state — restart recommended if uptime is high');
        return { success: true, errors: [], reason: 'No changes made — restart if uptime is high' };
      default:
        return { success: false, errors: [`Unknown module ${module.moduleId}`] };
    }
  }

  private logVerification(entry: VerificationLog): void {
    const logs = [entry, ...this.state.verificationLogs].slice(0, 500);
    this.setState({ verificationLogs: logs });
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('avs-verification-logs', JSON.stringify(logs));
      }
    } catch {
      // localStorage may not be available
    }
  }

  setDeveloperMode(enabled: boolean): void {
    this.setState({ developerMode: enabled });
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('avs-developer-mode', String(enabled));
      }
    } catch {
      // localStorage may not be available
    }
  }

  cancelHealthScanOptimizations(): void {
    this.setState({ healthScanStep: 'report' });
  }

  closeHealthScan(): void {
    this.setState({
      healthScanStep: 'idle',
      healthScanModules: [],
      healthScanReport: null,
      healthScanBeforeReport: null,
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
      // dashboard.optimize.execute already clears the backend metrics cache
      // as part of its own execution, but invalidate again defensively in
      // case that changes, then await a full metrics reload so the health
      // score recomputed below reflects real post-optimization state.
      try {
        await this.service.refreshCache();
      } catch (err) {
        console.error('Failed to invalidate dashboard cache:', err);
      }
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
