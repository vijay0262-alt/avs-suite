/**
 * Automation Approval Engine — evaluates approval policies.
 *
 * Supports: Always Ask, Ask Once, Never Ask, Enterprise Approval,
 * Risk Based, Profile Based, Custom Approval.
 */
import type {
  AutomationRule,
  ApprovalContext,
  ApprovalDecision,
} from './types';
import { riskToScore } from './types';

export class AutomationApprovalEngine {
  private _askOnceMemory: Map<string, ApprovalDecision> = new Map();

  evaluate(rule: AutomationRule, context: ApprovalContext): ApprovalDecision {
    const policy = rule.approvalPolicy;

    // Check custom evaluator
    if (policy.customEvaluator) {
      return policy.customEvaluator(context);
    }

    switch (policy.type) {
      case 'always_ask':
        return this._alwaysAsk(rule);
      case 'ask_once':
        return this._askOnce(rule, context);
      case 'never_ask':
        return this._neverAsk(rule);
      case 'enterprise_approval':
        return this._enterpriseApproval(rule, context);
      case 'risk_based':
        return this._riskBased(rule, context);
      case 'profile_based':
        return this._profileBased(rule, context);
      case 'custom_approval':
        return this._neverAsk(rule);
      default:
        return this._alwaysAsk(rule);
    }
  }

  private _alwaysAsk(_rule: AutomationRule): ApprovalDecision {
    return {
      approved: false,
      reason: 'Always ask policy — user approval required',
      requiresUserInput: true,
      expiresAt: this._computeExpiry(3600000),
      futureMetadata: {},
    };
  }

  private _askOnce(rule: AutomationRule, _context: ApprovalContext): ApprovalDecision {
    const existing = this._askOnceMemory.get(rule.id);
    if (existing) return existing;
    return {
      approved: false,
      reason: 'Ask once policy — awaiting first user approval',
      requiresUserInput: true,
      expiresAt: this._computeExpiry(3600000),
      futureMetadata: {},
    };
  }

  private _neverAsk(_rule: AutomationRule): ApprovalDecision {
    return {
      approved: true,
      reason: 'Never ask policy — auto-approved',
      requiresUserInput: false,
      expiresAt: null,
      futureMetadata: {},
    };
  }

  private _enterpriseApproval(rule: AutomationRule, context: ApprovalContext): ApprovalDecision {
    const enterprise = context.enterprisePolicy;
    if (!enterprise) {
      return {
        approved: false,
        reason: 'Enterprise approval required but no enterprise policy configured',
        requiresUserInput: true,
        expiresAt: this._computeExpiry(3600000),
        futureMetadata: {},
      };
    }
    const riskScore = riskToScore(context.riskLevel);
    if (riskScore <= 0.2 && enterprise.autoApproveLowRisk) {
      return {
        approved: true,
        reason: 'Enterprise auto-approved (low risk)',
        requiresUserInput: false,
        expiresAt: null,
        futureMetadata: {},
      };
    }
    if (riskScore >= 0.8 && enterprise.requireApprovalForHighRisk) {
      return {
        approved: false,
        reason: 'Enterprise approval required (high risk)',
        requiresUserInput: true,
        expiresAt: this._computeExpiry(3600000),
        futureMetadata: {},
      };
    }
    return {
      approved: true,
      reason: 'Enterprise approved',
      requiresUserInput: false,
      expiresAt: null,
      futureMetadata: {},
    };
  }

  private _riskBased(rule: AutomationRule, context: ApprovalContext): ApprovalDecision {
    const riskScore = riskToScore(context.riskLevel);
    const threshold = rule.approvalPolicy.riskThreshold;
    if (riskScore <= threshold) {
      return {
        approved: true,
        reason: `Risk score ${riskScore.toFixed(2)} <= threshold ${threshold} — auto-approved`,
        requiresUserInput: false,
        expiresAt: null,
        futureMetadata: {},
      };
    }
    return {
      approved: false,
      reason: `Risk score ${riskScore.toFixed(2)} > threshold ${threshold} — approval required`,
      requiresUserInput: true,
      expiresAt: this._computeExpiry(3600000),
      futureMetadata: {},
    };
  }

  private _profileBased(rule: AutomationRule, context: ApprovalContext): ApprovalDecision {
    const riskScore = riskToScore(context.riskLevel);
    const threshold = rule.approvalPolicy.riskThreshold;
    if (riskScore <= threshold) {
      return {
        approved: true,
        reason: `Profile-based auto-approved (risk ${riskScore.toFixed(2)})`,
        requiresUserInput: false,
        expiresAt: null,
        futureMetadata: {},
      };
    }
    return {
      approved: false,
      reason: `Profile-based approval required (risk ${riskScore.toFixed(2)})`,
      requiresUserInput: true,
      expiresAt: this._computeExpiry(3600000),
      futureMetadata: {},
    };
  }

  rememberApproval(ruleId: string, decision: ApprovalDecision): void {
    this._askOnceMemory.set(ruleId, decision);
  }

  forgetApproval(ruleId: string): void {
    this._askOnceMemory.delete(ruleId);
  }

  clearMemory(): void {
    this._askOnceMemory.clear();
  }

  private _computeExpiry(ms: number): string {
    return new Date(Date.now() + ms).toISOString();
  }
}
