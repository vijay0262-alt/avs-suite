/**
 * Feature Visibility Service — determines feature visibility state.
 *
 * Supports three visibility states:
 *   Visible, Limited, Hidden
 *
 * Nothing disappears completely unless configured.
 */
import type { FeatureVisibilityState, FeatureVisibilityRule, SubscriptionPlan } from './types';
import type { CapabilityResolver } from '../usage-capabilities/capabilityResolver';

export class FeatureVisibilityService {
  private _rules: Map<string, FeatureVisibilityRule> = new Map();
  private _resolver: CapabilityResolver | null = null;

  setRules(rules: FeatureVisibilityRule[]): void {
    this._rules.clear();
    for (const rule of rules) {
      this._rules.set(rule.featureId, rule);
    }
  }

  setCapabilityResolver(resolver: CapabilityResolver): void {
    this._resolver = resolver;
  }

  /**
   * Get the visibility state for a feature given a plan.
   */
  getVisibility(featureId: string, plan: SubscriptionPlan): FeatureVisibilityState {
    const rule = this._rules.get(featureId);
    if (rule) {
      const planVisibility = rule.planVisibility[plan];
      if (planVisibility) return planVisibility;
      return rule.defaultVisibility;
    }

    // Fallback: use capability resolver to determine visibility
    if (this._resolver) {
      const resolved = this._resolver.resolveFeature(featureId, plan);
      if (resolved) {
        if (!resolved.isVisible) return 'hidden';
        if (resolved.isLocked) return 'limited';
        return 'visible';
      }
    }

    return 'visible';
  }

  /**
   * Get badge text for a feature given a plan.
   */
  getBadgeText(featureId: string, plan: SubscriptionPlan): string | null {
    const rule = this._rules.get(featureId);
    if (!rule) return null;
    return rule.badgeText[plan] ?? null;
  }

  /**
   * Get display message for a feature given a plan.
   */
  getDisplayMessage(featureId: string, plan: SubscriptionPlan): string | null {
    const rule = this._rules.get(featureId);
    if (!rule) return null;
    return rule.displayMessage[plan] ?? null;
  }

  /**
   * Get all features that are visible for a plan.
   */
  getVisibleFeatures(featureIds: string[], plan: SubscriptionPlan): string[] {
    return featureIds.filter((id) => this.getVisibility(id, plan) !== 'hidden');
  }

  /**
   * Get all features that are limited for a plan.
   */
  getLimitedFeatures(featureIds: string[], plan: SubscriptionPlan): string[] {
    return featureIds.filter((id) => this.getVisibility(id, plan) === 'limited');
  }

  /**
   * Get all features that are hidden for a plan.
   */
  getHiddenFeatures(featureIds: string[], plan: SubscriptionPlan): string[] {
    return featureIds.filter((id) => this.getVisibility(id, plan) === 'hidden');
  }
}
