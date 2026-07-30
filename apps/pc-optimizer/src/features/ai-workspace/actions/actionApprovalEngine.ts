/**
 * Natural Language Action Engine — Action Approval Engine
 *
 * EPIC 5 PHASE A PART 4
 *
 * Manages approval for action plans.
 * Supports: always_ask, risk_based, enterprise_policy, user_preference,
 * one_time_approval, session_approval.
 */
import type { ActionPlan, ApprovalPolicy, ApprovalResult, ApprovalPolicyType, ActionRiskLevel } from './types';

export class ActionApprovalEngine {
  private _policies: ApprovalPolicy[];
  private _activePolicy: ApprovalPolicy;
  private _sessionApprovals: Set<string> = new Set();
  private _oneTimeApprovals: Map<string, ApprovalResult> = new Map();

  constructor(policies: ApprovalPolicy[]) {
    this._policies = policies.length > 0 ? policies : [{ type: 'risk_based', riskThreshold: 'medium', autoApproveBelow: true, description: 'Default risk-based policy', futureMetadata: {} }];
    this._activePolicy = this._policies[0]!;
  }

  setActivePolicy(policyType: ApprovalPolicyType): boolean {
    const policy = this._policies.find((p) => p.type === policyType);
    if (!policy) return false;
    this._activePolicy = policy;
    return true;
  }

  getActivePolicy(): ApprovalPolicy {
    return this._activePolicy;
  }

  checkApproval(plan: ActionPlan): ApprovalResult {
    const policy = this._activePolicy;

    // Check session approval
    if (this._sessionApprovals.has(plan.intent)) {
      return {
        approved: true,
        reason: 'Approved for this session',
        policy: 'session_approval',
        expiresAt: null,
        futureMetadata: {},
      };
    }

    // Check one-time approval
    const oneTime = this._oneTimeApprovals.get(plan.id);
    if (oneTime && oneTime.approved) {
      return oneTime;
    }

    // Always ask
    if (policy.type === 'always_ask') {
      return {
        approved: false,
        reason: 'Approval required (always ask policy)',
        policy: policy.type,
        expiresAt: null,
        futureMetadata: {},
      };
    }

    // Risk based
    if (policy.type === 'risk_based') {
      const riskScores: Record<ActionRiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
      const thresholdScore = riskScores[policy.riskThreshold];
      const planRiskScore = riskScores[plan.estimatedRisk];

      if (policy.autoApproveBelow && planRiskScore < thresholdScore) {
        return {
          approved: true,
          reason: `Auto-approved: risk level (${plan.estimatedRisk}) below threshold (${policy.riskThreshold})`,
          policy: policy.type,
          expiresAt: null,
          futureMetadata: {},
        };
      }

      return {
        approved: false,
        reason: `Approval required: risk level (${plan.estimatedRisk}) meets or exceeds threshold (${policy.riskThreshold})`,
        policy: policy.type,
        expiresAt: null,
        futureMetadata: {},
      };
    }

    // User preference
    if (policy.type === 'user_preference') {
      const riskScores: Record<ActionRiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
      if (policy.autoApproveBelow && riskScores[plan.estimatedRisk] < riskScores[policy.riskThreshold]) {
        return {
          approved: true,
          reason: 'Auto-approved based on user preferences',
          policy: policy.type,
          expiresAt: null,
          futureMetadata: {},
        };
      }
      return {
        approved: false,
        reason: 'Approval required based on user preferences',
        policy: policy.type,
        expiresAt: null,
        futureMetadata: {},
      };
    }

    // Enterprise policy
    if (policy.type === 'enterprise_policy') {
      return {
        approved: false,
        reason: 'Enterprise policy requires explicit approval',
        policy: policy.type,
        expiresAt: null,
        futureMetadata: {},
      };
    }

    // Default: require approval
    return {
      approved: false,
      reason: 'Approval required',
      policy: policy.type,
      expiresAt: null,
      futureMetadata: {},
    };
  }

  approve(plan: ActionPlan, policyType: ApprovalPolicyType = 'one_time_approval'): ApprovalResult {
    const result: ApprovalResult = {
      approved: true,
      reason: 'Approved by user',
      policy: policyType,
      expiresAt: policyType === 'session_approval' ? null : new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      futureMetadata: {},
    };

    if (policyType === 'session_approval') {
      this._sessionApprovals.add(plan.intent);
    } else {
      this._oneTimeApprovals.set(plan.id, result);
    }

    return result;
  }

  reject(plan: ActionPlan, reason: string): ApprovalResult {
    const result: ApprovalResult = {
      approved: false,
      reason: reason || 'Rejected by user',
      policy: this._activePolicy.type,
      expiresAt: null,
      futureMetadata: {},
    };
    this._oneTimeApprovals.set(plan.id, result);
    return result;
  }

  clearSessionApprovals(): void {
    this._sessionApprovals.clear();
  }

  clearOneTimeApprovals(): void {
    this._oneTimeApprovals.clear();
  }

  clearAll(): void {
    this._sessionApprovals.clear();
    this._oneTimeApprovals.clear();
  }
}
