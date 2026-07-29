/**
 * Upgrade Reason Builder — builds structured upgrade reasons
 * with clear benefits. Never uses fear-based messaging.
 */
import type { UpgradeReason, UpgradeBenefit, SubscriptionPlan, UpgradeRecommendationRule } from './types';

export class UpgradeReasonBuilder {
  /**
   * Build an upgrade reason from a recommendation rule.
   */
  buildFromRule(
    rule: UpgradeRecommendationRule,
    currentPlan: SubscriptionPlan,
  ): UpgradeReason {
    return {
      featureId: rule.featureId,
      currentPlan,
      recommendedPlan: rule.recommendedPlan,
      reason: rule.reason,
      benefits: rule.benefits,
      urgency: rule.urgency,
      contextHint: rule.contextHint,
    };
  }

  /**
   * Build an upgrade reason from a locked feature.
   */
  buildForLockedFeature(
    featureId: string,
    currentPlan: SubscriptionPlan,
    recommendedPlan: SubscriptionPlan,
    reason: string,
    benefits: UpgradeBenefit[],
  ): UpgradeReason {
    return {
      featureId,
      currentPlan,
      recommendedPlan,
      reason,
      benefits,
      urgency: 'medium',
      contextHint: 'feature_locked',
    };
  }

  /**
   * Build an upgrade reason from a quota limit reached.
   */
  buildForQuotaExceeded(
    featureId: string,
    quotaId: string,
    currentPlan: SubscriptionPlan,
    recommendedPlan: SubscriptionPlan,
    reason: string,
    benefits: UpgradeBenefit[],
  ): UpgradeReason {
    return {
      featureId,
      currentPlan,
      recommendedPlan,
      reason,
      benefits,
      urgency: 'high',
      contextHint: `quota_exceeded:${quotaId}`,
    };
  }

  /**
   * Build a generic upgrade reason.
   */
  buildGeneric(
    featureId: string,
    currentPlan: SubscriptionPlan,
    recommendedPlan: SubscriptionPlan,
    reason: string,
    benefits: UpgradeBenefit[],
    urgency: 'low' | 'medium' | 'high' = 'low',
  ): UpgradeReason {
    return {
      featureId,
      currentPlan,
      recommendedPlan,
      reason,
      benefits,
      urgency,
      contextHint: 'generic',
    };
  }
}
