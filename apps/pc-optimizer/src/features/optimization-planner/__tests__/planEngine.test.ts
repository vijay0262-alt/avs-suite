/**
 * Tests for EPIC 3 PHASE A PART 5 — Optimization Plan Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  Recommendation,
  RecommendationCategory,
  RecommendationPriority,
  RecommendationScores,
  RecommendationEvidence,
  RecommendationBenefits,
  RecommendationSafety,
} from '../../ai-intelligence/recommendations/types';
import type {
  OptimizationPlanV2,
  OptimizationPlanType,
  PlanStep,
  PlanRiskLevel,
  PlanConfiguration,
  PlanBuilderInput,
  PlanUserPreferences,
} from '../types';
import {
  getPlanTypeLabel,
  getPlanRiskLabel,
  riskToPlanRisk,
  planRiskToWeight,
  createDefaultPlanConfiguration,
  createDefaultPlanUserPreferences,
  generatePlanId,
  generateStepId,
} from '../types';
import {
  DEFAULT_PLAN_CONFIGURATION,
  createPlanConfiguration,
  isPlanTypeEnabled,
} from '../planConfiguration';
import { PlanEvents } from '../planEvents';
import { PlanRegistry } from '../planRegistry';
import { PlanEstimator } from '../planEstimator';
import { PlanScorer } from '../planScorer';
import { PlanAnalyzer } from '../planAnalyzer';
import { PlanValidator } from '../planValidator';
import { PlanBuilder } from '../planBuilder';
import { PlanHistory } from '../planHistory';
import { OptimizationPlanManager } from '../planManager';

// ── Mock Data Builders ───────────────────────────────────────

function createMockScores(overrides: Partial<RecommendationScores> = {}): RecommendationScores {
  return {
    impactScore: overrides.impactScore ?? 0.8,
    safetyScore: overrides.safetyScore ?? 0.9,
    urgencyScore: overrides.urgencyScore ?? 0.7,
    effortScore: overrides.effortScore ?? 0.6,
    confidenceScore: overrides.confidenceScore ?? 0.85,
    overallScore: overrides.overallScore ?? 0.82,
  };
}

function createMockEvidence(overrides: Partial<RecommendationEvidence> = {}): RecommendationEvidence {
  return {
    supportingFacts: overrides.supportingFacts ?? ['fact_1'],
    supportingRelationships: overrides.supportingRelationships ?? [],
    supportingTrends: overrides.supportingTrends ?? [],
    supportingChanges: overrides.supportingChanges ?? [],
    evidence: {
      statement: 'test statement',
      dataPoints: [],
      sourceProviders: ['test_provider'],
      contextTimestamp: new Date().toISOString(),
      confidence: 0.85,
    },
    evidenceCount: overrides.evidenceCount ?? 1,
    sourceProviders: overrides.sourceProviders ?? ['test_provider'],
    confidence: overrides.confidence ?? 0.85,
  };
}

function createMockBenefits(overrides: Partial<RecommendationBenefits> = {}): RecommendationBenefits {
  return {
    estimatedTime: overrides.estimatedTime ?? 60,
    estimatedBenefit: overrides.estimatedBenefit ?? 'Improves system performance',
    estimatedSpaceRecovered: overrides.estimatedSpaceRecovered ?? 500,
    estimatedPerformanceGain: overrides.estimatedPerformanceGain ?? 10,
    estimatedPrivacyImprovement: overrides.estimatedPrivacyImprovement ?? 5,
    estimatedHealthIncrease: overrides.estimatedHealthIncrease ?? 8,
  };
}

function createMockSafety(overrides: Partial<RecommendationSafety> = {}): RecommendationSafety {
  return {
    riskLevel: overrides.riskLevel ?? 'low',
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    requiresConfirmation: overrides.requiresConfirmation ?? false,
    automaticExecutionAllowed: overrides.automaticExecutionAllowed ?? true,
    automationEligible: overrides.automationEligible ?? true,
    warnings: overrides.warnings ?? [],
  };
}

function createMockRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: overrides.id ?? 'rec_test_1',
    title: overrides.title ?? 'Clean Temporary Files',
    summary: overrides.summary ?? 'Remove unnecessary temp files',
    description: overrides.description ?? 'Cleans up temporary files that accumulate over time',
    category: overrides.category ?? 'storage',
    priority: overrides.priority ?? 'high',
    scores: overrides.scores ?? createMockScores(),
    evidence: overrides.evidence ?? createMockEvidence(),
    benefits: overrides.benefits ?? createMockBenefits(),
    safety: overrides.safety ?? createMockSafety(),
    requiresPro: overrides.requiresPro ?? false,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    expiresAt: overrides.expiresAt ?? null,
    status: overrides.status ?? 'active',
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockRecommendations(count: number = 5): Recommendation[] {
  const categories: RecommendationCategory[] = ['storage', 'performance', 'privacy', 'startup', 'maintenance'];
  const priorities: RecommendationPriority[] = ['critical', 'high', 'medium', 'low', 'informational'];
  return Array.from({ length: count }, (_, i) =>
    createMockRecommendation({
      id: `rec_${i}`,
      title: `Recommendation ${i}`,
      category: categories[i % categories.length],
      priority: priorities[i % priorities.length],
      benefits: createMockBenefits({
        estimatedTime: 30 + i * 10,
        estimatedHealthIncrease: 2 + i,
        estimatedSpaceRecovered: 100 * (i + 1),
      }),
    }),
  );
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers (Part 5)', () => {
  it('getPlanTypeLabel returns correct labels', () => {
    expect(getPlanTypeLabel('quick_optimize')).toBe('Quick Optimize');
    expect(getPlanTypeLabel('performance_boost')).toBe('Performance Boost');
    expect(getPlanTypeLabel('storage_recovery')).toBe('Storage Recovery');
    expect(getPlanTypeLabel('deep_optimization')).toBe('Deep Optimization');
    expect(getPlanTypeLabel('custom_plan')).toBe('Custom Plan');
  });
  it('getPlanRiskLabel returns correct labels', () => {
    expect(getPlanRiskLabel('none')).toBe('None');
    expect(getPlanRiskLabel('very_low')).toBe('Very Low');
    expect(getPlanRiskLabel('low')).toBe('Low');
    expect(getPlanRiskLabel('medium')).toBe('Medium');
    expect(getPlanRiskLabel('high')).toBe('High');
    expect(getPlanRiskLabel('critical')).toBe('Critical');
  });
  it('riskToPlanRisk converts correctly', () => {
    expect(riskToPlanRisk('none')).toBe('none');
    expect(riskToPlanRisk('low')).toBe('low');
    expect(riskToPlanRisk('medium')).toBe('medium');
    expect(riskToPlanRisk('high')).toBe('high');
    expect(riskToPlanRisk('critical')).toBe('critical');
    expect(riskToPlanRisk('unknown')).toBe('medium');
  });
  it('planRiskToWeight returns correct weights', () => {
    expect(planRiskToWeight('none')).toBe(0);
    expect(planRiskToWeight('very_low')).toBe(10);
    expect(planRiskToWeight('low')).toBe(25);
    expect(planRiskToWeight('medium')).toBe(50);
    expect(planRiskToWeight('high')).toBe(75);
    expect(planRiskToWeight('critical')).toBe(100);
  });
  it('createDefaultPlanConfiguration has all sections', () => {
    const cfg = createDefaultPlanConfiguration();
    expect(cfg.benefitRules).toBeDefined();
    expect(cfg.riskRules).toBeDefined();
    expect(cfg.orderingRules).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
    expect(cfg.enableEvents).toBe(true);
  });
  it('createDefaultPlanUserPreferences has defaults', () => {
    const prefs = createDefaultPlanUserPreferences();
    expect(prefs.avoidHighRisk).toBe(false);
    expect(prefs.maxDurationSeconds).toBe(0);
  });
  it('generatePlanId produces unique ids', () => {
    const id1 = generatePlanId('quick_optimize');
    const id2 = generatePlanId('quick_optimize');
    expect(id1).not.toBe(id2);
    expect(id1).toContain('plan_quick_optimize');
  });
  it('generateStepId produces ids with index', () => {
    const id = generateStepId(0);
    expect(id).toContain('step_0');
  });
});

// ── Configuration ────────────────────────────────────────────

describe('PlanConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_PLAN_CONFIGURATION.configVersion).toBe('2.0.0');
    expect(DEFAULT_PLAN_CONFIGURATION.benefitRules.maxHealthGain).toBe(30);
    expect(DEFAULT_PLAN_CONFIGURATION.riskRules.defaultRisk).toBe('low');
  });
  it('createPlanConfiguration accepts overrides', () => {
    const cfg = createPlanConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
    expect(cfg.configVersion).toBe('2.0.0');
  });
  it('createPlanConfiguration merges benefitRules', () => {
    const cfg = createPlanConfiguration({ benefitRules: { maxHealthGain: 50 } });
    expect(cfg.benefitRules.maxHealthGain).toBe(50);
    expect(cfg.benefitRules.healthGainMultiplier).toBe(1.0);
  });
  it('createPlanConfiguration merges riskRules', () => {
    const cfg = createPlanConfiguration({ riskRules: { defaultRisk: 'medium' } });
    expect(cfg.riskRules.defaultRisk).toBe('medium');
  });
  it('createPlanConfiguration merges orderingRules', () => {
    const cfg = createPlanConfiguration({ orderingRules: { prioritizeBy: 'benefit' } });
    expect(cfg.orderingRules.prioritizeBy).toBe('benefit');
  });
  it('createPlanConfiguration merges featureFlags', () => {
    const cfg = createPlanConfiguration({ featureFlags: { enableQuickOptimize: false } });
    expect(cfg.featureFlags.enableQuickOptimize).toBe(false);
    expect(cfg.featureFlags.enableDeepOptimization).toBe(true);
  });
  it('isPlanTypeEnabled returns true for enabled types', () => {
    expect(isPlanTypeEnabled(DEFAULT_PLAN_CONFIGURATION, 'quick_optimize')).toBe(true);
    expect(isPlanTypeEnabled(DEFAULT_PLAN_CONFIGURATION, 'deep_optimization')).toBe(true);
  });
  it('isPlanTypeEnabled returns false for disabled types', () => {
    const cfg = createPlanConfiguration({ featureFlags: { enableQuickOptimize: false } });
    expect(isPlanTypeEnabled(cfg, 'quick_optimize')).toBe(false);
  });
});

// ── Plan Events ──────────────────────────────────────────────

describe('PlanEvents', () => {
  let events: PlanEvents;
  beforeEach(() => { events = new PlanEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('plan_generated', () => { received = true; });
    events.emitGenerated('p1');
    expect(received).toBe(true);
  });
  it('off removes listener', () => {
    let received = false;
    const listener = () => { received = true; };
    events.on('plan_selected', listener);
    events.off('plan_selected', listener);
    events.emitSelected('p1');
    expect(received).toBe(false);
  });
  it('on returns unsubscribe function', () => {
    let received = false;
    const unsub = events.on('plan_validated', () => { received = true; });
    unsub();
    events.emitValidated('p1');
    expect(received).toBe(false);
  });
  it('emitUpdated works', () => {
    let received = false;
    events.on('plan_updated', () => { received = true; });
    events.emitUpdated('p1');
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
  it('clear removes all listeners', () => {
    events.on('plan_generated', () => {});
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });
  it('listenerCount returns correct count', () => {
    events.on('plan_generated', () => {});
    events.on('plan_generated', () => {});
    events.on('plan_selected', () => {});
    expect(events.listenerCount('plan_generated')).toBe(2);
    expect(events.listenerCount()).toBe(3);
  });
  it('does not crash on listener error', () => {
    events.on('plan_generated', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    events.emitGenerated('p1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Plan Registry ────────────────────────────────────────────

describe('PlanRegistry', () => {
  let registry: PlanRegistry;
  let plan: OptimizationPlanV2;
  beforeEach(() => {
    registry = new PlanRegistry();
    plan = {
      id: 'plan_1', title: 'Test', description: 'desc', summary: 'sum',
      generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString(),
      planType: 'quick_optimize', estimatedDuration: 120, estimatedHealthGain: 10,
      estimatedStorageRecovery: 500, estimatedPerformanceGain: 5, estimatedPrivacyGain: 3,
      estimatedStartupGain: 2, estimatedRisk: 'low', confidenceScore: 0.85,
      rollbackAvailable: true, requiresConfirmation: false, recommendedOrder: ['s1'],
      steps: [{ id: 's1', title: 'Step 1', description: 'd', category: 'storage', estimatedDuration: 60, estimatedBenefit: 'b', riskLevel: 'low', rollbackAvailable: true, rollbackMethod: 'auto', rollbackConfidence: 0.9, estimatedRollbackTime: 30, relatedRecommendation: 'r1', confidence: 0.85, status: 'pending', priority: 'high', futureMetadata: {} }],
      relatedRecommendations: ['r1'], futureMetadata: {},
    };
  });

  it('register adds plan', () => {
    expect(registry.register(plan)).toBe(true);
    expect(registry.has(plan.id)).toBe(true);
    expect(registry.count).toBe(1);
  });
  it('register returns false for duplicate', () => {
    registry.register(plan);
    expect(registry.register(plan)).toBe(false);
  });
  it('unregister removes plan', () => {
    registry.register(plan);
    expect(registry.unregister(plan.id)).toBe(true);
    expect(registry.has(plan.id)).toBe(false);
  });
  it('unregister returns false for unknown', () => {
    expect(registry.unregister('unknown')).toBe(false);
  });
  it('get returns plan', () => {
    registry.register(plan);
    expect(registry.get(plan.id)).toBe(plan);
  });
  it('getAll returns all plans', () => {
    registry.register(plan);
    registry.register({ ...plan, id: 'plan_2' });
    expect(registry.getAll().length).toBe(2);
  });
  it('getByType filters by plan type', () => {
    registry.register(plan);
    registry.register({ ...plan, id: 'plan_2', planType: 'deep_optimization' });
    expect(registry.getByType('quick_optimize').length).toBe(1);
  });
  it('clear removes all', () => {
    registry.register(plan);
    registry.clear();
    expect(registry.count).toBe(0);
  });
});

// ── Plan Estimator ───────────────────────────────────────────

describe('PlanEstimator', () => {
  let estimator: PlanEstimator;
  beforeEach(() => { estimator = new PlanEstimator(createDefaultPlanConfiguration()); });

  it('estimates duration from recommendations', () => {
    const recs = createMockRecommendations(3);
    const est = estimator.estimate(recs);
    expect(est.estimatedDuration).toBe(30 + 40 + 50);
  });
  it('estimates health gain', () => {
    const recs = createMockRecommendations(3);
    const est = estimator.estimate(recs);
    expect(est.estimatedHealthGain).toBeGreaterThan(0);
  });
  it('estimates storage recovery', () => {
    const recs = createMockRecommendations(3);
    const est = estimator.estimate(recs);
    expect(est.estimatedStorageRecovery).toBeGreaterThan(0);
  });
  it('estimates performance gain', () => {
    const recs = createMockRecommendations(3);
    const est = estimator.estimate(recs);
    expect(est.estimatedPerformanceGain).toBeGreaterThan(0);
  });
  it('estimates privacy gain', () => {
    const recs = createMockRecommendations(3);
    const est = estimator.estimate(recs);
    expect(est.estimatedPrivacyGain).toBeGreaterThanOrEqual(0);
  });
  it('estimates startup gain', () => {
    const recs = createMockRecommendations(3);
    const est = estimator.estimate(recs);
    expect(est.estimatedStartupGain).toBeGreaterThanOrEqual(0);
  });
  it('calculates confidence score', () => {
    const recs = createMockRecommendations(3);
    const est = estimator.estimate(recs);
    expect(est.confidenceScore).toBeGreaterThan(0);
    expect(est.confidenceScore).toBeLessThanOrEqual(1);
  });
  it('calculates rollback availability', () => {
    const recs = createMockRecommendations(3);
    const est = estimator.estimate(recs);
    expect(est.rollbackAvailable).toBe(true);
  });
  it('rollback false when any rec lacks rollback', () => {
    const recs = createMockRecommendations(2);
    recs[1] = createMockRecommendation({ ...recs[1], safety: createMockSafety({ rollbackAvailable: false }) });
    const est = estimator.estimate(recs);
    expect(est.rollbackAvailable).toBe(false);
  });
  it('calculates overall risk', () => {
    const recs = createMockRecommendations(3);
    const est = estimator.estimate(recs);
    expect(['none', 'very_low', 'low', 'medium', 'high', 'critical']).toContain(est.estimatedRisk);
  });
  it('estimates step from recommendation', () => {
    const rec = createMockRecommendation();
    const stepEst = estimator.estimateStep(rec);
    expect(stepEst.estimatedDuration).toBe(rec.benefits.estimatedTime);
    expect(stepEst.riskLevel).toBe('low');
    expect(stepEst.rollbackAvailable).toBe(true);
  });
  it('handles empty recommendations', () => {
    const est = estimator.estimate([]);
    expect(est.estimatedDuration).toBe(0);
    expect(est.confidenceScore).toBe(0);
  });
  it('respects maxHealthGain config', () => {
    const cfg = createPlanConfiguration({ benefitRules: { maxHealthGain: 5 } });
    estimator.updateConfig(cfg);
    const recs = createMockRecommendations(5);
    const est = estimator.estimate(recs);
    expect(est.estimatedHealthGain).toBeLessThanOrEqual(5);
  });
});

// ── Plan Scorer ──────────────────────────────────────────────

describe('PlanScorer', () => {
  let scorer: PlanScorer;
  let plan: OptimizationPlanV2;
  beforeEach(() => {
    scorer = new PlanScorer(createDefaultPlanConfiguration());
    plan = {
      id: 'p1', title: 'Test', description: 'd', summary: 's',
      generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString(),
      planType: 'quick_optimize', estimatedDuration: 120, estimatedHealthGain: 15,
      estimatedStorageRecovery: 500, estimatedPerformanceGain: 10, estimatedPrivacyGain: 5,
      estimatedStartupGain: 3, estimatedRisk: 'low', confidenceScore: 0.85,
      rollbackAvailable: true, requiresConfirmation: false, recommendedOrder: [],
      steps: [], relatedRecommendations: [], futureMetadata: {},
    };
  });

  it('scores a plan', () => {
    const score = scorer.score(plan);
    expect(score.planId).toBe('p1');
    expect(score.overallScore).toBeGreaterThan(0);
    expect(score.overallScore).toBeLessThanOrEqual(100);
  });
  it('benefit score reflects gains', () => {
    const score = scorer.score(plan);
    expect(score.benefitScore).toBeGreaterThan(0);
  });
  it('risk score is inverse of risk', () => {
    const lowRiskScore = scorer.score({ ...plan, estimatedRisk: 'low' });
    const highRiskScore = scorer.score({ ...plan, estimatedRisk: 'high' });
    expect(lowRiskScore.riskScore).toBeGreaterThan(highRiskScore.riskScore);
  });
  it('rankPlans sorts by overall score', () => {
    const plan2 = { ...plan, id: 'p2', estimatedHealthGain: 25 };
    const scores = scorer.rankPlans([plan, plan2]);
    expect(scores[0]?.overallScore).toBeGreaterThanOrEqual(scores[1]?.overallScore ?? 0);
  });
  it('efficiency score rewards high gain per minute', () => {
    const fast = scorer.score({ ...plan, estimatedDuration: 60, estimatedHealthGain: 20 });
    const slow = scorer.score({ ...plan, estimatedDuration: 600, estimatedHealthGain: 20 });
    expect(fast.efficiencyScore).toBeGreaterThan(slow.efficiencyScore);
  });
});

// ── Plan Analyzer ────────────────────────────────────────────

describe('PlanAnalyzer', () => {
  let analyzer: PlanAnalyzer;
  let plan: OptimizationPlanV2;
  beforeEach(() => {
    analyzer = new PlanAnalyzer(createDefaultPlanConfiguration());
    plan = {
      id: 'p1', title: 'Test', description: 'd', summary: 's',
      generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString(),
      planType: 'quick_optimize', estimatedDuration: 120, estimatedHealthGain: 10,
      estimatedStorageRecovery: 500, estimatedPerformanceGain: 5, estimatedPrivacyGain: 3,
      estimatedStartupGain: 2, estimatedRisk: 'low', confidenceScore: 0.85,
      rollbackAvailable: true, requiresConfirmation: false, recommendedOrder: ['s1', 's2'],
      steps: [
        { id: 's1', title: 'S1', description: 'd', category: 'storage', estimatedDuration: 60, estimatedBenefit: 'b', riskLevel: 'low', rollbackAvailable: true, rollbackMethod: 'auto', rollbackConfidence: 0.9, estimatedRollbackTime: 30, relatedRecommendation: 'r1', confidence: 0.85, status: 'pending', priority: 'high', futureMetadata: {} },
        { id: 's2', title: 'S2', description: 'd', category: 'performance', estimatedDuration: 60, estimatedBenefit: 'b', riskLevel: 'medium', rollbackAvailable: false, rollbackMethod: null, rollbackConfidence: 0, estimatedRollbackTime: 0, relatedRecommendation: 'r2', confidence: 0.7, status: 'pending', priority: 'medium', futureMetadata: {} },
      ],
      relatedRecommendations: ['r1', 'r2'], futureMetadata: {},
    };
  });

  it('analyzes plan', () => {
    const analysis = analyzer.analyze(plan);
    expect(analysis.planId).toBe('p1');
    expect(analysis.stepCount).toBe(2);
  });
  it('counts rollback steps', () => {
    const analysis = analyzer.analyze(plan);
    expect(analysis.rollbackSteps).toBe(1);
  });
  it('counts high risk steps', () => {
    const analysis = analyzer.analyze(plan);
    expect(analysis.highRiskSteps).toBe(0);
  });
  it('calculates average confidence', () => {
    const analysis = analyzer.analyze(plan);
    expect(analysis.averageConfidence).toBeCloseTo((0.85 + 0.7) / 2, 2);
  });
  it('covers categories', () => {
    const analysis = analyzer.analyze(plan);
    expect(analysis.categoriesCovered).toContain('storage');
    expect(analysis.categoriesCovered).toContain('performance');
  });
  it('rollbackAvailable false when not all steps support it', () => {
    const analysis = analyzer.analyze(plan);
    expect(analysis.rollbackAvailable).toBe(false);
  });
  it('analyzes risk from steps', () => {
    const risk = analyzer.analyzeRisk(plan.steps);
    expect(['none', 'very_low', 'low', 'medium', 'high', 'critical']).toContain(risk);
  });
  it('handles empty steps', () => {
    const analysis = analyzer.analyze({ ...plan, steps: [] });
    expect(analysis.stepCount).toBe(0);
    expect(analysis.averageConfidence).toBe(0);
  });
});

// ── Plan Validator ───────────────────────────────────────────

describe('PlanValidator', () => {
  let validator: PlanValidator;
  let validPlan: OptimizationPlanV2;
  beforeEach(() => {
    validator = new PlanValidator(createDefaultPlanConfiguration());
    validPlan = {
      id: 'p1', title: 'Test Plan', description: 'A test plan', summary: 's',
      generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString(),
      planType: 'quick_optimize', estimatedDuration: 120, estimatedHealthGain: 10,
      estimatedStorageRecovery: 500, estimatedPerformanceGain: 5, estimatedPrivacyGain: 3,
      estimatedStartupGain: 2, estimatedRisk: 'low', confidenceScore: 0.85,
      rollbackAvailable: true, requiresConfirmation: false, recommendedOrder: ['s1'],
      steps: [{ id: 's1', title: 'Step 1', description: 'd', category: 'storage', estimatedDuration: 60, estimatedBenefit: 'b', riskLevel: 'low', rollbackAvailable: true, rollbackMethod: 'auto', rollbackConfidence: 0.9, estimatedRollbackTime: 30, relatedRecommendation: 'r1', confidence: 0.85, status: 'pending', priority: 'high', futureMetadata: {} }],
      relatedRecommendations: ['r1'], futureMetadata: {},
    };
  });

  it('validates correct plan', () => {
    const result = validator.validate(validPlan);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
  it('fails for missing id', () => {
    const result = validator.validate({ ...validPlan, id: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Plan id is required');
  });
  it('fails for missing title', () => {
    const result = validator.validate({ ...validPlan, title: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Plan title is required');
  });
  it('fails for empty steps', () => {
    const result = validator.validate({ ...validPlan, steps: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least one step'))).toBe(true);
  });
  it('fails for unknown step in recommendedOrder', () => {
    const result = validator.validate({ ...validPlan, recommendedOrder: ['unknown'] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown step'))).toBe(true);
  });
  it('warns for step not in recommendedOrder', () => {
    const plan = { ...validPlan, steps: [...validPlan.steps, { ...validPlan.steps[0]!, id: 's2' }], recommendedOrder: ['s1'] };
    const result = validator.validate(plan);
    expect(result.warnings.some((w) => w.includes('not in recommended order'))).toBe(true);
  });
  it('warns for low confidence', () => {
    const result = validator.validate({ ...validPlan, confidenceScore: 0.1 });
    expect(result.warnings.some((w) => w.includes('confidence'))).toBe(true);
  });
  it('warns for expired plan', () => {
    const result = validator.validate({ ...validPlan, expiresAt: '2020-01-01T00:00:00Z' });
    expect(result.warnings.some((w) => w.includes('expired'))).toBe(true);
  });
  it('warns for critical risk', () => {
    const result = validator.validate({ ...validPlan, estimatedRisk: 'critical' });
    expect(result.warnings.some((w) => w.includes('critical'))).toBe(true);
  });
  it('fails for negative health gain', () => {
    const result = validator.validate({ ...validPlan, estimatedHealthGain: -5 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('negative'))).toBe(true);
  });
  it('fails for exceeding maxStepsPerPlan', () => {
    const cfg = createPlanConfiguration({ maxStepsPerPlan: 1 });
    validator.updateConfig(cfg);
    const plan = { ...validPlan, steps: [...validPlan.steps, { ...validPlan.steps[0]!, id: 's2' }] };
    const result = validator.validate(plan);
    expect(result.valid).toBe(false);
  });
});

// ── Plan Builder ─────────────────────────────────────────────

describe('PlanBuilder', () => {
  let builder: PlanBuilder;
  beforeEach(() => { builder = new PlanBuilder(createDefaultPlanConfiguration()); });

  it('builds a plan from recommendations', () => {
    const recs = createMockRecommendations(5);
    const plan = builder.build({ recommendations: recs, planType: 'quick_optimize' });
    expect(plan.id).toContain('plan_quick_optimize');
    expect(plan.title).toBe('Quick Optimize');
    expect(plan.steps.length).toBeGreaterThan(0);
  });
  it('builds deep_optimization with all recommendations', () => {
    const recs = createMockRecommendations(5);
    const plan = builder.build({ recommendations: recs, planType: 'deep_optimization' });
    expect(plan.steps.length).toBe(5);
  });
  it('filters by plan type categories', () => {
    const recs = createMockRecommendations(5);
    const plan = builder.build({ recommendations: recs, planType: 'storage_recovery' });
    expect(plan.steps.every((s) => s.category === 'storage')).toBe(true);
  });
  it('builds custom plan with selected recommendations', () => {
    const recs = createMockRecommendations(5);
    const plan = builder.build({
      recommendations: recs,
      planType: 'custom_plan',
      customRecommendationIds: ['rec_0', 'rec_2'],
    });
    expect(plan.steps.length).toBe(2);
  });
  it('sets step status to pending', () => {
    const recs = createMockRecommendations(3);
    const plan = builder.build({ recommendations: recs, planType: 'deep_optimization' });
    expect(plan.steps.every((s) => s.status === 'pending')).toBe(true);
  });
  it('sets generatedAt and expiresAt', () => {
    const recs = createMockRecommendations(3);
    const plan = builder.build({ recommendations: recs, planType: 'quick_optimize' });
    expect(plan.generatedAt).toBeDefined();
    expect(plan.expiresAt).toBeDefined();
    expect(new Date(plan.expiresAt).getTime()).toBeGreaterThan(new Date(plan.generatedAt).getTime());
  });
  it('computes recommendedOrder', () => {
    const recs = createMockRecommendations(3);
    const plan = builder.build({ recommendations: recs, planType: 'deep_optimization' });
    expect(plan.recommendedOrder.length).toBe(plan.steps.length);
    expect(plan.recommendedOrder).toEqual(plan.steps.map((s) => s.id));
  });
  it('sets requiresConfirmation for deep_optimization', () => {
    const recs = createMockRecommendations(3);
    const plan = builder.build({ recommendations: recs, planType: 'deep_optimization' });
    expect(plan.requiresConfirmation).toBe(true);
  });
  it('sets requiresConfirmation for high risk', () => {
    const recs = createMockRecommendations(3).map((r) => ({
      ...r, safety: createMockSafety({ riskLevel: 'high' as const }),
    }));
    const plan = builder.build({ recommendations: recs, planType: 'deep_optimization' });
    expect(plan.requiresConfirmation).toBe(true);
  });
  it('respects avoidHighRisk preference', () => {
    const recs = [
      createMockRecommendation({ id: 'r1', safety: createMockSafety({ riskLevel: 'high' }) }),
      createMockRecommendation({ id: 'r2', safety: createMockSafety({ riskLevel: 'low' }) }),
    ];
    const plan = builder.build({
      recommendations: recs,
      planType: 'deep_optimization',
      userPreferences: { ...createDefaultPlanUserPreferences(), avoidHighRisk: true },
    });
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0]?.relatedRecommendation).toBe('r2');
  });
  it('respects maxDurationSeconds preference', () => {
    const recs = createMockRecommendations(5);
    const plan = builder.build({
      recommendations: recs,
      planType: 'deep_optimization',
      userPreferences: { ...createDefaultPlanUserPreferences(), maxDurationSeconds: 70 },
    });
    expect(plan.estimatedDuration).toBeLessThanOrEqual(70);
  });
  it('includes relatedRecommendations', () => {
    const recs = createMockRecommendations(3);
    const plan = builder.build({ recommendations: recs, planType: 'deep_optimization' });
    expect(plan.relatedRecommendations.length).toBe(3);
  });
  it('generates summary', () => {
    const recs = createMockRecommendations(3);
    const plan = builder.build({ recommendations: recs, planType: 'quick_optimize' });
    expect(plan.summary).toContain('Quick Optimize');
    expect(plan.summary).toContain('steps');
  });
});

// ── Plan History ─────────────────────────────────────────────

describe('PlanHistory', () => {
  let history: PlanHistory;
  beforeEach(() => { history = new PlanHistory(); });

  it('records entries', () => {
    history.record('p1', 'quick_optimize', 'generated');
    expect(history.count).toBe(1);
  });
  it('getAll returns all entries', () => {
    history.record('p1', 'quick_optimize', 'generated');
    history.record('p2', 'deep_optimization', 'selected');
    expect(history.getAll().length).toBe(2);
  });
  it('getRecent returns last N', () => {
    for (let i = 0; i < 5; i++) history.record(`p${i}`, 'quick_optimize', 'generated');
    expect(history.getRecent(2).length).toBe(2);
  });
  it('getByPlan filters by plan id', () => {
    history.record('p1', 'quick_optimize', 'generated');
    history.record('p2', 'deep_optimization', 'generated');
    expect(history.getByPlan('p1').length).toBe(1);
  });
  it('getByAction filters by action', () => {
    history.record('p1', 'quick_optimize', 'generated');
    history.record('p2', 'deep_optimization', 'selected');
    expect(history.getByAction('generated').length).toBe(1);
    expect(history.getByAction('selected').length).toBe(1);
  });
  it('getByType filters by plan type', () => {
    history.record('p1', 'quick_optimize', 'generated');
    history.record('p2', 'deep_optimization', 'generated');
    expect(history.getByType('quick_optimize').length).toBe(1);
  });
  it('clear removes all', () => {
    history.record('p1', 'quick_optimize', 'generated');
    history.clear();
    expect(history.count).toBe(0);
  });
  it('trims to max entries', () => {
    const h = new PlanHistory(5);
    for (let i = 0; i < 10; i++) h.record(`p${i}`, 'quick_optimize', 'generated');
    expect(h.count).toBe(5);
  });
});

// ── Plan Manager ─────────────────────────────────────────────

describe('OptimizationPlanManager', () => {
  let manager: OptimizationPlanManager;
  beforeEach(() => { manager = new OptimizationPlanManager(); });

  it('buildPlan creates and registers a plan', () => {
    const recs = createMockRecommendations(5);
    const plan = manager.buildPlan(recs, 'quick_optimize');
    expect(plan.id).toBeDefined();
    expect(manager.getPlan(plan.id)).toBeDefined();
  });
  it('buildPlan throws for disabled plan type', () => {
    const cfg = createPlanConfiguration({ featureFlags: { enableQuickOptimize: false } });
    const m = new OptimizationPlanManager(cfg);
    expect(() => m.buildPlan(createMockRecommendations(3), 'quick_optimize')).toThrow();
  });
  it('buildPlans creates multiple plans', () => {
    const recs = createMockRecommendations(5);
    const plans = manager.buildPlans(recs);
    expect(plans.length).toBeGreaterThan(1);
  });
  it('buildPlans respects specific plan types', () => {
    const recs = createMockRecommendations(5);
    const plans = manager.buildPlans(recs, ['quick_optimize', 'storage_recovery']);
    expect(plans.length).toBe(2);
  });
  it('getPlan returns undefined for unknown', () => {
    expect(manager.getPlan('unknown')).toBeUndefined();
  });
  it('getPlans returns all plans', () => {
    const recs = createMockRecommendations(5);
    manager.buildPlan(recs, 'quick_optimize');
    manager.buildPlan(recs, 'deep_optimization');
    expect(manager.getPlans().length).toBe(2);
  });
  it('getPlans filters by type', () => {
    const recs = createMockRecommendations(5);
    manager.buildPlan(recs, 'quick_optimize');
    manager.buildPlan(recs, 'deep_optimization');
    expect(manager.getPlans('quick_optimize').length).toBe(1);
  });
  it('comparePlans compares multiple plans', () => {
    const recs = createMockRecommendations(5);
    const p1 = manager.buildPlan(recs, 'quick_optimize');
    const p2 = manager.buildPlan(recs, 'deep_optimization');
    const comparison = manager.comparePlans([p1.id, p2.id]);
    expect(comparison.plans.length).toBe(2);
    expect(comparison.bestForHealth).toBeDefined();
    expect(comparison.bestForSpeed).toBeDefined();
  });
  it('comparePlans finds best for health', () => {
    const recs = createMockRecommendations(5);
    const p1 = manager.buildPlan(recs, 'quick_optimize');
    const p2 = manager.buildPlan(recs, 'deep_optimization');
    const comparison = manager.comparePlans([p1.id, p2.id]);
    const best = manager.getPlan(comparison.bestForHealth!);
    const other = comparison.plans.find((p) => p.planId !== comparison.bestForHealth)!;
    expect(best!.estimatedHealthGain).toBeGreaterThanOrEqual(other.estimatedHealthGain);
  });
  it('comparePlans finds best for speed', () => {
    const recs = createMockRecommendations(5);
    const p1 = manager.buildPlan(recs, 'quick_optimize');
    const p2 = manager.buildPlan(recs, 'deep_optimization');
    const comparison = manager.comparePlans([p1.id, p2.id]);
    const best = manager.getPlan(comparison.bestForSpeed!);
    const other = comparison.plans.find((p) => p.planId !== comparison.bestForSpeed)!;
    expect(best!.estimatedDuration).toBeLessThanOrEqual(other.estimatedDuration);
  });
  it('comparePlans finds best for safety', () => {
    const recs = createMockRecommendations(5);
    const p1 = manager.buildPlan(recs, 'quick_optimize');
    const p2 = manager.buildPlan(recs, 'deep_optimization');
    const comparison = manager.comparePlans([p1.id, p2.id]);
    expect(comparison.bestForSafety).toBeDefined();
  });
  it('comparePlans handles empty array', () => {
    const comparison = manager.comparePlans([]);
    expect(comparison.plans.length).toBe(0);
    expect(comparison.bestForHealth).toBeNull();
  });
  it('validatePlan returns valid for correct plan', () => {
    const recs = createMockRecommendations(3);
    const plan = manager.buildPlan(recs, 'quick_optimize');
    const result = manager.validatePlan(plan.id);
    expect(result.valid).toBe(true);
  });
  it('validatePlan fails for unknown plan', () => {
    const result = manager.validatePlan('unknown');
    expect(result.valid).toBe(false);
  });
  it('getPlanStatistics returns stats', () => {
    const recs = createMockRecommendations(5);
    manager.buildPlan(recs, 'quick_optimize');
    manager.buildPlan(recs, 'deep_optimization');
    const stats = manager.getPlanStatistics();
    expect(stats.totalPlans).toBe(2);
    expect(stats.totalSteps).toBeGreaterThan(0);
  });
  it('selectPlan returns true for existing plan', () => {
    const recs = createMockRecommendations(3);
    const plan = manager.buildPlan(recs, 'quick_optimize');
    expect(manager.selectPlan(plan.id)).toBe(true);
  });
  it('selectPlan returns false for unknown', () => {
    expect(manager.selectPlan('unknown')).toBe(false);
  });
  it('emits plan_generated event', () => {
    let emitted = false;
    manager.on('plan_generated', () => { emitted = true; });
    manager.buildPlan(createMockRecommendations(3), 'quick_optimize');
    expect(emitted).toBe(true);
  });
  it('emits plan_selected event', () => {
    let emitted = false;
    manager.on('plan_selected', () => { emitted = true; });
    const plan = manager.buildPlan(createMockRecommendations(3), 'quick_optimize');
    manager.selectPlan(plan.id);
    expect(emitted).toBe(true);
  });
  it('emits plan_validated event', () => {
    let emitted = false;
    manager.on('plan_validated', () => { emitted = true; });
    const plan = manager.buildPlan(createMockRecommendations(3), 'quick_optimize');
    manager.validatePlan(plan.id);
    expect(emitted).toBe(true);
  });
  it('events disabled does not emit', () => {
    const cfg = createPlanConfiguration({ enableEvents: false });
    const m = new OptimizationPlanManager(cfg);
    let emitted = false;
    m.on('plan_generated', () => { emitted = true; });
    m.buildPlan(createMockRecommendations(3), 'quick_optimize');
    expect(emitted).toBe(false);
  });
  it('updateConfig updates rules', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
  it('analyzePlan returns analysis', () => {
    const plan = manager.buildPlan(createMockRecommendations(3), 'quick_optimize');
    const analysis = manager.analyzePlan(plan.id);
    expect(analysis).not.toBeNull();
    expect(analysis!.stepCount).toBeGreaterThan(0);
  });
  it('scorePlan returns score', () => {
    const plan = manager.buildPlan(createMockRecommendations(3), 'quick_optimize');
    const score = manager.scorePlan(plan.id);
    expect(score).not.toBeNull();
    expect(score!.overallScore).toBeGreaterThan(0);
  });
  it('clear resets everything', () => {
    manager.buildPlan(createMockRecommendations(3), 'quick_optimize');
    manager.clear();
    expect(manager.getPlans().length).toBe(0);
  });
  it('history tracks generated plans', () => {
    manager.buildPlan(createMockRecommendations(3), 'quick_optimize');
    expect(manager.history.count).toBeGreaterThan(0);
    expect(manager.history.getByAction('generated').length).toBeGreaterThan(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression (Part 5)', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.OptimizationPlanManager).toBeDefined();
    expect(module.PlanBuilder).toBeDefined();
    expect(module.PlanRegistry).toBeDefined();
    expect(module.PlanEstimator).toBeDefined();
    expect(module.PlanScorer).toBeDefined();
    expect(module.PlanAnalyzer).toBeDefined();
    expect(module.PlanValidator).toBeDefined();
    expect(module.PlanHistory).toBeDefined();
    expect(module.PlanEvents).toBeDefined();
    expect(module.DEFAULT_PLAN_CONFIGURATION).toBeDefined();
    expect(module.createPlanConfiguration).toBeDefined();
    expect(module.isPlanTypeEnabled).toBeDefined();
  });
  it('full lifecycle: build → validate → compare → select', () => {
    const manager = new OptimizationPlanManager();
    const recs = createMockRecommendations(5);
    const p1 = manager.buildPlan(recs, 'quick_optimize');
    const p2 = manager.buildPlan(recs, 'deep_optimization');
    expect(manager.validatePlan(p1.id).valid).toBe(true);
    const comparison = manager.comparePlans([p1.id, p2.id]);
    expect(comparison.plans.length).toBe(2);
    expect(manager.selectPlan(p1.id)).toBe(true);
    expect(manager.getPlanStatistics().totalPlans).toBe(2);
  });
  it('never executes optimizations', () => {
    const manager = new OptimizationPlanManager();
    const plan = manager.buildPlan(createMockRecommendations(3), 'quick_optimize');
    expect(plan.steps.every((s) => s.status === 'pending')).toBe(true);
  });
  it('existing Part 1-4 exports still work', async () => {
    const module = await import('../index');
    expect(module.OptimizationPlanner).toBeDefined();
    expect(module.optimizationPlanner).toBeDefined();
    expect(module.planBuilder).toBeDefined();
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance (Part 5)', () => {
  it('plan generation under 150ms', () => {
    const manager = new OptimizationPlanManager();
    const recs = createMockRecommendations(20);
    const start = performance.now();
    manager.buildPlan(recs, 'deep_optimization');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(150);
  });
  it('building all plan types under 500ms', () => {
    const manager = new OptimizationPlanManager();
    const recs = createMockRecommendations(20);
    const start = performance.now();
    manager.buildPlans(recs);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases (Part 5)', () => {
  it('buildPlan with empty recommendations produces empty plan', () => {
    const manager = new OptimizationPlanManager();
    const plan = manager.buildPlan([], 'quick_optimize');
    expect(plan.steps.length).toBe(0);
  });
  it('buildPlans skips disabled types', () => {
    const cfg = createPlanConfiguration({ featureFlags: { enableQuickOptimize: false } });
    const manager = new OptimizationPlanManager(cfg);
    const plans = manager.buildPlans(createMockRecommendations(3));
    expect(plans.every((p) => p.planType !== 'quick_optimize')).toBe(true);
  });
  it('custom plan with no matching recommendations produces empty plan', () => {
    const manager = new OptimizationPlanManager();
    const plan = manager.buildPlan(createMockRecommendations(3), 'custom_plan', {
      customRecommendationIds: ['nonexistent'],
    });
    expect(plan.steps.length).toBe(0);
  });
  it('comparePlans with unknown ids returns empty', () => {
    const manager = new OptimizationPlanManager();
    const comparison = manager.comparePlans(['unknown1', 'unknown2']);
    expect(comparison.plans.length).toBe(0);
  });
  it('analyzePlan returns null for unknown', () => {
    const manager = new OptimizationPlanManager();
    expect(manager.analyzePlan('unknown')).toBeNull();
  });
  it('scorePlan returns null for unknown', () => {
    const manager = new OptimizationPlanManager();
    expect(manager.scorePlan('unknown')).toBeNull();
  });
  it('plan with single recommendation works', () => {
    const manager = new OptimizationPlanManager();
    const plan = manager.buildPlan([createMockRecommendation()], 'deep_optimization');
    expect(plan.steps.length).toBe(1);
    expect(plan.estimatedDuration).toBeGreaterThan(0);
  });
  it('plan expiry is configurable', () => {
    const cfg = createPlanConfiguration({ planExpiryMinutes: 60 });
    const manager = new OptimizationPlanManager(cfg);
    const plan = manager.buildPlan(createMockRecommendations(3), 'quick_optimize');
    const expiryMs = new Date(plan.expiresAt).getTime() - new Date(plan.generatedAt).getTime();
    expect(expiryMs).toBeCloseTo(60 * 60 * 1000, -2);
  });
  it('maxStepsPerPlan limits steps', () => {
    const cfg = createPlanConfiguration({ maxStepsPerPlan: 2 });
    const manager = new OptimizationPlanManager(cfg);
    const plan = manager.buildPlan(createMockRecommendations(10), 'deep_optimization');
    expect(plan.steps.length).toBeLessThanOrEqual(2);
  });
});
