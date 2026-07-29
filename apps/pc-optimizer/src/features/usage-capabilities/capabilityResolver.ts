/**
 * Capability Resolver — resolves which capabilities and features
 * are available, locked, or limited for a given subscription plan.
 *
 * Provides APIs:
 *   getCapabilities(plan)
 *   hasCapability(plan, capability)
 *   getLockedCapabilities(plan)
 *   getVisibleFeatures(plan)
 *   getAvailableFeatures(plan)
 *   resolveFeature(featureId, plan)
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  SubscriptionPlan,
  ResolvedFeature,
  ResolvedCapability,
} from './types';
import {
  normalizePlan,
  getPlanTierIndex,
  planIncludes,
} from './types';
import type { CapabilityRegistry } from './capabilityRegistry';

export class CapabilityResolver {
  private _registry: CapabilityRegistry;

  constructor(registry: CapabilityRegistry) {
    this._registry = registry;
  }

  /**
   * Get all capabilities unlocked for a given plan (cumulative).
   */
  getCapabilities(plan: string): string[] {
    const normalized = normalizePlan(plan);
    return this._registry.getCapabilitiesForPlan(normalized);
  }

  /**
   * Check if a plan has a specific capability unlocked.
   */
  hasCapability(plan: string, capabilityId: string): boolean {
    const capabilities = this.getCapabilities(plan);
    return capabilities.includes(capabilityId);
  }

  /**
   * Get capabilities that are locked (not available) for a given plan.
   * Only returns visible capabilities.
   */
  getLockedCapabilities(plan: string): string[] {
    const normalized = normalizePlan(plan);
    const unlocked = new Set(this.getCapabilities(normalized));
    const all = this._registry.getAllCapabilities();

    return all
      .filter((cap) => cap.isVisible && !unlocked.has(cap.id))
      .map((cap) => cap.id);
  }

  /**
   * Get all visible features for a given plan.
   * A feature is visible if its definition has isVisible = true.
   */
  getVisibleFeatures(_plan: string): string[] {
    const all = this._registry.getAllFeatures();
    return all.filter((f) => f.isVisible).map((f) => f.id);
  }

  /**
   * Get all available (unlocked) features for a given plan.
   * A feature is available if all its required capabilities are unlocked.
   */
  getAvailableFeatures(plan: string): string[] {
    const normalized = normalizePlan(plan);
    const unlockedCapabilities = new Set(this.getCapabilities(normalized));
    const all = this._registry.getAllFeatures();

    return all
      .filter((f) => f.isEnabled && f.requiredCapabilities.every((cap) => unlockedCapabilities.has(cap)))
      .map((f) => f.id);
  }

  /**
   * Resolve a single feature for a given plan.
   * Returns full resolution state including locked, limited, and missing capabilities.
   */
  resolveFeature(featureId: string, plan: string): ResolvedFeature | null {
    const feature = this._registry.getFeature(featureId);
    if (!feature) return null;

    const normalized = normalizePlan(plan);
    const unlockedCapabilities = new Set(this.getCapabilities(normalized));

    const availableCapabilities = feature.requiredCapabilities.filter((cap) =>
      unlockedCapabilities.has(cap),
    );
    const missingCapabilities = feature.requiredCapabilities.filter((cap) =>
      !unlockedCapabilities.has(cap),
    );

    const hasAllCapabilities = missingCapabilities.length === 0;
    const planMeetsMinimum = planIncludes(normalized, feature.minimumPlan);

    const isLocked = !hasAllCapabilities || !planMeetsMinimum;
    const isLimited = !isLocked && feature.isLimited && this._isPlanLimitedForFeature(normalized, featureId);

    return {
      featureId: feature.id,
      displayName: feature.displayName,
      isVisible: feature.isVisible,
      isEnabled: feature.isEnabled,
      isLimited,
      requiresSubscription: feature.requiresSubscription,
      isLocked,
      minimumPlan: feature.minimumPlan,
      missingCapabilities,
      availableCapabilities,
    };
  }

  /**
   * Resolve all features for a given plan.
   */
  resolveAllFeatures(plan: string): ResolvedFeature[] {
    const all = this._registry.getAllFeatures();
    const results: ResolvedFeature[] = [];
    for (const feature of all) {
      const resolved = this.resolveFeature(feature.id, plan);
      if (resolved) results.push(resolved);
    }
    return results;
  }

  /**
   * Resolve all capabilities for a given plan.
   */
  resolveAllCapabilities(plan: string): ResolvedCapability[] {
    const normalized = normalizePlan(plan);
    const unlocked = new Set(this.getCapabilities(normalized));
    const all = this._registry.getAllCapabilities();

    return all.map((cap) => ({
      capabilityId: cap.id,
      displayName: cap.displayName,
      isUnlocked: unlocked.has(cap.id),
      isLimited: cap.canBeLimited && unlocked.has(cap.id) && this._isCapabilityLimited(normalized, cap.id),
      minimumPlan: cap.minimumPlan,
      isVisible: cap.isVisible,
    }));
  }

  /**
   * Get the minimum plan required to unlock a specific capability.
   */
  getMinimumPlanForCapability(capabilityId: string): SubscriptionPlan | null {
    const cap = this._registry.getCapability(capabilityId);
    return cap?.minimumPlan ?? null;
  }

  /**
   * Get the minimum plan required to unlock a specific feature.
   */
  getMinimumPlanForFeature(featureId: string): SubscriptionPlan | null {
    const feature = this._registry.getFeature(featureId);
    return feature?.minimumPlan ?? null;
  }

  /**
   * Get all capabilities that are limited (but not locked) for a plan.
   */
  getLimitedCapabilities(plan: string): string[] {
    const resolved = this.resolveAllCapabilities(plan);
    return resolved.filter((r) => r.isLimited).map((r) => r.capabilityId);
  }

  /**
   * Get all features that are limited (but not locked) for a plan.
   */
  getLimitedFeatures(plan: string): string[] {
    const resolved = this.resolveAllFeatures(plan);
    return resolved.filter((r) => r.isLimited).map((r) => r.featureId);
  }

  /**
   * Get all locked features for a plan.
   */
  getLockedFeatures(plan: string): string[] {
    const resolved = this.resolveAllFeatures(plan);
    return resolved.filter((r) => r.isLocked).map((r) => r.featureId);
  }

  /**
   * Determine if a capability is in a limited state for a plan.
   * A capability is limited when it's unlocked but the plan is at
   * the minimum tier and the capability supports limiting.
   */
  private _isCapabilityLimited(plan: SubscriptionPlan, capabilityId: string): boolean {
    const cap = this._registry.getCapability(capabilityId);
    if (!cap || !cap.canBeLimited) return false;

    // Capability is limited when the plan is exactly at the minimum tier
    const planTier = getPlanTierIndex(plan);
    const minTier = getPlanTierIndex(cap.minimumPlan);
    return planTier === minTier;
  }

  /**
   * Determine if a feature is in a limited state for a plan.
   */
  private _isPlanLimitedForFeature(plan: SubscriptionPlan, featureId: string): boolean {
    const feature = this._registry.getFeature(featureId);
    if (!feature || !feature.isLimited) return false;

    // Feature is limited when the plan is exactly at the minimum tier
    const planTier = getPlanTierIndex(plan);
    const minTier = getPlanTierIndex(feature.minimumPlan);
    return planTier === minTier;
  }
}
