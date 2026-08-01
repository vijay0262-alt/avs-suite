/**
 * OptimizationApprovalManager — manages user approval flow for
 * optimization actions that require confirmation.
 *
 * Low-risk actions can be auto-approved based on configuration.
 * Higher-risk actions always require explicit user confirmation.
 */
import type {
  OptimizationAction,
  OptimizationPlan,
  ApprovalRequest,
} from './types';
import { optimizationEventBus } from './OptimizationEvents';

export class OptimizationApprovalManager {
  private pendingApprovals = new Map<string, ApprovalRequest>();
  private approvedActions = new Set<string>();
  private rejectedActions = new Set<string>();

  constructor(private autoApproveLowRisk: boolean) {}

  requestApprovals(plan: OptimizationPlan): ApprovalRequest[] {
    const requests: ApprovalRequest[] = [];

    for (const action of plan.actions) {
      if (this.autoApproveLowRisk && !action.requiresUserConfirmation) {
        this.approvedActions.add(action.id);
        optimizationEventBus.emitActionApproved(action.id, plan.id);
        continue;
      }

      if (action.requiresUserConfirmation) {
        const request: ApprovalRequest = {
          id: `approval-${action.id}`,
          planId: plan.id,
          actionId: action.id,
          actionTitle: action.title,
          riskLevel: action.risk.level,
          reason: this.buildReason(action),
          evidence: action.evidence,
          estimatedBenefit: action.impact.description,
          rollbackAvailable: action.rollbackAvailable,
          status: 'pending',
          requestedAt: Date.now(),
          decidedAt: null,
          decidedBy: null,
        };
        this.pendingApprovals.set(request.id, request);
        requests.push(request);
      } else {
        this.approvedActions.add(action.id);
      }
    }

    return requests;
  }

  approve(requestId: string, decidedBy: string = 'user'): boolean {
    const request = this.pendingApprovals.get(requestId);
    if (!request || request.status !== 'pending') return false;

    request.status = 'approved';
    request.decidedAt = Date.now();
    request.decidedBy = decidedBy;
    this.approvedActions.add(request.actionId);
    this.pendingApprovals.delete(requestId);
    optimizationEventBus.emitActionApproved(request.actionId, request.planId);
    return true;
  }

  reject(requestId: string, reason?: string, decidedBy: string = 'user'): boolean {
    const request = this.pendingApprovals.get(requestId);
    if (!request || request.status !== 'pending') return false;

    request.status = 'rejected';
    request.decidedAt = Date.now();
    request.decidedBy = decidedBy;
    this.rejectedActions.add(request.actionId);
    this.pendingApprovals.delete(requestId);
    optimizationEventBus.emitActionRejected(request.actionId, request.planId, reason);
    return true;
  }

  isApproved(actionId: string): boolean {
    return this.approvedActions.has(actionId);
  }

  isRejected(actionId: string): boolean {
    return this.rejectedActions.has(actionId);
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }

  getApprovedActionIds(): string[] {
    return Array.from(this.approvedActions);
  }

  getRejectedActionIds(): string[] {
    return Array.from(this.rejectedActions);
  }

  expireStaleApprovals(maxAgeMs: number): void {
    const now = Date.now();
    for (const [id, request] of this.pendingApprovals) {
      if (now - request.requestedAt > maxAgeMs) {
        request.status = 'expired';
        this.pendingApprovals.delete(id);
      }
    }
  }

  clear(): void {
    this.pendingApprovals.clear();
    this.approvedActions.clear();
    this.rejectedActions.clear();
  }

  private buildReason(action: OptimizationAction): string {
    const parts: string[] = [];
    parts.push(`Risk level: ${action.risk.level}.`);
    if (action.risk.factors.length > 0) {
      parts.push(`Risk factors: ${action.risk.factors.join('; ')}.`);
    }
    if (action.rollbackAvailable) {
      parts.push('Rollback is available if needed.');
    } else {
      parts.push('This action is irreversible.');
    }
    return parts.join(' ');
  }
}
