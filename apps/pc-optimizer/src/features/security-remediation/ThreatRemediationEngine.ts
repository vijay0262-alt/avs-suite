/**
 * ThreatRemediationEngine — the orchestrator.
 *
 * Safe remediation pipeline with complete transparency.
 *
 * Default flow:
 *   Detect → Investigate → Recommend → User Approval → Quarantine → Observe → Delete (optional)
 *
 * Safety principles:
 *   - Safety before speed
 *   - Never remove anything unless highly confident or user explicitly approves
 *   - Every action must be explainable
 *   - Every reversible action must support rollback
 *   - Never perform destructive actions without user approval
 *
 * Integrates with:
 *   - Security Center (threats)
 *   - Investigation Engine (investigations)
 *   - Undo/Restore Service (rollback)
 *   - Entitlement (FREE vs PRO)
 */
import type {
  Threat,
  ThreatInvestigation,
  RemediationPlan,
  RemediationAction,
  RemediationReport,
  RemediationConfiguration,
  RemediationPolicy,
  RemediationTier,
  FalsePositiveExclusionType,
  QuarantineEntry,
  RemediationDashboardData,
  RemediationHistoryData,
} from './types';

import { ThreatConfigurationManager } from './ThreatConfiguration';
import { ThreatRemediationPolicyManager } from './ThreatRemediationPolicy';
import { ThreatSafetyValidator } from './ThreatSafetyValidator';
import { ThreatQuarantineManager } from './ThreatQuarantineManager';
import { ThreatRollbackManager } from './ThreatRollbackManager';
import { ThreatApprovalManager } from './ThreatApprovalManager';
import { ThreatRemediationPlanner } from './ThreatRemediationPlanner';
import { ThreatRemediationHistory } from './ThreatRemediationHistory';
import { ThreatRemediationReportGenerator } from './ThreatRemediationReport';
import { ThreatDashboardProvider } from './ThreatDashboardProvider';
import { ThreatFalsePositiveTracker } from './ThreatFalsePositiveTracker';
import { remediationEventBus } from './ThreatRemediationEvents';

export class ThreatRemediationEngine {
  private configManager: ThreatConfigurationManager;
  private policyManager: ThreatRemediationPolicyManager;
  private safetyValidator: ThreatSafetyValidator;
  private quarantineManager: ThreatQuarantineManager;
  private rollbackManager: ThreatRollbackManager;
  private approvalManager: ThreatApprovalManager;
  private planner: ThreatRemediationPlanner;
  private history: ThreatRemediationHistory;
  private reportGenerator: ThreatRemediationReportGenerator;
  private dashboardProvider: ThreatDashboardProvider;
  private falsePositiveTracker: ThreatFalsePositiveTracker;

  private plans = new Map<string, RemediationPlan>();
  private reports = new Map<string, RemediationReport>();

  constructor(config?: Partial<RemediationConfiguration>) {
    this.configManager = new ThreatConfigurationManager(config);
    const policy = this.configManager.getPolicy();
    this.policyManager = new ThreatRemediationPolicyManager(policy);
    this.safetyValidator = new ThreatSafetyValidator(this.configManager.get().policy.autoRemediateThreshold === 'safe' ? 0 : 0.5);
    this.quarantineManager = new ThreatQuarantineManager(
      this.configManager.isQuarantineEnabled() && this.configManager.get().quarantineEncryption,
      this.configManager.getQuarantinePath(),
    );
    this.rollbackManager = new ThreatRollbackManager(this.configManager.getRollbackMaxEntries());
    this.approvalManager = new ThreatApprovalManager();
    this.planner = new ThreatRemediationPlanner(this.safetyValidator, this.policyManager);
    this.history = new ThreatRemediationHistory();
    this.reportGenerator = new ThreatRemediationReportGenerator(this.rollbackManager);
    this.falsePositiveTracker = new ThreatFalsePositiveTracker();
    this.dashboardProvider = new ThreatDashboardProvider(
      this.approvalManager,
      this.quarantineManager,
      this.rollbackManager,
      this.falsePositiveTracker,
    );
  }

  // ── Plan Creation ─────────────────────────────────────────────────

  createPlan(investigation: ThreatInvestigation, threats: Threat[], tier?: RemediationTier): RemediationPlan {
    const effectiveTier = tier ?? this.policyManager.getTier();
    const plan = this.planner.createPlan(investigation, threats, effectiveTier);
    this.plans.set(plan.id, plan);
    remediationEventBus.emitPlanCreated(plan.id, plan.investigationId, plan.summary);

    // If plan requires approval, create approval request
    if (plan.requiresApproval) {
      const highRisk = plan.actions.filter((a) => a.riskLevel === 'high_risk' || a.riskLevel === 'critical_risk');
      const destructive = plan.actions.filter((a) => a.type === 'delete');
      const parts: string[] = [];
      parts.push(`This remediation plan contains ${plan.totalActions} action(s).`);
      if (highRisk.length > 0) parts.push(`${highRisk.length} action(s) are classified as high or critical risk.`);
      if (destructive.length > 0) parts.push(`${destructive.length} action(s) are destructive and cannot be undone.`);
      parts.push(`Please review each action carefully before approving.`);
      const explanation = parts.join(' ');

      this.approvalManager.createRequest(
        plan.id,
        plan.investigationId,
        plan.actions.filter((a) => a.requiresApproval),
        plan.actions.reduce<RemediationAction['riskLevel']>((max, a) => {
          const order = ['safe', 'low_risk', 'medium_risk', 'high_risk', 'critical_risk'];
          return order.indexOf(a.riskLevel) > order.indexOf(max) ? a.riskLevel : max;
        }, 'safe'),
        plan.summary,
        explanation,
      );
    }

    return plan;
  }

  // ── False Positive ────────────────────────────────────────────────

  markFalsePositive(
    threat: Threat,
    investigationId: string,
    reason: string,
    exclusionType: FalsePositiveExclusionType,
    notes?: string,
  ): boolean {
    if (!this.configManager.isFalsePositiveTrackingEnabled()) return false;

    this.falsePositiveTracker.markFalsePositive(threat, investigationId, reason, exclusionType, 'user', notes);
    remediationEventBus.emitFalsePositiveMarked(threat.id, investigationId, reason);
    return true;
  }

  isFalsePositive(threat: Threat): boolean {
    return this.falsePositiveTracker.isFalsePositive(threat);
  }

  // ── Quarantine ────────────────────────────────────────────────────

  getQuarantineEntry(id: string): QuarantineEntry | null {
    return this.quarantineManager.get(id);
  }

  getQuarantineSummary() {
    return this.quarantineManager.getSummary();
  }

  // ── Public API ────────────────────────────────────────────────────

  getPlan(id: string): RemediationPlan | null {
    return this.plans.get(id) ?? null;
  }

  getAllPlans(): RemediationPlan[] {
    return [...this.plans.values()];
  }

  generateReport(planId: string): RemediationReport | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;
    const report = this.reportGenerator.generate(plan, this.policyManager.getTier());
    this.reports.set(planId, report);
    remediationEventBus.emitReportGenerated(planId, plan.investigationId, 'Report generated on demand');
    return report;
  }

  getHistory(): RemediationHistoryData {
    return this.history.getSummary();
  }

  getDashboard(): RemediationDashboardData {
    return this.dashboardProvider.build([...this.plans.values()]);
  }

  getConfiguration(): RemediationConfiguration {
    return this.configManager.get();
  }

  updateConfiguration(updates: Partial<RemediationConfiguration>): void {
    this.configManager.update(updates);
  }

  updatePolicy(updates: Partial<RemediationPolicy>): void {
    this.configManager.updatePolicy(updates);
    this.policyManager.update(updates);
  }

  clear(): void {
    this.plans.clear();
    this.reports.clear();
    this.history.clear();
    this.quarantineManager.clear();
    this.rollbackManager.clear();
    this.approvalManager.clear();
    this.falsePositiveTracker.clear();
  }
}
