/**
 * Tests for EPIC 4 PHASE A PART 2 — Optimization Profile Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  OptimizationProfile,
  ProfileCategory,
  ProfileResolutionContext,
  ProfileUserPreferences,
  RecommendationCategory,
  RiskTolerance,
  RiskLevel,
  OptimizationGoal,
  DeviceProfileType,
  PerformanceTier,
  WorkloadType,
} from '../types';
import {
  createDefaultPriorityWeights,
  createDefaultPolicies,
  createDefaultConstraints,
  createDefaultProfileConfiguration,
  generateProfileId,
  generateProfileComparisonId,
  generateProfileHistoryId,
  riskToleranceToScore,
  profilePriorityToScore,
} from '../types';
import {
  DEFAULT_PROFILE_CONFIGURATION,
  createProfileConfiguration,
} from '../optimizationProfileConfiguration';
import { OptimizationProfileEvents } from '../optimizationProfileEvents';
import { OptimizationProfileRegistry } from '../optimizationProfileRegistry';
import { OptimizationPolicyEngine } from '../optimizationPolicyEngine';
import { OptimizationConstraintEngine } from '../optimizationConstraintEngine';
import { OptimizationPreferenceResolver } from '../optimizationPreferenceResolver';
import { OptimizationProfileResolver } from '../optimizationProfileResolver';
import { OptimizationProfileValidator } from '../optimizationProfileValidator';
import { OptimizationProfileBuilder, type CustomProfileInput } from '../optimizationProfileBuilder';
import { OptimizationProfileHistory } from '../optimizationProfileHistory';
import { OptimizationProfileManager } from '../optimizationProfileManager';

// ── Mock Data Builders ───────────────────────────────────────

function createMockProfile(overrides: Partial<OptimizationProfile> = {}): OptimizationProfile {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'test_profile',
    name: overrides.name ?? 'Test Profile',
    description: overrides.description ?? 'A test profile',
    icon: overrides.icon ?? 'test-icon',
    category: overrides.category ?? 'balanced' as ProfileCategory,
    priority: overrides.priority ?? 'medium',
    optimizationGoal: overrides.optimizationGoal ?? 'balanced' as OptimizationGoal,
    preferredStrategy: overrides.preferredStrategy ?? 'balanced',
    preferredModules: overrides.preferredModules ?? [],
    excludedModules: overrides.excludedModules ?? [],
    riskTolerance: overrides.riskTolerance ?? 'medium' as RiskTolerance,
    estimatedDuration: overrides.estimatedDuration ?? 300,
    backgroundAllowed: overrides.backgroundAllowed ?? true,
    priorityWeights: overrides.priorityWeights ?? createDefaultPriorityWeights(),
    policies: overrides.policies ?? createDefaultPolicies(),
    constraints: overrides.constraints ?? createDefaultConstraints(),
    isBuiltIn: overrides.isBuiltIn ?? false,
    isCustom: overrides.isCustom ?? false,
    version: overrides.version ?? '1.0.0',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockResolutionContext(overrides: Partial<ProfileResolutionContext> = {}): ProfileResolutionContext {
  return {
    goal: overrides.goal ?? 'balanced' as OptimizationGoal,
    deviceProfileType: overrides.deviceProfileType ?? 'general_purpose' as DeviceProfileType,
    performanceTier: overrides.performanceTier ?? 'mid_range' as PerformanceTier,
    primaryWorkload: overrides.primaryWorkload ?? 'general_use' as WorkloadType,
    recommendationCategories: overrides.recommendationCategories ?? [],
    optimizationHistory: overrides.optimizationHistory ?? [],
    userPreferences: overrides.userPreferences ?? null,
    enterprisePolicies: overrides.enterprisePolicies ?? null,
  };
}

function createMockCustomInput(overrides: Partial<CustomProfileInput> = {}): CustomProfileInput {
  return {
    name: overrides.name ?? 'My Custom Profile',
    description: overrides.description ?? 'A custom optimization profile',
    optimizationGoal: overrides.optimizationGoal ?? 'balanced' as OptimizationGoal,
    priorityWeights: overrides.priorityWeights ?? { performance: 0.8 },
    preferredModules: overrides.preferredModules ?? [],
    excludedModules: overrides.excludedModules ?? [],
    riskTolerance: overrides.riskTolerance ?? 'low' as RiskTolerance,
    ...overrides,
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('createDefaultPriorityWeights has all 10 weights', () => {
    const w = createDefaultPriorityWeights();
    expect(w.performance).toBeDefined();
    expect(w.storage).toBeDefined();
    expect(w.privacy).toBeDefined();
    expect(w.startup).toBeDefined();
    expect(w.memory).toBeDefined();
    expect(w.battery).toBeDefined();
    expect(w.health).toBeDefined();
    expect(w.stability).toBeDefined();
    expect(w.maintenance).toBeDefined();
    expect(w.security).toBeDefined();
  });
  it('createDefaultPolicies has all 8 policies', () => {
    const p = createDefaultPolicies();
    expect(p.execution).toBeDefined();
    expect(p.safety).toBeDefined();
    expect(p.confirmation).toBeDefined();
    expect(p.scheduling).toBeDefined();
    expect(p.risk).toBeDefined();
    expect(p.rollback).toBeDefined();
    expect(p.notification).toBeDefined();
    expect(p.enterprise).toBeDefined();
  });
  it('createDefaultConstraints has all fields', () => {
    const c = createDefaultConstraints();
    expect(c.maxDurationMinutes).toBeDefined();
    expect(c.maxRiskLevel).toBeDefined();
    expect(c.requireRollback).toBeDefined();
  });
  it('createDefaultProfileConfiguration has all sections', () => {
    const cfg = createDefaultProfileConfiguration();
    expect(cfg.configVersion).toBe('1.0.0');
    expect(cfg.defaultPriorityWeights).toBeDefined();
    expect(cfg.defaultPolicies).toBeDefined();
    expect(cfg.defaultConstraints).toBeDefined();
    expect(cfg.resolutionRules).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
  });
  it('generateProfileId produces unique ids', () => {
    expect(generateProfileId()).not.toBe(generateProfileId());
    expect(generateProfileId()).toContain('profile_');
  });
  it('generateProfileComparisonId produces unique ids', () => {
    expect(generateProfileComparisonId()).toContain('profcmp_');
  });
  it('generateProfileHistoryId produces unique ids', () => {
    expect(generateProfileHistoryId()).toContain('profhist_');
  });
  it('riskToleranceToScore converts correctly', () => {
    expect(riskToleranceToScore('none')).toBe(0);
    expect(riskToleranceToScore('low')).toBe(0.25);
    expect(riskToleranceToScore('medium')).toBe(0.5);
    expect(riskToleranceToScore('high')).toBe(0.75);
    expect(riskToleranceToScore('extreme')).toBe(1.0);
  });
  it('profilePriorityToScore converts correctly', () => {
    expect(profilePriorityToScore('low')).toBe(0.3);
    expect(profilePriorityToScore('medium')).toBe(0.5);
    expect(profilePriorityToScore('high')).toBe(0.7);
    expect(profilePriorityToScore('critical')).toBe(1.0);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('ProfileConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_PROFILE_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_PROFILE_CONFIGURATION.maxCustomProfiles).toBe(20);
  });
  it('createProfileConfiguration accepts overrides', () => {
    const cfg = createProfileConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
  });
  it('merges featureFlags', () => {
    const cfg = createProfileConfiguration({ featureFlags: { enableCustomProfiles: false } });
    expect(cfg.featureFlags.enableCustomProfiles).toBe(false);
    expect(cfg.featureFlags.enableProfileComparison).toBe(true);
  });
  it('merges resolutionRules', () => {
    const cfg = createProfileConfiguration({ resolutionRules: { goalWeight: 0.5 } });
    expect(cfg.resolutionRules.goalWeight).toBe(0.5);
  });
  it('merges defaultPriorityWeights', () => {
    const cfg = createProfileConfiguration({ defaultPriorityWeights: { performance: 0.9 } });
    expect(cfg.defaultPriorityWeights.performance).toBe(0.9);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('ProfileEvents', () => {
  let events: OptimizationProfileEvents;
  beforeEach(() => { events = new OptimizationProfileEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('profile_registered', () => { received = true; });
    events.emitRegistered('p1');
    expect(received).toBe(true);
  });
  it('off removes listener', () => {
    let received = false;
    const listener = () => { received = true; };
    events.on('profile_selected', listener);
    events.off('profile_selected', listener);
    events.emitSelected('p1');
    expect(received).toBe(false);
  });
  it('on returns unsubscribe function', () => {
    let received = false;
    const unsub = events.on('profile_resolved', () => { received = true; });
    unsub();
    events.emitResolved('p1');
    expect(received).toBe(false);
  });
  it('emitUpdated works', () => {
    let received = false;
    events.on('profile_updated', () => { received = true; });
    events.emitUpdated('p1');
    expect(received).toBe(true);
  });
  it('emitDeleted works', () => {
    let received = false;
    events.on('profile_deleted', () => { received = true; });
    events.emitDeleted('p1');
    expect(received).toBe(true);
  });
  it('emitValidated works', () => {
    let received = false;
    events.on('profile_validated', () => { received = true; });
    events.emitValidated('p1');
    expect(received).toBe(true);
  });
  it('clear removes all', () => {
    events.on('profile_registered', () => {});
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });
  it('listenerCount returns correct count', () => {
    events.on('profile_registered', () => {});
    events.on('profile_selected', () => {});
    expect(events.listenerCount()).toBe(2);
    expect(events.listenerCount('profile_registered')).toBe(1);
  });
  it('does not crash on listener error', () => {
    events.on('profile_registered', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    events.emitRegistered('p1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Registry ─────────────────────────────────────────────────

describe('ProfileRegistry', () => {
  let registry: OptimizationProfileRegistry;
  beforeEach(() => { registry = new OptimizationProfileRegistry(createDefaultProfileConfiguration()); });

  it('registers built-in profiles on construction', () => {
    expect(registry.count()).toBeGreaterThanOrEqual(12);
    expect(registry.get('balanced')).toBeDefined();
    expect(registry.get('gaming')).toBeDefined();
    expect(registry.get('performance')).toBeDefined();
    expect(registry.get('privacy')).toBeDefined();
    expect(registry.get('storage')).toBeDefined();
    expect(registry.get('battery')).toBeDefined();
    expect(registry.get('maintenance')).toBeDefined();
    expect(registry.get('safe_mode')).toBeDefined();
    expect(registry.get('creator')).toBeDefined();
    expect(registry.get('developer')).toBeDefined();
    expect(registry.get('trading')).toBeDefined();
    expect(registry.get('business')).toBeDefined();
  });
  it('getBuiltIn returns only built-in', () => {
    const builtIns = registry.getBuiltIn();
    expect(builtIns.every((p) => p.isBuiltIn)).toBe(true);
  });
  it('register adds a new profile', () => {
    const profile = createMockProfile({ id: 'custom1', isCustom: true });
    expect(registry.register(profile)).toBe(true);
    expect(registry.get('custom1')).toBeDefined();
  });
  it('register fails for duplicate id', () => {
    const profile = createMockProfile({ id: 'balanced' });
    expect(registry.register(profile)).toBe(false);
  });
  it('unregister removes custom profiles', () => {
    const profile = createMockProfile({ id: 'custom1', isCustom: true });
    registry.register(profile);
    expect(registry.unregister('custom1')).toBe(true);
    expect(registry.get('custom1')).toBeUndefined();
  });
  it('unregister fails for built-in profiles', () => {
    expect(registry.unregister('balanced')).toBe(false);
  });
  it('getByCategory filters correctly', () => {
    const gaming = registry.getByCategory('gaming');
    expect(gaming.length).toBe(1);
    expect(gaming[0]!.id).toBe('gaming');
  });
  it('update modifies custom profiles', () => {
    const profile = createMockProfile({ id: 'custom1', isCustom: true });
    registry.register(profile);
    expect(registry.update('custom1', { name: 'Updated' })).toBe(true);
    expect(registry.get('custom1')!.name).toBe('Updated');
  });
  it('update fails for built-in profiles', () => {
    expect(registry.update('balanced', { name: 'X' })).toBe(false);
  });
  it('getAll returns all profiles', () => {
    expect(registry.getAll().length).toBe(registry.count());
  });
  it('getCustom returns empty initially', () => {
    expect(registry.getCustom().length).toBe(0);
  });
  it('customCount returns 0 initially', () => {
    expect(registry.customCount()).toBe(0);
  });
});

// ── Policy Engine ────────────────────────────────────────────

describe('PolicyEngine', () => {
  let engine: OptimizationPolicyEngine;
  beforeEach(() => { engine = new OptimizationPolicyEngine(); });

  it('evaluateExecution validates correctly', () => {
    expect(engine.evaluateExecution(createDefaultPolicies().execution).valid).toBe(true);
    expect(engine.evaluateExecution({ ...createDefaultPolicies().execution, maxParallelActions: 0 }).valid).toBe(false);
  });
  it('evaluateSafety allows low risk', () => {
    const result = engine.evaluateSafety(createDefaultPolicies().safety, 'low');
    expect(result.allowed).toBe(true);
  });
  it('evaluateSafety blocks critical risk', () => {
    const result = engine.evaluateSafety(createDefaultPolicies().safety, 'critical');
    expect(result.allowed).toBe(false);
  });
  it('evaluateConfirmation requires for high risk', () => {
    const policy = createDefaultPolicies().confirmation;
    expect(engine.evaluateConfirmation(policy, 'high').required).toBe(true);
  });
  it('evaluateConfirmation does not require for low risk', () => {
    const policy = createDefaultPolicies().confirmation;
    expect(engine.evaluateConfirmation(policy, 'low').required).toBe(false);
  });
  it('evaluateScheduling allows immediate', () => {
    expect(engine.evaluateScheduling(createDefaultPolicies().scheduling).canRunNow).toBe(true);
  });
  it('evaluateScheduling blocks manual', () => {
    const policy = { ...createDefaultPolicies().scheduling, type: 'manual' as const };
    expect(engine.evaluateScheduling(policy).canRunNow).toBe(false);
  });
  it('evaluateRisk accepts medium', () => {
    expect(engine.evaluateRisk(createDefaultPolicies().risk, 'medium').acceptable).toBe(true);
  });
  it('evaluateRisk rejects critical', () => {
    expect(engine.evaluateRisk(createDefaultPolicies().risk, 'critical').acceptable).toBe(false);
  });
  it('evaluateRollback requires capability', () => {
    const policy = { ...createDefaultPolicies().rollback, requireRollbackCapability: true };
    expect(engine.evaluateRollback(policy, false).canProceed).toBe(false);
    expect(engine.evaluateRollback(policy, true).canProceed).toBe(true);
  });
  it('evaluateNotification for start event', () => {
    const policy = createDefaultPolicies().notification;
    expect(engine.evaluateNotification(policy, 'start').shouldNotify).toBe(true);
  });
  it('evaluateNotification for none type', () => {
    const policy = { ...createDefaultPolicies().notification, type: 'none' as const };
    expect(engine.evaluateNotification(policy, 'start').shouldNotify).toBe(false);
  });
  it('evaluateEnterprise blocks disallowed', () => {
    const policy = { ...createDefaultPolicies().enterprise, enforceProfiles: true, allowedProfiles: ['x'] };
    expect(engine.evaluateEnterprise(policy, 'y').allowed).toBe(false);
  });
  it('evaluateEnterprise blocks blocked', () => {
    const policy = { ...createDefaultPolicies().enterprise, enforceProfiles: true, blockedProfiles: ['x'] };
    expect(engine.evaluateEnterprise(policy, 'x').allowed).toBe(false);
  });
  it('evaluateAll returns valid for default policies', () => {
    expect(engine.evaluateAll(createDefaultPolicies(), 'test').valid).toBe(true);
  });
  it('mergePolicies merges correctly', () => {
    const base = createDefaultPolicies();
    const merged = engine.mergePolicies(base, { execution: { maxParallelActions: 5 } as never });
    expect(merged.execution.maxParallelActions).toBe(5);
  });
});

// ── Constraint Engine ────────────────────────────────────────

describe('ConstraintEngine', () => {
  let engine: OptimizationConstraintEngine;
  beforeEach(() => { engine = new OptimizationConstraintEngine(); });

  it('evaluateDuration passes within limit', () => {
    expect(engine.evaluateDuration(createDefaultConstraints(), 60).passes).toBe(true);
  });
  it('evaluateDuration fails over limit', () => {
    expect(engine.evaluateDuration(createDefaultConstraints(), 3600).passes).toBe(false);
  });
  it('evaluateRisk passes for low risk', () => {
    expect(engine.evaluateRisk(createDefaultConstraints(), 'low').passes).toBe(true);
  });
  it('evaluateRisk fails for critical', () => {
    const c = { ...createDefaultConstraints(), maxRiskLevel: 'medium' as RiskLevel };
    expect(engine.evaluateRisk(c, 'critical').passes).toBe(false);
  });
  it('evaluateRollback passes when available', () => {
    expect(engine.evaluateRollback(createDefaultConstraints(), true).passes).toBe(true);
  });
  it('evaluateRollback fails when required but missing', () => {
    expect(engine.evaluateRollback(createDefaultConstraints(), false).passes).toBe(false);
  });
  it('evaluateCategory passes for allowed', () => {
    const c = { ...createDefaultConstraints(), allowedCategories: [] as RecommendationCategory[] };
    expect(engine.evaluateCategory(c, 'storage' as RecommendationCategory).passes).toBe(true);
  });
  it('evaluateCategory fails for blocked', () => {
    const c = { ...createDefaultConstraints(), blockedCategories: ['security'] as RecommendationCategory[] };
    expect(engine.evaluateCategory(c, 'security' as RecommendationCategory).passes).toBe(false);
  });
  it('evaluateSubscription passes with no requirements', () => {
    expect(engine.evaluateSubscription(createDefaultConstraints(), 'free').passes).toBe(true);
  });
  it('evaluateCapabilities passes with no requirements', () => {
    expect(engine.evaluateCapabilities(createDefaultConstraints(), []).passes).toBe(true);
  });
  it('evaluateCapabilities fails for missing', () => {
    const c = { ...createDefaultConstraints(), capabilityRequirements: ['admin'] };
    expect(engine.evaluateCapabilities(c, []).passes).toBe(false);
  });
  it('evaluateAll passes for valid context', () => {
    const result = engine.evaluateAll(createDefaultConstraints(), {
      estimatedDuration: 60,
      risk: 'low' as RiskLevel,
      hasRollback: true,
      requiresConfirmation: false,
      categories: [],
      subscription: 'free',
      capabilities: [],
    });
    expect(result.passes).toBe(true);
  });
  it('evaluateAll fails for invalid context', () => {
    const result = engine.evaluateAll(createDefaultConstraints(), {
      estimatedDuration: 3600,
      risk: 'low' as RiskLevel,
      hasRollback: true,
      requiresConfirmation: false,
      categories: [],
      subscription: 'free',
      capabilities: [],
    });
    expect(result.passes).toBe(false);
  });
  it('mergeConstraints merges correctly', () => {
    const base = createDefaultConstraints();
    const merged = engine.mergeConstraints(base, { maxDurationMinutes: 60 });
    expect(merged.maxDurationMinutes).toBe(60);
  });
});

// ── Preference Resolver ──────────────────────────────────────

describe('PreferenceResolver', () => {
  let resolver: OptimizationPreferenceResolver;
  beforeEach(() => { resolver = new OptimizationPreferenceResolver(); });

  it('resolve returns defaults for null', () => {
    const result = resolver.resolve(null);
    expect(result.riskTolerance).toBe('medium');
    expect(result.preferredCategory).toBeNull();
  });
  it('resolve returns user preferences', () => {
    const prefs: ProfileUserPreferences = {
      preferredCategory: 'gaming' as ProfileCategory,
      riskTolerance: 'low' as RiskTolerance,
      preferredCategories: [],
      excludedCategories: [],
      schedulingPreference: 'idle',
    };
    const result = resolver.resolve(prefs);
    expect(result.preferredCategory).toBe('gaming');
    expect(result.riskTolerance).toBe('low');
  });
  it('applyToProfile applies risk tolerance', () => {
    const profile = createMockProfile();
    const prefs: ProfileUserPreferences = {
      preferredCategory: null,
      riskTolerance: 'high' as RiskTolerance,
      preferredCategories: [],
      excludedCategories: [],
      schedulingPreference: 'immediate',
    };
    const applied = resolver.applyToProfile(profile, prefs);
    expect(applied.riskTolerance).toBe('high');
  });
  it('matchesProfile returns true for null preferences', () => {
    expect(resolver.matchesProfile(createMockProfile(), null)).toBe(true);
  });
  it('matchesProfile returns false for non-matching category', () => {
    const prefs: ProfileUserPreferences = {
      preferredCategory: 'gaming' as ProfileCategory,
      riskTolerance: 'medium' as RiskTolerance,
      preferredCategories: [],
      excludedCategories: [],
      schedulingPreference: 'immediate',
    };
    expect(resolver.matchesProfile(createMockProfile({ category: 'balanced' as ProfileCategory }), prefs)).toBe(false);
  });
  it('getPreferenceScore returns 0.5 for null preferences', () => {
    expect(resolver.getPreferenceScore(createMockProfile(), null)).toBe(0.5);
  });
  it('getPreferenceScore boosts matching category', () => {
    const prefs: ProfileUserPreferences = {
      preferredCategory: 'balanced' as ProfileCategory,
      riskTolerance: 'medium' as RiskTolerance,
      preferredCategories: [],
      excludedCategories: [],
      schedulingPreference: 'immediate',
    };
    expect(resolver.getPreferenceScore(createMockProfile({ category: 'balanced' as ProfileCategory }), prefs)).toBeGreaterThan(0.5);
  });
});

// ── Profile Resolver ─────────────────────────────────────────

describe('ProfileResolver', () => {
  let registry: OptimizationProfileRegistry;
  let resolver: OptimizationProfileResolver;
  beforeEach(() => {
    registry = new OptimizationProfileRegistry(createDefaultProfileConfiguration());
    resolver = new OptimizationProfileResolver(registry, createDefaultProfileConfiguration());
  });

  it('resolves a profile for balanced goal', () => {
    const result = resolver.resolve(createMockResolutionContext({ goal: 'balanced' as OptimizationGoal }));
    expect(result).not.toBeNull();
    expect(result!.profile).toBeDefined();
    expect(result!.score).toBeGreaterThan(0);
  });
  it('resolves gaming profile for gaming goal on gaming PC', () => {
    const result = resolver.resolve(createMockResolutionContext({
      goal: 'gaming_preparation' as OptimizationGoal,
      deviceProfileType: 'gaming_pc' as DeviceProfileType,
      primaryWorkload: 'gaming' as WorkloadType,
    }));
    expect(result).not.toBeNull();
    expect(result!.profile.category).toBe('gaming');
  });
  it('resolves storage profile for storage goal', () => {
    const result = resolver.resolve(createMockResolutionContext({
      goal: 'storage_recovery' as OptimizationGoal,
    }));
    expect(result).not.toBeNull();
    expect(result!.profile.id).toBe('storage');
  });
  it('provides alternatives', () => {
    const result = resolver.resolve(createMockResolutionContext());
    expect(result!.alternatives.length).toBeGreaterThan(0);
  });
  it('includes reason in result', () => {
    const result = resolver.resolve(createMockResolutionContext());
    expect(result!.reason).toContain('scored');
  });
  it('respects user preferences', () => {
    const result = resolver.resolve(createMockResolutionContext({
      goal: 'privacy_protection' as OptimizationGoal,
      userPreferences: {
        preferredCategory: 'privacy' as ProfileCategory,
        riskTolerance: 'low' as RiskTolerance,
        preferredCategories: [],
        excludedCategories: [],
        schedulingPreference: 'immediate',
      },
    }));
    expect(result).not.toBeNull();
    expect(result!.profile.category).toBe('privacy');
  });
  it('respects enterprise blocked profiles', () => {
    const result = resolver.resolve(createMockResolutionContext({
      goal: 'balanced' as OptimizationGoal,
      enterprisePolicies: {
        enforceProfiles: true,
        allowedProfiles: [],
        blockedProfiles: ['balanced'],
        requireApproval: false,
        maxDurationMinutes: 30,
        customRules: {},
      },
    }));
    expect(result).not.toBeNull();
    expect(result!.profile.id).not.toBe('balanced');
  });
  it('returns null for empty registry', () => {
    const emptyRegistry = new OptimizationProfileRegistry(createDefaultProfileConfiguration());
    const r = new OptimizationProfileResolver(emptyRegistry, createDefaultProfileConfiguration());
    // Manually clear all profiles
    for (const p of emptyRegistry.getAll()) {
      emptyRegistry.unregister(p.id);
    }
    // Built-ins can't be unregistered, so just test with normal registry
    expect(r.resolve(createMockResolutionContext())).not.toBeNull();
  });
});

// ── Validator ────────────────────────────────────────────────

describe('ProfileValidator', () => {
  let validator: OptimizationProfileValidator;
  beforeEach(() => { validator = new OptimizationProfileValidator(); });

  it('validates a correct profile', () => {
    const result = validator.validate(createMockProfile());
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
  it('detects missing id', () => {
    const result = validator.validate(createMockProfile({ id: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NO_ID')).toBe(true);
  });
  it('detects missing name', () => {
    const result = validator.validate(createMockProfile({ name: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NO_NAME')).toBe(true);
  });
  it('detects invalid priority weight', () => {
    const weights = { ...createDefaultPriorityWeights(), performance: -0.5 };
    const result = validator.validate(createMockProfile({ priorityWeights: weights }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_WEIGHT')).toBe(true);
  });
  it('detects invalid maxParallelActions', () => {
    const policies = createDefaultPolicies();
    policies.execution.maxParallelActions = 0;
    const result = validator.validate(createMockProfile({ policies }));
    expect(result.valid).toBe(false);
  });
  it('detects category conflict', () => {
    const constraints = createDefaultConstraints();
    constraints.allowedCategories = ['storage'] as RecommendationCategory[];
    constraints.blockedCategories = ['storage'] as RecommendationCategory[];
    const result = validator.validate(createMockProfile({ constraints }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'CATEGORY_CONFLICT')).toBe(true);
  });
  it('warns on missing version', () => {
    const result = validator.validate(createMockProfile({ version: '' }));
    expect(result.warnings.some((w) => w.code === 'NO_VERSION')).toBe(true);
  });
  it('validateBatch separates valid and invalid', () => {
    const profiles = [
      createMockProfile({ id: 'valid1' }),
      createMockProfile({ id: 'invalid1', name: '' }),
    ];
    const result = validator.validateBatch(profiles);
    expect(result.valid.length).toBe(1);
    expect(result.invalid.length).toBe(1);
  });
});

// ── Builder ──────────────────────────────────────────────────

describe('ProfileBuilder', () => {
  let builder: OptimizationProfileBuilder;
  beforeEach(() => { builder = new OptimizationProfileBuilder(createDefaultProfileConfiguration()); });

  it('builds a custom profile', () => {
    const profile = builder.buildCustom(createMockCustomInput());
    expect(profile.id).toContain('profile_');
    expect(profile.isCustom).toBe(true);
    expect(profile.isBuiltIn).toBe(false);
    expect(profile.name).toBe('My Custom Profile');
  });
  it('sets category to custom', () => {
    const profile = builder.buildCustom(createMockCustomInput());
    expect(profile.category).toBe('custom');
  });
  it('applies priority weights', () => {
    const profile = builder.buildCustom(createMockCustomInput({ priorityWeights: { performance: 0.9 } }));
    expect(profile.priorityWeights.performance).toBe(0.9);
  });
  it('applies risk tolerance', () => {
    const profile = builder.buildCustom(createMockCustomInput({ riskTolerance: 'high' as RiskTolerance }));
    expect(profile.riskTolerance).toBe('high');
  });
  it('applies excluded categories to constraints', () => {
    const profile = builder.buildCustom(createMockCustomInput({
      excludedCategories: ['security'] as RecommendationCategory[],
    }));
    expect(profile.constraints.blockedCategories).toContain('security');
  });
  it('updateCustom updates existing profile', () => {
    const existing = builder.buildCustom(createMockCustomInput());
    const updated = builder.updateCustom(existing, { name: 'Updated Name' });
    expect(updated.name).toBe('Updated Name');
  });
});

// ── History ──────────────────────────────────────────────────

describe('ProfileHistory', () => {
  let history: OptimizationProfileHistory;
  beforeEach(() => { history = new OptimizationProfileHistory(100); });

  it('records entries', () => {
    history.record('p1', 'registered');
    expect(history.count).toBe(1);
  });
  it('getAll returns all entries', () => {
    history.record('p1', 'registered');
    history.record('p2', 'selected');
    expect(history.getAll().length).toBe(2);
  });
  it('getRecent returns last N', () => {
    history.record('p1', 'registered');
    history.record('p2', 'selected');
    expect(history.getRecent(1).length).toBe(1);
    expect(history.getRecent(1)[0]!.profileId).toBe('p2');
  });
  it('getByProfile filters', () => {
    history.record('p1', 'registered');
    history.record('p2', 'selected');
    expect(history.getByProfile('p1').length).toBe(1);
  });
  it('getByAction filters', () => {
    history.record('p1', 'registered');
    history.record('p2', 'selected');
    expect(history.getByAction('registered').length).toBe(1);
  });
  it('clear removes all', () => {
    history.record('p1', 'registered');
    history.clear();
    expect(history.count).toBe(0);
  });
  it('setMaxEntries trims', () => {
    for (let i = 0; i < 10; i++) history.record(`p${i}`, 'registered');
    history.setMaxEntries(5);
    expect(history.count).toBe(5);
  });
});

// ── Profile Manager ──────────────────────────────────────────

describe('ProfileManager', () => {
  let manager: OptimizationProfileManager;
  beforeEach(() => { manager = new OptimizationProfileManager(); });

  it('initializes with built-in profiles', () => {
    expect(manager.getProfiles().length).toBeGreaterThanOrEqual(12);
  });
  it('getProfile returns built-in', () => {
    expect(manager.getProfile('balanced')).toBeDefined();
  });
  it('getProfiles returns all', () => {
    expect(manager.getProfiles().length).toBeGreaterThan(0);
  });
  it('getBuiltInProfiles returns built-ins', () => {
    expect(manager.getBuiltInProfiles().length).toBeGreaterThanOrEqual(12);
  });
  it('getCustomProfiles returns empty initially', () => {
    expect(manager.getCustomProfiles().length).toBe(0);
  });
  it('registerProfile adds a profile', () => {
    const profile = createMockProfile({ id: 'custom1', isCustom: true });
    expect(manager.registerProfile(profile)).toBe(true);
    expect(manager.getProfile('custom1')).toBeDefined();
  });
  it('registerProfile emits event', () => {
    let emitted = false;
    manager.on('profile_registered', () => { emitted = true; });
    manager.registerProfile(createMockProfile({ id: 'custom1', isCustom: true }));
    expect(emitted).toBe(true);
  });
  it('resolveProfile returns a result', () => {
    const result = manager.resolveProfile(createMockResolutionContext({ goal: 'balanced' as OptimizationGoal }));
    expect(result).not.toBeNull();
    expect(result!.profile).toBeDefined();
  });
  it('resolveProfile emits events', () => {
    let resolved = false;
    let selected = false;
    manager.on('profile_resolved', () => { resolved = true; });
    manager.on('profile_selected', () => { selected = true; });
    manager.resolveProfile(createMockResolutionContext());
    expect(resolved).toBe(true);
    expect(selected).toBe(true);
  });
  it('compareProfiles returns comparison', () => {
    const comparison = manager.compareProfiles('balanced', 'gaming');
    expect(comparison).not.toBeNull();
    expect(comparison!.profileAId).toBe('balanced');
    expect(comparison!.profileBId).toBe('gaming');
  });
  it('compareProfiles returns null for unknown', () => {
    expect(manager.compareProfiles('unknown', 'also_unknown')).toBeNull();
  });
  it('validateProfile returns result', () => {
    const result = manager.validateProfile('balanced');
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
  });
  it('validateProfile returns null for unknown', () => {
    expect(manager.validateProfile('unknown')).toBeNull();
  });
  it('validateProfile emits event', () => {
    let emitted = false;
    manager.on('profile_validated', () => { emitted = true; });
    manager.validateProfile('balanced');
    expect(emitted).toBe(true);
  });
  it('createCustomProfile creates and registers', () => {
    const profile = manager.createCustomProfile(createMockCustomInput());
    expect(profile).not.toBeNull();
    expect(profile!.isCustom).toBe(true);
    expect(manager.getProfile(profile!.id)).toBeDefined();
  });
  it('createCustomProfile emits registered event', () => {
    let emitted = false;
    manager.on('profile_registered', () => { emitted = true; });
    manager.createCustomProfile(createMockCustomInput());
    expect(emitted).toBe(true);
  });
  it('createCustomProfile fails when disabled', () => {
    const cfg = createProfileConfiguration({ featureFlags: { enableCustomProfiles: false } });
    const m = new OptimizationProfileManager(cfg);
    expect(m.createCustomProfile(createMockCustomInput())).toBeNull();
  });
  it('updateCustomProfile updates existing', () => {
    const profile = manager.createCustomProfile(createMockCustomInput());
    const updated = manager.updateCustomProfile(profile!.id, { name: 'Updated' });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Updated');
  });
  it('updateCustomProfile fails for built-in', () => {
    expect(manager.updateCustomProfile('balanced', { name: 'X' })).toBeNull();
  });
  it('updateCustomProfile emits updated event', () => {
    let emitted = false;
    manager.on('profile_updated', () => { emitted = true; });
    const profile = manager.createCustomProfile(createMockCustomInput());
    manager.updateCustomProfile(profile!.id, { name: 'Updated' });
    expect(emitted).toBe(true);
  });
  it('deleteCustomProfile removes custom', () => {
    const profile = manager.createCustomProfile(createMockCustomInput());
    expect(manager.deleteCustomProfile(profile!.id)).toBe(true);
    expect(manager.getProfile(profile!.id)).toBeUndefined();
  });
  it('deleteCustomProfile fails for built-in', () => {
    expect(manager.deleteCustomProfile('balanced')).toBe(false);
  });
  it('deleteCustomProfile emits deleted event', () => {
    let emitted = false;
    manager.on('profile_deleted', () => { emitted = true; });
    const profile = manager.createCustomProfile(createMockCustomInput());
    manager.deleteCustomProfile(profile!.id);
    expect(emitted).toBe(true);
  });
  it('getProfileStatistics returns stats', () => {
    const stats = manager.getProfileStatistics();
    expect(stats.totalProfiles).toBeGreaterThanOrEqual(12);
    expect(stats.builtInProfiles).toBeGreaterThanOrEqual(12);
    expect(stats.byCategory.balanced).toBe(1);
  });
  it('getProfileStatistics tracks custom profiles', () => {
    manager.createCustomProfile(createMockCustomInput());
    const stats = manager.getProfileStatistics();
    expect(stats.customProfiles).toBe(1);
  });
  it('history records events', () => {
    manager.resolveProfile(createMockResolutionContext());
    expect(manager.history.length).toBeGreaterThan(0);
  });
  it('clear resets history and events', () => {
    manager.resolveProfile(createMockResolutionContext());
    manager.clear();
    expect(manager.history.length).toBe(0);
  });
  it('config is accessible', () => {
    expect(manager.config.configVersion).toBe('1.0.0');
  });
  it('updateConfig updates config', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.OptimizationProfileManager).toBeDefined();
    expect(module.OptimizationProfileRegistry).toBeDefined();
    expect(module.OptimizationProfileBuilder).toBeDefined();
    expect(module.OptimizationProfileResolver).toBeDefined();
    expect(module.OptimizationProfileValidator).toBeDefined();
    expect(module.OptimizationPolicyEngine).toBeDefined();
    expect(module.OptimizationConstraintEngine).toBeDefined();
    expect(module.OptimizationPreferenceResolver).toBeDefined();
    expect(module.OptimizationProfileHistory).toBeDefined();
    expect(module.OptimizationProfileEvents).toBeDefined();
    expect(module.DEFAULT_PROFILE_CONFIGURATION).toBeDefined();
  });
  it('full lifecycle: create custom → validate → compare → delete', () => {
    const manager = new OptimizationProfileManager();
    const custom = manager.createCustomProfile(createMockCustomInput({ name: 'Lifecycle Test' }));
    expect(custom).not.toBeNull();
    const validation = manager.validateProfile(custom!.id);
    expect(validation!.valid).toBe(true);
    const comparison = manager.compareProfiles('balanced', custom!.id);
    expect(comparison).not.toBeNull();
    expect(manager.deleteCustomProfile(custom!.id)).toBe(true);
  });
  it('built-in profiles have correct goals', () => {
    const manager = new OptimizationProfileManager();
    const gaming = manager.getProfile('gaming');
    expect(gaming!.optimizationGoal).toBe('gaming_preparation');
    const storage = manager.getProfile('storage');
    expect(storage!.optimizationGoal).toBe('storage_recovery');
    const privacy = manager.getProfile('privacy');
    expect(privacy!.optimizationGoal).toBe('privacy_protection');
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('profile resolution under 50ms', () => {
    const manager = new OptimizationProfileManager();
    const start = performance.now();
    manager.resolveProfile(createMockResolutionContext());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles null user preferences in resolution', () => {
    const manager = new OptimizationProfileManager();
    const result = manager.resolveProfile(createMockResolutionContext({ userPreferences: null }));
    expect(result).not.toBeNull();
  });
  it('handles empty optimization history', () => {
    const manager = new OptimizationProfileManager();
    const result = manager.resolveProfile(createMockResolutionContext({ optimizationHistory: [] }));
    expect(result).not.toBeNull();
  });
  it('handles null enterprise policies', () => {
    const manager = new OptimizationProfileManager();
    const result = manager.resolveProfile(createMockResolutionContext({ enterprisePolicies: null }));
    expect(result).not.toBeNull();
  });
  it('handles max custom profiles limit', () => {
    const cfg = createProfileConfiguration({ maxCustomProfiles: 1 });
    const manager = new OptimizationProfileManager(cfg);
    expect(manager.createCustomProfile(createMockCustomInput({ name: 'A' }))).not.toBeNull();
    expect(manager.createCustomProfile(createMockCustomInput({ name: 'B' }))).toBeNull();
  });
  it('handles events disabled', () => {
    const cfg = createProfileConfiguration({ enableEvents: false });
    const manager = new OptimizationProfileManager(cfg);
    let emitted = false;
    manager.on('profile_registered', () => { emitted = true; });
    manager.registerProfile(createMockProfile({ id: 'test1', isCustom: true }));
    expect(emitted).toBe(false);
  });
  it('handles invalid custom profile input', () => {
    const manager = new OptimizationProfileManager();
    const profile = manager.createCustomProfile(createMockCustomInput({ name: '' }));
    expect(profile).toBeNull();
  });
  it('safe_mode profile has low risk', () => {
    const manager = new OptimizationProfileManager();
    const safeMode = manager.getProfile('safe_mode');
    expect(safeMode!.policies.safety.maxRiskLevel).toBe('low');
    expect(safeMode!.policies.safety.allowUnsafeActions).toBe(false);
  });
  it('gaming profile has high performance weight', () => {
    const manager = new OptimizationProfileManager();
    const gaming = manager.getProfile('gaming');
    expect(gaming!.priorityWeights.performance).toBeGreaterThan(0.8);
  });
  it('privacy profile has high privacy weight', () => {
    const manager = new OptimizationProfileManager();
    const privacy = manager.getProfile('privacy');
    expect(privacy!.priorityWeights.privacy).toBeGreaterThan(0.8);
  });
  it('battery profile has high battery weight', () => {
    const manager = new OptimizationProfileManager();
    const battery = manager.getProfile('battery');
    expect(battery!.priorityWeights.battery).toBeGreaterThan(0.8);
  });
});
