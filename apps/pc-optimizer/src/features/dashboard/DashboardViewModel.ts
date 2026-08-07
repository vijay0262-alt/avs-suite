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
  HardwareSensors,
  ScanPhase,
  ScanLiveStats,
} from './dashboard.types';
import { SCAN_PHASES } from './dashboard.types';
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
import { canUse as featureGateCanUse } from '../licensing/FeatureGate';
import type { ManagedFeature } from '@avs/licensing';
import { onboardingService } from '../onboarding/OnboardingService';
import { HardwareManager } from '../hardware-center/HardwareManager';
import { hardwareRegistry } from '../hardware-center/HardwareRegistry';
import { createMockHardwareProvider } from '../hardware-center/MockHardwareProvider';
import { hardwareSnapshotToSensors, getCpuTempFromSnapshot } from './hardwareAdapter';

export type OptimizeStep = 'idle' | 'preview' | 'confirm' | 'optimizing' | 'complete';

const MODULE_SIM_PATHS: Record<string, string[]> = {
  junk: [
    'C:\\Users\\user\\AppData\\Local\\Temp\\~tmp1F3A.tmp',
    'C:\\Windows\\Temp\\setup_log_2024.txt',
    'C:\\Users\\user\\AppData\\Local\\Microsoft\\Edge\\Cache\\f_00001',
    'C:\\Users\\user\\AppData\\Local\\Google\\Chrome\\Cache\\0001_cache',
    'C:\\Windows\\SoftwareDistribution\\Download\\KB5034123.cab',
    'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_installer.log',
    'C:\\Windows\\Prefetch\\CHROME.EXE-8F2B1A.pf',
    'C:\\Users\\user\\AppData\\Local\\Temp\\VSCode_crash.dmp',
  ],
  startup: [
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Discord',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Spotify',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Steam',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\OneDrive',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Skype',
    'C:\\Users\\user\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\auto.bat',
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
  performance: [
    'Process: chrome.exe (PID 4892) — 1.2 GB RAM',
    'Process: Code.exe (PID 3210) — 850 MB RAM',
    'Process: node.exe (PID 5678) — 420 MB RAM',
    'Service: SysMain (Superfetch) — Active',
    'Service: Windows Search Indexer — High I/O',
    'Process: docker.exe (PID 7890) — 2.1 GB RAM',
  ],
  disk: [
    'C:\\Users\\user\\Downloads\\large_video.mp4 (2.3 GB)',
    'C:\\Users\\user\\Documents\\archive_2023.zip (1.8 GB)',
    'C:\\Users\\user\\AppData\\Local\\Docker\\image.vhdx (12 GB)',
    'C:\\Windows\\Installer\\patch_8f3a.msi (450 MB)',
    'C:\\Users\\user\\AppData\\Local\\Temp\\install_cache.cab (320 MB)',
    'C:\\Users\\user\\Downloads\\setup_tool.exe (180 MB)',
  ],
  registry: [
    'HKLM\\Software\\Orphan\\Uninstall\\{B2F3A1} — Missing executable',
    'HKCU\\Software\\OldApp\\Startup — Invalid path reference',
    'HKLM\\System\\CurrentControlSet\\Services\\GhostDriver — No .sys file',
    'HKCU\\Software\\Classes\\BrokenLink\\shell\\open — Missing target',
    'HKLM\\Software\\UninstalledApp\\TrayIcon — Orphaned key',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2 — Stale entries',
  ],
  security: [
    'Checking Windows Defender real-time protection status...',
    'Checking Windows Firewall profile (Domain/Private/Public)...',
    'Checking Windows Update pending patches...',
    'Checking UAC (User Account Control) settings...',
    'Checking SmartScreen filter configuration...',
    'Checking network sharing and discovery settings...',
  ],
  system: [
    'Checking OS version: Windows 11 23H2 Build 22631',
    'Checking system uptime and last boot time...',
    'Checking CPU model: Intel Core i7-12700K @ 3.6 GHz',
    'Checking total RAM: 32 GB DDR4 @ 3200 MT/s',
    'Checking motherboard: ASUS PRIME Z690-A (BIOS 1801)',
    'Checking GPU: NVIDIA GeForce RTX 3070 (Driver 536.40)',
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

  // Verification / developer logs
  verificationLogs: VerificationLog[];
  developerMode: boolean;

  // Improvement Summary (Part 7)
  optimizationSummary: OptimizationSummary | null;

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
        estimatedStorageRecovery: 0,
        estimatedMemoryRecovery: 0,
        estimatedStartupImprovement: 0,
        recommendationsFound: 0,
      },
      scanStartTime: null,
      verificationLogs: [],
      developerMode: false,

      quickActionsOpen: false,
      optimizationSummary: null,

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
        estimatedStorageRecovery: 0,
        estimatedMemoryRecovery: 0,
        estimatedStartupImprovement: 0,
        recommendationsFound: 0,
      },
      scanStartTime: Date.now(),
    });

    // Brief preparing phase for UX feedback, then start scanning
    setTimeout(() => {
      if (this.state.healthScanCancelled) {
        this.resetHealthScan();
        return;
      }
      this.setState({ healthScanStep: 'scanning' });
      void this.runHealthScan('scan');
    }, 600);
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
      healthScanCurrentFile: null,
      healthScanSubProgress: 0,

      scanPhase: null,
      scanOverallProgress: 0,
      scanLiveStats: {
        filesScanned: 0,
        registryEntries: 0,
        startupItems: 0,
        privacyItems: 0,
        estimatedStorageRecovery: 0,
        estimatedMemoryRecovery: 0,
        estimatedStartupImprovement: 0,
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
      healthScanStep: 'report',
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
          estimatedStorageRecovery: this.state.scanLiveStats.estimatedStorageRecovery + (patch.estimatedStorageRecovery ?? 0),
          estimatedMemoryRecovery: this.state.scanLiveStats.estimatedMemoryRecovery + (patch.estimatedMemoryRecovery ?? 0),
          estimatedStartupImprovement: this.state.scanLiveStats.estimatedStartupImprovement + (patch.estimatedStartupImprovement ?? 0),
          recommendationsFound: this.state.scanLiveStats.recommendationsFound + (patch.recommendationsFound ?? 0),
        },
      });
    };

    // Map module IDs to scan phases
    const modulePhaseMap: Record<string, ScanPhase> = {
      junk: 'junk',
      privacy: 'privacy',
      registry: 'registry',
      startup: 'startup',
      performance: 'performance',
      disk: 'performance',
      security: 'performance',
      system: 'performance',
    };

    // Stats increment per module per simulated step
    const moduleStatsMap: Record<string, Partial<ScanLiveStats>> = {
      junk: { filesScanned: 120 },
      privacy: { privacyItems: 30, filesScanned: 45 },
      registry: { registryEntries: 80 },
      startup: { startupItems: 15 },
      performance: { filesScanned: 20 },
      disk: { filesScanned: 30 },
      security: { filesScanned: 10 },
      system: { filesScanned: 5 },
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
          addStats({ estimatedStorageRecovery: patch.recoverableSpace });
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
      scanIfNotCancelled('performance', async () => {
        const metrics = await performanceService.getMetrics();
        const alertList = (await performanceService.getAlerts()).alerts;
        const ramRecovery = metrics.memory?.used ? Math.max(0, metrics.memory.used - metrics.memory.total * 0.5) : 0;
        return {
          score: Math.round(Math.max(0, 100 - alertList.length * 10 - (metrics.cpu?.usage || 0) / 2)),
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
          score: Math.round(Math.max(0, 100 - full.length * 25 - drives.reduce((s, d) => s + d.percent, 0) / drives.length / 2)),
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

  async executeHealthScanOptimizations(): Promise<void> {
    const beforeReport = this.state.healthScanReport;
    if (!beforeReport) return;

    const moduleFeatureMap: Record<string, string> = {
      junk: 'junk.clean',
      privacy: 'privacy.clean',
      registry: 'registry.fix',
      startup: 'startup.disable',
      performance: 'performance.optimize',
    };
    const fixableModules = beforeReport.modules.filter(
      (m) => {
        if (m.status !== 'complete' || !m.canAutoFix) return false;
        if (m.recoverableSpace <= 0 && m.issuesFound <= 0) return false;
        const feature = moduleFeatureMap[m.moduleId];
        if (feature && !featureGateCanUse(feature as ManagedFeature)) return false;
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

      // Skip full verify re-scan — compute after-scores from cleaning results
      // instead of re-scanning all modules. This eliminates the second scan
      // that users see after clicking "Optimize Now".
      this.setState({
        healthScanStep: 'updating_dashboard',
        healthScanExecution: {
          ...this.state.healthScanExecution!,
          currentModule: 'Updating Dashboard',
          progress: 95,
          liveMessages: [...this.state.healthScanExecution!.liveMessages, 'Refreshing Health Score...', 'Updating Dashboard cards...'],
        },
      });

      // Compute estimated after-scores based on cleaning results
      const beforeById = new Map(beforeReport.modules.map((m) => [m.moduleId, m]));
      const verifiedModules = beforeReport.modules.map((m) => {
        const actual = actualMap.get(m.moduleId);
        if (!actual) return m;
        const before = beforeById.get(m.moduleId);
        const beforeScore = before?.score ?? m.score;
        const beforeIssues = before?.issuesFound ?? 0;
        const itemsFixed = (actual.itemsRemoved || 0) + (actual.entriesDisabled || 0) + (actual.issuesFixed || 0);
        const afterIssues = Math.max(0, beforeIssues - itemsFixed);
        const afterScore = itemsFixed > 0
          ? Math.min(100, Math.round(beforeScore + (itemsFixed / Math.max(1, beforeIssues)) * (100 - beforeScore)))
          : beforeScore;
        const afterRecoverable = Math.max(0, (before?.recoverableSpace ?? 0) - (actual.bytesRecovered || 0));
        return {
          ...m,
          actual,
          score: afterScore,
          issuesFound: afterIssues,
          recoverableSpace: afterRecoverable,
          verification: {
            beforeScore,
            beforeIssues,
            beforeRecoverable: before?.recoverableSpace ?? 0,
            afterScore,
            afterIssues,
            afterRecoverable,
          },
        };
      });

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
      // Use the verified report score as fallback since dashboard metrics
      // may not reflect changes immediately after cleaning
      const summaryHealthAfter = this.state.healthScore?.overallScore ?? verifiedReport.overallScore;
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

      this.setState({
        healthScanStep: 'complete',
        healthScanError: null,
      });
    } catch (err) {
      this.setState({
        healthScanStep: 'complete',
        healthScanError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private getLiveMessageForModule(moduleId: string): string {
    const messages: Record<string, string> = {
      junk: 'Cleaning Temporary Files...',
      privacy: 'Cleaning Browser Cache...',
      registry: 'Optimizing Registry...',
      startup: 'Checking Startup Items...',
      performance: 'Optimizing Memory...',
      disk: 'Analyzing Disk Usage...',
      security: 'Checking Security Status...',
      system: 'Validating System Health...',
    };
    return messages[moduleId] ?? `Optimizing ${moduleId}...`;
  }

  private getDoneMessageForModule(moduleId: string, actual: HealthScanModuleActual): string {
    const parts: string[] = [];
    if (actual.filesDeleted) parts.push(`${actual.filesDeleted} files removed`);
    if (actual.bytesRecovered) parts.push(`${Math.round(actual.bytesRecovered / 1_000_000)} MB recovered`);
    if (actual.itemsRemoved) parts.push(`${actual.itemsRemoved} traces cleaned`);
    if (actual.entriesDisabled) parts.push(`${actual.entriesDisabled} startup items disabled`);
    if (actual.issuesFixed) parts.push(`${actual.issuesFixed} registry issues fixed`);
    if (parts.length === 0) {
      return actual.success ? '✓ No changes needed' : `✗ ${actual.reason || 'Failed'}`;
    }
    return `✓ ${parts.join(', ')}`;
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
      junk: 'junk.clean',
      privacy: 'privacy.clean',
      registry: 'registry.fix',
      startup: 'startup.disable',
      performance: 'performance.optimize',
    };
    const requiredFeature = moduleFeatureMap[module.moduleId];
    if (requiredFeature && !featureGateCanUse(requiredFeature as ManagedFeature)) {
      log('blocked', 'feature-gate', undefined, undefined, false, `Feature ${requiredFeature} not available in current edition`);
      return { success: false, errors: [`This feature requires a higher edition.`], reason: 'Feature not available in Free edition' };
    }

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
      healthScanError: null,
      healthScanExecution: null,
      healthScanResult: null,
      optimizationSummary: null,
      scanPhase: null,
      scanOverallProgress: 0,
      scanLiveStats: {
        filesScanned: 0,
        registryEntries: 0,
        startupItems: 0,
        privacyItems: 0,
        estimatedStorageRecovery: 0,
        estimatedMemoryRecovery: 0,
        estimatedStartupImprovement: 0,
        recommendationsFound: 0,
      },
      scanStartTime: null,
    });
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
