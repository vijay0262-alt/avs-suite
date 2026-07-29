/**
 * Usage Summary Provider — provides a summary API returning
 * current plan, trial status, remaining quotas, features, and
 * recommended upgrade.
 */
import type { SubscriptionPlan, UsageSummary, FeatureUsageSummary } from './types';
import type { CapabilityRegistry } from '../usage-capabilities/capabilityRegistry';
import type { CapabilityResolver } from '../usage-capabilities/capabilityResolver';
import type { QuotaManager } from '../usage-quota/quotaManager';
import type { TrialManager } from './trialManager';
import type { UpgradeRecommendationEngine } from './upgradeRecommendationEngine';
import type { FeatureVisibilityService } from './featureVisibilityService';
import type { ExperienceConfig } from './types';

export class UsageSummaryProvider {
  private _registry: CapabilityRegistry;
  private _resolver: CapabilityResolver;
  private _quotaManager: QuotaManager;
  private _trialManager: TrialManager;
  private _recommendationEngine: UpgradeRecommendationEngine;
  private _visibilityService: FeatureVisibilityService;
  private _config: ExperienceConfig;

  constructor(
    registry: CapabilityRegistry,
    resolver: CapabilityResolver,
    quotaManager: QuotaManager,
    trialManager: TrialManager,
    recommendationEngine: UpgradeRecommendationEngine,
    visibilityService: FeatureVisibilityService,
    config: ExperienceConfig,
  ) {
    this._registry = registry;
    this._resolver = resolver;
    this._quotaManager = quotaManager;
    this._trialManager = trialManager;
    this._recommendationEngine = recommendationEngine;
    this._visibilityService = visibilityService;
    this._config = config;
  }

  /**
   * Generate a full usage summary.
   */
  getSummary(plan: SubscriptionPlan): UsageSummary {
    const allFeatures = this._registry.getAllFeatures();
    const trialInfo = this._trialManager.getTrialInfo();
    const planLabel = this._config.planLabels[plan] ?? plan;

    const featureSummaries: FeatureUsageSummary[] = [];
    const unlockedFeatures: string[] = [];
    const limitedFeatures: string[] = [];
    const lockedFeatures: string[] = [];

    let nextResetAt: string | null = null;

    for (const feature of allFeatures) {
      const resolved = this._resolver.resolveFeature(feature.id, plan);
      const visibility = this._visibilityService.getVisibility(feature.id, plan);

      // Find quota for this feature
      const recRule = this._config.recommendationRules.find((r) => r.featureId === feature.id);
      let remaining: number | null = null;
      let limit: number | null = null;
      let isUnlimited = false;
      let featureNextReset: string | null = null;

      if (recRule) {
        const quotaState = this._quotaManager.getQuota(recRule.triggerQuotaId);
        remaining = this._quotaManager.getRemaining(recRule.triggerQuotaId);
        if (quotaState) {
          limit = quotaState.limitValue;
          isUnlimited = quotaState.isUnlimited;
          featureNextReset = quotaState.nextResetAt;
          if (featureNextReset && (!nextResetAt || new Date(featureNextReset) < new Date(nextResetAt))) {
            nextResetAt = featureNextReset;
          }
        }
      }

      featureSummaries.push({
        featureId: feature.id,
        displayName: feature.displayName,
        remaining: isUnlimited ? null : remaining,
        limit: isUnlimited ? null : limit,
        unit: this._getUnitForFeature(feature.id),
        isUnlimited,
        nextResetAt: featureNextReset,
      });

      if (resolved && !resolved.isLocked && visibility !== 'hidden') {
        unlockedFeatures.push(feature.id);
      } else if (resolved?.isLocked && visibility !== 'hidden') {
        lockedFeatures.push(feature.id);
      }
      if (visibility === 'limited' || (resolved?.isLimited && !resolved.isLocked)) {
        limitedFeatures.push(feature.id);
      }
    }

    const recommendedUpgrade = this._recommendationEngine.getRecommendation(plan);

    return {
      currentPlan: plan,
      planLabel,
      trialStatus: trialInfo.status,
      trialDaysRemaining: trialInfo.daysRemaining,
      features: featureSummaries,
      unlockedFeatures,
      limitedFeatures,
      lockedFeatures,
      recommendedUpgrade,
      nextResetAt,
    };
  }

  updateConfig(config: ExperienceConfig): void {
    this._config = config;
  }

  // ── Private ────────────────────────────────────────────────

  private _getUnitForFeature(featureId: string): string | null {
    const recRule = this._config.recommendationRules.find((r) => r.featureId === featureId);
    if (!recRule) return null;
    const quotaState = this._quotaManager.getQuota(recRule.triggerQuotaId);
    return quotaState?.usageUnit ?? null;
  }
}
