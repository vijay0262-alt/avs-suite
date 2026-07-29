/**
 * Tests for the Experience Layer.
 *
 * Covers:
 * - Types & configuration
 * - Experience events (8 event types)
 * - Trial manager (active/expired/available/used/disabled, feature trials)
 * - Feature visibility service (visible/limited/hidden, badges, messages)
 * - Feature access validator (canAccess, canUse, isLimited, isLocked, getRemainingQuota)
 * - Upgrade reason builder (from rule, locked feature, quota exceeded, generic)
 * - Upgrade recommendation engine (context-based, analytics, all recommendations)
 * - Usage summary provider (plan, trial, features, quotas, recommendations)
 * - Experience resolver (full state resolution)
 * - Experience manager (orchestrator: all APIs, plan switching, trial, quota, analytics)
 * - Default configuration
 * - Regression
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExperienceConfig } from '../types';
import { ExperienceEventEmitter } from '../experienceEvents';
import { TrialManager } from '../trialManager';
import { FeatureVisibilityService } from '../featureVisibilityService';
import { FeatureAccessValidator } from '../featureAccessValidator';
import { UpgradeReasonBuilder } from '../upgradeReasonBuilder';
import { UpgradeRecommendationEngine } from '../upgradeRecommendationEngine';
import { UsageSummaryProvider } from '../usageSummaryProvider';
import { ExperienceResolver } from '../experienceResolver';
import { ExperienceManager } from '../experienceManager';
import { DEFAULT_EXPERIENCE_CONFIG } from '../defaultExperienceConfig';
import { CapabilityRegistry } from '../../usage-capabilities/capabilityRegistry';
import { CapabilityResolver } from '../../usage-capabilities/capabilityResolver';
import { QuotaManager } from '../../usage-quota/quotaManager';
import { MemoryQuotaStorage } from '../../usage-quota/quotaStorage';

// ── Experience Events ────────────────────────────────────────

describe('ExperienceEventEmitter', () => {
  let emitter: ExperienceEventEmitter;

  beforeEach(() => {
    emitter = new ExperienceEventEmitter();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    emitter.on('experience_loaded', listener);
    emitter.emit('experience_loaded', { test: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = emitter.on('trial_started', listener);
    unsub();
    emitter.emit('trial_started', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('tracks listener count', () => {
    emitter.on('feature_accessed', () => {});
    emitter.on('feature_accessed', () => {});
    expect(emitter.listenerCount('feature_accessed')).toBe(2);
  });

  it('clear removes all listeners', () => {
    emitter.on('experience_loaded', () => {});
    emitter.on('feature_denied', () => {});
    emitter.clear();
    expect(emitter.listenerCount('experience_loaded')).toBe(0);
  });

  it('does not crash when listener throws', () => {
    emitter.on('experience_updated', () => { throw new Error('test'); });
    expect(() => emitter.emit('experience_updated', {})).not.toThrow();
  });

  it('supports all 8 event types', () => {
    const events = [
      'experience_loaded', 'experience_updated', 'quota_limit_reached',
      'trial_started', 'trial_expired', 'upgrade_recommended',
      'feature_accessed', 'feature_denied',
    ] as const;
    for (const evt of events) {
      const listener = vi.fn();
      emitter.on(evt, listener);
      emitter.emit(evt, { test: true });
      expect(listener).toHaveBeenCalledTimes(1);
    }
  });
});

// ── Trial Manager ────────────────────────────────────────────

describe('TrialManager', () => {
  let trial: TrialManager;

  beforeEach(() => {
    trial = new TrialManager(DEFAULT_EXPERIENCE_CONFIG.trialConfig);
  });

  it('starts as available when enabled', () => {
    expect(trial.getStatus()).toBe('available');
    expect(trial.isTrialActive()).toBe(false);
  });

  it('starts as disabled when config disabled', () => {
    const disabledTrial = new TrialManager({ ...DEFAULT_EXPERIENCE_CONFIG.trialConfig, enabled: false });
    expect(disabledTrial.getStatus()).toBe('disabled');
  });

  it('startTrial activates trial', () => {
    const result = trial.startTrial();
    expect(result).toBe(true);
    expect(trial.isTrialActive()).toBe(true);
    expect(trial.getStatus()).toBe('active');
  });

  it('startTrial with custom duration', () => {
    trial.startTrial(30);
    const info = trial.getTrialInfo();
    expect(info.durationDays).toBe(14); // config default
    expect(info.daysRemaining).toBeLessThanOrEqual(30);
    expect(info.daysRemaining).toBeGreaterThan(25);
  });

  it('startTrial fails when already active', () => {
    trial.startTrial();
    expect(trial.startTrial()).toBe(false);
  });

  it('startTrial fails when disabled', () => {
    const disabledTrial = new TrialManager({ ...DEFAULT_EXPERIENCE_CONFIG.trialConfig, enabled: false });
    expect(disabledTrial.startTrial()).toBe(false);
  });

  it('startTrial marks as used after max trials', () => {
    trial.startTrial();
    trial.expireTrial();
    expect(trial.startTrial()).toBe(false);
    expect(trial.getStatus()).toBe('used');
  });

  it('expireTrial sets status to expired', () => {
    trial.startTrial();
    trial.expireTrial();
    expect(trial.getStatus()).toBe('expired');
  });

  it('expireTrial does nothing when not active', () => {
    trial.expireTrial();
    expect(trial.getStatus()).toBe('available');
  });

  it('getTrialInfo returns correct info when available', () => {
    const info = trial.getTrialInfo();
    expect(info.status).toBe('available');
    expect(info.startedAt).toBeNull();
    expect(info.expiresAt).toBeNull();
    expect(info.isEligible).toBe(true);
  });

  it('getTrialInfo returns correct info when active', () => {
    trial.startTrial(14);
    const info = trial.getTrialInfo();
    expect(info.status).toBe('active');
    expect(info.startedAt).not.toBeNull();
    expect(info.expiresAt).not.toBeNull();
    expect(info.daysRemaining).toBeGreaterThan(0);
    expect(info.isEligible).toBe(false);
  });

  it('startFeatureTrial starts a feature-specific trial', () => {
    const result = trial.startFeatureTrial('feature_ai_assistant');
    expect(result).toBe(true);
    expect(trial.isFeatureTrialActive('feature_ai_assistant')).toBe(true);
  });

  it('startFeatureTrial fails for duplicate', () => {
    trial.startFeatureTrial('feature_ai_assistant');
    expect(trial.startFeatureTrial('feature_ai_assistant')).toBe(false);
  });

  it('isFeatureTrialActive returns false for unknown feature', () => {
    expect(trial.isFeatureTrialActive('unknown')).toBe(false);
  });

  it('reset clears trial state', () => {
    trial.startTrial();
    trial.reset();
    expect(trial.getStatus()).toBe('available');
    expect(trial.getTrialInfo().startedAt).toBeNull();
  });

  it('updateConfig updates trial config', () => {
    trial.updateConfig({ ...DEFAULT_EXPERIENCE_CONFIG.trialConfig, defaultDurationDays: 30 });
    trial.startTrial();
    const info = trial.getTrialInfo();
    expect(info.durationDays).toBe(30);
  });
});

// ── Feature Visibility Service ───────────────────────────────

describe('FeatureVisibilityService', () => {
  let service: FeatureVisibilityService;
  let registry: CapabilityRegistry;
  let resolver: CapabilityResolver;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.loadDefaults();
    resolver = new CapabilityResolver(registry);
    service = new FeatureVisibilityService();
    service.setRules(DEFAULT_EXPERIENCE_CONFIG.visibilityRules);
    service.setCapabilityResolver(resolver);
  });

  it('getVisibility returns visible for FREE plan on basic features', () => {
    expect(service.getVisibility('feature_ai_assistant', 'FREE')).toBe('visible');
    expect(service.getVisibility('feature_smart_optimize', 'FREE')).toBe('visible');
  });

  it('getVisibility returns limited for FREE plan on Pro features', () => {
    expect(service.getVisibility('feature_startup_optimizer', 'FREE')).toBe('limited');
    expect(service.getVisibility('feature_duplicate_engine', 'FREE')).toBe('limited');
    expect(service.getVisibility('feature_scheduler', 'FREE')).toBe('limited');
  });

  it('getVisibility returns visible for PRO plan on Pro features', () => {
    expect(service.getVisibility('feature_startup_optimizer', 'PRO')).toBe('visible');
  });

  it('getVisibility returns limited for PRO plan on Ultimate features', () => {
    expect(service.getVisibility('feature_background_monitoring', 'PRO')).toBe('limited');
  });

  it('getVisibility returns visible for ENTERPRISE plan', () => {
    expect(service.getVisibility('feature_background_monitoring', 'ENTERPRISE')).toBe('visible');
  });

  it('getBadgeText returns badge for plan', () => {
    expect(service.getBadgeText('feature_ai_assistant', 'FREE')).toBe('5/day');
    expect(service.getBadgeText('feature_ai_assistant', 'PRO')).toBe('Unlimited');
  });

  it('getBadgeText returns null when no badge', () => {
    expect(service.getBadgeText('feature_ai_assistant', 'ENTERPRISE')).toBeNull();
  });

  it('getDisplayMessage returns message for plan', () => {
    expect(service.getDisplayMessage('feature_startup_optimizer', 'FREE')).toContain('Upgrade to Pro');
  });

  it('getVisibleFeatures returns non-hidden features', () => {
    const all = registry.getAllFeatures().map((f) => f.id);
    const visible = service.getVisibleFeatures(all, 'FREE');
    expect(visible).toContain('feature_ai_assistant');
    expect(visible).toContain('feature_startup_optimizer');
  });

  it('getLimitedFeatures returns limited features', () => {
    const all = registry.getAllFeatures().map((f) => f.id);
    const limited = service.getLimitedFeatures(all, 'FREE');
    expect(limited).toContain('feature_startup_optimizer');
    expect(limited).not.toContain('feature_ai_assistant');
  });

  it('getHiddenFeatures returns empty when nothing hidden', () => {
    const all = registry.getAllFeatures().map((f) => f.id);
    const hidden = service.getHiddenFeatures(all, 'FREE');
    expect(hidden).toHaveLength(0);
  });

  it('falls back to resolver when no rule exists', () => {
    expect(service.getVisibility('nonexistent_feature', 'FREE')).toBe('visible');
  });
});

// ── Feature Access Validator ─────────────────────────────────

describe('FeatureAccessValidator', () => {
  let registry: CapabilityRegistry;
  let resolver: CapabilityResolver;
  let quotaManager: QuotaManager;
  let trialManager: TrialManager;
  let visibilityService: FeatureVisibilityService;
  let validator: FeatureAccessValidator;

  beforeEach(async () => {
    registry = new CapabilityRegistry();
    registry.loadDefaults();
    resolver = new CapabilityResolver(registry);
    quotaManager = new QuotaManager(new MemoryQuotaStorage());
    await quotaManager.initialize();
    trialManager = new TrialManager(DEFAULT_EXPERIENCE_CONFIG.trialConfig);
    visibilityService = new FeatureVisibilityService();
    visibilityService.setRules(DEFAULT_EXPERIENCE_CONFIG.visibilityRules);
    visibilityService.setCapabilityResolver(resolver);
    validator = new FeatureAccessValidator(
      resolver, quotaManager, trialManager, visibilityService, DEFAULT_EXPERIENCE_CONFIG,
    );
  });

  it('canAccess returns true for visible features', () => {
    expect(validator.canAccess('feature_ai_assistant', 'FREE')).toBe(true);
  });

  it('canAccess returns true for limited features', () => {
    expect(validator.canAccess('feature_startup_optimizer', 'FREE')).toBe(true);
  });

  it('canUse returns true for unlocked features with quota', () => {
    expect(validator.canUse('feature_ai_assistant', 'FREE')).toBe(true);
  });

  it('canUse returns false for locked features', () => {
    expect(validator.canUse('feature_startup_optimizer', 'FREE')).toBe(false);
  });

  it('canUse returns true for locked features when trial is active', () => {
    trialManager.startTrial();
    expect(validator.canUse('feature_startup_optimizer', 'FREE')).toBe(true);
  });

  it('canOptimize is alias for canUse', () => {
    expect(validator.canOptimize('feature_ai_assistant', 'FREE')).toBe(true);
    expect(validator.canOptimize('feature_startup_optimizer', 'FREE')).toBe(false);
  });

  it('isFeatureLimited returns true for limited visibility', () => {
    expect(validator.isFeatureLimited('feature_startup_optimizer', 'FREE')).toBe(true);
  });

  it('isFeatureLimited returns false for fully unlocked', () => {
    expect(validator.isFeatureLimited('feature_ai_assistant', 'PRO')).toBe(false);
  });

  it('isFeatureLocked returns true for locked features', () => {
    expect(validator.isFeatureLocked('feature_startup_optimizer', 'FREE')).toBe(true);
  });

  it('isFeatureLocked returns false for unlocked features', () => {
    expect(validator.isFeatureLocked('feature_ai_assistant', 'FREE')).toBe(false);
  });

  it('isFeatureLocked returns false when trial is active', () => {
    trialManager.startTrial();
    expect(validator.isFeatureLocked('feature_startup_optimizer', 'FREE')).toBe(false);
  });

  it('getRemainingQuota returns quota for feature', () => {
    const remaining = validator.getRemainingQuota('feature_ai_assistant');
    expect(remaining).not.toBeNull();
    expect(remaining).toBe(5);
  });

  it('getRemainingQuota returns null for feature without quota', () => {
    expect(validator.getRemainingQuota('feature_cloud_sync')).toBeNull();
  });

  it('getAccessResult returns full result for unlocked feature', () => {
    const result = validator.getAccessResult('feature_ai_assistant', 'FREE');
    expect(result.featureId).toBe('feature_ai_assistant');
    expect(result.canAccess).toBe(true);
    expect(result.canUse).toBe(true);
    expect(result.isLocked).toBe(false);
    expect(result.visibility).toBe('visible');
    expect(result.badgeText).toBe('5/day');
  });

  it('getAccessResult returns full result for locked feature', () => {
    const result = validator.getAccessResult('feature_startup_optimizer', 'FREE');
    expect(result.canAccess).toBe(true);
    expect(result.canUse).toBe(false);
    expect(result.isLocked).toBe(true);
    expect(result.visibility).toBe('limited');
    expect(result.upgradeAvailable).toBe(true);
    expect(result.recommendedPlan).toBe('PRO');
  });

  it('getAccessResult returns badge text', () => {
    const result = validator.getAccessResult('feature_scheduler', 'FREE');
    expect(result.badgeText).toBe('Pro');
  });
});

// ── Upgrade Reason Builder ───────────────────────────────────

describe('UpgradeReasonBuilder', () => {
  let builder: UpgradeReasonBuilder;

  beforeEach(() => {
    builder = new UpgradeReasonBuilder();
  });

  it('buildFromRule creates reason from recommendation rule', () => {
    const rule = DEFAULT_EXPERIENCE_CONFIG.recommendationRules[0]!;
    const reason = builder.buildFromRule(rule, 'FREE');
    expect(reason.featureId).toBe(rule.featureId);
    expect(reason.currentPlan).toBe('FREE');
    expect(reason.recommendedPlan).toBe(rule.recommendedPlan);
    expect(reason.reason).toBe(rule.reason);
    expect(reason.benefits).toEqual(rule.benefits);
  });

  it('buildForLockedFeature creates reason with medium urgency', () => {
    const reason = builder.buildForLockedFeature('feat1', 'FREE', 'PRO', 'locked', [{ what: 'x', detail: 'y' }]);
    expect(reason.urgency).toBe('medium');
    expect(reason.contextHint).toBe('feature_locked');
  });

  it('buildForQuotaExceeded creates reason with high urgency', () => {
    const reason = builder.buildForQuotaExceeded('feat1', 'quota1', 'FREE', 'PRO', 'exceeded', [{ what: 'x', detail: 'y' }]);
    expect(reason.urgency).toBe('high');
    expect(reason.contextHint).toBe('quota_exceeded:quota1');
  });

  it('buildGeneric creates reason with low urgency by default', () => {
    const reason = builder.buildGeneric('feat1', 'FREE', 'PRO', 'generic', []);
    expect(reason.urgency).toBe('low');
    expect(reason.contextHint).toBe('generic');
  });

  it('buildGeneric accepts custom urgency', () => {
    const reason = builder.buildGeneric('feat1', 'FREE', 'PRO', 'generic', [], 'high');
    expect(reason.urgency).toBe('high');
  });
});

// ── Upgrade Recommendation Engine ────────────────────────────

describe('UpgradeRecommendationEngine', () => {
  let registry: CapabilityRegistry;
  let resolver: CapabilityResolver;
  let quotaManager: QuotaManager;
  let engine: UpgradeRecommendationEngine;

  beforeEach(async () => {
    registry = new CapabilityRegistry();
    registry.loadDefaults();
    resolver = new CapabilityResolver(registry);
    quotaManager = new QuotaManager(new MemoryQuotaStorage());
    await quotaManager.initialize();
    engine = new UpgradeRecommendationEngine(quotaManager, resolver);
    engine.setRules(DEFAULT_EXPERIENCE_CONFIG.recommendationRules);
  });

  it('getRecommendation returns null when no triggers', () => {
    expect(engine.getRecommendation('FREE')).toBeNull();
  });

  it('getRecommendation returns recommendation when quota exhausted', () => {
    // Exhaust ai_conversations quota (limit 5)
    for (let i = 0; i < 5; i++) {
      quotaManager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant');
    }
    const rec = engine.getRecommendation('FREE');
    expect(rec).not.toBeNull();
    expect(rec!.urgency).toBe('medium');
  });

  it('getRecommendation returns recommendation for frequently denied features', () => {
    // Track 3 denials for a locked feature
    engine.trackFeatureDenial('feature_startup_optimizer');
    engine.trackFeatureDenial('feature_startup_optimizer');
    engine.trackFeatureDenial('feature_startup_optimizer');
    const rec = engine.getRecommendation('FREE');
    expect(rec).not.toBeNull();
  });

  it('getRecommendation returns recommendation for frequently used features', () => {
    // Track 5 accesses
    for (let i = 0; i < 5; i++) {
      engine.trackFeatureAccess('feature_trend_history');
    }
    const rec = engine.getRecommendation('FREE');
    expect(rec).not.toBeNull();
  });

  it('getAllRecommendations returns all applicable', () => {
    // Exhaust two quotas
    for (let i = 0; i < 5; i++) {
      quotaManager.consumeQuota('ai_conversations', 1, 'ask', 'ai');
    }
    for (let i = 0; i < 3; i++) {
      quotaManager.consumeQuota('smart_optimize_runs', 1, 'optimize', 'optimizer');
    }
    const all = engine.getAllRecommendations('FREE');
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('trackFeatureAccess records analytics', () => {
    engine.trackFeatureAccess('feat1');
    engine.trackFeatureAccess('feat1');
    const summary = engine.getAnalyticsSummary();
    expect(summary.mostUsedFeatures[0]!.featureId).toBe('feat1');
    expect(summary.mostUsedFeatures[0]!.count).toBe(2);
  });

  it('trackFeatureDenial records analytics', () => {
    engine.trackFeatureDenial('feat1');
    const summary = engine.getAnalyticsSummary();
    expect(summary.frequentlyRequestedLocked[0]!.featureId).toBe('feat1');
  });

  it('trackQuotaReached records analytics', () => {
    engine.trackQuotaReached('quota1', 'feat1');
    const summary = engine.getAnalyticsSummary();
    expect(summary.mostReachedQuotas[0]!.quotaId).toBe('quota1');
  });

  it('clearAnalytics resets all', () => {
    engine.trackFeatureAccess('feat1');
    engine.clearAnalytics();
    const summary = engine.getAnalyticsSummary();
    expect(summary.mostUsedFeatures).toHaveLength(0);
  });
});

// ── Usage Summary Provider ───────────────────────────────────

describe('UsageSummaryProvider', () => {
  let registry: CapabilityRegistry;
  let resolver: CapabilityResolver;
  let quotaManager: QuotaManager;
  let trialManager: TrialManager;
  let engine: UpgradeRecommendationEngine;
  let visibilityService: FeatureVisibilityService;
  let provider: UsageSummaryProvider;

  beforeEach(async () => {
    registry = new CapabilityRegistry();
    registry.loadDefaults();
    resolver = new CapabilityResolver(registry);
    quotaManager = new QuotaManager(new MemoryQuotaStorage());
    await quotaManager.initialize();
    trialManager = new TrialManager(DEFAULT_EXPERIENCE_CONFIG.trialConfig);
    engine = new UpgradeRecommendationEngine(quotaManager, resolver);
    engine.setRules(DEFAULT_EXPERIENCE_CONFIG.recommendationRules);
    visibilityService = new FeatureVisibilityService();
    visibilityService.setRules(DEFAULT_EXPERIENCE_CONFIG.visibilityRules);
    visibilityService.setCapabilityResolver(resolver);
    provider = new UsageSummaryProvider(
      registry, resolver, quotaManager, trialManager, engine, visibilityService, DEFAULT_EXPERIENCE_CONFIG,
    );
  });

  it('getSummary returns plan info', () => {
    const summary = provider.getSummary('FREE');
    expect(summary.currentPlan).toBe('FREE');
    expect(summary.planLabel).toBe('Free');
  });

  it('getSummary returns trial status', () => {
    const summary = provider.getSummary('FREE');
    expect(summary.trialStatus).toBe('available');
    expect(summary.trialDaysRemaining).toBe(0);
  });

  it('getSummary returns feature summaries', () => {
    const summary = provider.getSummary('FREE');
    expect(summary.features.length).toBeGreaterThan(0);
    const aiFeature = summary.features.find((f) => f.featureId === 'feature_ai_assistant');
    expect(aiFeature).toBeDefined();
    expect(aiFeature!.remaining).toBe(5);
  });

  it('getSummary returns unlocked/limited/locked features', () => {
    const summary = provider.getSummary('FREE');
    expect(summary.unlockedFeatures).toContain('feature_ai_assistant');
    expect(summary.lockedFeatures).toContain('feature_startup_optimizer');
    expect(summary.limitedFeatures).toContain('feature_startup_optimizer');
  });

  it('getSummary returns recommended upgrade when quota exhausted', () => {
    for (let i = 0; i < 5; i++) {
      quotaManager.consumeQuota('ai_conversations', 1, 'ask', 'ai');
    }
    const summary = provider.getSummary('FREE');
    expect(summary.recommendedUpgrade).not.toBeNull();
  });

  it('getSummary returns next reset time', () => {
    const summary = provider.getSummary('FREE');
    expect(summary.nextResetAt).not.toBeNull();
  });

  it('getSummary for ENTERPRISE has all features unlocked', () => {
    const summary = provider.getSummary('ENTERPRISE');
    expect(summary.lockedFeatures).toHaveLength(0);
  });
});

// ── Experience Resolver ──────────────────────────────────────

describe('ExperienceResolver', () => {
  let registry: CapabilityRegistry;
  let resolver: CapabilityResolver;
  let quotaManager: QuotaManager;
  let trialManager: TrialManager;
  let visibilityService: FeatureVisibilityService;
  let accessValidator: FeatureAccessValidator;
  let engine: UpgradeRecommendationEngine;
  let experienceResolver: ExperienceResolver;

  beforeEach(async () => {
    registry = new CapabilityRegistry();
    registry.loadDefaults();
    resolver = new CapabilityResolver(registry);
    quotaManager = new QuotaManager(new MemoryQuotaStorage());
    await quotaManager.initialize();
    trialManager = new TrialManager(DEFAULT_EXPERIENCE_CONFIG.trialConfig);
    visibilityService = new FeatureVisibilityService();
    visibilityService.setRules(DEFAULT_EXPERIENCE_CONFIG.visibilityRules);
    visibilityService.setCapabilityResolver(resolver);
    accessValidator = new FeatureAccessValidator(
      resolver, quotaManager, trialManager, visibilityService, DEFAULT_EXPERIENCE_CONFIG,
    );
    engine = new UpgradeRecommendationEngine(quotaManager, resolver);
    engine.setRules(DEFAULT_EXPERIENCE_CONFIG.recommendationRules);
    experienceResolver = new ExperienceResolver(
      registry, resolver, quotaManager, trialManager,
      visibilityService, accessValidator, engine, DEFAULT_EXPERIENCE_CONFIG,
    );
  });

  it('resolve returns full experience state', () => {
    const state = experienceResolver.resolve('FREE');
    expect(state.plan).toBe('FREE');
    expect(state.planLabel).toBe('Free');
    expect(state.features.length).toBeGreaterThan(0);
    expect(state.generatedAt).toBeDefined();
  });

  it('resolve returns correct trial info', () => {
    const state = experienceResolver.resolve('FREE');
    expect(state.trial.status).toBe('available');
  });

  it('resolve categorizes features correctly for FREE', () => {
    const state = experienceResolver.resolve('FREE');
    expect(state.unlockedFeatures).toContain('feature_ai_assistant');
    expect(state.lockedFeatures).toContain('feature_startup_optimizer');
    expect(state.limitedFeatures).toContain('feature_startup_optimizer');
  });

  it('resolve categorizes features correctly for ENTERPRISE', () => {
    const state = experienceResolver.resolve('ENTERPRISE');
    expect(state.lockedFeatures).toHaveLength(0);
    expect(state.hiddenFeatures).toHaveLength(0);
  });

  it('resolve returns recommended upgrade when applicable', () => {
    for (let i = 0; i < 5; i++) {
      quotaManager.consumeQuota('ai_conversations', 1, 'ask', 'ai');
    }
    const state = experienceResolver.resolve('FREE');
    expect(state.recommendedUpgrade).not.toBeNull();
  });
});

// ── Experience Manager ───────────────────────────────────────

describe('ExperienceManager', () => {
  let manager: ExperienceManager;

  beforeEach(() => {
    manager = new ExperienceManager('FREE');
  });

  it('starts uninitialized', () => {
    expect(manager.isInitialized()).toBe(false);
  });

  it('initialize sets initialized flag', async () => {
    await manager.initialize();
    expect(manager.isInitialized()).toBe(true);
  });

  it('getCurrentPlan returns default plan', () => {
    expect(manager.getCurrentPlan()).toBe('FREE');
  });

  it('setPlan updates plan', () => {
    manager.setPlan('PRO');
    expect(manager.getCurrentPlan()).toBe('PRO');
  });

  it('getExperience returns full state', async () => {
    await manager.initialize();
    const exp = manager.getExperience();
    expect(exp.plan).toBe('FREE');
    expect(exp.features.length).toBeGreaterThan(0);
  });

  it('canAccess returns true for visible features', async () => {
    await manager.initialize();
    expect(manager.canAccess('feature_ai_assistant')).toBe(true);
  });

  it('canUse returns true for unlocked features', async () => {
    await manager.initialize();
    expect(manager.canUse('feature_ai_assistant')).toBe(true);
  });

  it('canUse returns false for locked features', async () => {
    await manager.initialize();
    expect(manager.canUse('feature_startup_optimizer')).toBe(false);
  });

  it('canOptimize is alias for canUse', async () => {
    await manager.initialize();
    expect(manager.canOptimize('feature_ai_assistant')).toBe(true);
  });

  it('isFeatureLimited returns true for limited features', async () => {
    await manager.initialize();
    expect(manager.isFeatureLimited('feature_startup_optimizer')).toBe(true);
  });

  it('isFeatureLocked returns true for locked features', async () => {
    await manager.initialize();
    expect(manager.isFeatureLocked('feature_startup_optimizer')).toBe(true);
  });

  it('getRemainingQuota returns quota', async () => {
    await manager.initialize();
    expect(manager.getRemainingQuota('feature_ai_assistant')).toBe(5);
  });

  it('getRemainingQuota returns null for feature without quota', async () => {
    await manager.initialize();
    expect(manager.getRemainingQuota('feature_cloud_sync')).toBeNull();
  });

  it('getUpgradeReason returns null when no recommendation', async () => {
    await manager.initialize();
    expect(manager.getUpgradeReason('feature_ai_assistant')).toBeNull();
  });

  it('getUpgradeReason returns reason when quota exhausted', async () => {
    await manager.initialize();
    for (let i = 0; i < 5; i++) {
      manager.consumeQuota('feature_ai_assistant', 1, 'ask', 'ai-assistant');
    }
    const reason = manager.getUpgradeReason('feature_ai_assistant');
    expect(reason).not.toBeNull();
  });

  it('getUpgradeBenefits returns benefits', async () => {
    await manager.initialize();
    for (let i = 0; i < 5; i++) {
      manager.consumeQuota('feature_ai_assistant', 1, 'ask', 'ai-assistant');
    }
    const benefits = manager.getUpgradeBenefits('feature_ai_assistant');
    expect(benefits.length).toBeGreaterThan(0);
  });

  it('getUsageSummary returns summary', async () => {
    await manager.initialize();
    const summary = manager.getUsageSummary();
    expect(summary.currentPlan).toBe('FREE');
    expect(summary.planLabel).toBe('Free');
    expect(summary.features.length).toBeGreaterThan(0);
  });

  it('isTrialActive returns false initially', () => {
    expect(manager.isTrialActive()).toBe(false);
  });

  it('startTrial activates trial', () => {
    expect(manager.startTrial()).toBe(true);
    expect(manager.isTrialActive()).toBe(true);
  });

  it('canUse returns true for locked features when trial active', async () => {
    await manager.initialize();
    manager.startTrial();
    expect(manager.canUse('feature_startup_optimizer')).toBe(true);
  });

  it('consumeQuota decrements remaining', async () => {
    await manager.initialize();
    manager.consumeQuota('feature_ai_assistant', 1, 'ask', 'ai-assistant');
    expect(manager.getRemainingQuota('feature_ai_assistant')).toBe(4);
  });

  it('consumeQuota returns false when exhausted', async () => {
    await manager.initialize();
    for (let i = 0; i < 5; i++) {
      manager.consumeQuota('feature_ai_assistant', 1, 'ask', 'ai-assistant');
    }
    expect(manager.consumeQuota('feature_ai_assistant', 1, 'ask', 'ai-assistant')).toBe(false);
  });

  it('trackFeatureAccess records analytics', async () => {
    await manager.initialize();
    manager.trackFeatureAccess('feat1');
    const summary = manager.getAnalyticsSummary();
    expect(summary.mostUsedFeatures.some((f) => f.featureId === 'feat1')).toBe(true);
  });

  it('trackFeatureDenial records analytics', async () => {
    await manager.initialize();
    manager.trackFeatureDenial('feat1');
    const summary = manager.getAnalyticsSummary();
    expect(summary.frequentlyRequestedLocked.some((f) => f.featureId === 'feat1')).toBe(true);
  });

  it('loadConfig updates configuration', async () => {
    await manager.initialize();
    const customConfig: ExperienceConfig = {
      ...DEFAULT_EXPERIENCE_CONFIG,
      planLabels: { ...DEFAULT_EXPERIENCE_CONFIG.planLabels, FREE: 'Basic' },
    };
    manager.loadConfig(customConfig);
    const summary = manager.getUsageSummary();
    expect(summary.planLabel).toBe('Basic');
  });

  it('getQuotaManager returns quota manager', () => {
    expect(manager.getQuotaManager()).toBeDefined();
  });

  it('getRegistry returns capability registry', () => {
    expect(manager.getRegistry()).toBeDefined();
  });

  it('getTrialManager returns trial manager', () => {
    expect(manager.getTrialManager()).toBeDefined();
  });

  it('plan switching updates experience', async () => {
    await manager.initialize();
    manager.setPlan('ENTERPRISE');
    const exp = manager.getExperience();
    expect(exp.plan).toBe('ENTERPRISE');
    expect(exp.lockedFeatures).toHaveLength(0);
  });
});

// ── Default Configuration ────────────────────────────────────

describe('Default Experience Config', () => {
  it('has plan labels for all 7 plans', () => {
    expect(DEFAULT_EXPERIENCE_CONFIG.planLabels.FREE).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.planLabels.PRO).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.planLabels.ULTIMATE).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.planLabels.LIFETIME).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.planLabels.BETA).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.planLabels.ENTERPRISE).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.planLabels.FAMILY).toBeDefined();
  });

  it('has messages', () => {
    expect(DEFAULT_EXPERIENCE_CONFIG.messages.quotaExceeded).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.messages.featureLocked).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.messages.trialAvailable).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.messages.trialExpired).toBeDefined();
    expect(DEFAULT_EXPERIENCE_CONFIG.messages.upgradeAvailable).toBeDefined();
  });

  it('has trial config', () => {
    expect(DEFAULT_EXPERIENCE_CONFIG.trialConfig.defaultDurationDays).toBe(14);
    expect(DEFAULT_EXPERIENCE_CONFIG.trialConfig.trialPlan).toBe('PRO');
    expect(DEFAULT_EXPERIENCE_CONFIG.trialConfig.enabled).toBe(true);
  });

  it('has visibility rules for all features', () => {
    expect(DEFAULT_EXPERIENCE_CONFIG.visibilityRules.length).toBe(10);
  });

  it('has recommendation rules', () => {
    expect(DEFAULT_EXPERIENCE_CONFIG.recommendationRules.length).toBeGreaterThan(0);
  });

  it('recommendation rules have benefits', () => {
    for (const rule of DEFAULT_EXPERIENCE_CONFIG.recommendationRules) {
      expect(rule.benefits.length).toBeGreaterThan(0);
    }
  });

  it('recommendation rules never use fear-based messaging', () => {
    for (const rule of DEFAULT_EXPERIENCE_CONFIG.recommendationRules) {
      expect(rule.reason).not.toMatch(/danger|risk|threat|vulnerable|unsafe/i);
    }
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.ExperienceManager).toBeDefined();
    expect(mod.experienceManager).toBeDefined();
    expect(mod.ExperienceResolver).toBeDefined();
    expect(mod.TrialManager).toBeDefined();
    expect(mod.FeatureVisibilityService).toBeDefined();
    expect(mod.FeatureAccessValidator).toBeDefined();
    expect(mod.UpgradeRecommendationEngine).toBeDefined();
    expect(mod.UpgradeReasonBuilder).toBeDefined();
    expect(mod.UsageSummaryProvider).toBeDefined();
    expect(mod.ExperienceEventEmitter).toBeDefined();
    expect(mod.experienceEvents).toBeDefined();
    expect(mod.DEFAULT_EXPERIENCE_CONFIG).toBeDefined();
  });

  it('full integration: FREE plan experience', async () => {
    const manager = new ExperienceManager('FREE');
    await manager.initialize();

    // Can use free features
    expect(manager.canUse('feature_ai_assistant')).toBe(true);
    expect(manager.canUse('feature_smart_optimize')).toBe(true);

    // Cannot use pro features
    expect(manager.canUse('feature_startup_optimizer')).toBe(false);
    expect(manager.canUse('feature_duplicate_engine')).toBe(false);

    // Can access (visible) pro features
    expect(manager.canAccess('feature_startup_optimizer')).toBe(true);

    // Is limited/locked
    expect(manager.isFeatureLimited('feature_startup_optimizer')).toBe(true);
    expect(manager.isFeatureLocked('feature_startup_optimizer')).toBe(true);

    // Get experience
    const exp = manager.getExperience();
    expect(exp.unlockedFeatures).toContain('feature_ai_assistant');
    expect(exp.lockedFeatures).toContain('feature_startup_optimizer');
  });

  it('full integration: PRO plan experience', async () => {
    const manager = new ExperienceManager('PRO');
    await manager.initialize();

    expect(manager.canUse('feature_ai_assistant')).toBe(true);
    expect(manager.canUse('feature_startup_optimizer')).toBe(true);
    expect(manager.canUse('feature_duplicate_engine')).toBe(true);
    expect(manager.canUse('feature_scheduler')).toBe(true);

    // Ultimate features still locked
    expect(manager.canUse('feature_background_monitoring')).toBe(false);
  });

  it('full integration: ENTERPRISE plan experience', async () => {
    const manager = new ExperienceManager('ENTERPRISE');
    await manager.initialize();

    const exp = manager.getExperience();
    expect(exp.lockedFeatures).toHaveLength(0);
    expect(exp.hiddenFeatures).toHaveLength(0);
  });

  it('trial unlocks pro features', async () => {
    const manager = new ExperienceManager('FREE');
    await manager.initialize();

    expect(manager.canUse('feature_startup_optimizer')).toBe(false);
    manager.startTrial();
    expect(manager.canUse('feature_startup_optimizer')).toBe(true);
  });

  it('quota consumption and upgrade recommendation', async () => {
    const manager = new ExperienceManager('FREE');
    await manager.initialize();

    // Consume all AI conversations
    for (let i = 0; i < 5; i++) {
      manager.consumeQuota('feature_ai_assistant', 1, 'ask', 'ai-assistant');
    }

    // Should not be able to use
    expect(manager.canUse('feature_ai_assistant')).toBe(false);

    // Should have upgrade recommendation
    const summary = manager.getUsageSummary();
    expect(summary.recommendedUpgrade).not.toBeNull();
  });

  it('plan switching updates feature access', async () => {
    const manager = new ExperienceManager('FREE');
    await manager.initialize();

    expect(manager.isFeatureLocked('feature_startup_optimizer')).toBe(true);
    manager.setPlan('PRO');
    expect(manager.isFeatureLocked('feature_startup_optimizer')).toBe(false);
  });

  it('local analytics tracks usage patterns', async () => {
    const manager = new ExperienceManager('FREE');
    await manager.initialize();

    manager.trackFeatureAccess('feature_ai_assistant');
    manager.trackFeatureAccess('feature_ai_assistant');
    manager.trackFeatureDenial('feature_scheduler');

    const summary = manager.getAnalyticsSummary();
    expect(summary.mostUsedFeatures.some((f) => f.featureId === 'feature_ai_assistant')).toBe(true);
    expect(summary.frequentlyRequestedLocked.some((f) => f.featureId === 'feature_scheduler')).toBe(true);
  });

  it('custom configuration loading works', async () => {
    const manager = new ExperienceManager('FREE');
    await manager.initialize();

    const customConfig: ExperienceConfig = {
      ...DEFAULT_EXPERIENCE_CONFIG,
      planLabels: { FREE: 'Starter' },
    };
    manager.loadConfig(customConfig);
    const summary = manager.getUsageSummary();
    expect(summary.planLabel).toBe('Starter');
  });

  it('unknown feature handled gracefully', async () => {
    const manager = new ExperienceManager('FREE');
    await manager.initialize();

    expect(manager.canAccess('nonexistent')).toBe(true); // defaults to visible
    expect(manager.canUse('nonexistent')).toBe(false);
    expect(manager.isFeatureLocked('nonexistent')).toBe(true);
    expect(manager.getRemainingQuota('nonexistent')).toBeNull();
  });

  it('experience state is consistent across calls', async () => {
    const manager = new ExperienceManager('FREE');
    await manager.initialize();

    const exp1 = manager.getExperience();
    const exp2 = manager.getExperience();
    expect(exp1.plan).toBe(exp2.plan);
    expect(exp1.unlockedFeatures).toEqual(exp2.unlockedFeatures);
  });
});
