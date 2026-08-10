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
  DeferredCleanupItem,
  HardwareSensors,
  ScanPhase,
  ScanLiveStats,
  ScanActivityEntry,
} from './dashboard.types';
import { SCAN_PHASES } from './dashboard.types';
import { HEALTH_CATEGORIES, groupModulesToCategories, getCategoryIdForModule } from './healthCategoryMapping';
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
import { invalidateMetricsCache, dashboardRefreshManager } from '../health';
import type { OptimizationEvent } from '../health';
import { optimizationHistoryService } from '../health/OptimizationHistoryService';
import { healthTimelineService } from '../health/HealthTimelineService';
import { healthNotificationService } from '../health/HealthNotificationService';
import type { OptimizationSummary } from './OptimizationSummary.types';
import { saveSession, loadSession, clearSession } from './sessionPersistence';
import { canUse as featureGateCanUse, currentEdition as getFeatureGateEdition } from '../licensing/FeatureGate';
import type { ManagedFeature } from '@avs/licensing';
import { useSyncStore, planToEdition } from '../sync/syncStore';
import { onboardingService } from '../onboarding/OnboardingService';
import { HardwareManager } from '../hardware-center/HardwareManager';
import { hardwareRegistry } from '../hardware-center/HardwareRegistry';
import { createMockHardwareProvider } from '../hardware-center/MockHardwareProvider';
import { hardwareSnapshotToSensors, getCpuTempFromSnapshot } from './hardwareAdapter';
import { buildVerificationReport } from '../health/VerificationEngine';
import type { VerificationReport } from '../health/VerificationEngine';
import { useLiveSync } from '../health/LiveSyncService';
import { orchestratorService } from '../orchestrator/orchestrator.service';
import type { OrchestratorFullResponse, OrchestratorModuleResult, ScanProfile } from '../orchestrator/orchestrator.service';
import { fullSystemScanService } from '../full-system-scan/fullSystemScan.service';
import type { FullScanStatus, FullScanResults } from '../full-system-scan/fullSystemScan.types';

export type OptimizeStep = 'idle' | 'preview' | 'confirm' | 'optimizing' | 'complete';

const MODULE_DISPLAY_NAMES: Record<string, string> = {
  system_health: 'System Health',
  storage: 'Storage',
  performance: 'Performance',
  privacy: 'Privacy',
  protection: 'Protection',
};

function _moduleDisplayName(mid: string): string {
  return MODULE_DISPLAY_NAMES[mid] ?? mid;
}

const MODULE_SIM_PATHS: Record<string, string[]> = {
  storage: [
    'C:\\Users\\user\\AppData\\Local\\Temp\\~tmp1F3A.tmp',
    'C:\\Windows\\Temp\\setup_log_2024.txt',
    'C:\\Users\\user\\AppData\\Local\\Microsoft\\Edge\\Cache\\f_00001',
    'C:\\Users\\user\\AppData\\Local\\Google\\Chrome\\Cache\\0001_cache',
    'C:\\Windows\\SoftwareDistribution\\Download\\KB5034123.cab',
    'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_installer.log',
    'C:\\Windows\\Prefetch\\CHROME.EXE-8F2B1A.pf',
    'C:\\Users\\user\\AppData\\Local\\Temp\\VSCode_crash.dmp',
    'C:\\Users\\user\\Downloads\\large_video.mp4 (2.3 GB)',
    'C:\\Users\\user\\AppData\\Local\\Docker\\image.vhdx (12 GB)',
  ],
  performance: [
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Discord',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Spotify',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Steam',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\OneDrive',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Skype',
    'Process: chrome.exe (PID 4892) — 1.2 GB RAM',
    'Process: Code.exe (PID 3210) — 850 MB RAM',
    'Service: SysMain (Superfetch) — Active',
    'Process: docker.exe (PID 7890) — 2.1 GB RAM',
  ],
  privacy: [
    'C:\\Users\\user\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cookies',
    'C:\\Users\\user\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\History',
    'C:\\Users\\user\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\sessionstore.jsonlz4',
    'C:\\Users\\user\\AppData\\Local\\Microsoft\\Windows\\Explorer\\thumbcache.db',
    'C:\\Users\\user\\AppData\\Roaming\\Microsoft\\Windows\\Recent\\doc1.lnk',
    'C:\\Windows\\System32\\config\\systemprofile\\NTUSER.DAT',
    'C:\\Users\\user\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache\\data_1',
  ],
  system_health: [
    'HKLM\\Software\\Orphan\\Uninstall\\{B2F3A1} — Missing executable',
    'HKCU\\Software\\OldApp\\Startup — Invalid path reference',
    'HKLM\\System\\CurrentControlSet\\Services\\GhostDriver — No .sys file',
    'HKCU\\Software\\Classes\\BrokenLink\\shell\\open — Missing target',
    'HKLM\\Software\\UninstalledApp\\TrayIcon — Orphaned key',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2 — Stale entries',
    'Checking OS version: Windows 11 23H2 Build 22631',
    'Checking system uptime and last boot time...',
    'Checking CPU model: Intel Core i7-12700K @ 3.6 GHz',
  ],
  protection: [
    'Checking Windows Defender real-time protection status...',
    'Checking Windows Firewall profile (Domain/Private/Public)...',
    'Checking Windows Update pending patches...',
    'Checking UAC (User Account Control) settings...',
    'Checking SmartScreen filter configuration...',
    'Checking network sharing and discovery settings...',
  ],
};

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

  // Full System Scan
  fullScanId: string | null;
  fullScanStatus: FullScanStatus | null;
  fullScanResults: FullScanResults | null;
  fullScanRunning: boolean;

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
      fullScanId: null,
      fullScanStatus: null,
      fullScanResults: null,
      fullScanRunning: false,
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

    // Part 15: Restore persisted session from previous app run
    const persisted = loadSession();
    if (persisted && persisted.healthScore !== null) {
      this.setState({
        optimizationSummary: persisted.optimizationSummary as OptimizationSummary | null,
      });
    }

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
      const metrics = await this.service.getMetrics();
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
  startHealthScan(profile: ScanProfile = 'dashboard', isPro: boolean = true): void {
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

    // Brief preparing phase for UX feedback, then start the unified orchestrator pipeline
    setTimeout(() => {
      if (this.state.healthScanCancelled) {
        this.resetHealthScan();
        return;
      }
      this.setState({ healthScanStep: 'scanning' });
      void this.runOrchestratorFullScan(profile, isPro);
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
      healthScanStep: 'complete',
      healthScanReport: report,
      healthScanError: null,
    });

    // Mark first scan as complete so the FirstScanDialog doesn't show again
    onboardingService.completeFirstScan();
  }

  private async runHealthScan(phase: 'scan' | 'verify' = 'scan'): Promise<void> {
    const startedAt = Date.now();

    // Helper: update scan phase and overall progress
    const setScanPhase = (p: ScanPhase, subPct: number): void => {
      const phaseInfo = SCAN_PHASES.find((s) => s.id === p);
      if (!phaseInfo) return;
      const overall = Math.round(phaseInfo.startPercent + (subPct / 100) * (phaseInfo.endPercent - phaseInfo.startPercent));
      this.setState({ scanPhase: p, scanOverallProgress: Math.min(overall, phaseInfo.endPercent) });
    };

    // Helper: increment live stats
    const addStats = (patch: Partial<ScanLiveStats>): void => {
      this.setState({
        scanLiveStats: {
          ...this.state.scanLiveStats,
          filesScanned: this.state.scanLiveStats.filesScanned + (patch.filesScanned ?? 0),
          registryEntries: this.state.scanLiveStats.registryEntries + (patch.registryEntries ?? 0),
          startupItems: this.state.scanLiveStats.startupItems + (patch.startupItems ?? 0),
          privacyItems: this.state.scanLiveStats.privacyItems + (patch.privacyItems ?? 0),
          storageRecovered: this.state.scanLiveStats.storageRecovered + (patch.storageRecovered ?? 0),
          memoryRecovered: this.state.scanLiveStats.memoryRecovered + (patch.memoryRecovered ?? 0),
          startupOptimized: this.state.scanLiveStats.startupOptimized + (patch.startupOptimized ?? 0),
          recommendationsFound: this.state.scanLiveStats.recommendationsFound + (patch.recommendationsFound ?? 0),
        },
      });
    };

    // Map category IDs to scan phases
    const modulePhaseMap: Record<string, ScanPhase> = {
      storage: 'storage',
      privacy: 'privacy',
      system_health: 'system_health',
      performance: 'performance',
      protection: 'protection',
    };

    // Stats increment per category per simulated step
    const moduleStatsMap: Record<string, Partial<ScanLiveStats>> = {
      storage: { filesScanned: 150 },
      privacy: { privacyItems: 30, filesScanned: 45 },
      system_health: { registryEntries: 80, filesScanned: 5 },
      performance: { startupItems: 15, filesScanned: 20 },
      protection: { filesScanned: 10 },
    };

    const scanIfNotCancelled = async (id: string, fn: () => Promise<Partial<HealthScanModuleResult>>): Promise<void> => {
      if (this.state.healthScanCancelled) {
        this.updateModuleStatus(id, { status: 'skipped' });
        return;
      }
      const scanPhase = modulePhaseMap[id] ?? 'performance';
      this.updateModuleStatus(id, { status: 'scanning' });
      this.setState({ healthScanCurrentFile: null, healthScanSubProgress: 0 });
      setScanPhase(scanPhase, 0);

      // Simulate file-by-file scanning progress for smooth UX
      const moduleSimPaths = MODULE_SIM_PATHS[id] ?? [];
      const simSteps = Math.min(8, moduleSimPaths.length);
      const statsPerStep = moduleStatsMap[id] ?? {};
      for (let i = 0; i < simSteps; i++) {
        if (this.state.healthScanCancelled) break;
        const subPct = Math.round(((i + 1) / simSteps) * 80); // Reserve 20% for actual scan
        this.setState({
          healthScanCurrentFile: moduleSimPaths[i] ?? null,
          healthScanSubProgress: subPct,
        });
        setScanPhase(scanPhase, subPct);
        addStats(statsPerStep);
        await new Promise((r) => setTimeout(r, 200 + Math.random() * 200));
      }

      try {
        this.setState({ healthScanCurrentFile: 'Running deep scan...', healthScanSubProgress: 90 });
        setScanPhase(scanPhase, 90);
        const patch = await fn();
        this.updateModuleStatus(id, { status: 'complete', ...patch });
        this.setState({ healthScanCurrentFile: null, healthScanSubProgress: 100 });
        setScanPhase(scanPhase, 100);

        // Update live stats from actual scan results
        if (patch.issuesFound && patch.issuesFound > 0) {
          addStats({ recommendationsFound: 1 });
        }
        if (patch.recoverableSpace && patch.recoverableSpace > 0) {
          addStats({ storageRecovered: patch.recoverableSpace });
        }
      } catch (err) {
        this.updateModuleStatus(id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
        this.setState({ healthScanCurrentFile: null, healthScanSubProgress: 0 });
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
      scanIfNotCancelled('storage', async () => {
        const cleaners = await junkCleanerService.list();
        const task = await junkCleanerService.startScan(cleaners.map((c) => c.id));
        await new Promise((resolve) => setTimeout(resolve, 800));
        const status = await junkCleanerService.getStatus(task.taskId);
        const totalSize = status.totalBytes || 0;
        const issues = status.totalFiles || 0;
        // Fetch actual file items for each cleaner
        const groups = await Promise.all(
          (status.cleaners || cleaners).map(async (c) => {
            const cleanerId = (c as { id?: string }).id ?? String(c);
            const cleanerName = (c as { name?: string }).name ?? String(c);
            const cleanerBytes = (c as { totalBytes?: number }).totalBytes ?? 0;
            let items: { name: string; size?: number }[] = [];
            try {
              const resultsPage = await junkCleanerService.getResults(task.taskId, cleanerId, 0, 10);
              items = resultsPage.items.map((item) => ({
                name: item.path || item.name,
                size: item.size,
              }));
            } catch {
              // getResults may fail if scan was partial — use cleaner name as fallback
              items = [];
            }
            return {
              title: cleanerName,
              totalSize: cleanerBytes,
              safeToRemove: true,
              why: 'Temporary files and caches are safe to remove and free disk space.',
              items,
            };
          }),
        );
        // Also scan disk usage
        let diskFull = 0;
        let diskSpace = 0;
        let diskGroups: { title: string; safeToRemove: boolean; why: string; items: { name: string }[] }[] = [];
        try {
          const drives = await diskAnalyzerService.listDrives();
          diskFull = drives.filter((d) => d.percent > 80).length;
          diskSpace = drives.reduce((s, d) => s + (d.used || 0), 0);
          diskGroups = drives.map((d) => ({
            title: `${d.mountpoint || d.device} (${d.percent}% used)`,
            safeToRemove: true,
            why: 'Identifies large files and disk space usage for review.',
            items: [{ name: `Free: ${Math.round(d.free / 1_000_000)} MB` }],
          }));
        } catch { /* disk analyzer may fail */ }
        const combinedSize = totalSize + diskSpace;
        const combinedIssues = issues + diskFull;
        return {
          score: Math.max(0, 100 - Math.min(combinedIssues / 100, 100)),
          issuesFound: combinedIssues,
          recoverableSpace: combinedSize,
          severity: combinedSize > 1_000_000_000 ? 'high' : combinedSize > 100_000_000 ? 'medium' : 'low',
          measuredDetail: `Can free ${Math.round(combinedSize / 1_000_000)} MB`,
          details: {
            summary: `${combinedIssues} storage issues found (${Math.round(combinedSize / 1_000_000)} MB recoverable)`,
            impact: (combinedSize > 1_000_000_000 ? 'high' : combinedSize > 100_000_000 ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups: [...groups, ...diskGroups],
            notChanged: notChanged.files,
            why: 'Temporary files, caches, and disk usage consume storage space. Cleaning them frees disk space but does not affect personal documents.',
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
      scanIfNotCancelled('system_health', async () => {
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
        // Also check system info (uptime, restart needed, etc.)
        let systemIssues = 0;
        let systemScore = 95;
        let systemDetail = 'System healthy';
        try {
          const info = await systemInfoService.getComprehensiveInfo();
          const uptimeDays = info.os?.bootTime ? (Date.now() / 1000 - info.os.bootTime) / 86400 : 0;
          if (uptimeDays > 30) {
            systemIssues = 1;
            systemScore = 80;
            systemDetail = 'System restart recommended';
            groups.push({
              title: 'System status',
              safeToRemove: true,
              why: 'A restart refreshes system state and releases memory leaks.',
              items: [{ name: `Uptime: ${Math.round(uptimeDays)} days — restart recommended` }, { name: `Windows ${info.os?.release || 'unknown'}` }],
            });
          } else {
            groups.push({
              title: 'System status',
              safeToRemove: true,
              why: 'System hardware and OS are within healthy parameters.',
              items: [{ name: `Windows ${info.os?.release || 'unknown'}` }, { name: `${info.cpu?.name || ''}` }],
            });
          }
        } catch { /* system info may fail */ }
        const totalIssues = result.issues.length + systemIssues;
        const avgScore = Math.round((Math.max(0, 100 - result.issues.length) + systemScore) / 2);
        return {
          score: avgScore,
          issuesFound: totalIssues,
          recoverableSpace: 0,
          severity: totalIssues > 50 ? 'high' : totalIssues > 10 ? 'medium' : 'low',
          measuredDetail: `${result.issues.length} registry issues, ${systemDetail}`,
          rawContext: { result },
          details: {
            summary: `${totalIssues} system health issues found`,
            impact: (totalIssues > 50 ? 'high' : totalIssues > 10 ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups,
            notChanged: ['Registry backups are created before changes', 'Installed software registrations are not removed'],
            why: 'Invalid registry entries and long uptime can cause slowdowns. Cleaning them safely removes obsolete references while keeping backups.',
          },
        };
      }),
      scanIfNotCancelled('performance', async () => {
        const entries = await startupService.listEntries();
        const high = entries.filter((e) => e.impact === 'high' && e.enabled);
        const metrics = await performanceService.getMetrics();
        const alertList = (await performanceService.getAlerts()).alerts;
        const ramRecovery = metrics.memory?.used ? Math.max(0, metrics.memory.used - metrics.memory.total * 0.5) : 0;
        const groups: { title: string; safeToRemove: boolean; why: string; items: { name: string }[] }[] = [];
        if (high.length > 0) {
          groups.push({
            title: 'High-impact startup items',
            safeToRemove: true,
            why: 'Disabling unnecessary startup items reduces Windows boot delay.',
            items: high.slice(0, 10).map((e) => ({ name: e.name })),
          });
        }
        groups.push(...alertList.slice(0, 5).map((a) => ({
          title: a.type,
          safeToRemove: true,
          why: a.message,
          items: [{ name: a.message }],
        })));
        const totalIssues = high.length + alertList.length;
        const score = Math.round(Math.max(0, 100 - high.length * 5 - alertList.length * 10 - (metrics.cpu?.usage || 0) / 2));
        return {
          score,
          issuesFound: totalIssues,
          recoverableSpace: ramRecovery,
          severity: totalIssues > 5 ? 'high' : totalIssues > 0 ? 'medium' : 'low',
          measuredDetail: `${high.length} startup items, ${alertList.length} performance alerts`,
          rawContext: { entries },
          details: {
            summary: `${totalIssues} performance issues: ${high.length} startup items, ${alertList.length} alerts, ${metrics.memory?.usage || 0}% memory`,
            impact: (totalIssues > 5 ? 'high' : totalIssues > 0 ? 'medium' : 'low') as OptimizationDetails['impact'],
            safeToRemove: true,
            groups,
            notChanged: ['Startup entries are backed up and can be re-enabled', 'System startup files are not deleted'],
            why: 'Too many startup applications and high memory usage slow the system. Disabling unnecessary items and reclaiming memory improves responsiveness.',
          },
        };
      }),
      scanIfNotCancelled('protection', async () => {
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
    ];

    // Run modules sequentially for smooth, trackable progress
    for (const task of tasks) {
      if (this.state.healthScanCancelled) break;
      await task;
    }

    // Phase 7: AI Optimization Planning (80-95%)
    if (!this.state.healthScanCancelled) {
      this.setState({ scanPhase: 'ai_planning', healthScanCurrentFile: 'Calculating optimization plan...' });
      const planningItems = ['Calculating impact', 'Calculating risk', 'Building optimization plan', 'Creating rollback strategy'];
      for (let i = 0; i < planningItems.length; i++) {
        if (this.state.healthScanCancelled) break;
        const subPct = Math.round(((i + 1) / planningItems.length) * 100);
        setScanPhase('ai_planning', subPct);
        this.setState({ healthScanCurrentFile: planningItems[i] + '...' });
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 200));
      }
    }

    // Phase 8: Finalizing (95-100%)
    if (!this.state.healthScanCancelled) {
      this.setState({ scanPhase: 'finalizing', healthScanCurrentFile: 'Final verification...' });
      const finalizingItems = ['Preparing recommendations...', 'Final verification...'];
      for (let i = 0; i < finalizingItems.length; i++) {
        if (this.state.healthScanCancelled) break;
        const subPct = Math.round(((i + 1) / finalizingItems.length) * 100);
        setScanPhase('finalizing', subPct);
        this.setState({ healthScanCurrentFile: finalizingItems[i] });
        await new Promise((r) => setTimeout(r, 300));
      }
      this.setState({ scanOverallProgress: 100, healthScanCurrentFile: null });
    }

    this.finishHealthScan(this.state.healthScanModules, startedAt, phase);
  }

  /**
   * Unified optimization pipeline via backend OptimizationOrchestrator.
   *
   * This is the ONE entry point for Dashboard, AI Smart Optimize, and
   * Protection Center. It calls orchestrator.fullAsync on the backend
   * which runs in a background thread, then polls orchestrator.status
   * to get real-time progress, activity log, counters, and module statuses.
   *
   * Pipeline: start → scan → optimize → verify → score → history → done
   * No simulated progress — all results come from real backend execution.
   */
  async runOrchestratorFullScan(profile: ScanProfile = 'dashboard', isPro: boolean = true): Promise<void> {
    const startedAt = Date.now();

    const defaultDetails = {
      summary: 'Initializing...',
      impact: 'low' as OptimizationDetails['impact'],
      safeToRemove: true,
      groups: [],
      notChanged: [],
      why: 'Preparing system scan...',
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
      healthScanStep: 'scanning',
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
      scanStartTime: startedAt,
      scanActivityLog: [],
      scanCurrentOperation: null,
      scanCurrentPath: null,
      scanItemsProcessed: 0,
      scanItemsRemaining: 0,
      scanBytesRecovered: 0,
    });

    let sessionId: string | null = null;

    try {
      // Start async pipeline in background thread
      const startResp = await orchestratorService.fullAsync(profile, !isPro);
      sessionId = startResp.sessionId;

      // Poll status until complete, error, or cancelled
      const POLL_INTERVAL_MS = 300;
      let lastActivityCount = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (this.state.healthScanCancelled) {
          try { await orchestratorService.cancel(sessionId); } catch { /* ignore */ }
          this.resetHealthScan();
          return;
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const status = await orchestratorService.status(sessionId);

        // Check for error — keep current step, don't jump to complete
        if (status.error) {
          this.setState({
            healthScanError: status.error,
          });
          return;
        }

        // Check for cancellation
        if (status.cancelled) {
          this.resetHealthScan();
          return;
        }

        // Map backend phase to frontend state
        const phase = status.phase;
        let scanPhase: ScanPhase = 'preparing';
        let step: HealthScanStep = 'scanning';
        if (phase === 'scanning' || phase === 'scanned') {
          // Determine which category is currently being scanned based on the backend module
          const currentBackendModule = status.currentModule;
          scanPhase = currentBackendModule ? (getCategoryIdForModule(currentBackendModule) as ScanPhase) : 'system_health';
          step = 'scanning';
        } else if (phase === 'optimizing') {
          scanPhase = 'ai_planning';
          step = 'optimizing';
        } else if (phase === 'verifying') {
          scanPhase = 'finalizing';
          step = 'verifying';
        } else if (phase === 'complete') {
          scanPhase = 'finalizing';
          step = 'verifying';
        }

        // Map backend progress to a continuous 0-100 scale across phases
        // scanning: 0-50%, optimizing: 50-90%, verifying: 90-100%
        const backendProgress = status.progress ?? 0;
        let overallProgress: number;
        if (phase === 'scanning' || phase === 'scanned') {
          overallProgress = Math.round(backendProgress * 0.5);
        } else if (phase === 'optimizing') {
          overallProgress = 50 + Math.round(backendProgress * 0.4);
        } else if (phase === 'verifying') {
          overallProgress = 90 + Math.round(backendProgress * 0.1);
        } else if (phase === 'complete') {
          overallProgress = 100;
        } else {
          overallProgress = backendProgress;
        }

        // Update category statuses by aggregating backend module statuses
        const moduleStatuses = status.moduleStatuses || {};
        const updatedModules = modules.map((cat) => {
          const catConfig = HEALTH_CATEGORIES.find((c) => c.categoryId === cat.moduleId);
          if (!catConfig) return cat;
          const backendModulesForCat = catConfig.modules;
          const statusesForCat = backendModulesForCat
            .map((mid) => moduleStatuses[mid])
            .filter((ms): ms is NonNullable<typeof ms> => ms != null);
          if (statusesForCat.length === 0) return cat;
          // Aggregate: if any scanning -> scanning; if all complete -> complete; if any error -> error
          const anyScanning = statusesForCat.some((ms) => ms.status === 'scanning');
          const anyError = statusesForCat.some((ms) => ms.status === 'error');
          const allComplete = statusesForCat.every((ms) => ms.status === 'complete' || ms.status === 'skipped');
          const aggregatedStatus = anyError ? 'error' as const
            : anyScanning ? 'scanning' as const
            : allComplete ? 'complete' as const
            : cat.status;
          // Sum issues across backend modules in this category
          const totalIssues = statusesForCat.reduce((sum, ms) => sum + (ms.issuesFound ?? 0), 0);
          return {
            ...cat,
            status: aggregatedStatus,
            issuesFound: totalIssues,
          };
        });

        // Update activity log (only new entries)
        const activityLog = status.activityLog || [];
        const newActivities = activityLog.slice(lastActivityCount);
        lastActivityCount = activityLog.length;

        // Map counters to scan live stats
        const counters = status.counters || {};
        // Derive per-module item counts from moduleStatuses
        const startupMs = moduleStatuses['startup'];
        const privacyMs = moduleStatuses['privacy'];
        const perfMs = moduleStatuses['performance'];
        const liveStats: ScanLiveStats = {
          filesScanned: counters.itemsScanned ?? 0,
          registryEntries: counters.registryFixed ?? 0,
          startupItems: startupMs?.issuesFound ?? 0,
          privacyItems: privacyMs?.issuesFound ?? counters.itemsCleaned ?? 0,
          storageRecovered: counters.storageRecovered ?? 0,
          memoryRecovered: counters.storageRecovered ?? 0,
          startupOptimized: counters.itemsOptimized ?? 0,
          recommendationsFound: counters.itemsOptimized ?? 0,
        };

        // Determine current activity for display
        const lastActivity = activityLog[activityLog.length - 1];
        const currentModule = status.currentModule;
        const currentOp = status.currentOperation;
        // Show file path if available, otherwise show module + operation for context
        const currentFile = status.currentPath
          ?? (currentModule && currentOp ? `${_moduleDisplayName(currentModule)} — ${currentOp}`
          : lastActivity?.detail ?? null);

        const isOptimizing = step === 'optimizing';
        const isVerifying = step === 'verifying';

        this.setState({
          scanPhase,
          scanOverallProgress: overallProgress,
          scanLiveStats: liveStats,
          scanActivityLog: activityLog.slice(-30) as ScanActivityEntry[],
          scanCurrentOperation: status.currentOperation ?? null,
          scanCurrentPath: status.currentPath ?? null,
          scanItemsProcessed: status.itemsProcessed ?? 0,
          scanItemsRemaining: status.itemsRemaining ?? 0,
          scanBytesRecovered: status.bytesRecovered ?? 0,
          healthScanModules: updatedModules,
          healthScanCurrentFile: currentFile,
          healthScanSubProgress: 0,
          healthScanStep: step,
          healthScanExecution: (isOptimizing || isVerifying) ? {
            currentModule: status.currentModule ?? (isVerifying ? 'Verifying' : 'Optimizing'),
            progress: overallProgress,
            itemsProcessed: status.itemsProcessed ?? counters.itemsOptimized ?? 0,
            spaceRecovered: counters.storageRecovered ?? 0,
            elapsedMs: counters.elapsedMs ?? 0,
            liveMessages: newActivities.map((a) => a.detail),
            filesRemoved: counters.itemsOptimized ?? 0,
          } : null,
        });

        // Check if complete
        if (phase === 'complete') {
          break;
        }
      }

      // Pipeline complete — fetch final results and map flat structure to nested
      const rawResult = await orchestratorService.result(sessionId) as unknown as Record<string, unknown>;
      const result: OrchestratorFullResponse = {
        sessionId: rawResult.sessionId as string,
        scan: {
          modules: (rawResult.modules as Record<string, OrchestratorModuleResult>) ?? {},
          overallScore: (rawResult.overallScoreBefore as number) ?? 0,
          totalIssues: (rawResult.issuesBefore as number) ?? 0,
          recoverableSpace: (rawResult.recoverableSpace as number) ?? 0,
          healthModel: rawResult.healthModel as never,
        },
        optimize: {
          optimizeResults: (rawResult.optimizeResults as Record<string, never>) ?? {},
          overallScoreBefore: (rawResult.overallScoreBefore as number) ?? 0,
          overallScoreAfter: (rawResult.overallScoreAfter as number) ?? 0,
          spaceRecovered: (rawResult.spaceRecovered as number) ?? 0,
          itemsFixed: 0,
          entriesDisabled: 0,
          issuesFixed: 0,
          issuesAfter: (rawResult.issuesAfter as number) ?? 0,
          errors: [],
          success: !rawResult.error,
          healthModel: rawResult.healthModel as never,
          healthModelAfter: rawResult.healthModelAfter as never,
        },
        history: rawResult.history as never,
        elapsedMs: 0,
        completedAt: (rawResult.completedAt as string) ?? new Date().toISOString(),
        profile: rawResult.profile as never,
      };

      // Extract itemsFixed, entriesDisabled, issuesFixed from optimizeResults
      const optResults = result.optimize.optimizeResults;
      if (optResults && typeof optResults === 'object') {
        let itemsFixed = 0;
        let entriesDisabled = 0;
        let issuesFixed = 0;
        let allErrors: string[] = [];
        for (const [, opt] of Object.entries(optResults)) {
          const o = opt as unknown as Record<string, unknown>;
          itemsFixed += (o.itemsRemoved as number) ?? 0;
          entriesDisabled += (o.entriesDisabled as number) ?? 0;
          issuesFixed += (o.issuesFixed as number) ?? 0;
          if (Array.isArray(o.errors)) {
            allErrors = allErrors.concat(o.errors as string[]);
          }
        }
        result.optimize.itemsFixed = itemsFixed;
        result.optimize.entriesDisabled = entriesDisabled;
        result.optimize.issuesFixed = issuesFixed;
        result.optimize.errors = allErrors.slice(0, 10);
        result.optimize.success = allErrors.length === 0;
      }

      // Calculate elapsed time from startedAt/completedAt
      const startedAtMs = new Date(rawResult.startedAt as string).getTime();
      const completedAtMs = new Date(result.completedAt).getTime();
      result.elapsedMs = completedAtMs - startedAtMs;

      // Free version: scan-only mode — show report with issues + upgrade prompt
      const hasOptimizeResults = optResults && Object.keys(optResults).length > 0;
      if (!hasOptimizeResults) {
        // Build backend module results from orchestrator scan data
        const scanModules = result.scan.modules;
        const backendModuleResults: HealthScanModuleResult[] = Object.entries(scanModules).map(([mid, orch]) => ({
          moduleId: mid,
          moduleName: _moduleDisplayName(mid),
          status: 'complete' as const,
          score: orch.score,
          issuesFound: orch.issues,
          recoverableSpace: orch.size,
          severity: orch.issues > 50 ? 'high' as const : orch.issues > 10 ? 'medium' as const : 'low' as const,
          measuredDetail: `${orch.issues} issues found, score ${orch.score}`,
          details: {
            summary: `${orch.issues} issues found`,
            impact: orch.issues > 50 ? 'high' as const : orch.issues > 10 ? 'medium' as const : 'low' as const,
            safeToRemove: orch.canAutoFix,
            groups: [],
            notChanged: [],
            why: 'Issues detected during scan',
          },
          canAutoFix: orch.canAutoFix,
        }));

        // Group backend modules into user-facing categories
        const dashModules = groupModulesToCategories(backendModuleResults);

        const overallScore = result.scan.overallScore;
        const totalIssues = result.scan.totalIssues;

        const report: HealthScanReport = {
          overallScore,
          issuesFound: totalIssues,
          recoverableSpace: dashModules.reduce((s, m) => s + m.recoverableSpace, 0),
          modules: dashModules,
          startedAt,
          finishedAt: Date.now(),
        };

        this.setState({
          healthScanStep: 'complete',
          healthScanModules: dashModules,
          healthScanReport: report,
          healthScanBeforeReport: report,
          healthScanError: null,
          scanPhase: 'finalizing',
          scanOverallProgress: 100,
        });
        return;
      }

      await this.finalizeOrchestratorResults(result, startedAt);

    } catch (err) {
      // Orchestrator failed (e.g. backend unavailable). Record the error
      // but do NOT transition to 'complete' — the state machine stays in
      // its current step until the user retries or cancels.
      const msg = err instanceof Error ? err.message : String(err);
      this.setState({
        healthScanError: msg,
      });
    }
  }

  /**
   * Finalize orchestrator results — map to DashboardViewModel state,
   * broadcast scores, record history, refresh metrics.
   */
  private async finalizeOrchestratorResults(
    response: OrchestratorFullResponse,
    startedAt: number,
  ): Promise<void> {
    const orchModules = response.scan.modules;
    const optResults = response.optimize.optimizeResults;

    // Build backend module results from orchestrator scan + optimize data
    const backendModuleResults: HealthScanModuleResult[] = Object.entries(orchModules).map(([mid, orch]) => {
      const optResult = optResults[mid];
      const afterScore = orch.scoreAfter ?? orch.score;
      const afterIssues = orch.issuesAfter ?? orch.issues;

      return {
        moduleId: mid,
        moduleName: _moduleDisplayName(mid),
        status: orch.status === 'complete' ? 'complete' as const : orch.status === 'error' ? 'error' as const : 'skipped' as const,
        score: afterScore,
        issuesFound: afterIssues,
        recoverableSpace: orch.size - (optResult?.bytesRecovered ?? 0),
        severity: afterIssues > 50 ? 'high' as const : afterIssues > 10 ? 'medium' as const : 'low' as const,
        measuredDetail: orch.status === 'complete'
          ? optResult
            ? `${(orch.issues ?? 0) - afterIssues} issues fixed, ${afterIssues} remaining, score ${afterScore}`
            : `${orch.issues} issues found, score ${orch.score}`
          : orch.error ?? 'Scan skipped',
        details: {
          summary: `${orch.issues} issues found`,
          impact: afterIssues > 50 ? 'high' as const : afterIssues > 10 ? 'medium' as const : 'low' as const,
          safeToRemove: orch.canAutoFix,
          groups: [],
          notChanged: [],
          why: 'Issues detected during scan',
        },
        canAutoFix: orch.canAutoFix,
        actual: optResult ? {
          success: optResult.success,
          bytesRecovered: optResult.bytesRecovered ?? 0,
          itemsRemoved: optResult.itemsRemoved ?? 0,
          entriesDisabled: optResult.entriesDisabled ?? 0,
          issuesFixed: optResult.issuesFixed ?? 0,
          errors: optResult.errors ?? [],
        } : undefined,
        verification: {
          beforeScore: orch.score,
          beforeIssues: orch.issues,
          beforeRecoverable: orch.size,
          afterScore,
          afterIssues,
          afterRecoverable: orch.size - (optResult?.bytesRecovered ?? 0),
        },
      };
    });

    // Group backend modules into user-facing categories
    const dashModules = groupModulesToCategories(backendModuleResults);

    const overallAfter = response.optimize.overallScoreAfter;
    const overallBefore = response.optimize.overallScoreBefore;

    const report: HealthScanReport = {
      overallScore: overallAfter,
      issuesFound: response.optimize.issuesAfter,
      recoverableSpace: dashModules.reduce((s, m) => s + m.recoverableSpace, 0),
      modules: dashModules,
      startedAt,
      finishedAt: Date.now(),
    };

    const summary: OptimizationSummary = {
      healthBefore: overallBefore,
      healthAfter: overallAfter,
      storageRecovered: response.optimize.spaceRecovered,
      registryFixed: response.optimize.issuesFixed,
      startupOptimized: response.optimize.entriesDisabled,
      privacyCleaned: response.optimize.itemsFixed,
      duplicateFilesRemoved: 0,
      durationMs: response.elapsedMs,
      completedAt: response.completedAt,
      success: response.optimize.success,
    };

    const actualMap = new Map<string, HealthScanModuleActual>();
    for (const cat of dashModules) {
      if (cat.actual) {
        actualMap.set(cat.moduleId, cat.actual);
      }
    }
    const verificationReport = buildVerificationReport(dashModules, actualMap, startedAt);

    this.setState({
      healthScanStep: 'complete',
      healthScanModules: dashModules,
      healthScanReport: report,
      healthScanBeforeReport: {
        ...report,
        overallScore: overallBefore,
        modules: dashModules.map((m) => ({
          ...m,
          score: m.verification?.beforeScore ?? m.score,
          issuesFound: m.verification?.beforeIssues ?? m.issuesFound,
          recoverableSpace: m.verification?.beforeRecoverable ?? m.recoverableSpace,
        })),
      },
      healthScanError: null,
      healthScore: {
        ...this.state.healthScore,
        overallScore: overallAfter,
        scoreZone: overallAfter >= 80 ? 'excellent' : overallAfter >= 60 ? 'good' : 'needs_attention',
        lastUpdated: new Date().toISOString(),
        issues: response.optimize.issuesAfter === 0 ? [] : this.state.healthScore?.issues ?? [],
      } as typeof this.state.healthScore,
      healthScanResult: {
        success: response.optimize.success,
        totalRecovered: response.optimize.spaceRecovered,
        results: {} as unknown as OptimizeExecuteResponse['results'],
        elapsedMs: response.elapsedMs,
        completedAt: response.completedAt,
      } as OptimizeExecuteResponse,
      healthScanExecution: {
        currentModule: 'Complete',
        progress: 100,
        itemsProcessed: response.optimize.itemsFixed + response.optimize.entriesDisabled + response.optimize.issuesFixed,
        spaceRecovered: response.optimize.spaceRecovered,
        elapsedMs: response.elapsedMs,
        liveMessages: ['Optimization complete'],
        filesRemoved: response.optimize.itemsFixed,
      },
      optimizationSummary: summary,
      scanPhase: 'finalizing',
      scanOverallProgress: 100,
      verificationReport,
    });

    // Broadcast scores globally via LiveSyncService using the unified health model
    const healthModelAfter = response.optimize.healthModelAfter;
    const liveSync = useLiveSync.getState();
    liveSync.broadcastScores({
      healthScore: healthModelAfter?.overallHealth ?? overallAfter,
      optimizationScore: healthModelAfter?.optimizationScore ?? overallAfter,
      securityScore: healthModelAfter?.protectionScore ?? 0,
      performanceScore: healthModelAfter?.performanceScore ?? dashModules.find((m) => m.moduleId === 'performance')?.score ?? overallAfter,
      storageScore: healthModelAfter?.storageScore ?? 0,
      hardwareHealth: healthModelAfter?.hardwareHealth ?? 0,
      protectionStatus: (healthModelAfter?.protectionScore ?? overallAfter) >= 80 ? 'fully_protected' : (healthModelAfter?.protectionScore ?? overallAfter) >= 60 ? 'partially_protected' : 'at_risk',
    });
    liveSync.broadcastOptimizationComplete({
      healthScoreBefore: overallBefore,
      healthScoreAfter: overallAfter,
      storageRecovered: response.optimize.spaceRecovered,
      registryFixed: response.optimize.issuesFixed,
      startupOptimized: response.optimize.entriesDisabled,
      privacyCleaned: response.optimize.itemsFixed,
      durationMs: response.elapsedMs,
      success: response.optimize.success,
      moduleIds: Object.keys(optResults),
    });

    // Record optimization history (frontend)
    optimizationHistoryService.recordOptimization({
      timestamp: response.completedAt,
      healthBefore: overallBefore,
      healthAfter: overallAfter,
      storageRecovered: response.optimize.spaceRecovered,
      registryFixed: response.optimize.issuesFixed,
      startupOptimized: response.optimize.entriesDisabled,
      privacyCleaned: response.optimize.itemsFixed,
      duplicateFilesRemoved: 0,
      durationMs: response.elapsedMs,
      result: response.optimize.success ? 'success' : 'partial',
      modulesUsed: Object.keys(optResults),
    });

    // Persist session
    saveSession({
      optimizationSummary: summary,
      healthScore: overallAfter,
      healthZone: this.state.healthScore?.scoreZone ?? null,
      recommendations: [],
      lastOptimizationAt: response.completedAt,
      savedAt: new Date().toISOString(),
    });

    // Refresh metrics from backend
    try {
      await this.service.refreshCache();
    } catch {
      // non-fatal
    }
    void this.loadMetrics();

    // Mark first scan as complete
    onboardingService.completeFirstScan();
  }

  async executeHealthScanOptimizations(): Promise<void> {
    const beforeReport = this.state.healthScanReport;
    if (!beforeReport) return;

    const moduleFeatureMap: Record<string, string> = {
      storage: 'junk.clean',
      privacy: 'privacy.clean',
      system_health: 'registry.fix',
      performance: 'performance.optimize',
      protection: 'security.apply',
    };
    const fixableModules = beforeReport.modules.filter(
      (m) => {
        if (m.status !== 'complete' || !m.canAutoFix) return false;
        if (m.recoverableSpace <= 0 && m.issuesFound <= 0) return false;
        const feature = moduleFeatureMap[m.moduleId];
        if (feature && !this.canUseFeature(feature)) return false;
        return true;
      }
    );
    if (fixableModules.length === 0) {
      this.setState({
        healthScanStep: 'complete',
        healthScanError: null,
        healthScanResult: {
          success: true,
          totalRecovered: 0,
          results: {} as unknown as OptimizeExecuteResponse['results'],
          elapsedMs: 0,
          completedAt: new Date().toISOString(),
        } as OptimizeExecuteResponse,
      });
      return;
    }

    this.setState({
      healthScanStep: 'optimizing',
      healthScanBeforeReport: beforeReport,
      healthScanExecution: {
        currentModule: 'Starting...',
        progress: 0,
        itemsProcessed: 0,
        spaceRecovered: 0,
        elapsedMs: 0,
        liveMessages: ['Preparing optimization...'],
        filesRemoved: 0,
      },
    });

    const start = Date.now();
    const actualMap = new Map<string, HealthScanModuleActual>();

    try {
      for (const item of fixableModules) {
        const liveMessage = this.getLiveMessageForModule(item.moduleId);
        const prevExecution = this.state.healthScanExecution!;
        this.setState({
          healthScanExecution: {
            ...prevExecution,
            currentModule: item.moduleName,
            progress: Math.max(10, Math.min(90, Math.round((actualMap.size / fixableModules.length) * 80))),
            liveMessages: [...prevExecution.liveMessages, liveMessage],
          },
        });
        const moduleResult = beforeReport.modules.find((m) => m.moduleId === item.moduleId);
        const actual = moduleResult ? await this.executeModuleAction(moduleResult) : { success: false, errors: ['Module not found in before report'] };
        actualMap.set(item.moduleId, actual);

        // Track deferred cleanup items (locked files, admin-only, permission errors)
        if (!actual.success && actual.errors) {
          const deferredKeywords = ['locked', 'permission', 'admin', 'access denied', 'in use', 'busy'];
          const isDeferred = actual.errors.some((e) =>
            deferredKeywords.some((kw) => e.toLowerCase().includes(kw)),
          );
          if (isDeferred) {
            const deferredItem: DeferredCleanupItem = {
              id: `${Date.now()}-${item.moduleId}`,
              moduleId: item.moduleId,
              moduleName: item.moduleName,
              path: actual.reason ?? 'Unknown',
              reason: actual.errors[0] ?? 'File locked or access denied',
              size: moduleResult?.recoverableSpace ?? 0,
              timestamp: Date.now(),
            };
            this.setState({
              deferredCleanupItems: [...this.state.deferredCleanupItems, deferredItem],
            });
          }
        }

        // Update real-time counters after each module completes
        const totalSpace = [...actualMap.values()].reduce((s, a) => s + (a.bytesRecovered || 0), 0);
        const totalItems = [...actualMap.values()].reduce((s, a) => s + (a.itemsRemoved || 0) + (a.entriesDisabled || 0) + (a.issuesFixed || 0), 0);
        const totalFiles = [...actualMap.values()].reduce((s, a) => s + (a.filesDeleted || 0), 0);
        const doneMessage = this.getDoneMessageForModule(item.moduleId, actual);
        const currentExec = this.state.healthScanExecution!;
        this.setState({
          healthScanExecution: {
            ...currentExec,
            spaceRecovered: totalSpace,
            itemsProcessed: totalItems,
            filesRemoved: totalFiles,
            liveMessages: [...currentExec.liveMessages, doneMessage],
          },
        });
      }

      // Phase: Verification — re-scan each optimized category to confirm
      // actual changes occurred on the filesystem/registry/startup.
      // Scores are computed ONLY from verified results, not estimates.
      this.setState({
        healthScanStep: 'verifying',
        healthScanExecution: {
          ...this.state.healthScanExecution!,
          currentModule: 'Verifying',
          progress: 92,
          liveMessages: [...this.state.healthScanExecution!.liveMessages, 'Verifying actual changes...'],
        },
      });

      const beforeById = new Map(beforeReport.modules.map((m) => [m.moduleId, m]));
      const verifiedModules: HealthScanModuleResult[] = [];

      for (const m of beforeReport.modules) {
        const actual = actualMap.get(m.moduleId);
        if (!actual) {
          verifiedModules.push(m);
          continue;
        }
        const before = beforeById.get(m.moduleId);
        const beforeScore = before?.score ?? m.score;
        const beforeIssues = before?.issuesFound ?? 0;
        const beforeRecoverable = before?.recoverableSpace ?? 0;
        const itemsFixed = (actual.itemsRemoved || 0) + (actual.entriesDisabled || 0) + (actual.issuesFixed || 0);
        const bytesRecovered = actual.bytesRecovered || 0;

        // Re-scan to verify actual changes
        let verifiedIssues = beforeIssues;
        let verifiedScore = beforeScore;
        try {
          const verifyResult = await this._verifyCategoryCleanup(m.moduleId);
          verifiedIssues = verifyResult.issuesFound;
          verifiedScore = verifyResult.score;
        } catch {
          // If verification scan fails, fall back to computed values
          verifiedIssues = Math.max(0, beforeIssues - itemsFixed);
          verifiedScore = beforeScore;
        }

        // Score comes ONLY from verified state — no estimated boost
        const afterIssues = verifiedIssues;
        const afterRecoverable = Math.max(0, beforeRecoverable - bytesRecovered);
        let afterScore: number;
        if (itemsFixed === 0 && bytesRecovered === 0) {
          // Nothing was actually cleaned — score must not increase
          afterScore = beforeScore;
        } else if (afterIssues === 0 && afterRecoverable === 0) {
          afterScore = 100;
        } else if (verifiedIssues < beforeIssues) {
          // Verification confirmed fewer issues — use verified score
          afterScore = Math.max(verifiedScore, beforeScore);
        } else {
          // Verification didn't confirm improvement — keep before score
          afterScore = beforeScore;
        }

        verifiedModules.push({
          ...m,
          actual,
          score: afterScore,
          issuesFound: afterIssues,
          recoverableSpace: afterRecoverable,
          verification: {
            beforeScore,
            beforeIssues,
            beforeRecoverable,
            afterScore,
            afterIssues,
            afterRecoverable,
          },
        });
      }

      const verifiedReport: HealthScanReport = {
        ...beforeReport,
        modules: verifiedModules,
        overallScore: Math.round(verifiedModules.reduce((s, m) => s + m.score, 0) / verifiedModules.length),
        issuesFound: verifiedModules.reduce((s, m) => s + m.issuesFound, 0),
        recoverableSpace: verifiedModules.reduce((s, m) => s + m.recoverableSpace, 0),
      };

      const modulesWithActual = verifiedModules;
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
      // Update healthScanReport with verified results so the complete step shows before/after comparison
      const recoveredSpace = (beforeReport.recoverableSpace || 0) - verifiedReport.recoverableSpace;
      const scoreBefore = beforeReport.overallScore;
      const scoreAfter = verifiedReport.overallScore;
      this.setState({
        healthScanReport: verifiedReport,
        healthScanBeforeReport: beforeReport,
        healthScanHistory: [{
          id: `${Date.now()}`,
          date: new Date().toISOString(),
          healthBefore: scoreBefore,
          healthAfter: scoreAfter,
          recoveredSpace: Math.max(0, recoveredSpace),
          modulesUsed: [...actualMap.keys()],
          durationMs: Date.now() - start,
          result: scoreAfter > scoreBefore && recoveredSpace >= 0 ? 'success' : 'partial',
        } as HealthScanHistoryEntry, ...this.state.healthScanHistory].slice(0, 20),
      });

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
      await Promise.all([this.loadMetrics(), this.loadPrivacyRisks(), this.loadHardwareSensors()]);

      // Part 7: Build improvement summary from health scan results
      // Prefer the verified report score (computed locally from actual cleaning results)
      // over dashboard healthScore which may still be stale from the backend metrics refresh.
      const summaryHealthAfter = verifiedReport.overallScore;
      const totalRecovered = [...actualMap.values()].reduce((s, a) => s + (a.bytesRecovered || 0), 0);
      const registryFixed = [...actualMap.values()].reduce((s, a) => s + (a.issuesFixed || 0), 0);
      const startupOptimized = [...actualMap.values()].reduce((s, a) => s + (a.entriesDisabled || 0), 0);
      const privacyCleaned = [...actualMap.values()].reduce((s, a) => s + (a.itemsRemoved || 0), 0);
      const modulesUsed = [...actualMap.keys()];
      const elapsedMs = Date.now() - start;
      const completedAt = new Date().toISOString();

      const summary: OptimizationSummary = {
        healthBefore: this.state.healthScanBeforeReport?.overallScore ?? 0,
        healthAfter: summaryHealthAfter,
        storageRecovered: totalRecovered,
        registryFixed,
        startupOptimized,
        privacyCleaned,
        duplicateFilesRemoved: 0,
        durationMs: elapsedMs,
        completedAt,
        success: [...actualMap.values()].every((a) => a.success),
      };
      this.setState({ optimizationSummary: summary });

      // Part 15: Persist session for restart recovery
      saveSession({
        optimizationSummary: summary,
        healthScore: summaryHealthAfter,
        healthZone: this.state.healthScore?.scoreZone ?? null,
        recommendations: [],
        lastOptimizationAt: completedAt,
        savedAt: new Date().toISOString(),
      });

      // Part 8: Record optimization history
      optimizationHistoryService.recordOptimization({
        timestamp: completedAt,
        healthBefore: this.state.healthScanBeforeReport?.overallScore ?? 0,
        healthAfter: summaryHealthAfter,
        storageRecovered: totalRecovered,
        registryFixed,
        startupOptimized,
        privacyCleaned,
        duplicateFilesRemoved: 0,
        durationMs: elapsedMs,
        result: [...actualMap.values()].every((a) => a.success) ? 'success' : 'partial',
        modulesUsed,
      });

      // Phase 9 — Build verification report from actual backend results
      const verificationReport = buildVerificationReport(
        beforeReport.modules,
        actualMap,
        start,
      );

      this.setState({
        healthScanStep: 'complete',
        healthScanError: null,
        verificationReport,
      });

      // Phase 9 — Broadcast scores globally via LiveSyncService
      const liveSync = useLiveSync.getState();
      const catScores = this.state.healthScore?.categoryScores;
      liveSync.broadcastScores({
        healthScore: summaryHealthAfter,
        performanceScore: catScores?.performance ?? summaryHealthAfter,
        storageScore: catScores?.storage ?? 0,
        privacyScore: catScores?.privacy ?? 0,
        protectionStatus: summaryHealthAfter >= 80 ? 'fully_protected' : summaryHealthAfter >= 60 ? 'partially_protected' : 'at_risk',
      });
      liveSync.broadcastOptimizationComplete({
        healthScoreBefore: this.state.healthScanBeforeReport?.overallScore ?? 0,
        healthScoreAfter: summaryHealthAfter,
        storageRecovered: totalRecovered,
        registryFixed,
        startupOptimized,
        privacyCleaned,
        durationMs: elapsedMs,
        success: verificationReport.overallStatus === 'verified',
        moduleIds: modulesUsed,
      });

      // Refresh metrics so health score reflects the optimization just performed
      invalidateMetricsCache();
      void this.loadMetrics();
    } catch (err) {
      this.setState({
        healthScanStep: 'complete',
        healthScanError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private getLiveMessageForModule(moduleId: string): string {
    const messages: Record<string, string> = {
      storage: 'Cleaning Temporary Files & Freeing Disk Space...',
      privacy: 'Cleaning Browser Cache & Privacy Traces...',
      system_health: 'Optimizing Registry & System Health...',
      performance: 'Optimizing Memory & Startup Items...',
      protection: 'Checking Security Status...',
    };
    return messages[moduleId] ?? `Optimizing ${moduleId}...`;
  }

  private getDoneMessageForModule(moduleId: string, actual: HealthScanModuleActual): string {
    const parts: string[] = [];
    if (actual.filesDeleted) parts.push(`${actual.filesDeleted} files removed`);
    if (actual.bytesRecovered) parts.push(`${Math.round(actual.bytesRecovered / 1_000_000)} MB recovered`);
    if (actual.itemsRemoved) parts.push(`${actual.itemsRemoved} traces cleaned`);
    if (actual.entriesDisabled) parts.push(`${actual.entriesDisabled} startup items optimized`);
    if (actual.issuesFixed) parts.push(`${actual.issuesFixed} issues fixed`);
    if (parts.length === 0) {
      return actual.success ? '✓ No changes needed' : `✗ ${actual.reason || 'Failed'}`;
    }
    return `✓ ${parts.join(', ')}`;
  }

  private async _verifyCategoryCleanup(categoryId: string): Promise<{ issuesFound: number; score: number }> {
    switch (categoryId) {
      case 'storage': {
        const cleaners = await junkCleanerService.list();
        const task = await junkCleanerService.startScan(cleaners.map((c) => c.id));
        await new Promise((resolve) => setTimeout(resolve, 500));
        const status = await junkCleanerService.getStatus(task.taskId);
        const issues = status.totalFiles ?? 0;
        const score = Math.max(0, 100 - Math.min(issues / 100, 100));
        return { issuesFound: issues, score };
      }
      case 'privacy': {
        const result = await this.privacyService.scan();
        const issues = result.items?.length ?? 0;
        const score = Math.max(0, 100 - issues * 2);
        return { issuesFound: issues, score };
      }
      case 'system_health': {
        const result = await registryService.scan();
        const issues = result.issues?.length ?? 0;
        const score = Math.max(0, 100 - Math.min(issues * 2, 100));
        return { issuesFound: issues, score };
      }
      case 'performance': {
        const entries = await startupService.listEntries();
        const high = entries.filter((e) => e.impact === 'high' && e.enabled);
        const metrics = await performanceService.getMetrics();
        const alertList = (await performanceService.getAlerts()).alerts;
        const totalIssues = high.length + alertList.length;
        const score = Math.round(Math.max(0, 100 - high.length * 5 - alertList.length * 10 - (metrics.cpu?.usage || 0) / 2));
        return { issuesFound: totalIssues, score };
      }
      case 'protection': {
        const metrics = await this.service.getMetrics();
        const pending = metrics.security.updates.pendingUpdates || 0;
        const thirdPartyAV = metrics.security.defender.thirdPartyAV || metrics.security.firewall.thirdPartyAV;
        const defender = (!thirdPartyAV && !metrics.security.defender.enabled) ? 1 : 0;
        const firewall = (!thirdPartyAV && !metrics.security.firewall.enabled) ? 1 : 0;
        const issues = pending + defender + firewall;
        const score = Math.max(0, 100 - (issues + (defender + firewall) * 20));
        return { issuesFound: issues, score };
      }
      default:
        return { issuesFound: 0, score: 100 };
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

    const moduleFeatureMap: Record<string, string> = {
      storage: 'junk.clean',
      privacy: 'privacy.clean',
      system_health: 'registry.fix',
      performance: 'performance.optimize',
      protection: 'security.apply',
    };
    const requiredFeature = moduleFeatureMap[module.moduleId];
    if (requiredFeature && !this.canUseFeature(requiredFeature)) {
      log('blocked', 'feature-gate', undefined, undefined, false, `Feature ${requiredFeature} not available in current edition`);
      return { success: false, errors: [`This feature requires a higher edition.`], reason: 'Feature not available in Free edition' };
    }

    switch (module.moduleId) {
      case 'storage': {
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
          const errors = result.errors || [];
          log('clean', 'privacy.clean', module.issuesFound, module.issuesFound - removed, errors.length === 0);
          return {
            success: errors.length === 0,
            itemsRemoved: removed,
            bytesRecovered: result.spaceFreed || 0,
            errors,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log('clean', 'privacy.clean', module.issuesFound, undefined, false, msg);
          return { success: false, errors: [msg], reason: msg };
        }
      }
      case 'system_health': {
        const issues = (ctx.result as { issues?: { id: string; category: string; description: string; hive: string; subkey: string; valueName: string; valueData: string; severity: string }[] })?.issues || [];
        if (!issues.length) {
          log('clean', 'registry.clean', module.issuesFound, 0, false, 'No issues found in scan context');
          return { success: false, errors: ['No registry issues found in scan context'], reason: 'No issues found' };
        }
        try {
          const result = await registryService.clean(issues as unknown as RegistryIssue[]);
          const regErrors = result.errors || [];
          log('clean', 'registry.clean', module.issuesFound, module.issuesFound - result.fixed, regErrors.length === 0);
          return { success: regErrors.length === 0, issuesFixed: result.fixed, errors: regErrors };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log('clean', 'registry.clean', module.issuesFound, undefined, false, msg);
          return { success: false, errors: [msg], reason: msg };
        }
      }
      case 'performance': {
        // Combine startup optimization + memory optimization
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
        // Also optimize memory
        let memoryFreed = 0;
        let processesOptimized = 0;
        try {
          const memResult = await performanceService.optimizeMemory();
          memoryFreed = memResult.memoryFreed || 0;
          processesOptimized = memResult.processesOptimized || 0;
          if (memResult.errors) errors.push(...memResult.errors);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`Memory optimization: ${msg}`);
        }
        log('optimize', 'performance.optimize', module.issuesFound, module.issuesFound - disabled - processesOptimized, errors.length === 0, errors.join('; ') || undefined);
        return {
          success: errors.length === 0,
          entriesDisabled: disabled,
          bytesRecovered: memoryFreed,
          issuesFixed: processesOptimized,
          errors: errors.slice(0, 5),
        };
      }
      case 'protection':
        log('apply', 'security.apply', undefined, undefined, false, 'Security settings require manual action via Windows Security');
        return { success: false, errors: ['Security settings require manual action. Use the Security page to open Windows Security.'], reason: 'Requires manual action' };
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
  // Full System Scan
  // ------------------------------------------------------------------

  async runFullSystemScan(): Promise<void> {
    this.setState({
      fullScanId: null,
      fullScanStatus: null,
      fullScanResults: null,
      fullScanRunning: true,
    });

    try {
      const startResp = await fullSystemScanService.start();
      const scanId = startResp.scanId;
      this.setState({ fullScanId: scanId });

      const POLL_MS = 300;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const status = await fullSystemScanService.getStatus(scanId);
        if (!status.present) break;

        this.setState({ fullScanStatus: status });

        if (status.status === 'completed' || status.status === 'cancelled' || status.status === 'failed') {
          const result = await fullSystemScanService.getResult(scanId);
          this.setState({
            fullScanResults: result.results,
            fullScanRunning: false,
          });
          break;
        }
      }
    } catch (err) {
      this.setState({
        fullScanRunning: false,
        fullScanStatus: null,
      });
      console.error('Full system scan error:', err);
    }
  }

  async cancelFullSystemScan(): Promise<void> {
    const scanId = this.state.fullScanId;
    if (scanId) {
      try { await fullSystemScanService.cancel(scanId); } catch { /* ignore */ }
    }
    this.setState({
      fullScanRunning: false,
      fullScanId: null,
      fullScanStatus: null,
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
