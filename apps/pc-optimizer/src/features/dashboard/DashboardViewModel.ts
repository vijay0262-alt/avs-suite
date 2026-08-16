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
  OptimizationExecutionProgress,
  HealthScanHistoryEntry,
  OptimizationDetails,
  VerificationLog,
  DeferredCleanupItem,
  HardwareSensors,
  ScanPhase,
  ScanLiveStats,
  ScanActivityEntry,
} from './dashboard.types';
import { HEALTH_CATEGORIES } from './healthCategoryMapping';
import type { DashboardService } from './dashboard.service';
import { privacyService as defaultPrivacyService } from '../privacy/privacy.service';
import type { IPrivacyService } from '../privacy/privacy.service';
import type { NavigateFunction } from 'react-router-dom';
import { calculateHealthScore } from './dashboard.utils';
import { invalidateMetricsCache, dashboardRefreshManager } from '../health';
import { withRetry } from '../health/RpcRetryWrapper';
import type { OptimizationEvent } from '../health';
import { optimizationHistoryService } from '../health/OptimizationHistoryService';
import { healthTimelineService } from '../health/HealthTimelineService';
import { healthNotificationService } from '../health/HealthNotificationService';
import type { OptimizationSummary } from './OptimizationSummary.types';
import { loadSession, clearSession } from './sessionPersistence';
import { idbPut } from '../../services/avsWithIDB';
import { canUse as featureGateCanUse, currentEdition as getFeatureGateEdition } from '../licensing/FeatureGate';
import type { ManagedFeature } from '@avs/licensing';
import { useSyncStore, planToEdition } from '../sync/syncStore';
import { HardwareManager } from '../hardware-center/HardwareManager';
import { hardwareRegistry } from '../hardware-center/HardwareRegistry';
import { createMockHardwareProvider } from '../hardware-center/MockHardwareProvider';
import { hardwareSnapshotToSensors, getCpuTempFromSnapshot } from './hardwareAdapter';
import type { VerificationReport } from '../health/VerificationEngine';
import { useLiveSync } from '../health/LiveSyncService';

type ScanProfile = 'dashboard' | 'optimize' | 'protection';

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
  healthScanCurrentFile: string | null;
  healthScanSubProgress: number; // 0-100 sub-progress within current module

  // AI Smart Optimize scan phases & live stats
  scanPhase: ScanPhase | null;
  scanOverallProgress: number; // 0-100 smooth overall progress
  scanLiveStats: ScanLiveStats;
  scanStartTime: number | null;
  scanActivityLog: ScanActivityEntry[];
  scanCurrentOperation: string | null;
  scanCurrentPath: string | null;
  scanItemsProcessed: number;
  scanItemsRemaining: number;
  scanBytesRecovered: number;

  // Verification / developer logs
  verificationLogs: VerificationLog[];
  developerMode: boolean;

  // Improvement Summary (Part 7)
  optimizationSummary: OptimizationSummary | null;

  // Phase 9 — Verification Report
  verificationReport: VerificationReport | null;

  // Deferred cleanup queue — items that could not be cleaned (locked files, admin-only, etc.)
  deferredCleanupItems: DeferredCleanupItem[];

  // Quick actions
  quickActionsOpen: boolean;

  // Hardware sensors
  hardwareSensors: HardwareSensors | null;
  hardwareSensorsLoading: boolean;
  hardwareSensorsError: string | null;

}

const LIVE_METRICS_POLL_INTERVAL_MS = 2000;
const LIVE_METRICS_POLL_HIDDEN_INTERVAL_MS = 30000;

export class DashboardViewModel extends ViewModel<DashboardState> {
  private liveMetricsPollTimer: ReturnType<typeof setInterval> | null = null;
  private optimizationUnsub: (() => void) | null = null;
  private optimizationRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingEventModuleId: string | null = null;
  private verificationLogFlushTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Check if the current user has Professional edition.
   * Reads directly from the sync store to avoid stale FeatureGate module-level state.
   * Falls back to FeatureGate's currentEdition() if sync store is unavailable.
   */
  private isProEdition(): boolean {
    try {
      const syncData = useSyncStore.getState().data;
      if (syncData) {
        return planToEdition(syncData.subscription.plan, syncData.license?.edition) === 'PROFESSIONAL';
      }
    } catch {
      // sync store not available
    }
    return getFeatureGateEdition() === 'professional';
  }

  /**
   * Check if a feature is available, using live sync store edition.
   */
  private canUseFeature(feature: string): boolean {
    // If sync store says Pro, all features are available
    if (this.isProEdition()) return true;
    // Otherwise fall back to FeatureGate (which checks the feature flag registry for Free edition)
    return featureGateCanUse(feature as ManagedFeature);
  }

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
      healthScanCurrentFile: null,
      healthScanSubProgress: 0,

      scanPhase: null,
      scanOverallProgress: 0,
      scanLiveStats: {
        filesScanned: 0,
        registryEntries: 0,
        startupItems: 0,
        privacyItems: 0,
        storageRecovered: 0,
        memoryRecovered: 0,
        startupOptimized: 0,
        recommendationsFound: 0,
      },
      scanStartTime: null,
      scanActivityLog: [],
      scanCurrentOperation: null,
      scanCurrentPath: null,
      scanItemsProcessed: 0,
      scanItemsRemaining: 0,
      scanBytesRecovered: 0,
      verificationLogs: [],
      developerMode: false,

      quickActionsOpen: false,
      optimizationSummary: null,
      verificationReport: null,
      deferredCleanupItems: [],
      hardwareSensors: null,
      hardwareSensorsLoading: false,
      hardwareSensorsError: null,
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  async bootstrap(): Promise<void> {
    if (this.state.bootstrap === 'ready') return;
    // Register with the global refresh manager so we receive optimization
    // events even if they arrived while the Dashboard was not mounted.
    this.optimizationUnsub = dashboardRefreshManager.register((event: OptimizationEvent) => {
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
      hardwareSensorsLoading: true,
    });
    // Show a default health score immediately (all zeros / 'critical')
    this.recalculateHealth(null, null);

    // Part 15: Restore persisted session from previous app run (optimization summary only)
    loadSession().then((persisted) => {
      if (persisted && persisted.healthScore !== null) {
        this.setState({
          optimizationSummary: persisted.optimizationSummary as OptimizationSummary | null,
        });
      }
    });

    void this.bootstrapData();
  }

  private async bootstrapData(): Promise<void> {
    this.startLiveMetricsPolling();
    this.loadDeveloperMode();
    try {
      await Promise.all([this.loadMetrics(), this.loadPrivacyRisks(), this.loadHardwareSensors()]);
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
    if (this.verificationLogFlushTimer) {
      clearTimeout(this.verificationLogFlushTimer);
      this.verificationLogFlushTimer = null;
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
   * Performance: Only reloads data affected by the module that triggered
   * the event — avoids rescanning the entire system.
   *
   * Error isolation: Uses Promise.allSettled so one failing reload
   * (e.g. registry) doesn't block others (e.g. junk, storage, health).
   *
   * Debounces refresh — if multiple events arrive in quick succession
   * (e.g. a batch operation), we only reload once after 500ms of quiet.
   */
  private handleOptimizationEvent(event: OptimizationEvent): void {
    // Track the latest module that triggered an event for targeted refresh
    this.pendingEventModuleId = event.moduleId;
    if (this.optimizationRefreshTimer) {
      clearTimeout(this.optimizationRefreshTimer);
    }
    this.optimizationRefreshTimer = setTimeout(() => {
      this.optimizationRefreshTimer = null;
      const moduleId = this.pendingEventModuleId;
      this.pendingEventModuleId = null;

      // Invalidate the backend metrics cache so we get fresh data
      try {
        void this.service.refreshCache();
      } catch {
        // Best-effort
      }
      // Invalidate the local health provider metrics cache
      invalidateMetricsCache();

      // Build the set of reloads needed based on which module triggered.
      // This avoids rescanning the entire system when only one module changed.
      const reloads: Promise<void>[] = [];

      // Metrics (DashboardMetrics) covers: storage, startup, security, windows,
      // performance snapshot. Reload for modules that affect these categories.
      const metricsModules = ['junk', 'startup', 'disk', 'security', 'system', 'duplicate'];
      // Privacy risks need a separate scan call.
      const privacyModules = ['privacy'];
      // Live metrics (CPU/RAM) only needed for performance module.
      const liveModules = ['performance'];

      // If we don't know the module (null/unknown), reload everything as fallback.
      const knownModule = moduleId && [...metricsModules, ...privacyModules, ...liveModules].includes(moduleId);

      if (!knownModule || metricsModules.includes(moduleId!)) {
        reloads.push(this.loadMetrics());
      }
      if (!knownModule || privacyModules.includes(moduleId!)) {
        reloads.push(this.loadPrivacyRisks());
      }
      if (!knownModule || liveModules.includes(moduleId!)) {
        reloads.push(this.loadLiveMetrics());
      }

      // Use allSettled so one failure doesn't block the others.
      // Each load* method already handles its own errors and updates
      // its portion of state independently.
      void Promise.allSettled(reloads);
    }, 500);
  }

  async loadMetrics(): Promise<void> {
    this.setState({ metricsLoading: true, metricsError: null });
    try {
      const metrics = await withRetry(() => this.service.getMetrics(), 'dashboard.metrics', { maxAttempts: 3, baseDelayMs: 1000 });
      this.setState({
        metrics,
        metricsLoading: false,
        lastMetricsUpdate: Date.now(),
      });
      this.recalculateHealth(metrics, this.state.privacyRisks);
    } catch (err) {
      // Only set metricsError — don't set healthScoreError so the
      // health score card still shows the last known score. Other
      // data sources (privacy, live metrics) may still succeed.
      this.setState({
        metricsLoading: false,
        metricsError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  clearMetricsError(): void {
    this.setState({ metricsError: null });
  }

  clearLiveMetricsError(): void {
    this.setState({ liveMetricsError: null });
  }

  clearHardwareSensorsError(): void {
    this.setState({ hardwareSensorsError: null });
  }

  async loadHardwareSensors(): Promise<void> {
    this.setState({ hardwareSensorsLoading: true, hardwareSensorsError: null });
    try {
      // Use the same HardwareManager as the Hardware Center page
      if (hardwareRegistry.getAllProviders().length === 0) {
        hardwareRegistry.register(createMockHardwareProvider());
      }
      const manager = new HardwareManager({ enablePolling: false });
      await manager.initialize();
      const snapshot = await manager.scan();
      const sensors = hardwareSnapshotToSensors(snapshot);
      this.setState({
        hardwareSensors: sensors,
        hardwareSensorsLoading: false,
      });

      // Also update live metrics CPU temperature from hardware center data
      const cpuTemp = getCpuTempFromSnapshot(snapshot);
      if (cpuTemp !== null && this.state.liveMetrics) {
        this.setState({
          liveMetrics: {
            ...this.state.liveMetrics,
            cpu: {
              ...this.state.liveMetrics.cpu,
              temperature: cpuTemp,
            },
          },
        });
      }
      manager.dispose();
    } catch (err) {
      // Fallback to dashboard.live data if hardware center scan fails
      try {
        const live = await this.service.getLiveMetrics();
        const fallbackSensors = this.buildHardwareSensorsFromLive(live);
        this.setState({
          hardwareSensors: fallbackSensors,
          hardwareSensorsLoading: false,
          hardwareSensorsError: null,
        });
      } catch {
        this.setState({
          hardwareSensorsLoading: false,
          hardwareSensorsError: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private buildHardwareSensorsFromLive(live: LiveMetrics): HardwareSensors {
    const tempSensors = live.cpu.temperature !== null
      ? [{
          name: 'CPU',
          value: live.cpu.temperature,
          high: null,
          critical: null,
          unit: 'celsius',
          source: 'dashboard.live',
          supported: true,
        }]
      : [];

    const clockSensors = live.cpu.frequency > 0
      ? [{
          name: 'CPU',
          current: live.cpu.frequency,
          min: null,
          max: null,
          unit: 'mhz',
          source: 'dashboard.live',
          supported: true,
        }]
      : [];

    return {
      temperature: {
        sensors: tempSensors,
        supported: tempSensors.length > 0,
        source: tempSensors.length > 0 ? 'dashboard.live' : null,
        message: tempSensors.length === 0
          ? 'Temperature sensors are not available on this system. Install LibreHardwareMonitor for detailed sensor data.'
          : undefined,
      },
      fans: {
        sensors: [],
        supported: false,
        source: null,
        message: 'Fan speed sensors are not available on this system.',
      },
      clocks: {
        clocks: clockSensors,
        supported: clockSensors.length > 0,
      },
      battery: {
        present: false,
        percent: null,
        powerPlugged: null,
        secsLeft: null,
        supported: false,
        message: 'No battery detected on this system.',
      },
      power: {
        supported: false,
        source: null,
        message: 'Power usage monitoring is not available on this system.',
      },
    };
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
    // Part 13: recalculateHealth is only called after events (loadMetrics,
    // loadPrivacyRisks, bootstrap) — never on every 2s live metrics poll.
    // The debounce in handleOptimizationEvent already prevents redundant
    // recalculations from rapid event bursts.
    try {
      const score = calculateHealthScore(metrics, privacyRisks);
      this.setState({
        healthScore: score,
        healthScoreLoading: false,
        healthScoreError: null,
      });
      // Part 9: Record health timeline entry
      healthTimelineService.recordHealth(
        score.overallScore,
        score.scoreZone,
        score.issues.length,
      );
      // Part 10: Check for meaningful changes and fire notifications
      const perf = metrics?.performance;
      healthNotificationService.checkForChanges(
        score.overallScore,
        perf ? perf.temporaryFilesSize + perf.recycleBinSize + perf.browserCacheSize : 0,
        perf?.startupApps ?? 0,
      );
      // Phase 9 — Broadcast scores globally so all modules stay synchronized
      useLiveSync.getState().broadcastScores({
        healthScore: score.overallScore,
        performanceScore: score.categoryScores.performance,
        storageScore: score.categoryScores.storage,
        privacyScore: score.categoryScores.privacy,
        protectionStatus: score.overallScore >= 80 ? 'fully_protected' : score.overallScore >= 60 ? 'partially_protected' : 'at_risk',
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
  startHealthScan(_profile: ScanProfile = 'dashboard', _isPro: boolean = true): void {
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

    // User-facing categories — always show all 5 regardless of profile.
    // Internal implementation modules are mapped to these categories.
    const modules: HealthScanModuleResult[] = HEALTH_CATEGORIES.map((cat) => ({
      moduleId: cat.categoryId,
      moduleName: cat.categoryName,
      status: 'pending' as const,
      score: 0,
      issuesFound: 0,
      recoverableSpace: 0,
      severity: 'low' as const,
      measuredDetail: cat.description,
      details: defaultDetails,
      canAutoFix: true,
    }));

    this.setState({
      healthScanStep: 'preparing',
      healthScanModules: modules,
      healthScanReport: null,
      healthScanError: null,
      healthScanCancelled: false,
      healthScanExecution: null,
      healthScanResult: null,
      healthScanCurrentFile: null,
      healthScanSubProgress: 0,

      scanPhase: 'preparing',
      scanOverallProgress: 0,
      scanLiveStats: {
        filesScanned: 0,
        registryEntries: 0,
        startupItems: 0,
        privacyItems: 0,
        storageRecovered: 0,
        memoryRecovered: 0,
        startupOptimized: 0,
        recommendationsFound: 0,
      },
      scanStartTime: Date.now(),
      scanActivityLog: [],
      scanCurrentOperation: null,
      scanCurrentPath: null,
      scanItemsProcessed: 0,
      scanItemsRemaining: 0,
      scanBytesRecovered: 0,
    });

    // Brief preparing phase for UX feedback. The actual scan now starts from
    // ScanView; dashboard health scan has been deprecated in SC-8C9 Phase 2.
    setTimeout(() => {
      if (this.state.healthScanCancelled) {
        this.resetHealthScan();
        return;
      }
      this.setState({ healthScanStep: 'scanning' });
    }, 600);
  }

  cancelHealthScan(): void {
    this.setState({ healthScanCancelled: true });
    // Reset immediately — don't wait for the scan loop to notice the flag
    this.setState({
      healthScanStep: 'idle',
      healthScanModules: [],
      healthScanReport: null,
      healthScanBeforeReport: null,
      healthScanError: null,
      healthScanExecution: null,
      healthScanResult: null,
      healthScanCurrentFile: null,
      healthScanSubProgress: 0,
      scanPhase: null,
      scanOverallProgress: 0,
      scanLiveStats: {
        filesScanned: 0,
        registryEntries: 0,
        startupItems: 0,
        privacyItems: 0,
        storageRecovered: 0,
        memoryRecovered: 0,
        startupOptimized: 0,
        recommendationsFound: 0,
      },
      scanStartTime: null,
      scanActivityLog: [],
      scanCurrentOperation: null,
      scanCurrentPath: null,
      scanItemsProcessed: 0,
      scanItemsRemaining: 0,
      scanBytesRecovered: 0,
      deferredCleanupItems: [],
    });
  }

  cancelHealthScanOptimizations(): void {
    this.setState({
      healthScanStep: 'idle',
      healthScanModules: [],
      healthScanReport: null,
      healthScanBeforeReport: null,
      healthScanError: null,
      healthScanCancelled: false,
      healthScanExecution: null,
      healthScanResult: null,
      healthScanCurrentFile: null,
      healthScanSubProgress: 0,

      scanPhase: null,
      scanOverallProgress: 0,
      scanLiveStats: {
        filesScanned: 0,
        registryEntries: 0,
        startupItems: 0,
        privacyItems: 0,
        storageRecovered: 0,
        memoryRecovered: 0,
        startupOptimized: 0,
        recommendationsFound: 0,
      },
      scanStartTime: null,
      scanActivityLog: [],
      scanCurrentOperation: null,
      scanCurrentPath: null,
      scanItemsProcessed: 0,
      scanItemsRemaining: 0,
      scanBytesRecovered: 0,
      deferredCleanupItems: [],
    });
    // Refresh metrics so scores reflect any partial optimizations that were applied
    invalidateMetricsCache();
    void this.loadMetrics();
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
      healthScanCurrentFile: null,
      healthScanSubProgress: 0,

      scanPhase: null,
      scanOverallProgress: 0,
      scanLiveStats: {
        filesScanned: 0,
        registryEntries: 0,
        startupItems: 0,
        privacyItems: 0,
        storageRecovered: 0,
        memoryRecovered: 0,
        startupOptimized: 0,
        recommendationsFound: 0,
      },
      scanStartTime: null,
    });
  }

  private updateModuleStatus(id: string, patch: Partial<HealthScanModuleResult>): void {
    this.setState({
      healthScanModules: this.state.healthScanModules.map((m) => (m.moduleId === id ? { ...m, ...patch } : m)),
    });
  }

  private logVerification(entry: VerificationLog): void {
    const logs = [entry, ...this.state.verificationLogs].slice(0, 500);
    this.setState({ verificationLogs: logs });
    if (this.verificationLogFlushTimer) clearTimeout(this.verificationLogFlushTimer);
    this.verificationLogFlushTimer = setTimeout(() => {
      idbPut('verificationLogs', entry);
      this.verificationLogFlushTimer = null;
    }, 500);
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

  closeHealthScan(): void {
    this.setState({
      healthScanStep: 'idle',
      healthScanModules: [],
      healthScanReport: null,
      healthScanBeforeReport: null,
      healthScanError: null,
      healthScanExecution: null,
      healthScanResult: null,
      optimizationSummary: null,
      verificationReport: null,
      deferredCleanupItems: [],
      scanPhase: null,
      scanOverallProgress: 0,
      scanLiveStats: {
        filesScanned: 0,
        registryEntries: 0,
        startupItems: 0,
        privacyItems: 0,
        storageRecovered: 0,
        memoryRecovered: 0,
        startupOptimized: 0,
        recommendationsFound: 0,
      },
      scanStartTime: null,
      scanActivityLog: [],
      scanCurrentOperation: null,
      scanCurrentPath: null,
      scanItemsProcessed: 0,
      scanItemsRemaining: 0,
      scanBytesRecovered: 0,
    });
    // Refresh metrics so scores reflect any optimizations that were applied
    invalidateMetricsCache();
    void Promise.all([this.loadMetrics(), this.loadPrivacyRisks(), this.loadHardwareSensors()]);
    clearSession();
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
    const healthBefore = this.state.healthScore?.overallScore ?? 0;

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

      // Part 7: Build improvement summary
      const healthAfter = this.state.healthScore?.overallScore ?? 100;
      const summary: OptimizationSummary = {
        healthBefore,
        healthAfter,
        storageRecovered: result.totalRecovered,
        registryFixed: 0,
        startupOptimized: 0,
        privacyCleaned: 0,
        duplicateFilesRemoved: 0,
        durationMs: result.elapsedMs,
        completedAt: result.completedAt,
        success: result.success,
      };
      this.setState({ optimizationSummary: summary });

      // Part 8: Record optimization history
      optimizationHistoryService.recordOptimization({
        timestamp: result.completedAt,
        healthBefore,
        healthAfter,
        storageRecovered: result.totalRecovered,
        registryFixed: 0,
        startupOptimized: 0,
        privacyCleaned: 0,
        duplicateFilesRemoved: 0,
        durationMs: result.elapsedMs,
        result: result.success ? 'success' : 'partial',
        modulesUsed: ['junk'],
      });
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
      optimizationSummary: null,
      verificationReport: null,
      deferredCleanupItems: [],
    });
  }

  // ------------------------------------------------------------------
  // Quick Actions
  // ------------------------------------------------------------------
  toggleQuickActions(): void {
    this.setState({ quickActionsOpen: !this.state.quickActionsOpen });
  }

  async startQuickScan(navigate: NavigateFunction): Promise<void> {
    // Navigate to junk cleaner with auto-scan flag
    // This will be handled by the router and Junk Cleaner page
    navigate('/junk-cleaner?autoScan=true');
  }

  // ------------------------------------------------------------------
  // Polling — adaptive based on page visibility and user activity
  // ------------------------------------------------------------------
  private liveMetricsPollActive = false;
  private visibilityHandler: (() => void) | null = null;

  private getLiveMetricsPollInterval(): number {
    if (typeof document !== 'undefined' && document.hidden) {
      return LIVE_METRICS_POLL_HIDDEN_INTERVAL_MS;
    }
    return LIVE_METRICS_POLL_INTERVAL_MS;
  }

  private startLiveMetricsPolling(): void {
    this.stopLiveMetricsPolling();
    this.liveMetricsPollActive = true;
    void this.loadLiveMetrics();

    const scheduleNext = () => {
      if (!this.liveMetricsPollActive) return;
      const interval = this.getLiveMetricsPollInterval();
      this.liveMetricsPollTimer = setTimeout(() => {
        void this.loadLiveMetrics().finally(() => scheduleNext());
      }, interval);
    };
    scheduleNext();

    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (!this.liveMetricsPollActive) return;
        if (this.liveMetricsPollTimer) {
          clearTimeout(this.liveMetricsPollTimer);
          this.liveMetricsPollTimer = null;
        }
        if (!document.hidden) {
          void this.loadLiveMetrics();
        }
        scheduleNext();
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private stopLiveMetricsPolling(): void {
    this.liveMetricsPollActive = false;
    if (this.liveMetricsPollTimer) {
      clearTimeout(this.liveMetricsPollTimer);
      this.liveMetricsPollTimer = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}
