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
  RollbackData,
  ApprovalRequest,
  RemediationDashboardData,
  RemediationHistoryData,
} from './types';

import { ThreatConfigurationManager } from './ThreatConfiguration';
import { ThreatRemediationPolicyManager } from './ThreatRemediationPolicy';
import { ThreatSafetyValidator } from './ThreatSafetyValidator';
import { ThreatQuarantineManager } from './ThreatQuarantineManager';
import { ThreatRestoreManager } from './ThreatRestoreManager';
import { ThreatDeletionManager } from './ThreatDeletionManager';
import { ThreatRollbackManager } from './ThreatRollbackManager';
import { ThreatApprovalManager } from './ThreatApprovalManager';
import { ThreatRemediationPlanner } from './ThreatRemediationPlanner';
import { ThreatRemediationHistory } from './ThreatRemediationHistory';
import { ThreatRemediationReportGenerator } from './ThreatRemediationReport';
import { ThreatRecoveryProvider } from './ThreatRecoveryProvider';
import { ThreatDashboardProvider } from './ThreatDashboardProvider';
import { ThreatFalsePositiveTracker } from './ThreatFalsePositiveTracker';
import { remediationEventBus } from './ThreatRemediationEvents';

export class ThreatRemediationEngine {
  private configManager: ThreatConfigurationManager;
  private policyManager: ThreatRemediationPolicyManager;
  private safetyValidator: ThreatSafetyValidator;
  private quarantineManager: ThreatQuarantineManager;
  private restoreManager: ThreatRestoreManager;
  private deletionManager: ThreatDeletionManager;
  private rollbackManager: ThreatRollbackManager;
  private approvalManager: ThreatApprovalManager;
  private planner: ThreatRemediationPlanner;
  private history: ThreatRemediationHistory;
  private reportGenerator: ThreatRemediationReportGenerator;
  private recoveryProvider: ThreatRecoveryProvider;
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
    this.restoreManager = new ThreatRestoreManager(this.quarantineManager);
    this.deletionManager = new ThreatDeletionManager(this.quarantineManager, this.configManager.getObservationPeriodMs());
    this.rollbackManager = new ThreatRollbackManager(this.configManager.getRollbackMaxEntries());
    this.approvalManager = new ThreatApprovalManager();
    this.planner = new ThreatRemediationPlanner(this.safetyValidator, this.policyManager);
    this.history = new ThreatRemediationHistory();
    this.reportGenerator = new ThreatRemediationReportGenerator(this.rollbackManager);
    this.recoveryProvider = new ThreatRecoveryProvider(this.quarantineManager, this.rollbackManager);
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
      this.approvalManager.createRequest(
        plan.id,
        plan.investigationId,
        plan.actions.filter((a) => a.requiresApproval),
        plan.actions.reduce<RemediationAction['riskLevel']>((max, a) => {
          const order = ['safe', 'low_risk', 'medium_risk', 'high_risk', 'critical_risk'];
          return order.indexOf(a.riskLevel) > order.indexOf(max) ? a.riskLevel : max;
        }, 'safe'),
        plan.summary,
        this.buildApprovalExplanation(plan),
      );
    }

    return plan;
  }

  // ── Approval ──────────────────────────────────────────────────────

  approvePlan(planId: string, userId?: string, reason?: string): RemediationPlan | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const approvalRequests = this.approvalManager.getByPlan(planId);
    for (const req of approvalRequests) {
      this.approvalManager.approve(req.id, userId, reason);
    }
    plan.status = 'approved';
    remediationEventBus.emitPlanApproved(planId, plan.investigationId, reason);
    return plan;
  }

  rejectPlan(planId: string, userId?: string, reason?: string): RemediationPlan | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    const approvalRequests = this.approvalManager.getByPlan(planId);
    for (const req of approvalRequests) {
      this.approvalManager.reject(req.id, userId, reason);
    }
    plan.status = 'cancelled';
    remediationEventBus.emitPlanRejected(planId, plan.investigationId, reason);
    return plan;
  }

  getApprovalRequest(planId: string): ApprovalRequest | null {
    const requests = this.approvalManager.getByPlan(planId);
    return requests[0] ?? null;
  }

  // ── Execution ─────────────────────────────────────────────────────

  executePlan(planId: string): RemediationPlan | null {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    if (plan.status !== 'approved' && plan.status !== 'draft') return null;
    if (plan.requiresApproval && !this.approvalManager.isApproved(planId)) return null;

    plan.status = 'executing';

    for (const action of plan.actions) {
      if (action.status !== 'pending' && action.status !== 'approved') continue;
      this.executeAction(action, plan);
    }

    const allCompleted = plan.actions.every((a) => a.status === 'completed' || a.status === 'failed' || a.status === 'rolled_back');
    const anyFailed = plan.actions.some((a) => a.status === 'failed');

    plan.status = allCompleted ? (anyFailed ? 'failed' : 'completed') : 'executing';

    // Generate report if enabled
    if (this.configManager.isAutoReportEnabled() && plan.status === 'completed') {
      const report = this.reportGenerator.generate(plan, this.policyManager.getTier());
      this.reports.set(plan.id, report);
      remediationEventBus.emitReportGenerated(plan.id, plan.investigationId, 'Report generated automatically');
    }

    return plan;
  }

  executeAction(action: RemediationAction, plan: RemediationPlan): void {
    action.status = 'executing';
    action.executedAt = Date.now();
    remediationEventBus.emitActionExecuting(action.id, plan.id, `Executing: ${action.type}`);

    try {
      const result = this.performAction(action);
      if (result.success) {
        action.status = 'completed';
        action.completedAt = Date.now();

        // Create rollback entry if reversible
        if (action.reversible && result.rollbackData) {
          const rollbackEntry = this.rollbackManager.createEntry(action, result.rollbackData);
          if (rollbackEntry) {
            action.rollbackId = rollbackEntry.id;
          }
        }

        this.history.record(plan.id, action.investigationId, action.type, 'completed', action.target.name, action.riskLevel);
        remediationEventBus.emitActionCompleted(action.id, plan.id, `Completed: ${action.type}`);
      } else {
        action.status = 'failed';
        action.error = result.error ?? 'Unknown error';
        action.completedAt = Date.now();
        this.history.record(plan.id, action.investigationId, action.type, 'failed', action.target.name, action.riskLevel, null, action.error);
        remediationEventBus.emitActionFailed(action.id, plan.id, action.error);
      }
    } catch (e) {
      action.status = 'failed';
      action.error = e instanceof Error ? e.message : 'Execution error';
      action.completedAt = Date.now();
      this.history.record(plan.id, action.investigationId, action.type, 'failed', action.target.name, action.riskLevel, null, action.error);
      remediationEventBus.emitActionFailed(action.id, plan.id, action.error);
    }
  }

  private performAction(action: RemediationAction): { success: boolean; error?: string; rollbackData?: RollbackData } {
    switch (action.type) {
      case 'review':
        return { success: true };

      case 'ignore':
        return { success: true };

      case 'mark_false_positive':
        return { success: true };

      case 'quarantine':
        return this.performQuarantine(action);

      case 'restore':
        return this.performRestore(action);

      case 'delete':
        return this.performDelete(action);

      case 'disable_startup_entry':
        return this.performDisableStartup(action);

      case 'disable_scheduled_task':
        return this.performDisableTask(action);

      case 'disable_browser_extension':
        return this.performDisableExtension(action);

      case 'reset_browser_setting':
        return this.performResetBrowser(action);

      case 'remove_persistence':
        return this.performRemovePersistence(action);

      case 'export_investigation':
        return { success: true };

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  }

  private performQuarantine(action: RemediationAction): { success: boolean; error?: string; rollbackData?: RollbackData } {
    if (!this.configManager.isQuarantineEnabled()) {
      return { success: false, error: 'Quarantine is disabled' };
    }

    // Create a quarantine entry in the quarantine manager
    const threat: Threat = {
      id: action.threatId,
      name: action.target.name,
      category: action.metadata.category,
      severity: action.metadata.severity,
      confidence: action.metadata.confidence,
      detectionSource: action.metadata.detectionSource,
      detectionTime: action.metadata.detectionTime,
    } as Threat;

    const quarantineEntry = this.quarantineManager.quarantine(
      threat,
      action.investigationId,
      action.target.path,
      action.target.name,
      0,
      '',
      null,
    );

    remediationEventBus.emitQuarantineAdded(quarantineEntry.id, action.threatId, `Quarantined: ${action.target.name}`);

    const rollbackData: RollbackData = {
      originalPath: action.target.path,
      backupPath: quarantineEntry.quarantinePath,
      originalValue: null,
      registryKey: null,
      registryValueName: null,
      browserSetting: null,
      extensionId: null,
      taskName: null,
      serviceName: null,
      startupEntryName: null,
    };

    return { success: true, rollbackData };
  }

  private performRestore(action: RemediationAction): { success: boolean; error?: string } {
    // Look up quarantine entry by threat ID to get the quarantine ID
    const entry = this.quarantineManager.getByThreat(action.threatId);
    if (!entry) {
      return { success: false, error: 'No quarantined item found for this threat' };
    }
    const result = this.restoreManager.restore(entry.id);
    if (!result.success) {
      return { success: false, error: result.error ?? 'Restore failed' };
    }
    remediationEventBus.emitQuarantineRestored(entry.id, `Restored: ${action.target.name}`);
    return { success: true };
  }

  private performDelete(action: RemediationAction): { success: boolean; error?: string } {
    // Look up quarantine entry by threat ID
    const entry = this.quarantineManager.getByThreat(action.threatId);
    if (!entry) {
      return { success: false, error: 'No quarantined item found for this threat' };
    }
    const result = this.deletionManager.delete(entry.id, true);
    if (!result.success) {
      return { success: false, error: result.error ?? 'Deletion failed' };
    }
    remediationEventBus.emitQuarantineDeleted(entry.id, `Deleted: ${action.target.name}`);
    return { success: true };
  }

  private performDisableStartup(action: RemediationAction): { success: boolean; error?: string; rollbackData?: RollbackData } {
    const rollbackData: RollbackData = {
      originalPath: action.target.path,
      backupPath: '',
      originalValue: 'enabled',
      registryKey: action.target.path,
      registryValueName: action.target.name,
      browserSetting: null,
      extensionId: null,
      taskName: null,
      serviceName: null,
      startupEntryName: action.target.name,
    };
    return { success: true, rollbackData };
  }

  private performDisableTask(action: RemediationAction): { success: boolean; error?: string; rollbackData?: RollbackData } {
    const rollbackData: RollbackData = {
      originalPath: action.target.path,
      backupPath: '',
      originalValue: 'enabled',
      registryKey: null,
      registryValueName: null,
      browserSetting: null,
      extensionId: null,
      taskName: action.target.name,
      serviceName: null,
      startupEntryName: null,
    };
    return { success: true, rollbackData };
  }

  private performDisableExtension(action: RemediationAction): { success: boolean; error?: string; rollbackData?: RollbackData } {
    const rollbackData: RollbackData = {
      originalPath: action.target.path,
      backupPath: '',
      originalValue: 'enabled',
      registryKey: null,
      registryValueName: null,
      browserSetting: null,
      extensionId: action.target.name,
      taskName: null,
      serviceName: null,
      startupEntryName: null,
    };
    return { success: true, rollbackData };
  }

  private performResetBrowser(action: RemediationAction): { success: boolean; error?: string; rollbackData?: RollbackData } {
    const rollbackData: RollbackData = {
      originalPath: '',
      backupPath: '',
      originalValue: action.target.path,
      registryKey: null,
      registryValueName: null,
      browserSetting: action.target.name,
      extensionId: null,
      taskName: null,
      serviceName: null,
      startupEntryName: null,
    };
    return { success: true, rollbackData };
  }

  private performRemovePersistence(action: RemediationAction): { success: boolean; error?: string; rollbackData?: RollbackData } {
    const rollbackData: RollbackData = {
      originalPath: action.target.path,
      backupPath: '',
      originalValue: 'present',
      registryKey: action.target.path,
      registryValueName: action.target.name,
      browserSetting: null,
      extensionId: null,
      taskName: null,
      serviceName: null,
      startupEntryName: null,
    };
    return { success: true, rollbackData };
  }

  // ── Rollback ──────────────────────────────────────────────────────

  rollbackAction(actionId: string): boolean {
    const entry = this.rollbackManager.rollbackByAction(actionId);
    if (!entry) return false;

    // Find the action and update its status
    for (const plan of this.plans.values()) {
      const action = plan.actions.find((a) => a.id === actionId);
      if (action) {
        action.status = 'rolled_back';
        this.history.record(plan.id, action.investigationId, action.type, 'rolled_back', action.target.name, action.riskLevel);
        remediationEventBus.emitActionRolledBack(actionId, plan.id, `Rolled back: ${action.type}`);
        break;
      }
    }

    return true;
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

  restoreFromQuarantine(quarantineId: string) {
    return this.restoreManager.restore(quarantineId);
  }

  deleteFromQuarantine(quarantineId: string, userConfirmed: boolean) {
    return this.deletionManager.delete(quarantineId, userConfirmed);
  }

  // ── Public API ────────────────────────────────────────────────────

  getPlan(id: string): RemediationPlan | null {
    return this.plans.get(id) ?? null;
  }

  getAllPlans(): RemediationPlan[] {
    return [...this.plans.values()];
  }

  getReport(planId: string): RemediationReport | null {
    return this.reports.get(planId) ?? null;
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

  getRecoveryStatus() {
    return this.recoveryProvider.getStatus();
  }

  getRecoveryProviders() {
    return this.recoveryProvider.getProviders();
  }

  getRecoveryOptions(investigationId: string) {
    return this.recoveryProvider.getRecoveryOptions(investigationId);
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

  setTier(tier: RemediationTier): void {
    this.policyManager.setTier(tier);
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

  private buildApprovalExplanation(plan: RemediationPlan): string {
    const highRisk = plan.actions.filter((a) => a.riskLevel === 'high_risk' || a.riskLevel === 'critical_risk');
    const destructive = plan.actions.filter((a) => a.type === 'delete');

    const parts: string[] = [];
    parts.push(`This remediation plan contains ${plan.totalActions} action(s).`);
    if (highRisk.length > 0) parts.push(`${highRisk.length} action(s) are classified as high or critical risk.`);
    if (destructive.length > 0) parts.push(`${destructive.length} action(s) are destructive and cannot be undone.`);
    parts.push(`Please review each action carefully before approving.`);

    return parts.join(' ');
  }
}
