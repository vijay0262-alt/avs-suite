/**
 * Optimization Constraint Engine — evaluates profile constraints.
 *
 * Supports: Max Duration, Max Risk, Require Rollback, Require Confirmation,
 * Allowed Categories, Blocked Categories, Subscription/Capability Requirements.
 */
import type {
  ProfileConstraints,
  RiskLevel,
  RecommendationCategory,
} from './types';

export class OptimizationConstraintEngine {
  evaluateDuration(constraints: ProfileConstraints, estimatedDuration: number): { passes: boolean; reason: string } {
    if (estimatedDuration > constraints.maxDurationMinutes * 60) {
      return { passes: false, reason: `Duration ${estimatedDuration}s exceeds max ${constraints.maxDurationMinutes}min` };
    }
    return { passes: true, reason: 'Duration within limits' };
  }

  evaluateRisk(constraints: ProfileConstraints, risk: RiskLevel): { passes: boolean; reason: string } {
    const riskScores: Record<RiskLevel, number> = { none: 0, low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    if (riskScores[risk] > riskScores[constraints.maxRiskLevel]) {
      return { passes: false, reason: `Risk (${risk}) exceeds max (${constraints.maxRiskLevel})` };
    }
    return { passes: true, reason: 'Risk within limits' };
  }

  evaluateRollback(constraints: ProfileConstraints, hasRollback: boolean): { passes: boolean; reason: string } {
    if (constraints.requireRollback && !hasRollback) {
      return { passes: false, reason: 'Rollback required but not available' };
    }
    return { passes: true, reason: 'Rollback constraint satisfied' };
  }

  evaluateConfirmation(constraints: ProfileConstraints, requiresConfirmation: boolean): { passes: boolean; reason: string } {
    if (constraints.requireConfirmation && !requiresConfirmation) {
      return { passes: false, reason: 'Confirmation required but not set' };
    }
    return { passes: true, reason: 'Confirmation constraint satisfied' };
  }

  evaluateCategory(constraints: ProfileConstraints, category: RecommendationCategory): { passes: boolean; reason: string } {
    if (constraints.blockedCategories.includes(category)) {
      return { passes: false, reason: `Category "${category}" is blocked` };
    }
    if (constraints.allowedCategories.length > 0 && !constraints.allowedCategories.includes(category)) {
      return { passes: false, reason: `Category "${category}" not in allowed list` };
    }
    return { passes: true, reason: 'Category allowed' };
  }

  evaluateSubscription(constraints: ProfileConstraints, subscription: string): { passes: boolean; reason: string } {
    if (constraints.subscriptionRequirements.length === 0) return { passes: true, reason: 'No subscription requirements' };
    if (constraints.subscriptionRequirements.includes(subscription)) {
      return { passes: true, reason: 'Subscription requirement met' };
    }
    return { passes: false, reason: `Subscription "${subscription}" does not meet requirements` };
  }

  evaluateCapabilities(constraints: ProfileConstraints, capabilities: string[]): { passes: boolean; reason: string } {
    if (constraints.capabilityRequirements.length === 0) return { passes: true, reason: 'No capability requirements' };
    for (const req of constraints.capabilityRequirements) {
      if (!capabilities.includes(req)) {
        return { passes: false, reason: `Missing capability: ${req}` };
      }
    }
    return { passes: true, reason: 'All capabilities available' };
  }

  evaluateAll(
    constraints: ProfileConstraints,
    context: {
      estimatedDuration: number;
      risk: RiskLevel;
      hasRollback: boolean;
      requiresConfirmation: boolean;
      categories: RecommendationCategory[];
      subscription: string;
      capabilities: string[];
    },
  ): { passes: boolean; violations: string[] } {
    const violations: string[] = [];

    const duration = this.evaluateDuration(constraints, context.estimatedDuration);
    if (!duration.passes) violations.push(duration.reason);

    const risk = this.evaluateRisk(constraints, context.risk);
    if (!risk.passes) violations.push(risk.reason);

    const rollback = this.evaluateRollback(constraints, context.hasRollback);
    if (!rollback.passes) violations.push(rollback.reason);

    const confirmation = this.evaluateConfirmation(constraints, context.requiresConfirmation);
    if (!confirmation.passes) violations.push(confirmation.reason);

    for (const category of context.categories) {
      const cat = this.evaluateCategory(constraints, category);
      if (!cat.passes) violations.push(cat.reason);
    }

    const sub = this.evaluateSubscription(constraints, context.subscription);
    if (!sub.passes) violations.push(sub.reason);

    const caps = this.evaluateCapabilities(constraints, context.capabilities);
    if (!caps.passes) violations.push(caps.reason);

    return { passes: violations.length === 0, violations };
  }

  mergeConstraints(base: ProfileConstraints, overrides: Partial<ProfileConstraints>): ProfileConstraints {
    return {
      ...base,
      ...overrides,
      allowedCategories: overrides.allowedCategories ?? base.allowedCategories,
      blockedCategories: overrides.blockedCategories ?? base.blockedCategories,
      subscriptionRequirements: overrides.subscriptionRequirements ?? base.subscriptionRequirements,
      capabilityRequirements: overrides.capabilityRequirements ?? base.capabilityRequirements,
    };
  }
}
