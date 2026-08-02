/**
 * ThreatDashboardProvider — builds dashboard data for the remediation UI.
 */
import type {
  RemediationPlan,
  RemediationDashboardData,
  RemediationDashboardSummary,
  RemediationDashboardEntry,
  ApprovalSummary,
  QuarantineSummary,
  FalsePositiveSummary,
} from './types';
import type { ThreatApprovalManager } from './ThreatApprovalManager';
import type { ThreatQuarantineManager } from './ThreatQuarantineManager';
import type { ThreatRollbackManager } from './ThreatRollbackManager';
import type { ThreatFalsePositiveTracker } from './ThreatFalsePositiveTracker';

export class ThreatDashboardProvider {
  constructor(
    private approvalManager: ThreatApprovalManager,
    private quarantineManager: ThreatQuarantineManager,
    private rollbackManager: ThreatRollbackManager,
    private falsePositiveTracker: ThreatFalsePositiveTracker,
  ) {}

  build(plans: RemediationPlan[]): RemediationDashboardData {
    const allActions = plans.flatMap((p) => p.actions);

    const summary: RemediationDashboardSummary = {
      totalPlans: plans.length,
      pendingPlans: plans.filter((p) => p.status === 'pending_approval' || p.status === 'draft').length,
      completedPlans: plans.filter((p) => p.status === 'completed').length,
      totalActions: allActions.length,
      pendingActions: allActions.filter((a) => a.status === 'pending' || a.status === 'approved').length,
      completedActions: allActions.filter((a) => a.status === 'completed').length,
      failedActions: allActions.filter((a) => a.status === 'failed').length,
      quarantinedItems: this.quarantineManager.getSummary().activeQuarantine,
      restoredItems: this.quarantineManager.getSummary().restored,
      deletedItems: this.quarantineManager.getSummary().deleted,
      falsePositives: this.falsePositiveTracker.getSummary().totalFalsePositives,
      rollbacksAvailable: this.rollbackManager.countAvailable(),
      rollbacksExecuted: this.rollbackManager.getAll().filter((r) => r.status === 'rolled_back').length,
    };

    const recentActions: RemediationDashboardEntry[] = allActions
      .filter((a) => a.executedAt !== null || a.status === 'pending')
      .sort((a, b) => (b.executedAt ?? b.createdAt) - (a.executedAt ?? a.createdAt))
      .slice(0, 20)
      .map((a) => ({
        id: a.id,
        actionType: a.type,
        status: a.status,
        riskLevel: a.riskLevel,
        target: a.target.name,
        investigationId: a.investigationId,
        timestamp: a.executedAt ?? a.createdAt,
        reversible: a.reversible,
      }));

    const approvalSummary: ApprovalSummary = this.approvalManager.getSummary();
    const quarantineSummary: QuarantineSummary = this.quarantineManager.getSummary();
    const falsePositiveSummary: FalsePositiveSummary = this.falsePositiveTracker.getSummary();

    return {
      summary,
      pendingApprovals: approvalSummary,
      quarantineSummary,
      recentActions,
      falsePositiveSummary,
      rollbackAvailable: this.rollbackManager.countAvailable(),
      lastUpdated: Date.now(),
    };
  }
}
