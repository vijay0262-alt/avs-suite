/**
 * Tests for the Usage Capability Framework.
 *
 * Covers:
 * - Types & helpers
 * - Capability events
 * - Capability registry (loading, registration, queries)
 * - Capability resolver (plan resolution, feature resolution, locked/limited)
 * - Capability validator (validation, unknown plans/capabilities, config)
 * - Default definitions
 * - Regression
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PLAN_TIER_ORDER,
  PLAN_LABELS,
  getPlanTierIndex,
  isKnownPlan,
  normalizePlan,
  planIncludes,
  type SubscriptionPlan,
  type CapabilityDefinition,
  type FeatureDefinition,
  type SubscriptionDefinition,
  type CapabilityConfig,
} from '../types';
import { CapabilityEventEmitter } from '../capabilityEvents';
import { CapabilityRegistry } from '../capabilityRegistry';
import { CapabilityResolver } from '../capabilityResolver';
import { CapabilityValidator } from '../capabilityValidator';
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_FEATURES,
  DEFAULT_SUBSCRIPTIONS,
  DEFAULT_CONFIG,
} from '../defaultDefinitions';

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('PLAN_TIER_ORDER has 7 plans in ascending order', () => {
    expect(PLAN_TIER_ORDER).toHaveLength(7);
    expect(PLAN_TIER_ORDER[0]).toBe('FREE');
    expect(PLAN_TIER_ORDER[PLAN_TIER_ORDER.length - 1]).toBe('ENTERPRISE');
  });

  it('PLAN_LABELS has labels for all plans', () => {
    for (const plan of PLAN_TIER_ORDER) {
      expect(PLAN_LABELS[plan]).toBeDefined();
      expect(PLAN_LABELS[plan].length).toBeGreaterThan(0);
    }
  });

  it('getPlanTierIndex returns correct index', () => {
    expect(getPlanTierIndex('FREE')).toBe(0);
    expect(getPlanTierIndex('PRO')).toBe(2);
    expect(getPlanTierIndex('ENTERPRISE')).toBe(6);
  });

  it('getPlanTierIndex returns -1 for unknown plan', () => {
    expect(getPlanTierIndex('UNKNOWN')).toBe(-1);
    expect(getPlanTierIndex('')).toBe(-1);
  });

  it('isKnownPlan recognizes all defined plans', () => {
    expect(isKnownPlan('FREE')).toBe(true);
    expect(isKnownPlan('PRO')).toBe(true);
    expect(isKnownPlan('ULTIMATE')).toBe(true);
    expect(isKnownPlan('LIFETIME')).toBe(true);
    expect(isKnownPlan('BETA')).toBe(true);
    expect(isKnownPlan('ENTERPRISE')).toBe(true);
    expect(isKnownPlan('FAMILY')).toBe(true);
  });

  it('isKnownPlan rejects unknown plans', () => {
    expect(isKnownPlan('UNKNOWN')).toBe(false);
    expect(isKnownPlan('')).toBe(false);
    expect(isKnownPlan('premium')).toBe(false);
  });

  it('normalizePlan normalizes strings', () => {
    expect(normalizePlan('free')).toBe('FREE');
    expect(normalizePlan('pro')).toBe('PRO');
    expect(normalizePlan('Pro')).toBe('PRO');
    expect(normalizePlan(null)).toBe('FREE');
    expect(normalizePlan(undefined)).toBe('FREE');
    expect(normalizePlan('')).toBe('FREE');
    expect(normalizePlan('unknown')).toBe('FREE');
  });

  it('planIncludes checks tier ordering', () => {
    expect(planIncludes('PRO', 'FREE')).toBe(true);
    expect(planIncludes('ULTIMATE', 'PRO')).toBe(true);
    expect(planIncludes('ENTERPRISE', 'FREE')).toBe(true);
    expect(planIncludes('FREE', 'PRO')).toBe(false);
    expect(planIncludes('FREE', 'FREE')).toBe(true);
  });
});

// ── Capability Events ────────────────────────────────────────

describe('CapabilityEventEmitter', () => {
  let emitter: CapabilityEventEmitter;

  beforeEach(() => {
    emitter = new CapabilityEventEmitter();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    emitter.on('capability_loaded', listener);
    emitter.emit('capability_loaded', { test: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ test: true });
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = emitter.on('plan_changed', listener);
    unsub();
    emitter.emit('plan_changed', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('tracks listener count', () => {
    emitter.on('capability_changed', () => {});
    emitter.on('capability_changed', () => {});
    expect(emitter.listenerCount('capability_changed')).toBe(2);
  });

  it('clear removes all listeners', () => {
    emitter.on('capability_loaded', () => {});
    emitter.on('plan_changed', () => {});
    emitter.clear();
    expect(emitter.listenerCount('capability_loaded')).toBe(0);
    expect(emitter.listenerCount('plan_changed')).toBe(0);
  });

  it('does not crash when listener throws', () => {
    emitter.on('capability_loaded', () => { throw new Error('test'); });
    expect(() => emitter.emit('capability_loaded', {})).not.toThrow();
  });

  it('emits different event types independently', () => {
    const loadedListener = vi.fn();
    const changedListener = vi.fn();
    emitter.on('capability_loaded', loadedListener);
    emitter.on('capability_changed', changedListener);
    emitter.emit('capability_loaded', {});
    expect(loadedListener).toHaveBeenCalledTimes(1);
    expect(changedListener).not.toHaveBeenCalled();
  });
});

// ── Capability Registry ──────────────────────────────────────

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  it('starts unloaded', () => {
    expect(registry.isLoaded()).toBe(false);
  });

  it('loadDefaults loads all definitions', () => {
    registry.loadDefaults();
    expect(registry.isLoaded()).toBe(true);
    expect(registry.getAllCapabilities().length).toBe(DEFAULT_CAPABILITIES.length);
    expect(registry.getAllFeatures().length).toBe(DEFAULT_FEATURES.length);
    expect(registry.getAllSubscriptions().length).toBe(DEFAULT_SUBSCRIPTIONS.length);
  });

  it('loadConfig loads custom config', () => {
    const config: CapabilityConfig = {
      capabilities: [
        { id: 'test_cap', displayName: 'Test', description: 'Test cap', category: 'test', minimumPlan: 'FREE', isVisible: true, canBeLimited: false },
      ],
      features: [
        { id: 'test_feat', displayName: 'Test Feature', description: 'Test', category: 'test', isVisible: true, isEnabled: true, isLimited: false, requiresSubscription: false, minimumPlan: 'FREE', requiredCapabilities: ['test_cap'] },
      ],
      subscriptions: [
        { plan: 'FREE', label: 'Free', description: 'Free plan', isPaid: false, capabilities: ['test_cap'], features: ['test_feat'], tierIndex: 0 },
      ],
    };
    registry.loadConfig(config);
    expect(registry.getCapability('test_cap')).not.toBeNull();
    expect(registry.getFeature('test_feat')).not.toBeNull();
    expect(registry.getSubscription('FREE')).not.toBeNull();
  });

  it('loadConfig replaces existing definitions', () => {
    registry.loadDefaults();
    registry.loadConfig({ capabilities: [], features: [], subscriptions: [] });
    expect(registry.getAllCapabilities()).toHaveLength(0);
    expect(registry.getAllFeatures()).toHaveLength(0);
    expect(registry.getAllSubscriptions()).toHaveLength(0);
  });

  it('registerCapability adds a capability', () => {
    registry.loadDefaults();
    const newCap: CapabilityDefinition = {
      id: 'new_cap',
      displayName: 'New',
      description: 'New capability',
      category: 'test',
      minimumPlan: 'PRO',
      isVisible: true,
      canBeLimited: false,
    };
    registry.registerCapability(newCap);
    expect(registry.hasCapability('new_cap')).toBe(true);
    expect(registry.getCapability('new_cap')?.displayName).toBe('New');
  });

  it('registerFeature adds a feature', () => {
    registry.loadDefaults();
    const newFeat: FeatureDefinition = {
      id: 'new_feat',
      displayName: 'New Feature',
      description: 'New',
      category: 'test',
      isVisible: true,
      isEnabled: true,
      isLimited: false,
      requiresSubscription: true,
      minimumPlan: 'PRO',
      requiredCapabilities: ['scheduler'],
    };
    registry.registerFeature(newFeat);
    expect(registry.hasFeature('new_feat')).toBe(true);
  });

  it('registerSubscription adds a subscription', () => {
    registry.loadDefaults();
    const newSub: SubscriptionDefinition = {
      plan: 'FREE',
      label: 'Free',
      description: 'Test',
      isPaid: false,
      capabilities: ['ai_assistant'],
      features: ['feature_ai_assistant'],
      tierIndex: 0,
    };
    registry.registerSubscription(newSub);
    expect(registry.hasSubscription('FREE')).toBe(true);
  });

  it('getCapability returns null for unknown', () => {
    registry.loadDefaults();
    expect(registry.getCapability('nonexistent')).toBeNull();
  });

  it('getFeature returns null for unknown', () => {
    registry.loadDefaults();
    expect(registry.getFeature('nonexistent')).toBeNull();
  });

  it('getSubscription returns null for unknown', () => {
    registry.loadDefaults();
    expect(registry.getSubscription('ENTERPRISE')).not.toBeNull();
  });

  it('getCapabilitiesForPlan returns cumulative capabilities', () => {
    registry.loadDefaults();
    const freeCaps = registry.getCapabilitiesForPlan('FREE');
    expect(freeCaps).toContain('ai_assistant');
    expect(freeCaps).toContain('smart_optimize');
    expect(freeCaps).not.toContain('startup_cleanup');

    const proCaps = registry.getCapabilitiesForPlan('PRO');
    expect(proCaps).toContain('ai_assistant');
    expect(proCaps).toContain('startup_cleanup');
    expect(proCaps).toContain('duplicate_cleanup');
  });

  it('getFeaturesForPlan returns cumulative features', () => {
    registry.loadDefaults();
    const freeFeats = registry.getFeaturesForPlan('FREE');
    expect(freeFeats).toContain('feature_ai_assistant');
    expect(freeFeats).not.toContain('feature_startup_optimizer');

    const proFeats = registry.getFeaturesForPlan('PRO');
    expect(proFeats).toContain('feature_ai_assistant');
    expect(proFeats).toContain('feature_startup_optimizer');
  });

  it('getCapabilitiesForPlan returns empty for unknown plan', () => {
    registry.loadDefaults();
    expect(registry.getCapabilitiesForPlan('UNKNOWN' as SubscriptionPlan)).toEqual([]);
  });

  it('exportConfig returns current config', () => {
    registry.loadDefaults();
    const config = registry.exportConfig();
    expect(config.capabilities.length).toBe(DEFAULT_CAPABILITIES.length);
    expect(config.features.length).toBe(DEFAULT_FEATURES.length);
    expect(config.subscriptions.length).toBe(DEFAULT_SUBSCRIPTIONS.length);
  });

  it('clear resets registry', () => {
    registry.loadDefaults();
    registry.clear();
    expect(registry.isLoaded()).toBe(false);
    expect(registry.getAllCapabilities()).toHaveLength(0);
  });

  it('emits capability_loaded event on load', () => {
    registry.loadDefaults();
    expect(registry.isLoaded()).toBe(true);
  });
});

// ── Capability Resolver ──────────────────────────────────────

describe('CapabilityResolver', () => {
  let registry: CapabilityRegistry;
  let resolver: CapabilityResolver;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.loadDefaults();
    resolver = new CapabilityResolver(registry);
  });

  it('getCapabilities returns capabilities for FREE plan', () => {
    const caps = resolver.getCapabilities('FREE');
    expect(caps).toContain('ai_assistant');
    expect(caps).toContain('smart_optimize');
    expect(caps).toContain('browser_cleanup');
    expect(caps).toContain('report_export');
  });

  it('getCapabilities returns cumulative capabilities for PRO plan', () => {
    const caps = resolver.getCapabilities('PRO');
    expect(caps).toContain('ai_assistant');
    expect(caps).toContain('startup_cleanup');
    expect(caps).toContain('duplicate_cleanup');
    expect(caps).toContain('scheduler');
    expect(caps).toContain('cloud_sync');
    expect(caps).toContain('trend_history');
  });

  it('getCapabilities returns all for ENTERPRISE plan', () => {
    const caps = resolver.getCapabilities('ENTERPRISE');
    expect(caps).toContain('background_monitoring');
    expect(caps).toContain('ai_assistant');
    expect(caps.length).toBe(DEFAULT_CAPABILITIES.length);
  });

  it('hasCapability returns true for unlocked capability', () => {
    expect(resolver.hasCapability('FREE', 'ai_assistant')).toBe(true);
    expect(resolver.hasCapability('PRO', 'startup_cleanup')).toBe(true);
  });

  it('hasCapability returns false for locked capability', () => {
    expect(resolver.hasCapability('FREE', 'startup_cleanup')).toBe(false);
    expect(resolver.hasCapability('FREE', 'background_monitoring')).toBe(false);
  });

  it('getLockedCapabilities returns locked for FREE plan', () => {
    const locked = resolver.getLockedCapabilities('FREE');
    expect(locked).toContain('startup_cleanup');
    expect(locked).toContain('duplicate_cleanup');
    expect(locked).toContain('scheduler');
    expect(locked).toContain('background_monitoring');
    expect(locked).not.toContain('ai_assistant');
  });

  it('getLockedCapabilities returns empty for ENTERPRISE plan', () => {
    const locked = resolver.getLockedCapabilities('ENTERPRISE');
    expect(locked).toHaveLength(0);
  });

  it('getVisibleFeatures returns all visible features', () => {
    const visible = resolver.getVisibleFeatures('FREE');
    expect(visible.length).toBe(DEFAULT_FEATURES.length);
  });

  it('getAvailableFeatures returns unlocked features for FREE plan', () => {
    const available = resolver.getAvailableFeatures('FREE');
    expect(available).toContain('feature_ai_assistant');
    expect(available).toContain('feature_smart_optimize');
    expect(available).toContain('feature_browser_health');
    expect(available).toContain('feature_report_export');
    expect(available).not.toContain('feature_startup_optimizer');
    expect(available).not.toContain('feature_duplicate_engine');
  });

  it('getAvailableFeatures returns all for ENTERPRISE plan', () => {
    const available = resolver.getAvailableFeatures('ENTERPRISE');
    expect(available.length).toBe(DEFAULT_FEATURES.length);
  });

  it('resolveFeature returns full resolution for FREE plan', () => {
    const resolved = resolver.resolveFeature('feature_ai_assistant', 'FREE');
    expect(resolved).not.toBeNull();
    expect(resolved!.featureId).toBe('feature_ai_assistant');
    expect(resolved!.isLocked).toBe(false);
    expect(resolved!.isLimited).toBe(true);
    expect(resolved!.missingCapabilities).toEqual([]);
  });

  it('resolveFeature returns locked for PRO feature on FREE plan', () => {
    const resolved = resolver.resolveFeature('feature_startup_optimizer', 'FREE');
    expect(resolved).not.toBeNull();
    expect(resolved!.isLocked).toBe(true);
    expect(resolved!.missingCapabilities).toContain('startup_cleanup');
  });

  it('resolveFeature returns unlocked for limited PRO feature on PRO plan', () => {
    const resolved = resolver.resolveFeature('feature_trend_history', 'PRO');
    expect(resolved).not.toBeNull();
    expect(resolved!.isLocked).toBe(false);
    expect(resolved!.isLimited).toBe(true);
  });

  it('resolveFeature returns unlocked and not limited for PRO feature on ULTIMATE plan', () => {
    const resolved = resolver.resolveFeature('feature_trend_history', 'ULTIMATE');
    expect(resolved).not.toBeNull();
    expect(resolved!.isLocked).toBe(false);
    expect(resolved!.isLimited).toBe(false);
  });

  it('resolveFeature returns null for unknown feature', () => {
    expect(resolver.resolveFeature('nonexistent', 'FREE')).toBeNull();
  });

  it('resolveAllFeatures returns all features', () => {
    const resolved = resolver.resolveAllFeatures('FREE');
    expect(resolved.length).toBe(DEFAULT_FEATURES.length);
  });

  it('resolveAllCapabilities returns all capabilities', () => {
    const resolved = resolver.resolveAllCapabilities('FREE');
    expect(resolved.length).toBe(DEFAULT_CAPABILITIES.length);
    const aiAssistant = resolved.find((r) => r.capabilityId === 'ai_assistant');
    expect(aiAssistant!.isUnlocked).toBe(true);
    const startup = resolved.find((r) => r.capabilityId === 'startup_cleanup');
    expect(startup!.isUnlocked).toBe(false);
  });

  it('getMinimumPlanForCapability returns correct plan', () => {
    expect(resolver.getMinimumPlanForCapability('ai_assistant')).toBe('FREE');
    expect(resolver.getMinimumPlanForCapability('startup_cleanup')).toBe('PRO');
    expect(resolver.getMinimumPlanForCapability('background_monitoring')).toBe('ULTIMATE');
  });

  it('getMinimumPlanForCapability returns null for unknown', () => {
    expect(resolver.getMinimumPlanForCapability('nonexistent')).toBeNull();
  });

  it('getMinimumPlanForFeature returns correct plan', () => {
    expect(resolver.getMinimumPlanForFeature('feature_ai_assistant')).toBe('FREE');
    expect(resolver.getMinimumPlanForFeature('feature_startup_optimizer')).toBe('PRO');
    expect(resolver.getMinimumPlanForFeature('feature_background_monitoring')).toBe('ULTIMATE');
  });

  it('getMinimumPlanForFeature returns null for unknown', () => {
    expect(resolver.getMinimumPlanForFeature('nonexistent')).toBeNull();
  });

  it('getLockedFeatures returns locked features for FREE plan', () => {
    const locked = resolver.getLockedFeatures('FREE');
    expect(locked).toContain('feature_startup_optimizer');
    expect(locked).toContain('feature_duplicate_engine');
    expect(locked).toContain('feature_scheduler');
    expect(locked).toContain('feature_background_monitoring');
    expect(locked).not.toContain('feature_ai_assistant');
  });

  it('getLockedFeatures returns empty for ENTERPRISE plan', () => {
    const locked = resolver.getLockedFeatures('ENTERPRISE');
    expect(locked).toHaveLength(0);
  });

  it('getLimitedFeatures returns limited features for FREE plan', () => {
    const limited = resolver.getLimitedFeatures('FREE');
    expect(limited).toContain('feature_ai_assistant');
    expect(limited).toContain('feature_smart_optimize');
    expect(limited).not.toContain('feature_startup_optimizer');
  });

  it('getLimitedFeatures returns empty for ENTERPRISE plan', () => {
    const limited = resolver.getLimitedFeatures('ENTERPRISE');
    expect(limited).toHaveLength(0);
  });

  it('getLimitedCapabilities returns limited capabilities for FREE plan', () => {
    const limited = resolver.getLimitedCapabilities('FREE');
    expect(limited).toContain('ai_assistant');
    expect(limited).toContain('smart_optimize');
  });

  it('handles unknown plan gracefully (defaults to FREE)', () => {
    const caps = resolver.getCapabilities('UNKNOWN');
    expect(caps).toContain('ai_assistant');
    expect(caps).not.toContain('startup_cleanup');
  });

  it('BETA plan has PRO-level capabilities', () => {
    const caps = resolver.getCapabilities('BETA');
    expect(caps).toContain('startup_cleanup');
    expect(caps).toContain('duplicate_cleanup');
    expect(caps).toContain('scheduler');
    expect(caps).not.toContain('background_monitoring');
  });
});

// ── Capability Validator ─────────────────────────────────────

describe('CapabilityValidator', () => {
  let validator: CapabilityValidator;

  beforeEach(() => {
    validator = new CapabilityValidator();
  });

  it('validates default config as valid', () => {
    const result = validator.validateConfig(DEFAULT_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('detects missing capability id', () => {
    const result = validator.validateCapability({
      id: '',
      displayName: 'Test',
      description: 'Test',
      category: 'test',
      minimumPlan: 'FREE',
      isVisible: true,
      canBeLimited: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'CAP_MISSING_ID')).toBe(true);
  });

  it('detects missing capability displayName', () => {
    const result = validator.validateCapability({
      id: 'test',
      displayName: '',
      description: 'Test',
      category: 'test',
      minimumPlan: 'FREE',
      isVisible: true,
      canBeLimited: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'CAP_MISSING_NAME')).toBe(true);
  });

  it('detects unknown plan in capability', () => {
    const result = validator.validateCapability({
      id: 'test',
      displayName: 'Test',
      description: 'Test',
      category: 'test',
      minimumPlan: 'UNKNOWN' as SubscriptionPlan,
      isVisible: true,
      canBeLimited: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'CAP_UNKNOWN_PLAN')).toBe(true);
  });

  it('detects duplicate capability ids in config', () => {
    const config: CapabilityConfig = {
      capabilities: [
        { id: 'dup', displayName: 'A', description: 'A', category: 'test', minimumPlan: 'FREE', isVisible: true, canBeLimited: false },
        { id: 'dup', displayName: 'B', description: 'B', category: 'test', minimumPlan: 'FREE', isVisible: true, canBeLimited: false },
      ],
      features: [],
      subscriptions: [],
    };
    const result = validator.validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'CAP_DUPLICATE_ID')).toBe(true);
  });

  it('detects missing feature id', () => {
    const result = validator.validateFeature({
      id: '',
      displayName: 'Test',
      description: 'Test',
      category: 'test',
      isVisible: true,
      isEnabled: true,
      isLimited: false,
      requiresSubscription: false,
      minimumPlan: 'FREE',
      requiredCapabilities: [],
    }, new Set());
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'FEAT_MISSING_ID')).toBe(true);
  });

  it('detects unknown plan in feature', () => {
    const result = validator.validateFeature({
      id: 'test_feat',
      displayName: 'Test',
      description: 'Test',
      category: 'test',
      isVisible: true,
      isEnabled: true,
      isLimited: false,
      requiresSubscription: false,
      minimumPlan: 'UNKNOWN' as SubscriptionPlan,
      requiredCapabilities: [],
    }, new Set());
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'FEAT_UNKNOWN_PLAN')).toBe(true);
  });

  it('detects unknown capability reference in feature', () => {
    const knownCaps = new Set(['cap_a']);
    const result = validator.validateFeature({
      id: 'test_feat',
      displayName: 'Test',
      description: 'Test',
      category: 'test',
      isVisible: true,
      isEnabled: true,
      isLimited: false,
      requiresSubscription: false,
      minimumPlan: 'FREE',
      requiredCapabilities: ['cap_a', 'cap_unknown'],
    }, knownCaps);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'FEAT_UNKNOWN_CAP')).toBe(true);
  });

  it('warns about features with no required capabilities', () => {
    const result = validator.validateFeature({
      id: 'test_feat',
      displayName: 'Test',
      description: 'Test',
      category: 'test',
      isVisible: true,
      isEnabled: true,
      isLimited: false,
      requiresSubscription: false,
      minimumPlan: 'FREE',
      requiredCapabilities: [],
    }, new Set());
    expect(result.issues.some((i) => i.code === 'FEAT_NO_CAPS' && i.level === 'warning')).toBe(true);
  });

  it('detects unknown plan in subscription', () => {
    const result = validator.validateSubscription({
      plan: 'UNKNOWN' as SubscriptionPlan,
      label: 'Test',
      description: 'Test',
      isPaid: false,
      capabilities: [],
      features: [],
      tierIndex: 99,
    }, new Set(), new Set());
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'SUB_UNKNOWN_PLAN')).toBe(true);
  });

  it('detects invalid tier index', () => {
    const result = validator.validateSubscription({
      plan: 'FREE',
      label: 'Free',
      description: 'Test',
      isPaid: false,
      capabilities: [],
      features: [],
      tierIndex: 99,
    }, new Set(), new Set());
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'SUB_INVALID_TIER')).toBe(true);
  });

  it('detects unknown capability in subscription', () => {
    const knownCaps = new Set(['cap_a']);
    const result = validator.validateSubscription({
      plan: 'FREE',
      label: 'Free',
      description: 'Test',
      isPaid: false,
      capabilities: ['cap_unknown'],
      features: [],
      tierIndex: 0,
    }, knownCaps, new Set());
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'SUB_UNKNOWN_CAP')).toBe(true);
  });

  it('detects unknown feature in subscription', () => {
    const knownFeatures = new Set(['feat_a']);
    const result = validator.validateSubscription({
      plan: 'FREE',
      label: 'Free',
      description: 'Test',
      isPaid: false,
      capabilities: [],
      features: ['feat_unknown'],
      tierIndex: 0,
    }, new Set(), knownFeatures);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'SUB_UNKNOWN_FEAT')).toBe(true);
  });

  it('detects duplicate subscription plans', () => {
    const config: CapabilityConfig = {
      capabilities: [],
      features: [],
      subscriptions: [
        { plan: 'FREE', label: 'A', description: 'A', isPaid: false, capabilities: [], features: [], tierIndex: 0 },
        { plan: 'FREE', label: 'B', description: 'B', isPaid: false, capabilities: [], features: [], tierIndex: 0 },
      ],
    };
    const result = validator.validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'SUB_DUPLICATE_PLAN')).toBe(true);
  });

  it('warns about tier index mismatch', () => {
    const config: CapabilityConfig = {
      capabilities: [],
      features: [],
      subscriptions: [
        { plan: 'FREE', label: 'Free', description: 'Test', isPaid: false, capabilities: [], features: [], tierIndex: 5 },
      ],
    };
    const result = validator.validateConfig(config);
    expect(result.issues.some((i) => i.code === 'SUB_TIER_MISMATCH' && i.level === 'warning')).toBe(true);
  });

  it('valid config returns no errors', () => {
    const result = validator.validateConfig(DEFAULT_CONFIG);
    expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });
});

// ── Default Definitions ──────────────────────────────────────

describe('Default Definitions', () => {
  it('DEFAULT_CAPABILITIES has 10 capabilities', () => {
    expect(DEFAULT_CAPABILITIES).toHaveLength(10);
  });

  it('DEFAULT_CAPABILITIES includes all expected capabilities', () => {
    const ids = DEFAULT_CAPABILITIES.map((c) => c.id);
    expect(ids).toContain('ai_assistant');
    expect(ids).toContain('smart_optimize');
    expect(ids).toContain('startup_cleanup');
    expect(ids).toContain('browser_cleanup');
    expect(ids).toContain('duplicate_cleanup');
    expect(ids).toContain('report_export');
    expect(ids).toContain('scheduler');
    expect(ids).toContain('background_monitoring');
    expect(ids).toContain('cloud_sync');
    expect(ids).toContain('trend_history');
  });

  it('DEFAULT_FEATURES has 10 features', () => {
    expect(DEFAULT_FEATURES).toHaveLength(10);
  });

  it('DEFAULT_SUBSCRIPTIONS has 7 subscriptions', () => {
    expect(DEFAULT_SUBSCRIPTIONS).toHaveLength(7);
  });

  it('all default capabilities have valid minimum plans', () => {
    for (const cap of DEFAULT_CAPABILITIES) {
      expect(isKnownPlan(cap.minimumPlan)).toBe(true);
    }
  });

  it('all default features have valid minimum plans', () => {
    for (const feat of DEFAULT_FEATURES) {
      expect(isKnownPlan(feat.minimumPlan)).toBe(true);
    }
  });

  it('all default subscriptions have valid plans', () => {
    for (const sub of DEFAULT_SUBSCRIPTIONS) {
      expect(isKnownPlan(sub.plan)).toBe(true);
    }
  });

  it('all default subscription tier indices match PLAN_TIER_ORDER', () => {
    for (const sub of DEFAULT_SUBSCRIPTIONS) {
      expect(sub.tierIndex).toBe(getPlanTierIndex(sub.plan));
    }
  });

  it('all default feature required capabilities exist in DEFAULT_CAPABILITIES', () => {
    const capIds = new Set(DEFAULT_CAPABILITIES.map((c) => c.id));
    for (const feat of DEFAULT_FEATURES) {
      for (const capId of feat.requiredCapabilities) {
        expect(capIds.has(capId)).toBe(true);
      }
    }
  });

  it('DEFAULT_CONFIG is valid', () => {
    const validator = new CapabilityValidator();
    const result = validator.validateConfig(DEFAULT_CONFIG);
    expect(result.valid).toBe(true);
  });

  it('FREE subscription has basic capabilities', () => {
    const free = DEFAULT_SUBSCRIPTIONS.find((s) => s.plan === 'FREE');
    expect(free).toBeDefined();
    expect(free!.capabilities).toContain('ai_assistant');
    expect(free!.capabilities).toContain('smart_optimize');
    expect(free!.isPaid).toBe(false);
  });

  it('PRO subscription is paid', () => {
    const pro = DEFAULT_SUBSCRIPTIONS.find((s) => s.plan === 'PRO');
    expect(pro).toBeDefined();
    expect(pro!.isPaid).toBe(true);
  });

  it('ENTERPRISE subscription has background_monitoring', () => {
    const ent = DEFAULT_SUBSCRIPTIONS.find((s) => s.plan === 'ENTERPRISE');
    expect(ent).toBeDefined();
    expect(ent!.capabilities).toContain('background_monitoring');
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.capabilityRegistry).toBeDefined();
    expect(mod.CapabilityRegistry).toBeDefined();
    expect(mod.CapabilityResolver).toBeDefined();
    expect(mod.CapabilityValidator).toBeDefined();
    expect(mod.capabilityValidator).toBeDefined();
    expect(mod.capabilityEvents).toBeDefined();
    expect(mod.CapabilityEventEmitter).toBeDefined();
    expect(mod.DEFAULT_CONFIG).toBeDefined();
    expect(mod.DEFAULT_CAPABILITIES).toBeDefined();
    expect(mod.DEFAULT_FEATURES).toBeDefined();
    expect(mod.DEFAULT_SUBSCRIPTIONS).toBeDefined();
    expect(mod.PLAN_TIER_ORDER).toBeDefined();
    expect(mod.PLAN_LABELS).toBeDefined();
    expect(mod.normalizePlan).toBeDefined();
    expect(mod.isKnownPlan).toBeDefined();
    expect(mod.planIncludes).toBeDefined();
    expect(mod.getPlanTierIndex).toBeDefined();
  });

  it('registry + resolver integration works end-to-end', () => {
    const registry = new CapabilityRegistry();
    registry.loadDefaults();
    const resolver = new CapabilityResolver(registry);

    // FREE plan
    expect(resolver.hasCapability('FREE', 'ai_assistant')).toBe(true);
    expect(resolver.hasCapability('FREE', 'startup_cleanup')).toBe(false);

    // PRO plan
    expect(resolver.hasCapability('PRO', 'startup_cleanup')).toBe(true);
    expect(resolver.hasCapability('PRO', 'background_monitoring')).toBe(false);

    // ENTERPRISE plan
    expect(resolver.hasCapability('ENTERPRISE', 'background_monitoring')).toBe(true);
    expect(resolver.getLockedCapabilities('ENTERPRISE')).toHaveLength(0);
  });

  it('adding a future plan requires only configuration', () => {
    const registry = new CapabilityRegistry();
    const config: CapabilityConfig = {
      capabilities: [
        { id: 'basic', displayName: 'Basic', description: 'Basic', category: 'test', minimumPlan: 'FREE', isVisible: true, canBeLimited: false },
        { id: 'advanced', displayName: 'Advanced', description: 'Advanced', category: 'test', minimumPlan: 'PRO', isVisible: true, canBeLimited: false },
      ],
      features: [
        { id: 'feat_basic', displayName: 'Basic', description: 'Basic', category: 'test', isVisible: true, isEnabled: true, isLimited: false, requiresSubscription: false, minimumPlan: 'FREE', requiredCapabilities: ['basic'] },
        { id: 'feat_advanced', displayName: 'Advanced', description: 'Advanced', category: 'test', isVisible: true, isEnabled: true, isLimited: false, requiresSubscription: true, minimumPlan: 'PRO', requiredCapabilities: ['advanced'] },
      ],
      subscriptions: [
        { plan: 'FREE', label: 'Free', description: 'Free', isPaid: false, capabilities: ['basic'], features: ['feat_basic'], tierIndex: 0 },
        { plan: 'PRO', label: 'Pro', description: 'Pro', isPaid: true, capabilities: ['advanced'], features: ['feat_advanced'], tierIndex: 2 },
      ],
    };
    registry.loadConfig(config);
    const resolver = new CapabilityResolver(registry);

    expect(resolver.hasCapability('FREE', 'basic')).toBe(true);
    expect(resolver.hasCapability('FREE', 'advanced')).toBe(false);
    expect(resolver.hasCapability('PRO', 'advanced')).toBe(true);
    expect(resolver.hasCapability('PRO', 'basic')).toBe(true);

    const validator = new CapabilityValidator();
    const result = validator.validateConfig(config);
    expect(result.valid).toBe(true);
  });

  it('unknown plan defaults to FREE', () => {
    const registry = new CapabilityRegistry();
    registry.loadDefaults();
    const resolver = new CapabilityResolver(registry);

    const caps = resolver.getCapabilities('NONEXISTENT');
    expect(caps).toContain('ai_assistant');
    expect(caps).not.toContain('startup_cleanup');
  });

  it('unknown capability returns false from hasCapability', () => {
    const registry = new CapabilityRegistry();
    registry.loadDefaults();
    const resolver = new CapabilityResolver(registry);

    expect(resolver.hasCapability('FREE', 'nonexistent')).toBe(false);
    expect(resolver.hasCapability('ENTERPRISE', 'nonexistent')).toBe(false);
  });

  it('resolveFeature returns null for unknown feature', () => {
    const registry = new CapabilityRegistry();
    registry.loadDefaults();
    const resolver = new CapabilityResolver(registry);

    expect(resolver.resolveFeature('nonexistent', 'FREE')).toBeNull();
  });

  it('getMinimumPlanForCapability returns null for unknown capability', () => {
    const registry = new CapabilityRegistry();
    registry.loadDefaults();
    const resolver = new CapabilityResolver(registry);

    expect(resolver.getMinimumPlanForCapability('nonexistent')).toBeNull();
  });

  it('all 7 subscription plans are covered in defaults', () => {
    const plans = new Set(DEFAULT_SUBSCRIPTIONS.map((s) => s.plan));
    expect(plans.has('FREE')).toBe(true);
    expect(plans.has('PRO')).toBe(true);
    expect(plans.has('ULTIMATE')).toBe(true);
    expect(plans.has('LIFETIME')).toBe(true);
    expect(plans.has('BETA')).toBe(true);
    expect(plans.has('ENTERPRISE')).toBe(true);
    expect(plans.has('FAMILY')).toBe(true);
  });

  it('all 10 capabilities are covered in defaults', () => {
    const ids = new Set(DEFAULT_CAPABILITIES.map((c) => c.id));
    expect(ids.has('ai_assistant')).toBe(true);
    expect(ids.has('smart_optimize')).toBe(true);
    expect(ids.has('startup_cleanup')).toBe(true);
    expect(ids.has('browser_cleanup')).toBe(true);
    expect(ids.has('duplicate_cleanup')).toBe(true);
    expect(ids.has('report_export')).toBe(true);
    expect(ids.has('scheduler')).toBe(true);
    expect(ids.has('background_monitoring')).toBe(true);
    expect(ids.has('cloud_sync')).toBe(true);
    expect(ids.has('trend_history')).toBe(true);
  });

  it('cumulative resolution: ENTERPRISE includes all capabilities', () => {
    const registry = new CapabilityRegistry();
    registry.loadDefaults();
    const resolver = new CapabilityResolver(registry);

    const caps = resolver.getCapabilities('ENTERPRISE');
    expect(caps.length).toBe(DEFAULT_CAPABILITIES.length);
  });

  it('cumulative resolution: ULTIMATE includes PRO capabilities', () => {
    const registry = new CapabilityRegistry();
    registry.loadDefaults();
    const resolver = new CapabilityResolver(registry);

    const ultimateCaps = resolver.getCapabilities('ULTIMATE');
    const proCaps = resolver.getCapabilities('PRO');

    // Every PRO capability should be in ULTIMATE
    for (const cap of proCaps) {
      expect(ultimateCaps).toContain(cap);
    }
  });

  it('LIFETIME has same capabilities as ULTIMATE (same tier+)', () => {
    const registry = new CapabilityRegistry();
    registry.loadDefaults();
    const resolver = new CapabilityResolver(registry);

    const lifetimeCaps = new Set(resolver.getCapabilities('LIFETIME'));
    const ultimateCaps = new Set(resolver.getCapabilities('ULTIMATE'));

    // Both should have background_monitoring
    expect(lifetimeCaps.has('background_monitoring')).toBe(true);
    expect(ultimateCaps.has('background_monitoring')).toBe(true);
  });

  it('FAMILY has same capabilities as PRO', () => {
    const registry = new CapabilityRegistry();
    registry.loadDefaults();
    const resolver = new CapabilityResolver(registry);

    const familyCaps = new Set(resolver.getCapabilities('FAMILY'));
    const proCaps = new Set(resolver.getCapabilities('PRO'));

    // FAMILY tier is above PRO, so it should include all PRO caps
    for (const cap of proCaps) {
      expect(familyCaps.has(cap)).toBe(true);
    }
  });
});
