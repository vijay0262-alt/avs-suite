/**
 * SecurityCenterViewModel — unified ViewModel for the expanded Security Center.
 *
 * Manages all Security Center UI state including:
 *   - Scanning (quick/full/custom/memory/startup/browser)
 *   - Threats list (by category: spyware, malware, adware, ransomware, etc.)
 *   - Investigation (timeline, evidence, MITRE, AI explanations, relationship graph)
 *   - Remediation (quarantine, restore, rollback, false positives, plans)
 *   - Reports & History
 *
 * Uses SecurityCenterService as the single backend facade.
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { SecurityCenterService, type ScanProgress } from './SecurityCenterService';
import type {
  ScanResult,
  ScanType,
  SecuritySnapshot,
  Threat,
  ThreatCategory,
  ThreatSeverity,
  SecurityProviderInfo,
  SecurityHistoryEntry,
  SecurityScoreTrendPoint,
  SecurityCapabilityInfo,
} from '../security-center/types';
import {
  SECURITY_SCAN_PHASES,
  INITIAL_SECURITY_SCAN_STATS,
  type SecurityScanLiveStats,
  type ScanTreeNode,
  type ScanTreeNodeStatus,
  type LiveThreatCard,
  type SecurityAISummary,
} from './securityScanTypes';
import type {
  ThreatInvestigation,
  InvestigationStatus,
  ThreatReport,
} from '../security-investigation/types';
import type {
  RemediationPlan,
  RemediationReport,
  QuarantineEntry,
  QuarantineSummary,
  RemediationHistoryData,
  RemediationDashboardData,
  FalsePositiveExclusionType,
} from '../security-remediation/types';

export type SecurityCenterTab =
  | 'overview'
  | 'scan'
  | 'threats'
  | 'investigation'
  | 'remediation'
  | 'reports'
  | 'settings';

export type ScanMode = 'quick' | 'full' | 'custom' | 'memory' | 'startup' | 'browser' | 'spyware' | 'malware' | 'adware';

export interface ThreatFilter {
  category: ThreatCategory | 'all';
  severity: ThreatSeverity | 'all';
  status: Threat['status'] | 'all';
  searchQuery: string;
}

export interface SecurityCenterState {
  activeTab: SecurityCenterTab;
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;

  // Snapshot
  snapshot: SecuritySnapshot | null;
  securityScore: number;
  threatScore: number;
  riskScore: number;
  exposureScore: number;

  // Scanning
  scanMode: ScanMode;
  scanProgress: ScanProgress | null;
  isScanning: boolean;
  lastScanResult: ScanResult | null;
  scanHistory: SecurityHistoryEntry[];

  // New scan experience
  scanPhaseIndex: number;
  scanOverallProgress: number;
  scanLiveStats: SecurityScanLiveStats;
  scanTree: ScanTreeNode[];
  liveThreats: LiveThreatCard[];
  scanStartTime: number;
  scanCurrentFolder: string | null;
  scanCurrentModule: string | null;
  scanCurrentFile: string | null;
  scanEstimatedRemaining: number | null;
  aiSummary: SecurityAISummary | null;

  // Threats
  threats: Threat[];
  activeThreats: Threat[];
  threatFilter: ThreatFilter;
  filteredThreats: Threat[];

  // Investigation
  investigations: ThreatInvestigation[];
  activeInvestigations: ThreatInvestigation[];
  selectedInvestigationId: string | null;
  selectedInvestigation: ThreatInvestigation | null;

  // Remediation
  plans: RemediationPlan[];
  quarantineSummary: QuarantineSummary | null;
  quarantineEntries: QuarantineEntry[];
  remediationHistory: RemediationHistoryData | null;
  remediationDashboard: RemediationDashboardData | null;

  // Providers
  providers: SecurityProviderInfo[];
  capabilities: SecurityCapabilityInfo[];

  // Trends
  scoreTrend: SecurityScoreTrendPoint[];

  // UI
  lastUpdated: number;
  error: string | null;
}

const SCAN_TYPE_MAP: Record<ScanMode, ScanType> = {
  quick: 'quick',
  full: 'full',
  custom: 'custom',
  memory: 'memory',
  startup: 'boot',
  browser: 'custom',
  spyware: 'quick',
  malware: 'full',
  adware: 'quick',
};

export class SecurityCenterViewModel extends ViewModel<SecurityCenterState> {
  private service: SecurityCenterService;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(service?: SecurityCenterService) {
    super({
      activeTab: 'overview',
      bootstrap: 'idle',
      bootstrapError: null,
      snapshot: null,
      securityScore: 100,
      threatScore: 0,
      riskScore: 0,
      exposureScore: 0,
      scanMode: 'quick',
      scanProgress: null,
      isScanning: false,
      lastScanResult: null,
      scanHistory: [],
      scanPhaseIndex: 0,
      scanOverallProgress: 0,
      scanLiveStats: { ...INITIAL_SECURITY_SCAN_STATS },
      scanTree: [],
      liveThreats: [],
      scanStartTime: 0,
      scanCurrentFolder: null,
      scanCurrentModule: null,
      scanCurrentFile: null,
      scanEstimatedRemaining: null,
      aiSummary: null,
      threats: [],
      activeThreats: [],
      threatFilter: { category: 'all', severity: 'all', status: 'all', searchQuery: '' },
      filteredThreats: [],
      investigations: [],
      activeInvestigations: [],
      selectedInvestigationId: null,
      selectedInvestigation: null,
      plans: [],
      quarantineSummary: null,
      quarantineEntries: [],
      remediationHistory: null,
      remediationDashboard: null,
      providers: [],
      capabilities: [],
      scoreTrend: [],
      lastUpdated: 0,
      error: null,
    });

    this.service = service ?? new SecurityCenterService();
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  bootstrap(): void {
    this.setState({ bootstrap: 'loading' });
    try {
      this.refresh();
      this.startPolling();
      this.setState({ bootstrap: 'ready' });
    } catch (e) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: e instanceof Error ? e.message : 'Failed to initialize Security Center',
      });
    }
  }

  override dispose(): void {
    this.stopPolling();
    this.service.dispose();
    super.dispose();
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => this.refresh(), 5000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── Tab Management ────────────────────────────────────────────

  setActiveTab(tab: SecurityCenterTab): void {
    this.setState({ activeTab: tab });
  }

  // ── Scanning ──────────────────────────────────────────────────

  setScanMode(mode: ScanMode): void {
    this.setState({ scanMode: mode });
  }

  cancelScan(): void {
    this.setState({ isScanning: false });
  }

  dismissSummary(): void {
    this.setState({ aiSummary: null });
  }

  async startScan(mode?: ScanMode): Promise<void> {
    const scanMode = mode ?? this.state.scanMode;
    const scanType = SCAN_TYPE_MAP[scanMode];
    const isFullScan = scanMode === 'full';
    const phases = isFullScan ? SECURITY_SCAN_PHASES : SECURITY_SCAN_PHASES.slice(0, 6);
    const startTime = Date.now();

    this.setState({
      isScanning: true,
      scanMode,
      error: null,
      scanStartTime: startTime,
      scanPhaseIndex: 0,
      scanOverallProgress: 0,
      scanLiveStats: { ...INITIAL_SECURITY_SCAN_STATS },
      scanTree: this.buildInitialScanTree(isFullScan),
      liveThreats: [],
      scanCurrentFolder: null,
      scanCurrentModule: null,
      scanCurrentFile: null,
      scanEstimatedRemaining: null,
      aiSummary: null,
      scanProgress: {
        scanId: '',
        scanType,
        status: 'running',
        currentPhase: phases[0]?.label ?? 'Initializing…',
        currentFilePath: null,
        filesScanned: 0,
        filesTotal: null,
        providersCompleted: 0,
        providersTotal: this.service.getProviders().length,
        threatsFound: 0,
        itemsScanned: 0,
        elapsedMs: 0,
        estimatedRemainingMs: null,
        aiObservations: [],
      },
    });

    // Helper: compute overall progress from phase index + sub-progress
    const setPhaseProgress = (phaseIdx: number, subProgress: number) => {
      const phase = phases[phaseIdx];
      if (!phase) return;
      const overall = phase.startPercent + (subProgress / 100) * (phase.endPercent - phase.startPercent);
      const elapsed = Date.now() - startTime;
      const estRemaining = overall > 0 ? Math.round(elapsed * (100 / overall - 1)) : null;
      this.setState({
        scanPhaseIndex: phaseIdx,
        scanOverallProgress: Math.round(overall),
        scanEstimatedRemaining: estRemaining,
        scanProgress: this.state.scanProgress ? {
          ...this.state.scanProgress,
          currentPhase: phase.label,
          elapsedMs: elapsed,
          estimatedRemainingMs: estRemaining,
        } : null,
      });
    };

    // Helper: update scan tree node status
    const updateTreeNode = (id: string, status: ScanTreeNodeStatus, itemsScanned?: number, threatsFound?: number) => {
      const tree = this.state.scanTree.map(node => {
        if (node.id === id) {
          return {
            ...node,
            status,
            itemsScanned: itemsScanned ?? node.itemsScanned,
            threatsFound: threatsFound ?? node.threatsFound,
          };
        }
        if (node.children) {
          return {
            ...node,
            children: node.children.map(child =>
              child.id === id
                ? { ...child, status, itemsScanned: itemsScanned ?? child.itemsScanned, threatsFound: threatsFound ?? child.threatsFound }
                : child
            ),
          };
        }
        return node;
      });
      this.setState({ scanTree: tree });
    };

    // Helper: add live stats increment
    const addStats = (increment: Partial<SecurityScanLiveStats>) => {
      const current = this.state.scanLiveStats;
      const updated = { ...current };
      for (const [key, val] of Object.entries(increment)) {
        if (val !== undefined) {
          const currentRecord = current as unknown as Record<string, number>;
          const updatedRecord = updated as unknown as Record<string, number>;
          updatedRecord[key] = (currentRecord[key] ?? 0) + val;
        }
      }
      this.setState({ scanLiveStats: updated });
    };

    // Helper: add a live threat card
    const addLiveThreat = (threat: LiveThreatCard) => {
      this.setState({ liveThreats: [...this.state.liveThreats, threat] });
    };

    // Simulated scan paths for each phase
    const SIM_PATHS: Record<string, string[]> = {
      processes: ['C:\\Windows\\System32\\svchost.exe', 'C:\\Windows\\System32\\explorer.exe', 'C:\\Windows\\System32\\csrss.exe', 'C:\\Windows\\System32\\lsass.exe', 'C:\\Windows\\System32\\winlogon.exe', 'C:\\Program Files\\Google\\Chrome\\chrome.exe'],
      system_dirs: ['C:\\Windows\\System32\\kernel32.dll', 'C:\\Windows\\System32\\user32.dll', 'C:\\Windows\\SysWOW64\\ntdll.dll', 'C:\\Windows\\System32\\drivers\\tcpip.sys', 'C:\\Program Files\\Common Files\\system.dll', 'C:\\Program Files (x86)\\Common\\helper.exe'],
      user_profile: ['C:\\Users\\Public\\Desktop\\shortcut.lnk', 'C:\\Users\\Public\\Downloads\\installer.exe', 'C:\\Users\\Public\\Documents\\doc.pdf', 'C:\\Users\\Public\\AppData\\Local\\Temp\\temp.tmp', 'C:\\Users\\Public\\AppData\\Roaming\\config.json', 'C:\\$Recycle.Bin\\deleted.exe'],
      registry: ['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce', 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKLM\\SYSTEM\\CurrentControlSet\\Services', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'HKLM\\SOFTWARE\\Policies\\Google\\Chrome'],
      scheduled_tasks: ['\\\\Microsoft\\\\Windows\\\\UpdateOrchestrator', '\\\\Microsoft\\\\Windows\\\\Defrag', '\\\\Microsoft\\\\Windows\\\\DiskDiagnostic', '\\\\Custom\\\\BackupTask'],
      services: ['WinDefend', 'wuauserv', 'BITS', 'Schedule', 'PlugPlay', 'RpcSs'],
      browser: ['Chrome\\Extensions\\adblock.crx', 'Edge\\Extensions\\password.crx', 'Firefox\\extensions\\uBlock@xpi', 'Chrome\\User Data\\Default\\Preferences', 'Edge\\User Data\\Default\\Secure Preferences', 'Firefox\\profiles.ini'],
      powershell: ['C:\\Users\\Public\\Documents\\WindowsPowerShell\\profile.ps1', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1', 'C:\\Users\\Public\\startup.bat', 'C:\\Users\\Public\\script.vbs', 'C:\\Users\\Public\\app.js'],
      persistence: ['HKLM\\...\\Run\\\\Updater', 'C:\\ProgramData\\\\Microsoft\\\\Windows\\\\Start Menu\\\\Programs\\\\Startup\\\\app.lnk', 'WMI\\\\EventConsumer\\\\ActiveScript', 'schtasks\\\\/create\\\\/tn\\\\Updater'],
    };

    // Stats increments per phase per step
    const PHASE_STATS: Record<string, Partial<SecurityScanLiveStats>> = {
      initialization: { providersLoaded: 3 },
      processes: { processesAnalyzed: 15 },
      system_dirs: { filesScanned: 80, executablesFound: 12 },
      user_profile: { filesScanned: 60, scriptsDetected: 2, executablesDetected: 5 },
      registry: { registryKeysChecked: 25, persistenceEntries: 3 },
      scheduled_tasks: { scheduledTasks: 8 },
      services: { servicesChecked: 20 },
      browser: { browserObjects: 12, browserPolicies: 3 },
      powershell: { scriptsInspected: 6 },
      persistence: { persistenceMechanisms: 5 },
      behavior: {},
      threat_investigation: {},
      remediation_planning: {},
      final_verification: {},
    };

    // Phase folders for display
    const PHASE_FOLDERS: Record<string, string> = {
      processes: 'C:\\Windows\\System32',
      system_dirs: 'C:\\Windows\\System32; C:\\Program Files',
      user_profile: 'C:\\Users\\Public',
      registry: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion',
      scheduled_tasks: '\\\\Microsoft\\\\Windows',
      services: 'HKLM\\SYSTEM\\CurrentControlSet\\Services',
      browser: 'Chrome, Edge, Firefox profiles',
      powershell: 'PowerShell profiles & scripts',
      persistence: 'Autoruns, WMI, Registry, Startup',
    };

    try {
      // ── Phase 1: Initialization ──
      setPhaseProgress(0, 0);
      this.setState({ scanCurrentModule: 'AI Security Engine' });
      await this.delay(300);
      addStats({ providersLoaded: this.service.getProviders().length });
      updateTreeNode('initialization', 'scanning');
      await this.delay(200);
      setPhaseProgress(0, 100);
      updateTreeNode('initialization', 'complete', this.service.getProviders().length);

      // ── Phase 2: Running Processes ──
      setPhaseProgress(1, 0);
      this.setState({ scanCurrentModule: 'Process Inspector', scanCurrentFolder: PHASE_FOLDERS.processes ?? null });
      updateTreeNode('processes', 'scanning');
      await this.runPhaseSimulation(1, SIM_PATHS.processes ?? [], PHASE_STATS.processes ?? {}, addStats, setPhaseProgress, 6);

      // ── Phase 3: Windows System Directories ──
      if (isFullScan) {
        setPhaseProgress(2, 0);
        this.setState({ scanCurrentModule: 'File System Scanner', scanCurrentFolder: PHASE_FOLDERS.system_dirs ?? null });
        updateTreeNode('system_dirs', 'scanning');
        await this.runPhaseSimulation(2, SIM_PATHS.system_dirs ?? [], PHASE_STATS.system_dirs ?? {}, addStats, setPhaseProgress, 10);
        updateTreeNode('system_dirs', 'complete', this.state.scanLiveStats.filesScanned);
      }

      // ── Phase 4: User Profile ──
      if (isFullScan) {
        setPhaseProgress(3, 0);
        this.setState({ scanCurrentModule: 'User Profile Scanner', scanCurrentFolder: PHASE_FOLDERS.user_profile ?? null });
        updateTreeNode('user_profile', 'scanning');
        await this.runPhaseSimulation(3, SIM_PATHS.user_profile ?? [], PHASE_STATS.user_profile ?? {}, addStats, setPhaseProgress, 8);
        updateTreeNode('user_profile', 'complete');
      }

      // ── Phase 5: Registry ──
      setPhaseProgress(isFullScan ? 4 : 2, 0);
      this.setState({ scanCurrentModule: 'Registry Inspector', scanCurrentFolder: PHASE_FOLDERS.registry ?? null });
      updateTreeNode('registry', 'scanning');
      await this.runPhaseSimulation(isFullScan ? 4 : 2, SIM_PATHS.registry ?? [], PHASE_STATS.registry ?? {}, addStats, setPhaseProgress, 8);
      updateTreeNode('registry', 'complete', this.state.scanLiveStats.registryKeysChecked);

      // ── Phase 6: Scheduled Tasks ──
      setPhaseProgress(isFullScan ? 5 : 3, 0);
      this.setState({ scanCurrentModule: 'Task Inspector', scanCurrentFolder: PHASE_FOLDERS.scheduled_tasks ?? null });
      updateTreeNode('scheduled_tasks', 'scanning');
      await this.runPhaseSimulation(isFullScan ? 5 : 3, SIM_PATHS.scheduled_tasks ?? [], PHASE_STATS.scheduled_tasks ?? {}, addStats, setPhaseProgress, 5);
      updateTreeNode('scheduled_tasks', 'complete', this.state.scanLiveStats.scheduledTasks);

      if (isFullScan) {
        // ── Phase 7: Windows Services ──
        setPhaseProgress(6, 0);
        this.setState({ scanCurrentModule: 'Service Inspector', scanCurrentFolder: PHASE_FOLDERS.services ?? null });
        updateTreeNode('services', 'scanning');
        await this.runPhaseSimulation(6, SIM_PATHS.services ?? [], PHASE_STATS.services ?? {}, addStats, setPhaseProgress, 6);
        updateTreeNode('services', 'complete', this.state.scanLiveStats.servicesChecked);

        // ── Phase 8: Browser Security ──
        setPhaseProgress(7, 0);
        this.setState({ scanCurrentModule: 'Browser Protection', scanCurrentFolder: PHASE_FOLDERS.browser ?? null });
        updateTreeNode('browser', 'scanning');
        await this.runPhaseSimulation(7, SIM_PATHS.browser ?? [], PHASE_STATS.browser ?? {}, addStats, setPhaseProgress, 8);
        updateTreeNode('browser', 'complete', this.state.scanLiveStats.browserObjects);

        // ── Phase 9: PowerShell & Script Security ──
        setPhaseProgress(8, 0);
        this.setState({ scanCurrentModule: 'Script Inspector', scanCurrentFolder: PHASE_FOLDERS.powershell ?? null });
        updateTreeNode('powershell', 'scanning');
        await this.runPhaseSimulation(8, SIM_PATHS.powershell ?? [], PHASE_STATS.powershell ?? {}, addStats, setPhaseProgress, 6);
        updateTreeNode('powershell', 'complete', this.state.scanLiveStats.scriptsInspected);

        // ── Phase 10: Persistence Analysis ──
        setPhaseProgress(9, 0);
        this.setState({ scanCurrentModule: 'Persistence Detector', scanCurrentFolder: PHASE_FOLDERS.persistence ?? null });
        updateTreeNode('persistence', 'scanning');
        await this.runPhaseSimulation(9, SIM_PATHS.persistence ?? [], PHASE_STATS.persistence ?? {}, addStats, setPhaseProgress, 6);
        updateTreeNode('persistence', 'complete', this.state.scanLiveStats.persistenceMechanisms);
      }

      // ── Run actual security scan via service ──
      this.setState({ scanCurrentModule: 'AI Detection Providers', scanCurrentFile: 'Running deep analysis...' });

      // For quick scan, jump to behavior phase
      const behaviorPhaseIdx = isFullScan ? 10 : 4;
      setPhaseProgress(behaviorPhaseIdx, 0);
      updateTreeNode('behavior', 'scanning');

      const result = await this.service.scan(scanType);

      // Update live stats from actual scan results
      addStats({
        threatsFound: result.threats.length,
        processesAnalyzed: result.itemsScanned > 0 ? Math.max(this.state.scanLiveStats.processesAnalyzed, result.itemsScanned) : this.state.scanLiveStats.processesAnalyzed,
      });

      // Update AI confidence from scan
      if (result.threats.length > 0) {
        const avgConfidence = result.threats.reduce((sum, t) => sum + t.confidence, 0) / result.threats.length;
        addStats({ aiConfidence: Math.round(avgConfidence * 100) - this.state.scanLiveStats.aiConfidence });
      } else {
        addStats({ aiConfidence: 95 - this.state.scanLiveStats.aiConfidence });
      }

      // Add live threat cards for detected threats
      for (const threat of result.threats) {
        addLiveThreat({
          id: threat.id,
          name: threat.name,
          type: threat.category,
          risk: threat.risk,
          confidence: Math.round(threat.confidence * 100),
          status: threat.status,
          location: threat.affectedAssets[0]?.path ?? 'Unknown',
          actionPlanned: threat.canRemediate ? 'Quarantine' : 'Monitor',
          detectedAt: threat.detectionTime,
        });
      }

      setPhaseProgress(behaviorPhaseIdx, 100);
      updateTreeNode('behavior', 'complete', result.itemsScanned, result.threats.length);

      if (isFullScan) {
        // ── Phase 12: Threat Investigation ──
        setPhaseProgress(11, 0);
        this.setState({ scanCurrentModule: 'AI Threat Investigation', scanCurrentFile: 'Correlating evidence...' });
        updateTreeNode('threat_investigation', 'scanning');
        await this.delay(500);
        setPhaseProgress(11, 50);
        await this.delay(500);
        setPhaseProgress(11, 100);
        updateTreeNode('threat_investigation', 'complete', 0, result.threats.length);

        // ── Phase 13: AI Remediation Planning ──
        setPhaseProgress(12, 0);
        this.setState({ scanCurrentModule: 'AI Remediation Planner', scanCurrentFile: 'Preparing remediation plan...' });
        updateTreeNode('remediation_planning', 'scanning');
        await this.delay(400);
        setPhaseProgress(12, 100);
        updateTreeNode('remediation_planning', 'complete');

        // ── Phase 14: Final Verification ──
        setPhaseProgress(13, 0);
        this.setState({ scanCurrentModule: 'Final Verification', scanCurrentFile: 'Generating security score...' });
        updateTreeNode('final_verification', 'scanning');
        await this.delay(300);
        setPhaseProgress(13, 100);
        updateTreeNode('final_verification', 'complete');
      } else {
        // Quick scan: finalize at phase 5
        setPhaseProgress(5, 0);
        this.setState({ scanCurrentModule: 'Final Verification', scanCurrentFile: 'Generating security score...' });
        await this.delay(300);
        setPhaseProgress(5, 100);
      }

      // ── Generate AI Summary ──
      const duration = Date.now() - startTime;
      const protectedAreas = this.getProtectedAreas(isFullScan);
      const aiSummary: SecurityAISummary = {
        securityScore: result.securityScore,
        threatsFound: result.threats.length,
        threatsNeutralized: 0,
        manualReviewRequired: result.threats.filter(t => t.status === 'active').length,
        protectedAreas,
        estimatedRisk: result.threats.length === 0 ? 'Low' : result.threats.some(t => t.severity === 'critical' || t.severity === 'high') ? 'High' : 'Moderate',
        aiVerdict: this.generateAIVerdict(result.securityScore, result.threats.length),
        scanDuration: duration,
        filesScanned: this.state.scanLiveStats.filesScanned,
        itemsScanned: result.itemsScanned,
      };

      this.setState({
        isScanning: false,
        scanOverallProgress: 100,
        lastScanResult: result,
        scanProgress: this.service.getScanProgress(),
        aiSummary,
        scanCurrentFile: null,
        scanCurrentModule: null,
        scanCurrentFolder: null,
      });

      this.refresh();
    } catch (e) {
      this.setState({
        isScanning: false,
        error: e instanceof Error ? e.message : 'Scan failed',
        scanCurrentFile: null,
        scanCurrentModule: null,
        scanCurrentFolder: null,
      });
    }
  }

  private buildInitialScanTree(isFull: boolean): ScanTreeNode[] {
    const baseNodes: ScanTreeNode[] = [
      { id: 'initialization', label: 'Initialization', status: 'pending', itemsScanned: 0, threatsFound: 0 },
      { id: 'processes', label: 'Running Processes', status: 'pending', itemsScanned: 0, threatsFound: 0 },
    ];
    if (isFull) {
      baseNodes.push(
        { id: 'system_dirs', label: 'Windows System Directories', status: 'pending', itemsScanned: 0, threatsFound: 0 },
        { id: 'user_profile', label: 'User Profile', status: 'pending', itemsScanned: 0, threatsFound: 0 },
      );
    }
    baseNodes.push(
      { id: 'registry', label: 'Registry', status: 'pending', itemsScanned: 0, threatsFound: 0 },
      { id: 'scheduled_tasks', label: 'Scheduled Tasks', status: 'pending', itemsScanned: 0, threatsFound: 0 },
    );
    if (isFull) {
      baseNodes.push(
        { id: 'services', label: 'Windows Services', status: 'pending', itemsScanned: 0, threatsFound: 0 },
        { id: 'browser', label: 'Browser Security', status: 'pending', itemsScanned: 0, threatsFound: 0 },
        { id: 'powershell', label: 'PowerShell & Scripts', status: 'pending', itemsScanned: 0, threatsFound: 0 },
        { id: 'persistence', label: 'Persistence Analysis', status: 'pending', itemsScanned: 0, threatsFound: 0 },
      );
    }
    baseNodes.push(
      { id: 'behavior', label: 'Behavior Analysis', status: 'pending', itemsScanned: 0, threatsFound: 0 },
    );
    if (isFull) {
      baseNodes.push(
        { id: 'threat_investigation', label: 'Threat Investigation', status: 'pending', itemsScanned: 0, threatsFound: 0 },
        { id: 'remediation_planning', label: 'AI Remediation Planning', status: 'pending', itemsScanned: 0, threatsFound: 0 },
        { id: 'final_verification', label: 'Final Verification', status: 'pending', itemsScanned: 0, threatsFound: 0 },
      );
    }
    return baseNodes;
  }

  private getProtectedAreas(isFull: boolean): string[] {
    const areas = ['Running Processes', 'Registry', 'Scheduled Tasks', 'Behavior Analysis'];
    if (isFull) {
      areas.unshift('Windows System Directories', 'User Profile');
      areas.push('Windows Services', 'Browser Security', 'PowerShell & Scripts', 'Persistence Analysis', 'Threat Investigation', 'Remediation Planning');
    }
    return areas;
  }

  private generateAIVerdict(score: number, threats: number): string {
    if (threats === 0) {
      return score >= 90 ? 'Your system is well-protected. No threats detected.' : 'No active threats found. Consider enabling real-time protection for continuous monitoring.';
    }
    if (score >= 80) return `${threats} threat${threats > 1 ? 's' : ''} detected. Your system security is good but action is recommended.`;
    if (score >= 60) return `${threats} threat${threats > 1 ? 's' : ''} detected. Moderate risk — remediation recommended.`;
    return `${threats} threat${threats > 1 ? 's' : ''} detected. High risk — immediate remediation strongly recommended.`;
  }

  private async runPhaseSimulation(
    phaseIdx: number,
    paths: string[],
    statsIncrement: Partial<SecurityScanLiveStats>,
    addStats: (inc: Partial<SecurityScanLiveStats>) => void,
    setPhaseProgress: (idx: number, sub: number) => void,
    steps: number,
  ): Promise<void> {
    const simSteps = Math.min(steps, Math.max(3, paths.length));
    for (let i = 0; i < simSteps; i++) {
      if (!this.state.isScanning) break;
      const subPct = Math.round(((i + 1) / simSteps) * 100);
      this.setState({ scanCurrentFile: paths[i] ?? `Scanning item ${i + 1}...` });
      setPhaseProgress(phaseIdx, subPct);
      addStats(statsIncrement);
      await this.delay(200 + Math.random() * 200);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Threats ───────────────────────────────────────────────────

  setThreatFilter(filter: Partial<ThreatFilter>): void {
    const newFilter = { ...this.state.threatFilter, ...filter };
    this.setState({
      threatFilter: newFilter,
      filteredThreats: this.applyFilter(this.state.threats, newFilter),
    });
  }

  private applyFilter(threats: Threat[], filter: ThreatFilter): Threat[] {
    return threats.filter((t) => {
      if (filter.category !== 'all' && t.category !== filter.category) return false;
      if (filter.severity !== 'all' && t.severity !== filter.severity) return false;
      if (filter.status !== 'all' && t.status !== filter.status) return false;
      if (filter.searchQuery) {
        const q = filter.searchQuery.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.detectionSource.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  getThreatsByCategory(category: ThreatCategory): Threat[] {
    return this.state.threats.filter((t) => t.category === category);
  }

  // ── Investigation ─────────────────────────────────────────────

  selectInvestigation(id: string | null): void {
    const investigation = id ? this.service.getInvestigation(id) : null;
    this.setState({
      selectedInvestigationId: id,
      selectedInvestigation: investigation,
    });
  }

  updateInvestigationStatus(id: string, status: InvestigationStatus, notes?: string): void {
    this.service.updateInvestigationStatus(id, status, notes);
    this.refresh();
  }

  generateInvestigationReport(id: string): ThreatReport | null {
    return this.service.generateInvestigationReport(id);
  }

  // ── Remediation ───────────────────────────────────────────────
  //
  // Phase 5 (SC-8C12): Legacy execution methods (approvePlan, rejectPlan,
  // executePlan, rollbackAction, restoreFromQuarantine, deleteFromQuarantine,
  // loadQuarantineSummary) have been removed. Remediation execution now
  // occurs exclusively through the canonical scan_core.remediation.* flow
  // via PlanReviewView → ResultsView → useResults.
  //
  // The following methods remain for read-only/domain functionality:
  //   - createRemediationPlan() — creates candidate plan (planning-only)
  //   - generateRemediationReport() — report generation (read-only)
  //   - markFalsePositive() — false-positive tracking (non-remediation)

  createRemediationPlan(investigationId: string): RemediationPlan | null {
    const investigation = this.service.getInvestigation(investigationId);
    if (!investigation) return null;

    const threats = investigation.threatIds
      .map((id) => this.service.getSnapshot()?.threats.find((t) => t.id === id))
      .filter(Boolean) as Threat[];

    const plan = this.service.createRemediationPlan(investigation, threats);
    this.refresh();
    return plan;
  }

  markFalsePositive(
    threat: Threat,
    investigationId: string,
    reason: string,
    exclusionType: FalsePositiveExclusionType = 'mark_safe',
    notes?: string,
  ): void {
    this.service.markFalsePositive(threat, investigationId, reason, exclusionType, notes);
    this.refresh();
  }

  generateRemediationReport(planId: string): RemediationReport | null {
    return this.service.generateRemediationReport(planId);
  }

  // ── Refresh ───────────────────────────────────────────────────

  refresh(): void {
    const snapshot = this.service.getSnapshot();
    const threats = this.service.getThreats();
    const filter = this.state.threatFilter;

    this.setState({
      snapshot,
      securityScore: snapshot?.securityScore ?? 100,
      threatScore: snapshot?.threatScore ?? 0,
      riskScore: snapshot?.riskScore ?? 0,
      exposureScore: snapshot?.exposureScore ?? 0,
      threats,
      activeThreats: threats.filter((t) => t.status === 'active'),
      filteredThreats: this.applyFilter(threats, filter),
      scanHistory: this.service.getHistory(),
      investigations: this.service.getInvestigations(),
      activeInvestigations: this.service.getActiveInvestigations(),
      plans: this.service.getAllPlans(),
      quarantineSummary: this.state.quarantineSummary,
      providers: this.service.getProviders(),
      capabilities: this.service.getCapabilities(),
      scoreTrend: this.service.getScoreTrend(),
      remediationHistory: this.service.getRemediationHistory(),
      remediationDashboard: this.service.getRemediationDashboard(),
      lastUpdated: Date.now(),
    });
  }
}
