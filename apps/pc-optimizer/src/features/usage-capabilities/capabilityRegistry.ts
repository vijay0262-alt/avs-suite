/**
 * Capability Registry — central store for capability, feature, and
 * subscription definitions.
 *
 * Supports loading from configuration and registering individual
 * definitions at runtime. Future plans should require configuration
 * changes only — no code changes needed.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  CapabilityDefinition,
  FeatureDefinition,
  SubscriptionDefinition,
  CapabilityConfig,
  SubscriptionPlan,
} from './types';
import { capabilityEvents } from './capabilityEvents';
import { DEFAULT_CONFIG } from './defaultDefinitions';

export class CapabilityRegistry {
  private _capabilities: Map<string, CapabilityDefinition> = new Map();
  private _features: Map<string, FeatureDefinition> = new Map();
  private _subscriptions: Map<SubscriptionPlan, SubscriptionDefinition> = new Map();
  private _loaded: boolean = false;

  /**
   * Load definitions from a configuration object.
   * Replaces all existing definitions.
   */
  loadConfig(config: CapabilityConfig): void {
    this._capabilities.clear();
    this._features.clear();
    this._subscriptions.clear();

    for (const cap of config.capabilities) {
      this._capabilities.set(cap.id, { ...cap });
    }
    for (const feat of config.features) {
      this._features.set(feat.id, { ...feat });
    }
    for (const sub of config.subscriptions) {
      this._subscriptions.set(sub.plan, { ...sub });
    }

    this._loaded = true;

    capabilityEvents.emit('capability_loaded', {
      timestamp: new Date().toISOString(),
      capabilityCount: this._capabilities.size,
      featureCount: this._features.size,
      subscriptionCount: this._subscriptions.size,
    });
  }

  /**
   * Load the default built-in definitions.
   */
  loadDefaults(): void {
    this.loadConfig(DEFAULT_CONFIG);
  }

  /**
   * Register a single capability definition.
   */
  registerCapability(capability: CapabilityDefinition): void {
    this._capabilities.set(capability.id, { ...capability });
    this._emitChanged(capability.id, 'unlocked');
  }

  /**
   * Register a single feature definition.
   */
  registerFeature(feature: FeatureDefinition): void {
    this._features.set(feature.id, { ...feature });
  }

  /**
   * Register a single subscription definition.
   */
  registerSubscription(subscription: SubscriptionDefinition): void {
    this._subscriptions.set(subscription.plan, { ...subscription });
  }

  /**
   * Get a capability definition by ID.
   */
  getCapability(id: string): CapabilityDefinition | null {
    return this._capabilities.get(id) ?? null;
  }

  /**
   * Get a feature definition by ID.
   */
  getFeature(id: string): FeatureDefinition | null {
    return this._features.get(id) ?? null;
  }

  /**
   * Get a subscription definition by plan.
   */
  getSubscription(plan: SubscriptionPlan): SubscriptionDefinition | null {
    return this._subscriptions.get(plan) ?? null;
  }

  /**
   * Get all capability definitions.
   */
  getAllCapabilities(): CapabilityDefinition[] {
    return Array.from(this._capabilities.values());
  }

  /**
   * Get all feature definitions.
   */
  getAllFeatures(): FeatureDefinition[] {
    return Array.from(this._features.values());
  }

  /**
   * Get all subscription definitions.
   */
  getAllSubscriptions(): SubscriptionDefinition[] {
    return Array.from(this._subscriptions.values());
  }

  /**
   * Check if a capability is registered.
   */
  hasCapability(id: string): boolean {
    return this._capabilities.has(id);
  }

  /**
   * Check if a feature is registered.
   */
  hasFeature(id: string): boolean {
    return this._features.has(id);
  }

  /**
   * Check if a subscription plan is registered.
   */
  hasSubscription(plan: SubscriptionPlan): boolean {
    return this._subscriptions.has(plan);
  }

  /**
   * Get capabilities for a specific plan (cumulative — includes
   * all capabilities from lower tiers plus this plan's capabilities).
   */
  getCapabilitiesForPlan(plan: SubscriptionPlan): string[] {
    const sub = this._subscriptions.get(plan);
    if (!sub) return [];

    const cumulative = new Set<string>();
    // Add capabilities from this plan and all lower-tier plans
    const tierIndex = sub.tierIndex;
    for (const s of this._subscriptions.values()) {
      if (s.tierIndex <= tierIndex) {
        for (const cap of s.capabilities) {
          cumulative.add(cap);
        }
      }
    }
    return Array.from(cumulative);
  }

  /**
   * Get features for a specific plan (cumulative).
   */
  getFeaturesForPlan(plan: SubscriptionPlan): string[] {
    const sub = this._subscriptions.get(plan);
    if (!sub) return [];

    const cumulative = new Set<string>();
    const tierIndex = sub.tierIndex;
    for (const s of this._subscriptions.values()) {
      if (s.tierIndex <= tierIndex) {
        for (const feat of s.features) {
          cumulative.add(feat);
        }
      }
    }
    return Array.from(cumulative);
  }

  /**
   * Check if the registry has been loaded with definitions.
   */
  isLoaded(): boolean {
    return this._loaded;
  }

  /**
   * Export the current configuration.
   */
  exportConfig(): CapabilityConfig {
    return {
      capabilities: this.getAllCapabilities(),
      features: this.getAllFeatures(),
      subscriptions: this.getAllSubscriptions(),
    };
  }

  /**
   * Clear all definitions.
   */
  clear(): void {
    this._capabilities.clear();
    this._features.clear();
    this._subscriptions.clear();
    this._loaded = false;
  }

  private _emitChanged(capabilityId: string, change: 'unlocked' | 'locked' | 'limited'): void {
    capabilityEvents.emit('capability_changed', {
      timestamp: new Date().toISOString(),
      capabilityId,
      change,
    });
  }
}

export const capabilityRegistry = new CapabilityRegistry();
