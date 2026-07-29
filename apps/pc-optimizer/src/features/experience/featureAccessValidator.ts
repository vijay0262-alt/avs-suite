/**
 * Feature Access Validator — validates whether a feature can be
 * accessed or used based on capabilities, quotas, and trial status.
 *
 * Provides:
 *   canAccess(feature), canUse(feature), canOptimize(feature)
 *   isFeatureLimited(feature), isFeatureLocked(feature)
 *   getRemainingQuota(feature)
 */
import type { SubscriptionPlan, FeatureAccessResult } from './types';
import type { CapabilityResolver } from '../usage-capabilities/capabilityResolver';
import type { QuotaManager } from '../usage-quota/quotaManager';
import type { TrialManager } from './trialManager';
import type { FeatureVisibilityService } from './featureVisibilityService';
import type { ExperienceConfig } from './types';
import { experienceEvents } from './experienceEvents';

export class FeatureAccessValidator {
  private _resolver: CapabilityResolver;
  private _quotaManager: QuotaManager;
  private _trialManager: TrialManager;
  private _visibilityService: FeatureVisibilityService;
  private _config: ExperienceConfig;
  private _featureToQuotaMap: Map<string, string> = new Map();

  constructor(
    resolver: CapabilityResolver,
    quotaManager: QuotaManager,
    trialManager: TrialManager,
    visibilityService: FeatureVisibilityService,
    config: ExperienceConfig,
  ) {
    this._resolver = resolver;
    this._quotaManager = quotaManager;
    this._trialManager = trialManager;
    this._visibilityService = visibilityService;
    this._config = config;
    this._buildFeatureQuotaMap();
  }

  updateConfig(config: ExperienceConfig): void {
    this._config = config;
    this._buildFeatureQuotaMap();
  }

  /**
   * Check if a feature can be accessed (visible or limited, not hidden).
   */
  canAccess(featureId: string, plan: SubscriptionPlan): boolean {
    const visibility = this._visibilityService.getVisibility(featureId, plan);
    return visibility !== 'hidden';
  }

  /**
   * Check if a feature can be used right now (has capabilities + quota).
   */
  canUse(featureId: string, plan: SubscriptionPlan): boolean {
    // Check capabilities
    const resolved = this._resolver.resolveFeature(featureId, plan);
    if (!resolved || resolved.isLocked) {
      // Check if trial unlocks it
      if (this._trialManager.isTrialActive()) {
        const trialResolved = this._resolver.resolveFeature(featureId, this._config.trialConfig.trialPlan);
        if (trialResolved && !trialResolved.isLocked) {
          return this._checkQuota(featureId);
        }
      }
      return false;
    }
    return this._checkQuota(featureId);
  }

  /**
   * Check if a feature can be used for optimization (alias for canUse
   * with additional optimization-specific checks).
   */
  canOptimize(featureId: string, plan: SubscriptionPlan): boolean {
    return this.canUse(featureId, plan);
  }

  /**
   * Check if a feature is in a limited state.
   */
  isFeatureLimited(featureId: string, plan: SubscriptionPlan): boolean {
    const visibility = this._visibilityService.getVisibility(featureId, plan);
    if (visibility === 'limited') return true;

    const resolved = this._resolver.resolveFeature(featureId, plan);
    if (resolved && resolved.isLimited) return true;

    const quotaId = this._featureToQuotaMap.get(featureId);
    if (quotaId) {
      const remaining = this._quotaManager.getRemaining(quotaId);
      if (remaining !== Infinity && remaining <= 0) return true;
    }

    return false;
  }

  /**
   * Check if a feature is locked (requires upgrade).
   */
  isFeatureLocked(featureId: string, plan: SubscriptionPlan): boolean {
    const resolved = this._resolver.resolveFeature(featureId, plan);
    if (!resolved) return true;
    if (resolved.isLocked) {
      // Trial may unlock it
      if (this._trialManager.isTrialActive()) {
        const trialResolved = this._resolver.resolveFeature(featureId, this._config.trialConfig.trialPlan);
        if (trialResolved && !trialResolved.isLocked) return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Get remaining quota for a feature.
   */
  getRemainingQuota(featureId: string): number | null {
    const quotaId = this._featureToQuotaMap.get(featureId);
    if (!quotaId) return null;
    return this._quotaManager.getRemaining(quotaId);
  }

  /**
   * Get full access result for a feature.
   */
  getAccessResult(featureId: string, plan: SubscriptionPlan): FeatureAccessResult {
    const visibility = this._visibilityService.getVisibility(featureId, plan);
    const resolved = this._resolver.resolveFeature(featureId, plan);
    const isLocked = this.isFeatureLocked(featureId, plan);
    const isLimited = this.isFeatureLimited(featureId, plan);
    const canUse = this.canUse(featureId, plan);
    const canAccess = this.canAccess(featureId, plan);

    const quotaId = this._featureToQuotaMap.get(featureId);
    let remainingQuota: number | null = null;
    let quotaUnit: string | null = null;
    let nextResetAt: string | null = null;

    if (quotaId) {
      const quotaState = this._quotaManager.getQuota(quotaId);
      remainingQuota = this._quotaManager.getRemaining(quotaId);
      if (quotaState) {
        quotaUnit = quotaState.usageUnit;
        nextResetAt = quotaState.nextResetAt;
      }
    }

    // Determine upgrade info
    const upgradeAvailable = isLocked || isLimited;
    const recommendedPlan = resolved?.minimumPlan ?? null;
    const upgradeBenefit = this._visibilityService.getDisplayMessage(featureId, plan);

    // Determine reason and message
    let reason: string | null = null;
    let displayMessage: string | null = null;

    if (isLocked) {
      reason = this._config.messages.featureLocked;
      displayMessage = this._visibilityService.getDisplayMessage(featureId, plan);
    } else if (remainingQuota !== null && remainingQuota <= 0) {
      reason = this._config.messages.quotaExceeded;
      displayMessage = this._config.messages.quotaExceeded;
    }

    const badgeText = this._visibilityService.getBadgeText(featureId, plan);

    // Emit events
    if (canUse) {
      experienceEvents.emit('feature_accessed', {
        timestamp: new Date().toISOString(),
        featureId,
        plan,
      });
    } else if (!canAccess || isLocked) {
      experienceEvents.emit('feature_denied', {
        timestamp: new Date().toISOString(),
        featureId,
        plan,
        reason,
      });
    }

    return {
      featureId,
      canAccess,
      canUse,
      visibility,
      isLimited,
      isLocked,
      reason,
      remainingQuota,
      quotaUnit,
      nextResetAt,
      upgradeAvailable,
      recommendedPlan,
      upgradeBenefit,
      displayMessage,
      badgeText,
    };
  }

  // ── Private ────────────────────────────────────────────────

  private _checkQuota(featureId: string): boolean {
    const quotaId = this._featureToQuotaMap.get(featureId);
    if (!quotaId) return true;
    return this._quotaManager.isQuotaAvailable(quotaId);
  }

  private _buildFeatureQuotaMap(): void {
    this._featureToQuotaMap.clear();
    for (const rule of this._config.recommendationRules) {
      this._featureToQuotaMap.set(rule.featureId, rule.triggerQuotaId);
    }
  }
}
