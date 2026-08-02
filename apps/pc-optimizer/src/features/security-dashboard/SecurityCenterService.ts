/**
 * SecurityCenterService — unified facade for the Security Center UI.
 *
 * Wraps three backend engines into a single cohesive API:
 *   - SecurityEngine (scan, detect, snapshot)
 *   - ThreatInvestigationEngine (investigate, explain, correlate)
 *   - ThreatRemediationEngine (quarantine, restore, rollback, false positives)
 *
 * The UI layer never touches the individual engines directly.
 */
import { SecurityEngine } from '../security-center/SecurityEngine';
import { securityEventBus } from '../security-center/SecurityEvents';
import type {
  ScanResult,
  ScanType,
  SecuritySnapshot,
  Threat,
  SecurityConfiguration,
  SecurityProviderInfo,
  SecurityHistorySummary,
  SecurityHistoryEntry,
  SecurityScoreTrendPoint,
  SecurityCapabilityInfo,
  SecurityEvent,
} from '../security-center/types';

import { ThreatInvestigationEngine } from '../security-investigation/ThreatInvestigationEngine';
import { threatEventBus } from '../security-investigation/ThreatEvents';
import type {
  ThreatInvestigation,
  InvestigationInput,
  InvestigationStatus,
  ThreatReport,
  TimelineEvent,
  CollectedEvidence,
  ThreatRelationshipGraph,
  AffectedComponent,
  RecommendedAction,
  FalsePositiveAnalysis,
  InvestigationEvent,
  InvestigationEventListener,
} from '../security-investigation/types';

import { ThreatRemediationEngine } from '../security-remediation/ThreatRemediationEngine';
import { remediationEventBus } from '../security-remediation/ThreatRemediationEvents';
import type {
  RemediationPlan,
  RemediationAction,
  RemediationReport,
  QuarantineEntry,
  QuarantineSummary,
  RollbackEntry,
  ApprovalRequest,
  RemediationHistoryData,
  RemediationDashboardData,
  RemediationConfiguration,
  RemediationPolicy,
  RemediationTier,
  FalsePositiveExclusionType,
  RemediationEvent,
  RemediationEventListener,
} from '../security-remediation/types';

export interface ScanProgress {
  scanId: string;
  scanType: ScanType;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentPhase: string;
  providersCompleted: number;
  providersTotal: number;
  threatsFound: number;
  itemsScanned: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  aiObservations: string[];
}

export class SecurityCenterService {
  private securityEngine: SecurityEngine;
  private investigationEngine: ThreatInvestigationEngine;
  private remediationEngine: ThreatRemediationEngine;

  private currentScan: ScanResult | null = null;
  private scanProgress: ScanProgress | null = null;
  private scanStartTime = 0;

  constructor() {
    this.securityEngine = new SecurityEngine();
    this.investigationEngine = new ThreatInvestigationEngine();
    this.remediationEngine = new ThreatRemediationEngine();
  }

  // ── Scanning ──────────────────────────────────────────────────

  async scan(scanType: ScanType, targets: string[] = [], options: Record<string, unknown> = {}): Promise<ScanResult> {
    this.scanStartTime = Date.now();
    const providerCount = this.securityEngine.getRegistry().getEnabledProviders().length;

    this.scanProgress = {
      scanId: `scan-${Date.now()}`,
      scanType,
      status: 'running',
      currentPhase: 'Initializing providers…',
      providersCompleted: 0,
      providersTotal: providerCount,
      threatsFound: 0,
      itemsScanned: 0,
      elapsedMs: 0,
      estimatedRemainingMs: null,
      aiObservations: [],
    };

    const result = await this.securityEngine.scan(scanType, targets, options);
    this.currentScan = result;

    this.scanProgress = {
      ...this.scanProgress,
      scanId: result.scanId,
      status: result.status,
      currentPhase: 'Completed',
      providersCompleted: result.providerResults.length,
      threatsFound: result.threats.length,
      itemsScanned: result.itemsScanned,
      elapsedMs: result.duration,
      estimatedRemainingMs: 0,
    };

    // Auto-investigate detected threats
    if (result.threats.length > 0) {
      const input: InvestigationInput = {
        threats: result.threats,
        snapshot: result.snapshot,
        historySummary: this.securityEngine.getHistory().getHistorySummary(),
      };
      this.investigationEngine.investigate(input);
    }

    return result;
  }

  getScanProgress(): ScanProgress | null {
    if (!this.scanProgress) return null;
    if (this.scanProgress.status === 'running') {
      this.scanProgress.elapsedMs = Date.now() - this.scanStartTime;
    }
    return this.scanProgress;
  }

  getCurrentScanResult(): ScanResult | null {
    return this.currentScan;
  }

  // ── Snapshot & Threats ────────────────────────────────────────

  getSnapshot(): SecuritySnapshot | null {
    return this.securityEngine.getSnapshot();
  }

  getThreats(): Threat[] {
    return this.securityEngine.getRepository().getAllThreats();
  }

  getThreatsByCategory(category: string): Threat[] {
    return this.getThreats().filter((t) => t.category === category);
  }

  getActiveThreats(): Threat[] {
    return this.getThreats().filter((t) => t.status === 'active');
  }

  // ── Providers ─────────────────────────────────────────────────

  getProviders(): SecurityProviderInfo[] {
    return this.securityEngine.getRegistry().getAllProviderInfo();
  }

  getCapabilities(): SecurityCapabilityInfo[] {
    return this.securityEngine.getCapabilities();
  }

  // ── History ───────────────────────────────────────────────────

  getHistory(): SecurityHistoryEntry[] {
    return this.securityEngine.getHistory().getRecentEntries(50);
  }

  getHistorySummary(): SecurityHistorySummary {
    return this.securityEngine.getHistory().getHistorySummary();
  }

  getScoreTrend(): SecurityScoreTrendPoint[] {
    return this.securityEngine.getHistory().getScoreTrend(30);
  }

  // ── Configuration ─────────────────────────────────────────────

  getConfiguration(): SecurityConfiguration {
    return this.securityEngine.getConfiguration();
  }

  updateConfiguration(updates: Partial<SecurityConfiguration>): void {
    this.securityEngine.updateConfiguration(updates);
  }

  getDefinitionsVersion(): string {
    return this.securityEngine.getDefinitionsVersion();
  }

  // ── Investigation ─────────────────────────────────────────────

  getInvestigations(): ThreatInvestigation[] {
    return this.investigationEngine.getAllInvestigations();
  }

  getActiveInvestigations(): ThreatInvestigation[] {
    return this.investigationEngine.getActiveInvestigations();
  }

  getInvestigation(id: string): ThreatInvestigation | null {
    return this.investigationEngine.getInvestigation(id);
  }

  updateInvestigationStatus(id: string, status: InvestigationStatus, notes?: string): void {
    this.investigationEngine.updateStatus(id, status, notes);
  }

  generateInvestigationReport(id: string): ThreatReport | null {
    return this.investigationEngine.generateReport(id);
  }

  getInvestigationHistory() {
    return this.investigationEngine.getHistory();
  }

  getInvestigationDashboard() {
    return this.investigationEngine.getDashboard();
  }

  // ── Remediation ───────────────────────────────────────────────

  createRemediationPlan(investigation: ThreatInvestigation, threats: Threat[], tier?: RemediationTier): RemediationPlan {
    return this.remediationEngine.createPlan(investigation, threats, tier);
  }

  approvePlan(planId: string, userId?: string, reason?: string): RemediationPlan | null {
    return this.remediationEngine.approvePlan(planId, userId, reason);
  }

  rejectPlan(planId: string, userId?: string, reason?: string): RemediationPlan | null {
    return this.remediationEngine.rejectPlan(planId, userId, reason);
  }

  executePlan(planId: string): RemediationPlan | null {
    return this.remediationEngine.executePlan(planId);
  }

  getPlan(id: string): RemediationPlan | null {
    return this.remediationEngine.getPlan(id);
  }

  getAllPlans(): RemediationPlan[] {
    return this.remediationEngine.getAllPlans();
  }

  rollbackAction(actionId: string): boolean {
    return this.remediationEngine.rollbackAction(actionId);
  }

  // ── Quarantine ────────────────────────────────────────────────

  getQuarantineEntry(id: string): QuarantineEntry | null {
    return this.remediationEngine.getQuarantineEntry(id);
  }

  getQuarantineSummary(): QuarantineSummary {
    return this.remediationEngine.getQuarantineSummary();
  }

  restoreFromQuarantine(quarantineId: string) {
    return this.remediationEngine.restoreFromQuarantine(quarantineId);
  }

  deleteFromQuarantine(quarantineId: string, userConfirmed: boolean) {
    return this.remediationEngine.deleteFromQuarantine(quarantineId, userConfirmed);
  }

  // ── False Positives ───────────────────────────────────────────

  markFalsePositive(
    threat: Threat,
    investigationId: string,
    reason: string,
    exclusionType: FalsePositiveExclusionType,
    notes?: string,
  ): boolean {
    return this.remediationEngine.markFalsePositive(threat, investigationId, reason, exclusionType, notes);
  }

  isFalsePositive(threat: Threat): boolean {
    return this.remediationEngine.isFalsePositive(threat);
  }

  // ── Remediation Reports & History ─────────────────────────────

  generateRemediationReport(planId: string): RemediationReport | null {
    return this.remediationEngine.generateReport(planId);
  }

  getRemediationHistory(): RemediationHistoryData {
    return this.remediationEngine.getHistory();
  }

  getRemediationDashboard(): RemediationDashboardData {
    return this.remediationEngine.getDashboard();
  }

  getRemediationConfiguration(): RemediationConfiguration {
    return this.remediationEngine.getConfiguration();
  }

  updateRemediationPolicy(updates: Partial<RemediationPolicy>): void {
    this.remediationEngine.updatePolicy(updates);
  }

  // ── Events ────────────────────────────────────────────────────

  onSecurityEvent(listener: (event: SecurityEvent) => void): () => void {
    return securityEventBus.subscribe(listener);
  }

  onThreatEvent(listener: InvestigationEventListener): () => void {
    return threatEventBus.subscribe(listener);
  }

  onRemediationEvent(listener: RemediationEventListener): () => void {
    return remediationEventBus.subscribe(listener);
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  dispose(): void {
    this.securityEngine.dispose();
    this.investigationEngine.clear();
    this.remediationEngine.clear();
  }
}
