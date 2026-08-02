/**
 * ThreatRemediationPolicy — evaluates and enforces remediation policies.
 *
 * Supported modes:
 *   - manual_only: Every action requires explicit user approval
 *   - recommend_only: Engine recommends but never executes
 *   - auto_remediate_low_risk: Low-risk actions auto-execute
 *   - enterprise: Future — policy-driven bulk automation
 *
 * Safety is the highest priority. Never auto-remediate high-risk actions.
 */
import type {
  RemediationPolicy,
  RemediationAction,
  RemediationActionType,
  RemediationRiskLevel,
  RemediationTier,
} from './types';
import { actionRequiresApproval, isActionDestructive, tierAllowsAction } from './types';

const RISK_ORDER: RemediationRiskLevel[] = ['safe', 'low_risk', 'medium_risk', 'high_risk', 'critical_risk'];

export class ThreatRemediationPolicyManager {
  private policy: RemediationPolicy;

  constructor(policy?: Partial<RemediationPolicy>) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  get(): RemediationPolicy {
    return { ...this.policy };
  }

  update(updates: Partial<RemediationPolicy>): void {
    this.policy = { ...this.policy, ...updates };
  }

  setMode(mode: RemediationPolicy['mode']): void {
    this.policy.mode = mode;
  }

  setTier(tier: RemediationTier): void {
    this.policy.tier = tier;
  }

  shouldAutoExecute(action: RemediationAction): boolean {
    // Never auto-execute destructive actions
    if (isActionDestructive(action.type)) return false;

    // Never auto-execute if tier doesn't allow
    if (!tierAllowsAction(action.type, this.policy.tier)) return false;

    // Manual only — never auto-execute
    if (this.policy.mode === 'manual_only') return false;

    // Recommend only — never auto-execute
    if (this.policy.mode === 'recommend_only') return false;

    // Auto-remediate low-risk
    if (this.policy.mode === 'auto_remediate_low_risk') {
      const thresholdIdx = RISK_ORDER.indexOf(this.policy.autoRemediateThreshold);
      const riskIdx = RISK_ORDER.indexOf(action.riskLevel);
      return riskIdx <= thresholdIdx;
    }

    // Enterprise — future
    if (this.policy.mode === 'enterprise') {
      const thresholdIdx = RISK_ORDER.indexOf(this.policy.autoRemediateThreshold);
      const riskIdx = RISK_ORDER.indexOf(action.riskLevel);
      return riskIdx <= thresholdIdx && !action.requiresApproval;
    }

    return false;
  }

  requiresApproval(action: RemediationAction): boolean {
    return actionRequiresApproval(action.type, action.riskLevel, this.policy);
  }

  requiresUserConfirmation(action: RemediationAction): boolean {
    if (isActionDestructive(action.type)) return true;
    if (action.riskLevel === 'high_risk' || action.riskLevel === 'critical_risk') return true;
    if (this.policy.requireApprovalForSystemLocations && this.isSystemLocation(action.target.path)) return true;
    if (this.policy.requireApprovalForCriticalServices && action.target.type === 'service') return true;
    if (this.policy.requireApprovalForBootChanges && this.isBootRelated(action)) return true;
    if (this.policy.requireApprovalForUnsignedInProtected && this.isUnsignedInProtected(action)) return true;
    return false;
  }

  quarantineBeforeDelete(): boolean {
    return this.policy.quarantineBeforeDelete;
  }

  getMaxAutoRemediatePerRun(): number {
    return this.policy.maxAutoRemediatePerRun;
  }

  getObservationPeriodMs(): number {
    return this.policy.observationPeriodMs;
  }

  allowsBulkRemediation(): boolean {
    return this.policy.allowBulkRemediation && this.policy.tier === 'pro';
  }

  allowsScheduledRemediation(): boolean {
    return this.policy.allowScheduledRemediation && this.policy.tier === 'pro';
  }

  getTier(): RemediationTier {
    return this.policy.tier;
  }

  canPerformAction(actionType: RemediationActionType): boolean {
    return tierAllowsAction(actionType, this.policy.tier);
  }

  private isSystemLocation(path: string): boolean {
    const systemPaths = ['C:\\Windows\\System32', 'C:\\Windows\\SysWOW64', 'C:\\Windows\\System', 'C:\\Program Files', 'C:\\Program Files (x86)'];
    return systemPaths.some((sp) => path.toLowerCase().startsWith(sp.toLowerCase()));
  }

  private isBootRelated(action: RemediationAction): boolean {
    return action.target.type === 'service' && action.target.name.toLowerCase().includes('boot');
  }

  private isUnsignedInProtected(action: RemediationAction): boolean {
    // Check if action targets an unsigned file in a protected directory
    return action.target.type === 'file' && this.isSystemLocation(action.target.path);
  }
}

const DEFAULT_POLICY: RemediationPolicy = {
  mode: 'manual_only',
  autoRemediateThreshold: 'low_risk',
  requireApprovalForHighRisk: true,
  requireApprovalForSystemLocations: true,
  requireApprovalForCriticalServices: true,
  requireApprovalForBootChanges: true,
  requireApprovalForUnsignedInProtected: true,
  quarantineBeforeDelete: true,
  maxAutoRemediatePerRun: 5,
  observationPeriodMs: 86400000,
  allowBulkRemediation: false,
  allowScheduledRemediation: false,
  tier: 'free',
};
