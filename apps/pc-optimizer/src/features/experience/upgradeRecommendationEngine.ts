/**
 * Upgrade Recommendation Engine — context-based upgrade recommendations.
 *
 * Recommendations are based on:
 *   - Quota limits reached
 *   - Frequently used features
 *   - Frequently requested locked features
 *   - Usage patterns
 *
 * Never uses pressure tactics. Never interrupts workflows.
 * All messaging is configuration-driven.
 *
 * Includes local analytics tracking (no cloud).
 */
import type { UpgradeReason, SubscriptionPlan, UpgradeRecommendationRule, LocalAnalyticsEntry, LocalAnalyticsSummary } from './types';
import type { QuotaManager } from '../usage-quota/quotaManager';
import type { CapabilityResolver } from '../usage-capabilities/capabilityResolver';
import { UpgradeReasonBuilder } from './upgradeReasonBuilder';
import { experienceEvents } from './experienceEvents';

export class UpgradeRecommendationEngine {
  private _rules: UpgradeRecommendationRule[] = [];
  private _quotaManager: QuotaManager;
  private _resolver: CapabilityResolver;
  private _builder: UpgradeReasonBuilder;
  private _analytics: LocalAnalyticsEntry[] = [];
  private _denialCounts: Map<string, number> = new Map();
  private _accessCounts: Map<string, number> = new Map();
  private _recommendationCounts: Map<string, number> = new Map();
  private _quotaReachedCounts: Map<string, number> = new Map();

  constructor(quotaManager: QuotaManager, resolver: CapabilityResolver) {
    this._quotaManager = quotaManager;
    this._resolver = resolver;
    this._builder = new UpgradeReasonBuilder();
  }

  setRules(rules: UpgradeRecommendationRule[]): void {
    this._rules = rules;
  }

  /**
   * Get the best upgrade recommendation for the current context.
   * Returns null if no recommendation is appropriate.
   */
  getRecommendation(plan: SubscriptionPlan): UpgradeReason | null {
    // Priority 1: Quota limits reached (high urgency)
    for (const rule of this._rules) {
      if (rule.urgency === 'high') {
        const remaining = this._quotaManager.getRemaining(rule.triggerQuotaId);
        if (remaining !== Infinity && remaining <= rule.triggerThreshold) {
          const reason = this._builder.buildFromRule(rule, plan);
          this._trackRecommendation(rule.featureId);
          this._emitRecommended(reason);
          return reason;
        }
      }
    }

    // Priority 2: Locked features that have been frequently requested
    for (const rule of this._rules) {
      const resolved = this._resolver.resolveFeature(rule.featureId, plan);
      if (resolved?.isLocked) {
        const denialCount = this._denialCounts.get(rule.featureId) ?? 0;
        if (denialCount >= 3) {
          const reason = this._builder.buildFromRule(rule, plan);
          this._trackRecommendation(rule.featureId);
          this._emitRecommended(reason);
          return reason;
        }
      }
    }

    // Priority 3: Medium urgency quota limits
    for (const rule of this._rules) {
      if (rule.urgency === 'medium') {
        const remaining = this._quotaManager.getRemaining(rule.triggerQuotaId);
        if (remaining !== Infinity && remaining <= rule.triggerThreshold) {
          const reason = this._builder.buildFromRule(rule, plan);
          this._trackRecommendation(rule.featureId);
          this._emitRecommended(reason);
          return reason;
        }
      }
    }

    // Priority 4: Low urgency — frequently used features
    for (const rule of this._rules) {
      if (rule.urgency === 'low') {
        const accessCount = this._accessCounts.get(rule.featureId) ?? 0;
        if (accessCount >= 5) {
          const reason = this._builder.buildFromRule(rule, plan);
          this._trackRecommendation(rule.featureId);
          this._emitRecommended(reason);
          return reason;
        }
      }
    }

    return null;
  }

  /**
   * Get all applicable recommendations (not just the top one).
   */
  getAllRecommendations(plan: SubscriptionPlan): UpgradeReason[] {
    const reasons: UpgradeReason[] = [];

    for (const rule of this._rules) {
      const remaining = this._quotaManager.getRemaining(rule.triggerQuotaId);
      const resolved = this._resolver.resolveFeature(rule.featureId, plan);
      const isQuotaReached = remaining !== Infinity && remaining <= rule.triggerThreshold;
      const isLocked = resolved?.isLocked ?? false;
      const accessCount = this._accessCounts.get(rule.featureId) ?? 0;
      const denialCount = this._denialCounts.get(rule.featureId) ?? 0;

      if (isQuotaReached || (isLocked && denialCount >= 3) || accessCount >= 5) {
        reasons.push(this._builder.buildFromRule(rule, plan));
      }
    }

    return reasons;
  }

  /**
   * Track a feature access (for local analytics).
   */
  trackFeatureAccess(featureId: string, context: string = 'general'): void {
    this._accessCounts.set(featureId, (this._accessCounts.get(featureId) ?? 0) + 1);
    this._analytics.push({
      featureId,
      action: 'accessed',
      timestamp: new Date().toISOString(),
      context,
    });
  }

  /**
   * Track a feature denial (for local analytics).
   */
  trackFeatureDenial(featureId: string, context: string = 'locked'): void {
    this._denialCounts.set(featureId, (this._denialCounts.get(featureId) ?? 0) + 1);
    this._analytics.push({
      featureId,
      action: 'denied',
      timestamp: new Date().toISOString(),
      context,
    });
  }

  /**
   * Track a quota limit reached.
   */
  trackQuotaReached(quotaId: string, featureId: string): void {
    this._quotaReachedCounts.set(quotaId, (this._quotaReachedCounts.get(quotaId) ?? 0) + 1);
    this._analytics.push({
      featureId,
      action: 'quota_reached',
      timestamp: new Date().toISOString(),
      context: quotaId,
    });
  }

  /**
   * Get local analytics summary.
   */
  getAnalyticsSummary(): LocalAnalyticsSummary {
    const mostUsedFeatures = Array.from(this._accessCounts.entries())
      .map(([featureId, count]) => ({ featureId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const mostReachedQuotas = Array.from(this._quotaReachedCounts.entries())
      .map(([quotaId, count]) => ({ quotaId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const frequentlyRequestedLocked = Array.from(this._denialCounts.entries())
      .map(([featureId, count]) => ({ featureId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recommendationFrequency = Array.from(this._recommendationCounts.entries())
      .map(([featureId, count]) => ({ featureId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      mostUsedFeatures,
      mostReachedQuotas,
      frequentlyRequestedLocked,
      recommendationFrequency,
      totalFeatureAccesses: this._accessCounts.size,
      totalDenials: this._denialCounts.size,
    };
  }

  /**
   * Clear analytics data.
   */
  clearAnalytics(): void {
    this._analytics = [];
    this._denialCounts.clear();
    this._accessCounts.clear();
    this._recommendationCounts.clear();
    this._quotaReachedCounts.clear();
  }

  // ── Private ────────────────────────────────────────────────

  private _trackRecommendation(featureId: string): void {
    this._recommendationCounts.set(featureId, (this._recommendationCounts.get(featureId) ?? 0) + 1);
  }

  private _emitRecommended(reason: UpgradeReason): void {
    experienceEvents.emit('upgrade_recommended', {
      timestamp: new Date().toISOString(),
      featureId: reason.featureId,
      recommendedPlan: reason.recommendedPlan,
      urgency: reason.urgency,
    });
  }
}
