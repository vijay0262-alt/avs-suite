/**
 * Tests for EPIC 4 PHASE A PART 1 — Smart Optimize 2.0 Personalized Optimization Planner.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  Recommendation,
  RecommendationCategory,
  RecommendationPriority,
  RiskLevel,
} from '../../../ai-intelligence/recommendations/types';
import type { DeviceProfile } from '../../../ai-intelligence/device-profile/types';
import type {
  SmartPlanAction,
  PlanningContext,
  OptimizationGoal,
} from '../types';
import {
  createDefaultPlannerConfiguration,
  generateSmartPlanId,
  generateComparisonId,
  generatePlannerHistoryId,
  riskToScore,
  priorityToScore,
} from '../types';
import {
  DEFAULT_PLANNER_CONFIGURATION,
  createPlannerConfiguration,
  getStrategyRule,
} from '../optimizationPlannerConfiguration';
import { OptimizationPlannerEvents } from '../optimizationPlannerEvents';
import { OptimizationStrategyEngine } from '../optimizationStrategyEngine';
import { OptimizationProfileResolver } from '../optimizationProfileResolver';
import { OptimizationPriorityEngine } from '../optimizationPriorityEngine';
import { OptimizationSequenceBuilder } from '../optimizationSequenceBuilder';
import { OptimizationConflictResolver } from '../optimizationConflictResolver';
import { OptimizationSafetyAnalyzer } from '../optimizationSafetyAnalyzer';
import { OptimizationEligibilityValidator } from '../optimizationEligibilityValidator';
import { OptimizationHistoryAnalyzer } from '../optimizationHistoryAnalyzer';
import { OptimizationPlanGenerator } from '../optimizationPlanGenerator';
import { OptimizationPlanner } from '../optimizationPlanner';
import { SmartOptimizeManager } from '../smartOptimizeManager';

// ── Mock Data Builders ───────────────────────────────────────

function createMockRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: overrides.id ?? 'rec_1',
    title: overrides.title ?? 'Clean Temporary Files',
    summary: overrides.summary ?? 'Remove accumulated temp files',
    description: overrides.description ?? 'Temporary files are consuming disk space',
    category: overrides.category ?? 'storage' as RecommendationCategory,
    priority: overrides.priority ?? 'high' as RecommendationPriority,
    scores: overrides.scores ?? {
      impactScore: 0.8,
      safetyScore: 0.9,
      urgencyScore: 0.7,
      effortScore: 0.8,
      confidenceScore: 0.85,
      overallScore: 0.82,
    },
    evidence: overrides.evidence ?? {
      supportingFacts: ['fact_1'],
      supportingRelationships: [],
      supportingTrends: [],
      supportingChanges: [],
      evidence: { source: 'test', metric: 'test', value: 1, timestamp: new Date().toISOString(), confidence: 0.85 } as never,
      evidenceCount: 1,
      sourceProviders: ['test'],
      confidence: 0.85,
    },
    benefits: overrides.benefits ?? {
      estimatedTime: 30,
      estimatedBenefit: 'Recovers ~500MB storage',
      estimatedSpaceRecovered: 500,
      estimatedPerformanceGain: null,
      estimatedPrivacyImprovement: null,
      estimatedHealthIncrease: 3,
    },
    safety: overrides.safety ?? {
      riskLevel: 'low' as RiskLevel,
      rollbackAvailable: true,
      requiresConfirmation: false,
      automaticExecutionAllowed: true,
      automationEligible: true,
      warnings: [],
    },
    requiresPro: overrides.requiresPro ?? false,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    expiresAt: overrides.expiresAt ?? null,
    status: overrides.status ?? 'active',
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockAction(overrides: Partial<SmartPlanAction> = {}): SmartPlanAction {
  return {
    id: overrides.id ?? 'action_1',
    recommendationId: overrides.recommendationId ?? 'rec_1',
    title: overrides.title ?? 'Clean Temporary Files',
    description: overrides.description ?? 'Remove temp files',
    category: overrides.category ?? 'storage' as RecommendationCategory,
    priority: overrides.priority ?? 'high' as RecommendationPriority,
    estimatedDuration: overrides.estimatedDuration ?? 30,
    estimatedBenefit: overrides.estimatedBenefit ?? 'Recovers storage',
    riskLevel: overrides.riskLevel ?? 'low' as RiskLevel,
    confidence: overrides.confidence ?? 0.85,
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    priorityScore: overrides.priorityScore ?? 0.8,
    dependencies: overrides.dependencies ?? [],
    predictedImpact: overrides.predictedImpact ?? 0.8,
    futureLearningWeight: overrides.futureLearningWeight ?? 0.5,
  };
}

function createMockDeviceProfile(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  return {
    id: overrides.id ?? 'profile_1',
    generatedAt: overrides.generatedAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    deviceName: overrides.deviceName ?? 'TestPC',
    platform: overrides.platform ?? 'win32',
    hardwareSummary: overrides.hardwareSummary ?? {
      cpuModel: 'Intel i7',
      cpuCores: 8,
      totalMemoryMB: 16384,
      gpuModel: 'RTX 3060',
      storageType: 'SSD',
      storageCapacityMB: 512000,
      driveCount: 1,
      performanceTier: 'high_end',
      displayCount: 1,
      hasBattery: false,
      details: {
        ramCapacity: 'high',
        cpuTier: 'high',
        gpuTier: 'high',
        storageTier: 'high',
        isLaptop: false,
        isServer: false,
        isVirtualMachine: false,
      },
      confidence: 0.9,
    },
    softwareSummary: overrides.softwareSummary ?? {
      installedAppCount: 50,
      developerToolCount: 5,
      creativeSoftwareCount: 0,
      gameCount: 10,
      officeSuiteCount: 1,
      browserCount: 3,
      virtualizationCount: 0,
      securitySoftwareCount: 1,
      backgroundServiceCount: 20,
      categories: [],
      confidence: 0.8,
    },
    usageSummary: overrides.usageSummary ?? {
      optimizationFrequency: 'medium',
      browsingActivity: 'high',
      startupBehavior: 'moderate',
      diskGrowthRate: 'moderate',
      storageConsumption: 'medium',
      maintenanceHabits: 'proactive',
      sessionDuration: 'medium',
      applicationCategories: [],
      confidence: 0.75,
    },
    workloadSummary: overrides.workloadSummary ?? {
      primaryWorkload: 'gaming',
      secondaryWorkloads: [],
      workloadScores: {},
      confidence: 0.8,
    },
    primaryProfile: overrides.primaryProfile ?? 'gaming_pc',
    secondaryProfiles: overrides.secondaryProfiles ?? [],
    profileScores: overrides.profileScores ?? [],
    confidenceScore: overrides.confidenceScore ?? 0.85,
    evidence: overrides.evidence ?? {
      relatedFacts: [],
      relatedKnowledge: [],
      relatedPredictions: [],
      contextEvidence: [],
      knowledgeEvidence: [],
      evidenceCount: 1,
      sourceProviders: [],
      confidence: 0.85,
      historicalStability: 0.8,
      profileConsistency: 0.9,
      dataFreshness: 0.95,
      assumptions: [],
    },
    changeHistory: overrides.changeHistory ?? [],
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockPlanningContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    recommendations: overrides.recommendations ?? [
      createMockRecommendation(),
      createMockRecommendation({ id: 'rec_2', title: 'Optimize Startup', category: 'startup', priority: 'medium' }),
    ],
    deviceProfile: overrides.deviceProfile !== undefined ? overrides.deviceProfile : createMockDeviceProfile(),
    predictions: overrides.predictions ?? null,
    currentHealth: overrides.currentHealth ?? 85,
    optimizationHistory: overrides.optimizationHistory ?? [],
    systemLoad: overrides.systemLoad ?? null,
    userPreferences: overrides.userPreferences ?? null,
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('createDefaultPlannerConfiguration has all sections', () => {
    const cfg = createDefaultPlannerConfiguration();
    expect(cfg.strategyRules).toBeDefined();
    expect(cfg.planningRules).toBeDefined();
    expect(cfg.priorityWeights).toBeDefined();
    expect(cfg.riskThresholds).toBeDefined();
    expect(cfg.eligibilityRules).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
  });
  it('generateSmartPlanId produces unique ids', () => {
    expect(generateSmartPlanId()).not.toBe(generateSmartPlanId());
    expect(generateSmartPlanId()).toContain('smartplan_');
  });
  it('generateComparisonId produces unique ids', () => {
    expect(generateComparisonId()).toContain('smartcmp_');
  });
  it('generatePlannerHistoryId produces unique ids', () => {
    expect(generatePlannerHistoryId()).toContain('plhist_');
  });
  it('riskToScore converts correctly', () => {
    expect(riskToScore('none')).toBe(0);
    expect(riskToScore('low')).toBe(0.25);
    expect(riskToScore('medium')).toBe(0.5);
    expect(riskToScore('high')).toBe(0.75);
    expect(riskToScore('critical')).toBe(1.0);
  });
  it('priorityToScore converts correctly', () => {
    expect(priorityToScore('critical')).toBe(1.0);
    expect(priorityToScore('high')).toBe(0.8);
    expect(priorityToScore('medium')).toBe(0.6);
    expect(priorityToScore('low')).toBe(0.4);
    expect(priorityToScore('informational')).toBe(0.2);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('PlannerConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_PLANNER_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_PLANNER_CONFIGURATION.planningRules.maxActions).toBe(15);
  });
  it('createPlannerConfiguration accepts overrides', () => {
    const cfg = createPlannerConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
  });
  it('merges featureFlags', () => {
    const cfg = createPlannerConfiguration({ featureFlags: { enableConflictResolution: false } });
    expect(cfg.featureFlags.enableConflictResolution).toBe(false);
    expect(cfg.featureFlags.enableSafetyAnalysis).toBe(true);
  });
  it('merges planningRules', () => {
    const cfg = createPlannerConfiguration({ planningRules: { maxActions: 5 } });
    expect(cfg.planningRules.maxActions).toBe(5);
  });
  it('merges priorityWeights', () => {
    const cfg = createPlannerConfiguration({ priorityWeights: { benefitWeight: 0.5 } });
    expect(cfg.priorityWeights.benefitWeight).toBe(0.5);
  });
  it('getStrategyRule returns rule', () => {
    const rule = getStrategyRule(DEFAULT_PLANNER_CONFIGURATION, 'aggressive');
    expect(rule.maxRiskLevel).toBe('high');
  });
  it('getStrategyRule falls back to balanced', () => {
    const rule = getStrategyRule(DEFAULT_PLANNER_CONFIGURATION, 'custom');
    expect(rule).toBeDefined();
  });
});

// ── Events ───────────────────────────────────────────────────

describe('PlannerEvents', () => {
  let events: OptimizationPlannerEvents;
  beforeEach(() => { events = new OptimizationPlannerEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('smart_plan_generated', () => { received = true; });
    events.emitGenerated('p1');
    expect(received).toBe(true);
  });
  it('off removes listener', () => {
    let received = false;
    const listener = () => { received = true; };
    events.on('plan_validated', listener);
    events.off('plan_validated', listener);
    events.emitValidated('p1');
    expect(received).toBe(false);
  });
  it('on returns unsubscribe function', () => {
    let received = false;
    const unsub = events.on('plan_rejected', () => { received = true; });
    unsub();
    events.emitRejected('p1');
    expect(received).toBe(false);
  });
  it('emitStrategySelected works', () => {
    let received = false;
    events.on('strategy_selected', () => { received = true; });
    events.emitStrategySelected('p1');
    expect(received).toBe(true);
  });
  it('emitExpired works', () => {
    let received = false;
    events.on('plan_expired', () => { received = true; });
    events.emitExpired('p1');
    expect(received).toBe(true);
  });
  it('emitCompared works', () => {
    let received = false;
    events.on('plan_compared', () => { received = true; });
    events.emitCompared('p1');
    expect(received).toBe(true);
  });
  it('clear removes all', () => {
    events.on('smart_plan_generated', () => {});
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });
  it('listenerCount returns correct count', () => {
    events.on('smart_plan_generated', () => {});
    events.on('plan_validated', () => {});
    expect(events.listenerCount()).toBe(2);
    expect(events.listenerCount('smart_plan_generated')).toBe(1);
  });
  it('does not crash on listener error', () => {
    events.on('smart_plan_generated', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    events.emitGenerated('p1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Strategy Engine ──────────────────────────────────────────

describe('OptimizationStrategyEngine', () => {
  let engine: OptimizationStrategyEngine;
  beforeEach(() => { engine = new OptimizationStrategyEngine(createDefaultPlannerConfiguration()); });

  it('selects strategy for quick_boost', () => {
    expect(engine.selectStrategy('quick_boost', createMockPlanningContext())).toBe('performance_first');
  });
  it('selects strategy for maximum_performance', () => {
    expect(engine.selectStrategy('maximum_performance', createMockPlanningContext())).toBe('aggressive');
  });
  it('selects strategy for storage_recovery', () => {
    expect(engine.selectStrategy('storage_recovery', createMockPlanningContext())).toBe('storage_first');
  });
  it('selects strategy for privacy_protection', () => {
    expect(engine.selectStrategy('privacy_protection', createMockPlanningContext())).toBe('privacy_first');
  });
  it('respects user preferred strategy', () => {
    const ctx = createMockPlanningContext({
      userPreferences: {
        preferredStrategy: 'conservative',
        riskTolerance: 'low',
        preferredCategories: [],
        excludedCategories: [],
      },
    });
    expect(engine.selectStrategy('quick_boost', ctx)).toBe('conservative');
  });
  it('filterActionsByStrategy excludes high-risk for safe_only', () => {
    const actions = [
      createMockAction({ id: 'a1', riskLevel: 'none' }),
      createMockAction({ id: 'a2', riskLevel: 'high' }),
    ];
    const result = engine.filterActionsByStrategy(actions, 'safe_only');
    expect(result.included.length).toBe(1);
    expect(result.excluded.length).toBe(1);
  });
  it('filterActionsByStrategy includes high-risk for aggressive', () => {
    const actions = [
      createMockAction({ id: 'a1', riskLevel: 'high', confidence: 0.6 }),
      createMockAction({ id: 'a2', riskLevel: 'critical' }),
    ];
    const result = engine.filterActionsByStrategy(actions, 'aggressive');
    expect(result.included.some((a) => a.id === 'a1')).toBe(true);
  });
  it('getStrategyLabel returns label', () => {
    expect(engine.getStrategyLabel('aggressive')).toBe('Aggressive');
  });
  it('getStrategyDescription returns description', () => {
    expect(engine.getStrategyDescription('balanced')).toContain('Balances');
  });
});

// ── Profile Resolver ─────────────────────────────────────────

describe('OptimizationProfileResolver', () => {
  let resolver: OptimizationProfileResolver;
  beforeEach(() => { resolver = new OptimizationProfileResolver(); });

  it('resolves device profile', () => {
    const snapshot = resolver.resolve(createMockDeviceProfile());
    expect(snapshot.profileType).toBe('gaming_pc');
    expect(snapshot.deviceName).toBe('TestPC');
    expect(snapshot.confidenceScore).toBe(0.85);
  });
  it('resolves null profile to defaults', () => {
    const snapshot = resolver.resolve(null);
    expect(snapshot.profileType).toBe('general_purpose');
    expect(snapshot.deviceName).toBe('Unknown');
  });
  it('gets profile adjustments for gaming_pc', () => {
    const adj = resolver.getProfileAdjustments('gaming_pc', 'gaming_preparation');
    expect(adj.priorityBoost).toContain('performance');
  });
  it('gets profile adjustments for creative_workstation', () => {
    const adj = resolver.getProfileAdjustments('creative_workstation', 'creator_workflow');
    expect(adj.priorityBoost).toContain('performance');
  });
  it('isLowEndDevice detects low_end', () => {
    expect(resolver.isLowEndDevice({ profileType: 'general_purpose', performanceTier: 'low_end', primaryWorkload: 'general_use', deviceName: 'Test', confidenceScore: 0.5 })).toBe(true);
  });
  it('isHighEndDevice detects high_end', () => {
    expect(resolver.isHighEndDevice({ profileType: 'gaming_pc', performanceTier: 'high_end', primaryWorkload: 'gaming', deviceName: 'Test', confidenceScore: 0.9 })).toBe(true);
  });
});

// ── Priority Engine ──────────────────────────────────────────

describe('OptimizationPriorityEngine', () => {
  let engine: OptimizationPriorityEngine;
  beforeEach(() => { engine = new OptimizationPriorityEngine(createDefaultPlannerConfiguration().priorityWeights); });

  it('ranks actions by score', () => {
    const actions = [
      createMockAction({ id: 'a1', priority: 'low', confidence: 0.5, riskLevel: 'high' }),
      createMockAction({ id: 'a2', priority: 'critical', confidence: 0.9, riskLevel: 'none' }),
    ];
    const ranked = engine.rank(actions);
    expect(ranked[0]!.id).toBe('a2');
  });
  it('scores action correctly', () => {
    const score = engine.score(createMockAction({ priority: 'high', confidence: 0.85, riskLevel: 'low' }));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });
  it('applyCategoryBoost boosts specified categories', () => {
    const actions = [createMockAction({ id: 'a1', category: 'performance', priorityScore: 0.5 })];
    const boosted = engine.applyCategoryBoost(actions, ['performance'], []);
    expect(boosted[0]!.priorityScore).toBeGreaterThan(0.5);
  });
  it('getTopActions returns top N', () => {
    const actions = [
      createMockAction({ id: 'a1', priority: 'low' }),
      createMockAction({ id: 'a2', priority: 'high' }),
      createMockAction({ id: 'a3', priority: 'critical' }),
    ];
    const top = engine.getTopActions(actions, 2);
    expect(top.length).toBe(2);
    expect(top[0]!.priority).toBe('critical');
  });
});

// ── Sequence Builder ─────────────────────────────────────────

describe('OptimizationSequenceBuilder', () => {
  let builder: OptimizationSequenceBuilder;
  beforeEach(() => { builder = new OptimizationSequenceBuilder(); });

  it('builds sequence respecting dependencies', () => {
    const actions = [
      createMockAction({ id: 'a2', dependencies: ['a1'] }),
      createMockAction({ id: 'a1' }),
    ];
    const seq = builder.build(actions);
    expect(seq[0]!.id).toBe('a1');
    expect(seq[1]!.id).toBe('a2');
  });
  it('handles empty actions', () => {
    expect(builder.build([])).toEqual([]);
  });
  it('handles circular dependencies gracefully', () => {
    const actions = [
      createMockAction({ id: 'a1', dependencies: ['a2'] }),
      createMockAction({ id: 'a2', dependencies: ['a1'] }),
    ];
    const seq = builder.build(actions);
    expect(seq.length).toBe(2);
  });
  it('validateSequence detects violations', () => {
    const actions = [
      createMockAction({ id: 'a1', dependencies: ['a2'] }),
    ];
    const result = builder.validateSequence(actions);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBe(1);
  });
  it('validateSequence passes for valid sequence', () => {
    const actions = [
      createMockAction({ id: 'a1' }),
      createMockAction({ id: 'a2', dependencies: ['a1'] }),
    ];
    const result = builder.validateSequence(actions);
    expect(result.valid).toBe(true);
  });
  it('estimateTotalDuration sums durations', () => {
    const actions = [
      createMockAction({ estimatedDuration: 30 }),
      createMockAction({ estimatedDuration: 60 }),
    ];
    expect(builder.estimateTotalDuration(actions)).toBe(90);
  });
});

// ── Conflict Resolver ────────────────────────────────────────

describe('OptimizationConflictResolver', () => {
  let resolver: OptimizationConflictResolver;
  beforeEach(() => { resolver = new OptimizationConflictResolver(); });

  it('detects duplicate actions', () => {
    const actions = [
      createMockAction({ id: 'a1', title: 'Clean Temp' }),
      createMockAction({ id: 'a2', title: 'Clean Temp' }),
    ];
    const result = resolver.resolve(actions);
    expect(result.conflicts.some((c) => c.type === 'duplicate')).toBe(true);
  });
  it('resolves duplicates by keeping highest priority', () => {
    const actions = [
      createMockAction({ id: 'a1', title: 'Clean Temp', priorityScore: 0.5 }),
      createMockAction({ id: 'a2', title: 'Clean Temp', priorityScore: 0.9 }),
    ];
    const result = resolver.resolve(actions);
    expect(result.resolvedConflicts.length).toBe(1);
    expect(result.resolvedConflicts[0]!.resolvedActionIds).toContain('a1');
  });
  it('detects dependency violations', () => {
    const actions = [createMockAction({ id: 'a1', dependencies: ['missing'] })];
    const result = resolver.resolve(actions);
    expect(result.conflicts.some((c) => c.type === 'dependency_violation')).toBe(true);
  });
  it('removeActions removes specified ids', () => {
    const actions = [createMockAction({ id: 'a1' }), createMockAction({ id: 'a2' })];
    const filtered = resolver.removeActions(actions, ['a1']);
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.id).toBe('a2');
  });
  it('handles no conflicts', () => {
    const actions = [createMockAction({ id: 'a1' }), createMockAction({ id: 'a2', title: 'Different' })];
    const result = resolver.resolve(actions);
    expect(result.conflicts.length).toBe(0);
  });
});

// ── Safety Analyzer ──────────────────────────────────────────

describe('OptimizationSafetyAnalyzer', () => {
  let analyzer: OptimizationSafetyAnalyzer;
  beforeEach(() => { analyzer = new OptimizationSafetyAnalyzer(createDefaultPlannerConfiguration()); });

  it('analyzes safe actions', () => {
    const actions = [createMockAction({ riskLevel: 'low' })];
    const result = analyzer.analyze(actions);
    expect(result.overallRisk).toBe('low');
    expect(result.rollbackAvailable).toBe(true);
  });
  it('analyzes high-risk actions', () => {
    const actions = [createMockAction({ riskLevel: 'high' })];
    const result = analyzer.analyze(actions);
    expect(result.overallRisk).toBe('high');
    expect(result.confirmationRequired).toBe(true);
  });
  it('detects unsafe actions', () => {
    const actions = [createMockAction({ id: 'a1', riskLevel: 'critical' })];
    const result = analyzer.analyze(actions);
    expect(result.unsafeActions).toContain('a1');
  });
  it('detects missing rollback', () => {
    const actions = [createMockAction({ rollbackAvailable: false })];
    const result = analyzer.analyze(actions);
    expect(result.rollbackAvailable).toBe(false);
  });
  it('isActionSafe returns true for low risk', () => {
    expect(analyzer.isActionSafe(createMockAction({ riskLevel: 'low' }))).toBe(true);
  });
  it('filterUnsafeActions separates safe and unsafe', () => {
    const actions = [
      createMockAction({ id: 'a1', riskLevel: 'low' }),
      createMockAction({ id: 'a2', riskLevel: 'critical' }),
    ];
    const result = analyzer.filterUnsafeActions(actions);
    expect(result.safe.length).toBe(1);
    expect(result.unsafe.length).toBe(1);
  });
});

// ── Eligibility Validator ────────────────────────────────────

describe('OptimizationEligibilityValidator', () => {
  let validator: OptimizationEligibilityValidator;
  beforeEach(() => { validator = new OptimizationEligibilityValidator(createDefaultPlannerConfiguration()); });

  it('validates eligible actions', () => {
    const actions = [createMockAction()];
    const result = validator.validate(actions, createMockPlanningContext());
    expect(result.eligible).toBe(true);
    expect(result.eligibleActions.length).toBe(1);
  });
  it('detects high CPU usage for performance actions', () => {
    const actions = [createMockAction({ category: 'performance' })];
    const ctx = createMockPlanningContext({ systemLoad: { cpuUsage: 95, memoryUsage: 50, diskUsage: 50, isIdle: false } });
    const result = validator.validate(actions, ctx);
    expect(result.eligible).toBe(false);
    expect(result.ineligibleActions[0]!.code).toBe('HIGH_CPU_USAGE');
  });
  it('detects protected categories', () => {
    const cfg = createPlannerConfiguration({ riskThresholds: { protectedCategories: ['security'] } });
    const v = new OptimizationEligibilityValidator(cfg);
    const actions = [createMockAction({ category: 'security' as RecommendationCategory })];
    const result = v.validate(actions, createMockPlanningContext());
    expect(result.ineligibleActions.length).toBe(1);
    expect(result.ineligibleActions[0]!.code).toBe('PROTECTED_CATEGORY');
  });
});

// ── History Analyzer ─────────────────────────────────────────

describe('OptimizationHistoryAnalyzer', () => {
  let analyzer: OptimizationHistoryAnalyzer;
  beforeEach(() => { analyzer = new OptimizationHistoryAnalyzer(); });

  it('analyzes empty history', () => {
    const result = analyzer.analyze([]);
    expect(result.totalOptimizations).toBe(0);
    expect(result.averageSuccessRate).toBe(0);
  });
  it('analyzes history with entries', () => {
    const history = [
      { planId: 'p1', executedAt: new Date().toISOString(), goal: 'quick_boost' as OptimizationGoal, actionsCompleted: ['a1'], actionsSkipped: [], healthBefore: 80, healthAfter: 85, successRate: 1.0 },
      { planId: 'p2', executedAt: new Date().toISOString(), goal: 'storage_recovery' as OptimizationGoal, actionsCompleted: ['a2'], actionsSkipped: ['a3'], healthBefore: 85, healthAfter: 88, successRate: 0.8 },
    ];
    const result = analyzer.analyze(history);
    expect(result.totalOptimizations).toBe(2);
    expect(result.averageSuccessRate).toBe(0.9);
  });
  it('adjusts actions by avoiding failed', () => {
    const analysis = {
      recentlyCompleted: [], recentlyFailed: ['a1'], recentlySkipped: [],
      averageSuccessRate: 0.5, totalOptimizations: 1,
      recommendedAvoid: ['a1'], recommendedRepeat: [],
    };
    const actions = [createMockAction({ id: 'a1' }), createMockAction({ id: 'a2' })];
    const result = analyzer.adjustActions(actions, analysis);
    expect(result.adjusted.length).toBe(1);
    expect(result.avoided.length).toBe(1);
  });
  it('getGoalHistory filters by goal', () => {
    const history = [
      { planId: 'p1', executedAt: new Date().toISOString(), goal: 'quick_boost' as OptimizationGoal, actionsCompleted: [], actionsSkipped: [], healthBefore: null, healthAfter: null, successRate: 1.0 },
      { planId: 'p2', executedAt: new Date().toISOString(), goal: 'storage_recovery' as OptimizationGoal, actionsCompleted: [], actionsSkipped: [], healthBefore: null, healthAfter: null, successRate: 0.8 },
    ];
    expect(analyzer.getGoalHistory(history, 'quick_boost').length).toBe(1);
  });
  it('getSuccessRateForGoal returns rate', () => {
    const history = [
      { planId: 'p1', executedAt: new Date().toISOString(), goal: 'quick_boost' as OptimizationGoal, actionsCompleted: [], actionsSkipped: [], healthBefore: null, healthAfter: null, successRate: 1.0 },
      { planId: 'p2', executedAt: new Date().toISOString(), goal: 'quick_boost' as OptimizationGoal, actionsCompleted: [], actionsSkipped: [], healthBefore: null, healthAfter: null, successRate: 0.6 },
    ];
    expect(analyzer.getSuccessRateForGoal(history, 'quick_boost')).toBe(0.8);
  });
});

// ── Plan Generator ───────────────────────────────────────────

describe('OptimizationPlanGenerator', () => {
  let generator: OptimizationPlanGenerator;
  beforeEach(() => { generator = new OptimizationPlanGenerator(createDefaultPlannerConfiguration()); });

  it('generates actions from recommendations', () => {
    const ctx = createMockPlanningContext();
    const actions = generator.generate(ctx, 'quick_boost');
    expect(actions.length).toBe(2);
    expect(actions[0]!.id).toBe('rec_1');
  });
  it('filters by confidence', () => {
    const cfg = createPlannerConfiguration({ planningRules: { minRecommendationConfidence: 0.9 } });
    const g = new OptimizationPlanGenerator(cfg);
    const ctx = createMockPlanningContext();
    const actions = g.generate(ctx, 'quick_boost');
    expect(actions.length).toBe(0);
  });
  it('filters by status', () => {
    const ctx = createMockPlanningContext({
      recommendations: [createMockRecommendation({ status: 'completed' })],
    });
    const actions = generator.generate(ctx, 'quick_boost');
    expect(actions.length).toBe(0);
  });
  it('sets predictedImpact', () => {
    const actions = generator.generate(createMockPlanningContext(), 'quick_boost');
    expect(actions[0]!.predictedImpact).toBeGreaterThan(0);
  });
});

// ── Optimization Planner ─────────────────────────────────────

describe('OptimizationPlanner', () => {
  let planner: OptimizationPlanner;
  beforeEach(() => { planner = new OptimizationPlanner(createDefaultPlannerConfiguration()); });

  it('generates a smart plan', () => {
    const plan = planner.plan('quick_boost', createMockPlanningContext());
    expect(plan.id).toContain('smartplan_');
    expect(plan.optimizationGoal).toBe('quick_boost');
    expect(plan.recommendedActions.length).toBeGreaterThan(0);
  });
  it('sets strategy based on goal', () => {
    const plan = planner.plan('maximum_performance', createMockPlanningContext());
    expect(plan.strategy).toBe('aggressive');
  });
  it('sets device profile snapshot', () => {
    const plan = planner.plan('balanced', createMockPlanningContext());
    expect(plan.deviceProfile.profileType).toBe('gaming_pc');
  });
  it('computes estimated benefits', () => {
    const plan = planner.plan('storage_recovery', createMockPlanningContext());
    expect(plan.estimatedBenefits.estimatedStorageRecovery).toBeGreaterThan(0);
  });
  it('computes confidence', () => {
    const plan = planner.plan('balanced', createMockPlanningContext());
    expect(plan.confidence).toBeGreaterThan(0);
    expect(plan.confidence).toBeLessThanOrEqual(1);
  });
  it('includes safety assessment', () => {
    const plan = planner.plan('balanced', createMockPlanningContext());
    expect(plan.safetyAssessment).toBeDefined();
    expect(plan.safetyAssessment.overallRisk).toBeDefined();
  });
  it('includes eligibility result', () => {
    const plan = planner.plan('balanced', createMockPlanningContext());
    expect(plan.eligibilityResult).toBeDefined();
  });
  it('respects maxActions config', () => {
    const cfg = createPlannerConfiguration({ planningRules: { maxActions: 1 } });
    const p = new OptimizationPlanner(cfg);
    const plan = p.plan('balanced', createMockPlanningContext());
    expect(plan.recommendedActions.length).toBeLessThanOrEqual(1);
  });
  it('generates title with goal and strategy', () => {
    const plan = planner.plan('gaming_preparation', createMockPlanningContext());
    expect(plan.title).toContain('Gaming');
  });
  it('sets expiry', () => {
    const plan = planner.plan('balanced', createMockPlanningContext());
    expect(plan.expiresAt).toBeDefined();
    expect(new Date(plan.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

// ── Smart Optimize Manager ───────────────────────────────────

describe('SmartOptimizeManager', () => {
  let manager: SmartOptimizeManager;
  beforeEach(() => { manager = new SmartOptimizeManager(); });

  it('generates a smart plan', () => {
    const plan = manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    expect(plan.id).toContain('smartplan_');
    expect(manager.getSmartPlan(plan.id)).toBeDefined();
  });
  it('emits smart_plan_generated event', () => {
    let emitted = false;
    manager.on('smart_plan_generated', () => { emitted = true; });
    manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    expect(emitted).toBe(true);
  });
  it('emits strategy_selected event', () => {
    let emitted = false;
    manager.on('strategy_selected', () => { emitted = true; });
    manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    expect(emitted).toBe(true);
  });
  it('events disabled does not emit', () => {
    const cfg = createPlannerConfiguration({ enableEvents: false });
    const m = new SmartOptimizeManager(cfg);
    let emitted = false;
    m.on('smart_plan_generated', () => { emitted = true; });
    m.generateSmartPlan('quick_boost', createMockPlanningContext());
    expect(emitted).toBe(false);
  });
  it('getSmartPlan returns undefined for unknown', () => {
    expect(manager.getSmartPlan('unknown')).toBeUndefined();
  });
  it('getPlans returns all', () => {
    manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    manager.generateSmartPlan('balanced', createMockPlanningContext());
    expect(manager.getPlans().length).toBe(2);
  });
  it('generatePlans generates multiple', () => {
    const plans = manager.generatePlans(['quick_boost', 'balanced'], createMockPlanningContext());
    expect(plans.length).toBe(2);
  });
  it('comparePlans returns comparison', () => {
    const planA = manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    const planB = manager.generateSmartPlan('balanced', createMockPlanningContext());
    const comparison = manager.comparePlans(planA.id, planB.id);
    expect(comparison).not.toBeNull();
    expect(comparison!.planAId).toBe(planA.id);
  });
  it('comparePlans returns null for unknown', () => {
    expect(manager.comparePlans('unknown', 'also_unknown')).toBeNull();
  });
  it('comparePlans emits plan_compared event', () => {
    let emitted = false;
    manager.on('plan_compared', () => { emitted = true; });
    const planA = manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    const planB = manager.generateSmartPlan('balanced', createMockPlanningContext());
    manager.comparePlans(planA.id, planB.id);
    expect(emitted).toBe(true);
  });
  it('validatePlan returns result', () => {
    const plan = manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    const result = manager.validatePlan(plan.id);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
  });
  it('validatePlan returns null for unknown', () => {
    expect(manager.validatePlan('unknown')).toBeNull();
  });
  it('validatePlan emits plan_validated event', () => {
    let emitted = false;
    manager.on('plan_validated', () => { emitted = true; });
    const plan = manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    manager.validatePlan(plan.id);
    expect(emitted).toBe(true);
  });
  it('getPlannerStatistics returns stats', () => {
    manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    const stats = manager.getPlannerStatistics();
    expect(stats.totalPlans).toBe(1);
    expect(stats.byGoal.quick_boost).toBe(1);
  });
  it('getPlannerStatistics with no plans returns zeros', () => {
    const stats = manager.getPlannerStatistics();
    expect(stats.totalPlans).toBe(0);
  });
  it('updateConfig updates rules', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
  it('clear resets everything', () => {
    manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    manager.clear();
    expect(manager.getPlans().length).toBe(0);
    expect(manager.history.length).toBe(0);
  });
  it('history records events', () => {
    manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    expect(manager.history.length).toBeGreaterThan(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.SmartOptimizeManager).toBeDefined();
    expect(module.OptimizationPlanner).toBeDefined();
    expect(module.OptimizationPlanGenerator).toBeDefined();
    expect(module.OptimizationStrategyEngine).toBeDefined();
    expect(module.OptimizationProfileResolver).toBeDefined();
    expect(module.OptimizationPriorityEngine).toBeDefined();
    expect(module.OptimizationSequenceBuilder).toBeDefined();
    expect(module.OptimizationConflictResolver).toBeDefined();
    expect(module.OptimizationSafetyAnalyzer).toBeDefined();
    expect(module.OptimizationEligibilityValidator).toBeDefined();
    expect(module.OptimizationHistoryAnalyzer).toBeDefined();
    expect(module.OptimizationPlannerEvents).toBeDefined();
    expect(module.DEFAULT_PLANNER_CONFIGURATION).toBeDefined();
  });
  it('full lifecycle: generate → validate → compare', () => {
    const manager = new SmartOptimizeManager();
    const planA = manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    const planB = manager.generateSmartPlan('balanced', createMockPlanningContext());
    manager.validatePlan(planA.id);
    const comparison = manager.comparePlans(planA.id, planB.id);
    expect(comparison).not.toBeNull();
    const stats = manager.getPlannerStatistics();
    expect(stats.totalPlans).toBe(2);
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('plan generation under 200ms', () => {
    const manager = new SmartOptimizeManager();
    const start = performance.now();
    manager.generateSmartPlan('quick_boost', createMockPlanningContext());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles no recommendations', () => {
    const manager = new SmartOptimizeManager();
    const plan = manager.generateSmartPlan('balanced', createMockPlanningContext({ recommendations: [] }));
    expect(plan.recommendedActions.length).toBe(0);
  });
  it('handles null device profile', () => {
    const manager = new SmartOptimizeManager();
    const plan = manager.generateSmartPlan('balanced', createMockPlanningContext({ deviceProfile: null }));
    expect(plan.deviceProfile.profileType).toBe('general_purpose');
  });
  it('handles null current health', () => {
    const manager = new SmartOptimizeManager();
    const plan = manager.generateSmartPlan('balanced', createMockPlanningContext({ currentHealth: null }));
    expect(plan.estimatedBenefits.estimatedHealthGain).toBeGreaterThanOrEqual(0);
  });
  it('handles empty optimization history', () => {
    const manager = new SmartOptimizeManager();
    const plan = manager.generateSmartPlan('balanced', createMockPlanningContext({ optimizationHistory: [] }));
    expect(plan).toBeDefined();
  });
  it('handles all recommendations expired', () => {
    const manager = new SmartOptimizeManager();
    const ctx = createMockPlanningContext({
      recommendations: [createMockRecommendation({ status: 'expired' })],
    });
    const plan = manager.generateSmartPlan('balanced', ctx);
    expect(plan.recommendedActions.length).toBe(0);
  });
  it('handles low confidence recommendations', () => {
    const cfg = createPlannerConfiguration({ planningRules: { minRecommendationConfidence: 0.95 } });
    const manager = new SmartOptimizeManager(cfg);
    const plan = manager.generateSmartPlan('balanced', createMockPlanningContext());
    expect(plan.recommendedActions.length).toBe(0);
  });
});
