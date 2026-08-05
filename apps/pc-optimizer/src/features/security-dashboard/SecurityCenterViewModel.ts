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

  async startScan(mode?: ScanMode): Promise<void> {
    const scanMode = mode ?? this.state.scanMode;
    const scanType = SCAN_TYPE_MAP[scanMode];

    this.setState({
      isScanning: true,
      scanMode,
      error: null,
      scanProgress: {
        scanId: '',
        scanType,
        status: 'running',
        currentPhase: 'Initializing scan engine…',
        currentFilePath: null,
        filesScanned: 0,
        filesTotal: null,
        providersCompleted: 0,
        providersTotal: this.service.getProviders().length,
        threatsFound: 0,
        itemsScanned: 0,
        elapsedMs: 0,
        estimatedRemainingMs: null,
        aiObservations: ['AI engine warming up…'],
      },
    });

    // Simulate progress updates during scan
    const progressInterval = setInterval(() => {
      const progress = this.service.getScanProgress();
      if (progress && progress.status === 'running') {
        const phases = [
          'Scanning processes…',
          'Analyzing browser extensions…',
          'Checking startup entries…',
          'Scanning registry…',
          'Analyzing network connections…',
          'Checking scheduled tasks…',
          'Examining file reputation…',
          'Correlating threat intelligence…',
        ];
        const elapsed = progress.elapsedMs;
        const phaseIndex = Math.min(phases.length - 1, Math.floor(elapsed / 500));
        const observations = [
          `Scanning ${progress.itemsScanned} items…`,
          `${progress.threatsFound} potential threats identified`,
          'AI analyzing behavioral patterns…',
          'Cross-referencing threat intelligence database…',
        ];

        // If we have a current file path from the deep scan, show it as the phase
        const currentPhase = progress.currentFilePath
          ? `Scanning: ${progress.currentFilePath}`
          : phases[phaseIndex] ?? 'Scanning…';

        this.setState({
          scanProgress: {
            ...progress,
            currentPhase,
            aiObservations: observations.slice(0, Math.min(4, Math.floor(elapsed / 300) + 1)),
          },
        });
      }
    }, 200);

    try {
      const result = await this.service.scan(scanType);
      clearInterval(progressInterval);

      this.setState({
        isScanning: false,
        lastScanResult: result,
        scanProgress: this.service.getScanProgress(),
      });

      this.refresh();
    } catch (e) {
      clearInterval(progressInterval);
      this.setState({
        isScanning: false,
        error: e instanceof Error ? e.message : 'Scan failed',
      });
    }
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

  approvePlan(planId: string): void {
    this.service.approvePlan(planId);
    this.refresh();
  }

  rejectPlan(planId: string): void {
    this.service.rejectPlan(planId);
    this.refresh();
  }

  executePlan(planId: string): void {
    this.service.executePlan(planId);
    this.refresh();
    void this.loadQuarantineSummary();
  }

  rollbackAction(actionId: string): void {
    this.service.rollbackAction(actionId);
    this.refresh();
    void this.loadQuarantineSummary();
  }

  async restoreFromQuarantine(quarantineId: string): Promise<void> {
    await this.service.restoreFromQuarantine(quarantineId);
    await this.loadQuarantineSummary();
  }

  async deleteFromQuarantine(quarantineId: string): Promise<void> {
    await this.service.deleteFromQuarantine(quarantineId, true);
    await this.loadQuarantineSummary();
  }

  async loadQuarantineSummary(): Promise<void> {
    try {
      const summary = await this.service.getQuarantineSummary();
      this.setState({ quarantineSummary: summary });
    } catch {
      // Fallback — keep existing state
    }
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
