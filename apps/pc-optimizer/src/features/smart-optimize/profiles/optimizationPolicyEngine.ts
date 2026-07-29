/**
 * Optimization Policy Engine — evaluates and applies profile policies.
 *
 * Supports: Execution, Safety, Confirmation, Scheduling, Risk,
 * Rollback, Notification, Enterprise policies.
 */
import type {
  ProfilePolicies,
  ExecutionPolicy,
  SafetyPolicy,
  ConfirmationPolicy,
  SchedulingPolicy,
  RiskPolicy,
  RollbackPolicy,
  NotificationPolicy,
  EnterprisePolicy,
  RiskLevel,
} from './types';

export class OptimizationPolicyEngine {
  evaluateExecution(policy: ExecutionPolicy): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    if (policy.maxParallelActions < 1) issues.push('maxParallelActions must be at least 1');
    if (policy.timeoutSeconds < 1) issues.push('timeoutSeconds must be positive');
    if (policy.retryCount < 0) issues.push('retryCount must be non-negative');
    return { valid: issues.length === 0, issues };
  }

  evaluateSafety(policy: SafetyPolicy, actionRisk: RiskLevel): { allowed: boolean; reason: string } {
    const riskScores: Record<RiskLevel, number> = { none: 0, low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    if (riskScores[actionRisk] > riskScores[policy.maxRiskLevel] && !policy.allowUnsafeActions) {
      return { allowed: false, reason: `Action risk (${actionRisk}) exceeds max (${policy.maxRiskLevel})` };
    }
    if (policy.skipHighRiskActions && actionRisk === 'high') {
      return { allowed: false, reason: 'High-risk actions are skipped by policy' };
    }
    return { allowed: true, reason: 'Action passes safety policy' };
  }

  evaluateConfirmation(policy: ConfirmationPolicy, actionRisk: RiskLevel): { required: boolean; reason: string } {
    if (policy.requireForAllActions) return { required: true, reason: 'Confirmation required for all actions' };
    const riskScores: Record<RiskLevel, number> = { none: 0, low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    if (riskScores[actionRisk] >= riskScores[policy.riskThreshold]) {
      return { required: true, reason: `Action risk (${actionRisk}) meets confirmation threshold (${policy.riskThreshold})` };
    }
    return { required: false, reason: 'Confirmation not required' };
  }

  evaluateScheduling(policy: SchedulingPolicy): { canRunNow: boolean; reason: string } {
    if (policy.type === 'manual') return { canRunNow: false, reason: 'Manual scheduling — user must initiate' };
    if (policy.type === 'scheduled' && !policy.preferredTime) return { canRunNow: false, reason: 'Scheduled but no preferred time set' };
    return { canRunNow: true, reason: 'Can run immediately' };
  }

  evaluateRisk(policy: RiskPolicy, overallRisk: RiskLevel): { acceptable: boolean; reason: string } {
    const riskScores: Record<RiskLevel, number> = { none: 0, low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    if (riskScores[overallRisk] > riskScores[policy.maxOverallRisk]) {
      return { acceptable: false, reason: `Overall risk (${overallRisk}) exceeds max (${policy.maxOverallRisk})` };
    }
    if (policy.autoExcludeCritical && overallRisk === 'critical') {
      return { acceptable: false, reason: 'Critical risk auto-excluded' };
    }
    return { acceptable: true, reason: 'Risk is acceptable' };
  }

  evaluateRollback(policy: RollbackPolicy, hasRollback: boolean): { canProceed: boolean; reason: string } {
    if (policy.requireRollbackCapability && !hasRollback) {
      return { canProceed: false, reason: 'Rollback capability required but not available' };
    }
    return { canProceed: true, reason: 'Rollback policy satisfied' };
  }

  evaluateNotification(policy: NotificationPolicy, event: string): { shouldNotify: boolean } {
    if (policy.type === 'none') return { shouldNotify: false };
    switch (event) {
      case 'start': return { shouldNotify: policy.notifyOnStart };
      case 'complete': return { shouldNotify: policy.notifyOnComplete };
      case 'error': return { shouldNotify: policy.notifyOnError };
      case 'rollback': return { shouldNotify: policy.notifyOnRollback };
      default: return { shouldNotify: policy.type !== 'none' as string };
    }
  }

  evaluateEnterprise(policy: EnterprisePolicy, profileId: string): { allowed: boolean; reason: string } {
    if (policy.enforceProfiles) {
      if (policy.allowedProfiles.length > 0 && !policy.allowedProfiles.includes(profileId)) {
        return { allowed: false, reason: 'Profile not in allowed list' };
      }
      if (policy.blockedProfiles.includes(profileId)) {
        return { allowed: false, reason: 'Profile is blocked by enterprise policy' };
      }
    }
    return { allowed: true, reason: 'Enterprise policy satisfied' };
  }

  evaluateAll(policies: ProfilePolicies, profileId: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const exec = this.evaluateExecution(policies.execution);
    if (!exec.valid) issues.push(...exec.issues);
    const ent = this.evaluateEnterprise(policies.enterprise, profileId);
    if (!ent.allowed) issues.push(ent.reason);
    return { valid: issues.length === 0, issues };
  }

  mergePolicies(base: ProfilePolicies, overrides: Partial<ProfilePolicies>): ProfilePolicies {
    return {
      execution: { ...base.execution, ...overrides.execution },
      safety: { ...base.safety, ...overrides.safety },
      confirmation: { ...base.confirmation, ...overrides.confirmation },
      scheduling: { ...base.scheduling, ...overrides.scheduling },
      risk: { ...base.risk, ...overrides.risk },
      rollback: { ...base.rollback, ...overrides.rollback },
      notification: { ...base.notification, ...overrides.notification },
      enterprise: { ...base.enterprise, ...overrides.enterprise },
    };
  }
}
