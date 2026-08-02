/**
 * ThreatApprovalManager — manages user approval workflow.
 *
 * Requires confirmation for:
 *   - High-risk actions
 *   - System locations
 *   - Unsigned files in protected directories
 *   - Critical services
 *   - Boot-related changes
 *   - Destructive actions (always)
 */
import type { ApprovalRequest, ApprovalSummary, RemediationAction, RemediationRiskLevel } from './types';

export class ThreatApprovalManager {
  private requests = new Map<string, ApprovalRequest>();

  createRequest(
    planId: string,
    investigationId: string,
    actions: RemediationAction[],
    riskLevel: RemediationRiskLevel,
    summary: string,
    explanation: string,
  ): ApprovalRequest {
    const id = `appr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const request: ApprovalRequest = {
      id,
      planId,
      investigationId,
      actions,
      riskLevel,
      summary,
      explanation,
      createdAt: Date.now(),
      respondedAt: null,
      response: null,
      userId: null,
      reason: null,
    };

    this.requests.set(id, request);
    return request;
  }

  approve(id: string, userId?: string, reason?: string): ApprovalRequest | null {
    const request = this.requests.get(id);
    if (!request) return null;
    if (request.response !== null) return null;

    request.response = 'approved';
    request.respondedAt = Date.now();
    request.userId = userId ?? null;
    request.reason = reason ?? null;
    return request;
  }

  reject(id: string, userId?: string, reason?: string): ApprovalRequest | null {
    const request = this.requests.get(id);
    if (!request) return null;
    if (request.response !== null) return null;

    request.response = 'rejected';
    request.respondedAt = Date.now();
    request.userId = userId ?? null;
    request.reason = reason ?? null;
    return request;
  }

  defer(id: string, userId?: string): ApprovalRequest | null {
    const request = this.requests.get(id);
    if (!request) return null;
    if (request.response !== null) return null;

    request.response = 'deferred';
    request.respondedAt = Date.now();
    request.userId = userId ?? null;
    return request;
  }

  get(id: string): ApprovalRequest | null {
    return this.requests.get(id) ?? null;
  }

  getPending(): ApprovalRequest[] {
    return [...this.requests.values()].filter((r) => r.response === null);
  }

  getApproved(): ApprovalRequest[] {
    return [...this.requests.values()].filter((r) => r.response === 'approved');
  }

  getByPlan(planId: string): ApprovalRequest[] {
    return [...this.requests.values()].filter((r) => r.planId === planId);
  }

  getByInvestigation(investigationId: string): ApprovalRequest[] {
    return [...this.requests.values()].filter((r) => r.investigationId === investigationId);
  }

  isApproved(planId: string): boolean {
    const requests = this.getByPlan(planId);
    return requests.some((r) => r.response === 'approved');
  }

  isRejected(planId: string): boolean {
    const requests = this.getByPlan(planId);
    return requests.some((r) => r.response === 'rejected');
  }

  getSummary(): ApprovalSummary {
    const all = [...this.requests.values()];
    const pending = all.filter((r) => r.response === null);
    const approved = all.filter((r) => r.response === 'approved');
    const rejected = all.filter((r) => r.response === 'rejected');
    const deferred = all.filter((r) => r.response === 'deferred');

    return {
      pendingCount: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      deferredCount: deferred.length,
      oldestPending: pending.length > 0 ? Math.min(...pending.map((r) => r.createdAt)) : null,
    };
  }

  clear(): void {
    this.requests.clear();
  }
}
