/**
 * Experience Resolver — resolves the full experience for a given plan.
 *
 * Combines capability resolution, quota state, trial status, visibility,
 * and upgrade recommendations into a single ExperienceState.
 */
import type { SubscriptionPlan, ExperienceState, FeatureAccessResult } from './types';
import type { CapabilityRegistry } from '../usage-capabilities/capabilityRegistry';
import type { CapabilityResolver } from '../usage-capabilities/capabilityResolver';
import type { QuotaManager } from '../usage-quota/quotaManager';
import type { TrialManager } from './trialManager';
import type { FeatureVisibilityService } from './featureVisibilityService';
import type { FeatureAccessValidator } from './featureAccessValidator';
import type { UpgradeRecommendationEngine } from './upgradeRecommendationEngine';
import type { ExperienceConfig } from './types';

export class ExperienceResolver {
  private _registry: CapabilityRegistry;
  private _resolver: CapabilityResolver;
  private _quotaManager: QuotaManager;
  private _trialManager: TrialManager;
  private _visibilityService: FeatureVisibilityService;
  private _accessValidator: FeatureAccessValidator;
  private _recommendationEngine: UpgradeRecommendationEngine;
  private _config: ExperienceConfig;

  constructor(
    registry: CapabilityRegistry,
    resolver: CapabilityResolver,
    quotaManager: QuotaManager,
    trialManager: TrialManager,
    visibilityService: FeatureVisibilityService,
    accessValidator: FeatureAccessValidator,
    recommendationEngine: UpgradeRecommendationEngine,
    config: ExperienceConfig,
  ) {
    this._registry = registry;
    this._resolver = resolver;
    this._quotaManager = quotaManager;
    this._trialManager = trialManager;
    this._visibilityService = visibilityService;
    this._accessValidator = accessValidator;
    this._recommendationEngine = recommendationEngine;
    this._config = config;
  }

  /**
   * Resolve the full experience for a plan.
   */
  resolve(plan: SubscriptionPlan): ExperienceState {
    const allFeatures = this._registry.getAllFeatures();
    const trialInfo = this._trialManager.getTrialInfo();
    const planLabel = this._config.planLabels[plan] ?? plan;

    const featureResults: FeatureAccessResult[] = [];
    const unlockedFeatures: string[] = [];
    const limitedFeatures: string[] = [];
    const lockedFeatures: string[] = [];
    const hiddenFeatures: string[] = [];

    for (const feature of allFeatures) {
      const result = this._accessValidator.getAccessResult(feature.id, plan);
      featureResults.push(result);

      if (result.visibility === 'hidden') {
        hiddenFeatures.push(feature.id);
      } else if (result.isLocked) {
        lockedFeatures.push(feature.id);
        if (result.visibility === 'limited') {
          limitedFeatures.push(feature.id);
        }
      } else {
        unlockedFeatures.push(feature.id);
        if (result.isLimited) {
          limitedFeatures.push(feature.id);
        }
      }
    }

    const recommendedUpgrade = this._recommendationEngine.getRecommendation(plan);

    return {
      plan,
      planLabel,
      trial: trialInfo,
      features: featureResults,
      unlockedFeatures,
      limitedFeatures,
      lockedFeatures,
      hiddenFeatures,
      recommendedUpgrade,
      generatedAt: new Date().toISOString(),
    };
  }

  updateConfig(config: ExperienceConfig): void {
    this._config = config;
  }
}
