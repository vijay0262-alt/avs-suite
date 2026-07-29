/**
 * Experience Manager — main orchestrator for the Experience Layer.
 *
 * Provides APIs:
 *   getExperience()
 *   canAccess(feature)
 *   canUse(feature)
 *   canOptimize(feature)
 *   isFeatureLimited(feature)
 *   isFeatureLocked(feature)
 *   getRemainingQuota(feature)
 *   getUpgradeReason(feature)
 *   getUpgradeBenefits(feature)
 *   getUsageSummary()
 *   getCurrentPlan()
 *   isTrialActive()
 *
 * Integrates: Capability Framework (Part 1), Quota Engine (Part 2),
 * Trial Manager, Visibility Service, Access Validator, Recommendation Engine.
 *
 * This module does NOT modify any existing architecture.
 */
import type { SubscriptionPlan, ExperienceState, UsageSummary, UpgradeReason, UpgradeBenefit } from './types';
import { CapabilityRegistry } from '../usage-capabilities/capabilityRegistry';
import { CapabilityResolver } from '../usage-capabilities/capabilityResolver';
import { QuotaManager } from '../usage-quota/quotaManager';
import { MemoryQuotaStorage } from '../usage-quota/quotaStorage';
import { TrialManager } from './trialManager';
import { FeatureVisibilityService } from './featureVisibilityService';
import { FeatureAccessValidator } from './featureAccessValidator';
import { UpgradeRecommendationEngine } from './upgradeRecommendationEngine';
import { UsageSummaryProvider } from './usageSummaryProvider';
import { ExperienceResolver } from './experienceResolver';
import { experienceEvents } from './experienceEvents';
import { DEFAULT_EXPERIENCE_CONFIG } from './defaultExperienceConfig';
import type { ExperienceConfig } from './types';

export class ExperienceManager {
  private _registry: CapabilityRegistry;
  private _resolver: CapabilityResolver;
  private _quotaManager: QuotaManager;
  private _trialManager: TrialManager;
  private _visibilityService: FeatureVisibilityService;
  private _accessValidator: FeatureAccessValidator;
  private _recommendationEngine: UpgradeRecommendationEngine;
  private _summaryProvider: UsageSummaryProvider;
  private _experienceResolver: ExperienceResolver;
  private _config: ExperienceConfig;
  private _plan: SubscriptionPlan;
  private _initialized: boolean = false;

  constructor(plan: SubscriptionPlan = 'FREE') {
    this._config = DEFAULT_EXPERIENCE_CONFIG;
    this._plan = plan;

    // Initialize Part 1: Capability Framework
    this._registry = new CapabilityRegistry();
    this._registry.loadDefaults();
    this._resolver = new CapabilityResolver(this._registry);

    // Initialize Part 2: Quota Engine
    this._quotaManager = new QuotaManager(new MemoryQuotaStorage());

    // Initialize Experience Layer components
    this._trialManager = new TrialManager(this._config.trialConfig);
    this._visibilityService = new FeatureVisibilityService();
    this._visibilityService.setRules(this._config.visibilityRules);
    this._visibilityService.setCapabilityResolver(this._resolver);

    this._accessValidator = new FeatureAccessValidator(
      this._resolver,
      this._quotaManager,
      this._trialManager,
      this._visibilityService,
      this._config,
    );

    this._recommendationEngine = new UpgradeRecommendationEngine(this._quotaManager, this._resolver);
    this._recommendationEngine.setRules(this._config.recommendationRules);

    this._summaryProvider = new UsageSummaryProvider(
      this._registry,
      this._resolver,
      this._quotaManager,
      this._trialManager,
      this._recommendationEngine,
      this._visibilityService,
      this._config,
    );

    this._experienceResolver = new ExperienceResolver(
      this._registry,
      this._resolver,
      this._quotaManager,
      this._trialManager,
      this._visibilityService,
      this._accessValidator,
      this._recommendationEngine,
      this._config,
    );
  }

  /**
   * Initialize the experience layer (loads quota engine).
   */
  async initialize(): Promise<void> {
    await this._quotaManager.initialize();
    this._initialized = true;

    experienceEvents.emit('experience_loaded', {
      timestamp: new Date().toISOString(),
      plan: this._plan,
    });
  }

  /**
   * Get the full experience state.
   */
  getExperience(): ExperienceState {
    return this._experienceResolver.resolve(this._plan);
  }

  /**
   * Check if a feature can be accessed (visible or limited).
   */
  canAccess(featureId: string): boolean {
    return this._accessValidator.canAccess(featureId, this._plan);
  }

  /**
   * Check if a feature can be used right now.
   */
  canUse(featureId: string): boolean {
    return this._accessValidator.canUse(featureId, this._plan);
  }

  /**
   * Check if a feature can be used for optimization.
   */
  canOptimize(featureId: string): boolean {
    return this._accessValidator.canOptimize(featureId, this._plan);
  }

  /**
   * Check if a feature is in a limited state.
   */
  isFeatureLimited(featureId: string): boolean {
    return this._accessValidator.isFeatureLimited(featureId, this._plan);
  }

  /**
   * Check if a feature is locked.
   */
  isFeatureLocked(featureId: string): boolean {
    return this._accessValidator.isFeatureLocked(featureId, this._plan);
  }

  /**
   * Get remaining quota for a feature.
   */
  getRemainingQuota(featureId: string): number | null {
    return this._accessValidator.getRemainingQuota(featureId);
  }

  /**
   * Get upgrade reason for a feature.
   */
  getUpgradeReason(featureId: string): UpgradeReason | null {
    const recommendations = this._recommendationEngine.getAllRecommendations(this._plan);
    return recommendations.find((r) => r.featureId === featureId) ?? null;
  }

  /**
   * Get upgrade benefits for a feature.
   */
  getUpgradeBenefits(featureId: string): UpgradeBenefit[] {
    const reason = this.getUpgradeReason(featureId);
    return reason?.benefits ?? [];
  }

  /**
   * Get usage summary.
   */
  getUsageSummary(): UsageSummary {
    return this._summaryProvider.getSummary(this._plan);
  }

  /**
   * Get current plan.
   */
  getCurrentPlan(): SubscriptionPlan {
    return this._plan;
  }

  /**
   * Set the current plan.
   */
  setPlan(plan: SubscriptionPlan): void {
    const previousPlan = this._plan;
    this._plan = plan;

    experienceEvents.emit('experience_updated', {
      timestamp: new Date().toISOString(),
      previousPlan,
      newPlan: plan,
    });
  }

  /**
   * Check if trial is active.
   */
  isTrialActive(): boolean {
    return this._trialManager.isTrialActive();
  }

  /**
   * Start a trial.
   */
  startTrial(durationDays?: number): boolean {
    return this._trialManager.startTrial(durationDays);
  }

  /**
   * Get trial info.
   */
  getTrialInfo() {
    return this._trialManager.getTrialInfo();
  }

  /**
   * Consume quota for a feature (delegates to QuotaManager).
   */
  consumeQuota(featureId: string, amount: number, action: string, sourceModule: string): boolean {
    const recRule = this._config.recommendationRules.find((r) => r.featureId === featureId);
    if (!recRule) return true;

    const result = this._quotaManager.consumeQuota(recRule.triggerQuotaId, amount, action, sourceModule, { feature: featureId });

    if (!result) {
      this._recommendationEngine.trackQuotaReached(recRule.triggerQuotaId, featureId);

      experienceEvents.emit('quota_limit_reached', {
        timestamp: new Date().toISOString(),
        featureId,
        quotaId: recRule.triggerQuotaId,
      });
    }

    return result;
  }

  /**
   * Track feature access (for local analytics).
   */
  trackFeatureAccess(featureId: string, context?: string): void {
    this._recommendationEngine.trackFeatureAccess(featureId, context);
  }

  /**
   * Track feature denial (for local analytics).
   */
  trackFeatureDenial(featureId: string, context?: string): void {
    this._recommendationEngine.trackFeatureDenial(featureId, context);
  }

  /**
   * Get local analytics summary.
   */
  getAnalyticsSummary() {
    return this._recommendationEngine.getAnalyticsSummary();
  }

  /**
   * Load a custom configuration.
   */
  loadConfig(config: ExperienceConfig): void {
    this._config = config;
    this._trialManager.updateConfig(config.trialConfig);
    this._visibilityService.setRules(config.visibilityRules);
    this._accessValidator.updateConfig(config);
    this._recommendationEngine.setRules(config.recommendationRules);
    this._summaryProvider.updateConfig(config);
    this._experienceResolver.updateConfig(config);
  }

  /**
   * Get the quota manager (for advanced usage).
   */
  getQuotaManager(): QuotaManager {
    return this._quotaManager;
  }

  /**
   * Get the capability registry (for advanced usage).
   */
  getRegistry(): CapabilityRegistry {
    return this._registry;
  }

  /**
   * Get the trial manager.
   */
  getTrialManager(): TrialManager {
    return this._trialManager;
  }

  /**
   * Check if initialized.
   */
  isInitialized(): boolean {
    return this._initialized;
  }
}

export const experienceManager = new ExperienceManager();
