/**
 * Tests for the AI Recommendation Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIContext, KnowledgeObject, KnowledgeFact } from '../../knowledge/types';
import { createProvenance } from '../../context/types';
import { createEvidence } from '../../knowledge/types';
import { KnowledgeBuilder } from '../../knowledge/knowledgeBuilder';
import { KnowledgeRegistry } from '../../knowledge/knowledgeRegistry';
import { KnowledgeValidator } from '../../knowledge/knowledgeValidator';
import { DEFAULT_KNOWLEDGE_CONFIG } from '../../knowledge/knowledgeConfiguration';
import type {
  Recommendation,
  RecommendationList,
  RecommendationCategory,
  RecommendationPriority,
  RecommendationFilter,
} from '../types';
import {
  generateRecommendationId,
  generateRecommendationListId,
  clampScore,
  createRecommendationEvidence,
  createDefaultSafety,
  createDefaultBenefits,
} from '../types';
import { RecommendationEventEmitter } from '../recommendationEvents';
import { DEFAULT_RECOMMENDATION_CONFIG, createRecommendationConfig } from '../recommendationConfiguration';
import { RecommendationRegistry } from '../recommendationRegistry';
import { RecommendationScorer } from '../recommendationScorer';
import { RecommendationRanker } from '../recommendationRanker';
import { RecommendationFilterer } from '../recommendationFilter';
import { RecommendationValidator } from '../recommendationValidator';
import { RecommendationHistory } from '../recommendationHistory';
import { RecommendationEngine } from '../recommendationEngine';
import { RecommendationBuilder } from '../recommendationBuilder';
import { RecommendationManager } from '../recommendationManager';

// ── Helpers ──────────────────────────────────────────────────

function createMockContext(sections: Partial<AIContext> = {}): AIContext {
  return {
    metadata: {
      contextId: 'test-ctx', timestamp: new Date().toISOString(),
      contextVersion: '1.0.0', appVersion: '1.0.0', platform: 'win32',
      language: 'en-US', currentPlan: 'FREE', generationTimeMs: 5,
    },
    provenance: [],
    ...sections,
  };
}

function createFullContext(): AIContext {
  const prov = createProvenance('test-provider', '1.0.0');
  return createMockContext({
    system: { osVersion: 'Win11', osBuild: '22631', architecture: 'x64', hostname: 'PC', uptime: 3600, cpuModel: 'i7', cpuCores: 8, totalMemoryMB: 16384, gpuModel: 'RTX', provenance: prov },
    health: { overallScore: 55, cpuScore: 60, ramScore: 50, diskScore: 45, stabilityScore: 70, securityScore: 60, issues: [], provenance: prov },
    performance: { cpuUsage: 85, ramUsage: 90, diskUsage: 92, diskReadSpeedMBps: null, diskWriteSpeedMBps: null, networkLatencyMs: null, activeProcesses: 120, provenance: prov },
    storage: { totalCapacityMB: 512000, usedMB: 420000, freeMB: 92000, driveType: 'SSD', driveHealth: 'fair', fragmentationPercent: 15, largeFiles: [], provenance: prov },
    browser: { installedBrowsers: [{ name: 'Chrome', version: '120', profileCount: 1, cacheMB: 500 }], totalCacheMB: 500, totalCookiesMB: 80, totalHistoryMB: 100, extensions: [], provenance: prov },
    privacy: { trackingCookies: 200, historyEntries: 1500, tempFilesMB: 350, recycleBinMB: 120, recentItems: 50, provenance: prov },
    startup: { totalStartupItems: 20, enabledItems: 15, disabledItems: 5, estimatedBootTimeSec: 60, highImpactItems: [], provenance: prov },
    windows: { windowsVersion: '11', buildNumber: '22631', lastUpdate: null, pendingUpdates: 3, services: [], provenance: prov },
    duplicates: { totalDuplicateGroups: 8, totalDuplicateFiles: 30, wastedSpaceMB: 800, scanStatus: 'completed', topDuplicateGroups: [], provenance: prov },
    scheduler: { enabled: false, scheduledTasks: [], lastRunAt: null, nextRunAt: null, provenance: prov },
    history: { totalOptimizations: 10, totalCleanedMB: 5000, totalIssuesFixed: 25, lastOptimizationAt: null, optimizationHistory: [], provenance: prov },
    reports: { totalReports: 3, lastReportAt: null, reportTypes: ['health'], scheduledReports: 1, provenance: prov },
    experience: { currentPlan: 'FREE', planLabel: 'Free', trialStatus: 'available', unlockedFeatures: ['f1'], limitedFeatures: ['f2'], lockedFeatures: ['f3'], provenance: prov },
    capabilities: { totalCapabilities: 10, enabledCapabilities: ['c1'], disabledCapabilities: ['c2'], provenance: prov },
    quota: { quotas: [{ quotaId: 'ai', limit: 5, used: 3, remaining: 2, isUnlimited: false, resetPolicy: 'daily', nextResetAt: null }], provenance: prov },
    analytics: { mostUsedFeatures: [], mostReachedQuotas: [], totalFeatureAccesses: 100, totalDenials: 5, provenance: prov },
  });
}

async function createKnowledge(): Promise<KnowledgeObject> {
  const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(DEFAULT_KNOWLEDGE_CONFIG), DEFAULT_KNOWLEDGE_CONFIG);
  return builder.build(createFullContext());
}

function createMockRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  const now = new Date().toISOString();
  return {
    id: generateRecommendationId('performance', 'Test Rec'),
    title: 'Test Recommendation',
    summary: 'Test summary',
    description: 'Test description',
    category: 'performance',
    priority: 'medium',
    scores: {
      impactScore: 0.7,
      safetyScore: 0.9,
      urgencyScore: 0.6,
      effortScore: 0.2,
      confidenceScore: 0.85,
      overallScore: 0.7,
    },
    evidence: {
      supportingFacts: ['fact_health_overall_score'],
      supportingRelationships: [],
      supportingTrends: [],
      supportingChanges: [],
      evidence: createEvidence('test', [{ source: 's', metric: 'm', value: 1, timestamp: now }], ['s'], now, 0.85),
      evidenceCount: 1,
      sourceProviders: ['s'],
      confidence: 0.85,
    },
    benefits: {
      estimatedTime: 60,
      estimatedBenefit: 'Improves performance',
      estimatedSpaceRecovered: 100,
      estimatedPerformanceGain: 15,
      estimatedPrivacyImprovement: null,
      estimatedHealthIncrease: 10,
    },
    safety: {
      riskLevel: 'low',
      rollbackAvailable: true,
      requiresConfirmation: false,
      automaticExecutionAllowed: true,
      automationEligible: true,
      warnings: [],
    },
    requiresPro: false,
    createdAt: now,
    expiresAt: null,
    status: 'active',
    futureMetadata: {},
    ...overrides,
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('generateRecommendationId returns unique IDs', () => {
    expect(generateRecommendationId('performance', 'Test')).not.toBe(generateRecommendationId('performance', 'Test'));
  });
  it('generateRecommendationListId returns unique IDs', () => {
    expect(generateRecommendationListId()).not.toBe(generateRecommendationListId());
  });
  it('clampScore clamps to [0,1]', () => {
    expect(clampScore(-1)).toBe(0);
    expect(clampScore(2)).toBe(1);
    expect(clampScore(0.5)).toBe(0.5);
  });
  it('createRecommendationEvidence builds evidence from facts', () => {
    const fact: KnowledgeFact = {
      id: 'f1', category: 'health', name: 'score', value: 90, dataType: 'number',
      unit: null, description: '', evidence: createEvidence('test', [{ source: 's', metric: 'm', value: 1, timestamp: new Date().toISOString() }], ['s'], new Date().toISOString(), 0.9),
      confidence: 0.9, sourceProvider: 's', extractedAt: new Date().toISOString(),
    };
    const ev = createRecommendationEvidence([fact], [], [], []);
    expect(ev.supportingFacts).toHaveLength(1);
    expect(ev.evidenceCount).toBe(1);
    expect(ev.sourceProviders).toContain('s');
  });
  it('createDefaultSafety creates safety with risk level', () => {
    const s = createDefaultSafety('medium');
    expect(s.riskLevel).toBe('medium');
    expect(s.requiresConfirmation).toBe(true);
  });
  it('createDefaultBenefits creates benefits with time', () => {
    const b = createDefaultBenefits(120);
    expect(b.estimatedTime).toBe(120);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('RecommendationEventEmitter', () => {
  let emitter: RecommendationEventEmitter;
  beforeEach(() => { emitter = new RecommendationEventEmitter(); });
  it('emits events', () => { const l = vi.fn(); emitter.on('recommendations_generated', l); emitter.emit('recommendations_generated', {}); expect(l).toHaveBeenCalledTimes(1); });
  it('supports unsubscribe', () => { const l = vi.fn(); const u = emitter.on('recommendation_added', l); u(); emitter.emit('recommendation_added', {}); expect(l).not.toHaveBeenCalled(); });
  it('tracks listener count', () => { emitter.on('recommendation_updated', () => {}); expect(emitter.listenerCount('recommendation_updated')).toBe(1); });
  it('clear removes all', () => { emitter.on('recommendation_removed', () => {}); emitter.clear(); expect(emitter.listenerCount('recommendation_removed')).toBe(0); });
  it('does not crash on listener error', () => { emitter.on('recommendation_ranked', () => { throw new Error('x'); }); expect(() => emitter.emit('recommendation_ranked', {})).not.toThrow(); });
  it('supports all 8 event types', () => {
    const evts = ['recommendations_generated','recommendation_added','recommendation_updated','recommendation_removed','recommendation_ranked','recommendation_filtered','recommendation_selected','recommendation_expired'] as const;
    for (const e of evts) { const l = vi.fn(); emitter.on(e, l); emitter.emit(e, {}); expect(l).toHaveBeenCalledTimes(1); }
  });
});

// ── Configuration ────────────────────────────────────────────

describe('RecommendationConfiguration', () => {
  it('has defaults', () => { expect(DEFAULT_RECOMMENDATION_CONFIG.scoringWeights.impact).toBe(0.35); expect(DEFAULT_RECOMMENDATION_CONFIG.maxRecommendations).toBe(50); });
  it('createRecommendationConfig accepts overrides', () => { expect(createRecommendationConfig({ maxRecommendations: 10 }).maxRecommendations).toBe(10); });
  it('merges nested scoringWeights', () => { expect(createRecommendationConfig({ scoringWeights: { ...DEFAULT_RECOMMENDATION_CONFIG.scoringWeights, impact: 0.5 } }).scoringWeights.impact).toBe(0.5); expect(createRecommendationConfig({ scoringWeights: { ...DEFAULT_RECOMMENDATION_CONFIG.scoringWeights, impact: 0.5 } }).scoringWeights.safety).toBe(0.25); });
  it('merges nested priorityThresholds', () => { expect(createRecommendationConfig({ priorityThresholds: { ...DEFAULT_RECOMMENDATION_CONFIG.priorityThresholds, critical: 0.9 } }).priorityThresholds.critical).toBe(0.9); expect(createRecommendationConfig({ priorityThresholds: { ...DEFAULT_RECOMMENDATION_CONFIG.priorityThresholds, critical: 0.9 } }).priorityThresholds.high).toBe(0.70); });
});

// ── Registry ─────────────────────────────────────────────────

describe('RecommendationRegistry', () => {
  let reg: RecommendationRegistry;
  beforeEach(() => { reg = new RecommendationRegistry(); });
  it('registers plugin', () => { const p = { getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => [] }; expect(reg.registerPlugin(p)).toBe(true); expect(reg.count).toBe(1); });
  it('rejects empty name', () => { const p = { getPluginName: () => '', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => [] }; expect(reg.registerPlugin(p)).toBe(false); });
  it('unregisters plugin', () => { const p = { getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => [] }; reg.registerPlugin(p); expect(reg.unregisterPlugin('p')).toBe(true); expect(reg.count).toBe(0); });
  it('getPlugins sorted by priority', () => { reg.registerPlugin({ getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 20, isAvailable: () => true, buildRecommendations: () => [] }); reg.registerPlugin({ getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 5, isAvailable: () => true, buildRecommendations: () => [] }); expect(reg.getPlugins()[0]!.getPluginName()).toBe('b'); });
  it('getAvailablePlugins filters unavailable', () => { reg.registerPlugin({ getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => [] }); reg.registerPlugin({ getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, buildRecommendations: () => [] }); expect(reg.getAvailablePlugins()).toHaveLength(1); });
  it('clear removes all', () => { reg.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => [] }); reg.clear(); expect(reg.count).toBe(0); });
});

// ── Scorer ───────────────────────────────────────────────────

describe('RecommendationScorer', () => {
  let scorer: RecommendationScorer;
  beforeEach(() => { scorer = new RecommendationScorer(DEFAULT_RECOMMENDATION_CONFIG); });
  it('scores a recommendation', () => {
    const rec = createMockRecommendation();
    const scores = scorer.score(rec);
    expect(scores.impactScore).toBeGreaterThan(0);
    expect(scores.safetyScore).toBeGreaterThan(0);
    expect(scores.urgencyScore).toBeGreaterThan(0);
    expect(scores.effortScore).toBeGreaterThanOrEqual(0);
    expect(scores.confidenceScore).toBeGreaterThan(0);
    expect(scores.overallScore).toBeGreaterThan(0);
    expect(scores.overallScore).toBeLessThanOrEqual(1);
  });
  it('derives priority from overall score', () => {
    expect(scorer.derivePriority(0.9)).toBe('critical');
    expect(scorer.derivePriority(0.75)).toBe('high');
    expect(scorer.derivePriority(0.55)).toBe('medium');
    expect(scorer.derivePriority(0.35)).toBe('low');
    expect(scorer.derivePriority(0.1)).toBe('informational');
  });
  it('updates scores in-place on recommendation', () => {
    const rec = createMockRecommendation();
    scorer.score(rec);
    expect(rec.scores.overallScore).toBeGreaterThan(0);
    expect(rec.priority).toBeDefined();
  });
  it('scoreAll scores multiple recommendations', () => {
    const recs = [createMockRecommendation(), createMockRecommendation({ id: 'rec2' })];
    scorer.scoreAll(recs);
    expect(recs[0]!.scores.overallScore).toBeGreaterThan(0);
    expect(recs[1]!.scores.overallScore).toBeGreaterThan(0);
  });
  it('safety score is high for none risk', () => {
    const rec = createMockRecommendation({ safety: { ...createDefaultSafety('none') } });
    scorer.score(rec);
    expect(rec.scores.safetyScore).toBeGreaterThan(0.8);
  });
  it('safety score is low for critical risk', () => {
    const rec = createMockRecommendation({ safety: { ...createDefaultSafety('critical'), rollbackAvailable: false, requiresConfirmation: true } });
    scorer.score(rec);
    expect(rec.scores.safetyScore).toBeLessThan(0.3);
  });
  it('effort score is low for quick actions', () => {
    const rec = createMockRecommendation({ benefits: { ...createDefaultBenefits(15) } });
    scorer.score(rec);
    expect(rec.scores.effortScore).toBeLessThan(0.2);
  });
  it('effort score is high for long actions', () => {
    const rec = createMockRecommendation({ benefits: { ...createDefaultBenefits(900) } });
    scorer.score(rec);
    expect(rec.scores.effortScore).toBeGreaterThan(0.7);
  });
});

// ── Ranker ───────────────────────────────────────────────────

describe('RecommendationRanker', () => {
  let ranker: RecommendationRanker;
  beforeEach(() => { ranker = new RecommendationRanker(); });
  it('ranks by overall score descending', () => {
    const recs = [
      createMockRecommendation({ id: 'r1', scores: { ...createMockRecommendation().scores, overallScore: 0.5 } }),
      createMockRecommendation({ id: 'r2', scores: { ...createMockRecommendation().scores, overallScore: 0.9 } }),
    ];
    const ranked = ranker.rank(recs);
    expect(ranked[0]!.id).toBe('r2');
  });
  it('breaks ties by impact', () => {
    const recs = [
      createMockRecommendation({ id: 'r1', scores: { impactScore: 0.3, safetyScore: 0.9, urgencyScore: 0.5, effortScore: 0.2, confidenceScore: 0.8, overallScore: 0.7 } }),
      createMockRecommendation({ id: 'r2', scores: { impactScore: 0.8, safetyScore: 0.9, urgencyScore: 0.5, effortScore: 0.2, confidenceScore: 0.8, overallScore: 0.7 } }),
    ];
    const ranked = ranker.rank(recs);
    expect(ranked[0]!.id).toBe('r2');
  });
  it('breaks ties by lowest risk', () => {
    const recs = [
      createMockRecommendation({ id: 'r1', safety: { ...createDefaultSafety('high') }, scores: { impactScore: 0.7, safetyScore: 0.5, urgencyScore: 0.5, effortScore: 0.2, confidenceScore: 0.8, overallScore: 0.7 } }),
      createMockRecommendation({ id: 'r2', safety: { ...createDefaultSafety('none') }, scores: { impactScore: 0.7, safetyScore: 0.9, urgencyScore: 0.5, effortScore: 0.2, confidenceScore: 0.8, overallScore: 0.7 } }),
    ];
    const ranked = ranker.rank(recs);
    expect(ranked[0]!.id).toBe('r2');
  });
  it('getTopN returns top N', () => {
    const recs = [
      createMockRecommendation({ id: 'r1', scores: { ...createMockRecommendation().scores, overallScore: 0.3 } }),
      createMockRecommendation({ id: 'r2', scores: { ...createMockRecommendation().scores, overallScore: 0.9 } }),
      createMockRecommendation({ id: 'r3', scores: { ...createMockRecommendation().scores, overallScore: 0.6 } }),
    ];
    const top = ranker.getTopN(recs, 2);
    expect(top).toHaveLength(2);
    expect(top[0]!.id).toBe('r2');
  });
  it('rankCopy does not mutate input', () => {
    const recs = [createMockRecommendation({ id: 'r1', scores: { ...createMockRecommendation().scores, overallScore: 0.3 } }), createMockRecommendation({ id: 'r2', scores: { ...createMockRecommendation().scores, overallScore: 0.9 } })];
    const ranked = ranker.rankCopy(recs);
    expect(recs[0]!.id).toBe('r1');
    expect(ranked[0]!.id).toBe('r2');
  });
});

// ── Filter ───────────────────────────────────────────────────

describe('RecommendationFilterer', () => {
  let filterer: RecommendationFilterer;
  beforeEach(() => { filterer = new RecommendationFilterer(DEFAULT_RECOMMENDATION_CONFIG); });
  it('filters by category', () => {
    const recs = [createMockRecommendation({ id: 'r1', category: 'performance' }), createMockRecommendation({ id: 'r2', category: 'storage' })];
    expect(filterer.byCategory(recs, ['performance'])).toHaveLength(1);
  });
  it('filters by priority', () => {
    const recs = [createMockRecommendation({ id: 'r1', priority: 'high' }), createMockRecommendation({ id: 'r2', priority: 'low' })];
    expect(filterer.byPriority(recs, ['high'])).toHaveLength(1);
  });
  it('filters safe only', () => {
    const recs = [createMockRecommendation({ id: 'r1', safety: { ...createDefaultSafety('none') } }), createMockRecommendation({ id: 'r2', safety: { ...createDefaultSafety('high') } })];
    expect(filterer.safeOnly(recs)).toHaveLength(1);
  });
  it('filters quick wins', () => {
    const recs = [
      createMockRecommendation({ id: 'r1', benefits: { ...createDefaultBenefits(60) }, scores: { impactScore: 0.7, safetyScore: 0.9, urgencyScore: 0.5, effortScore: 0.2, confidenceScore: 0.8, overallScore: 0.7 } }),
      createMockRecommendation({ id: 'r2', benefits: { ...createDefaultBenefits(600) }, scores: { impactScore: 0.3, safetyScore: 0.5, urgencyScore: 0.5, effortScore: 0.8, confidenceScore: 0.8, overallScore: 0.4 } }),
    ];
    const qw = filterer.quickWins(recs);
    expect(qw).toHaveLength(1);
    expect(qw[0]!.id).toBe('r1');
  });
  it('filters automation ready', () => {
    const recs = [createMockRecommendation({ id: 'r1', safety: { ...createDefaultSafety('none'), automationEligible: true } }), createMockRecommendation({ id: 'r2', safety: { ...createDefaultSafety('high'), automationEligible: false } })];
    expect(filterer.automationReady(recs)).toHaveLength(1);
  });
  it('filters under time', () => {
    const recs = [createMockRecommendation({ id: 'r1', benefits: { ...createDefaultBenefits(30) } }), createMockRecommendation({ id: 'r2', benefits: { ...createDefaultBenefits(600) } })];
    expect(filterer.underTime(recs, 60)).toHaveLength(1);
  });
  it('filters min impact', () => {
    const recs = [createMockRecommendation({ id: 'r1', scores: { ...createMockRecommendation().scores, impactScore: 0.8 } }), createMockRecommendation({ id: 'r2', scores: { ...createMockRecommendation().scores, impactScore: 0.2 } })];
    expect(filterer.minImpact(recs, 0.5)).toHaveLength(1);
  });
  it('filters pro only', () => {
    const recs = [createMockRecommendation({ id: 'r1', requiresPro: true }), createMockRecommendation({ id: 'r2', requiresPro: false })];
    expect(filterer.proOnly(recs)).toHaveLength(1);
  });
  it('filters free only', () => {
    const recs = [createMockRecommendation({ id: 'r1', requiresPro: true }), createMockRecommendation({ id: 'r2', requiresPro: false })];
    expect(filterer.freeOnly(recs)).toHaveLength(1);
  });
  it('applies complex filter', () => {
    const filter: RecommendationFilter = { categories: ['performance'], minImpact: 0.5, maxTimeRequired: 120 };
    const recs = [
      createMockRecommendation({ id: 'r1', category: 'performance', benefits: { ...createDefaultBenefits(60) }, scores: { ...createMockRecommendation().scores, impactScore: 0.7 } }),
      createMockRecommendation({ id: 'r2', category: 'storage', benefits: { ...createDefaultBenefits(60) }, scores: { ...createMockRecommendation().scores, impactScore: 0.7 } }),
      createMockRecommendation({ id: 'r3', category: 'performance', benefits: { ...createDefaultBenefits(600) }, scores: { ...createMockRecommendation().scores, impactScore: 0.7 } }),
    ];
    expect(filterer.filter(recs, filter)).toHaveLength(1);
  });
  it('applies custom filter', () => {
    const recs = [createMockRecommendation({ id: 'r1', title: 'ABC' }), createMockRecommendation({ id: 'r2', title: 'XYZ' })];
    const filter: RecommendationFilter = { custom: (r) => r.title.startsWith('A') };
    expect(filterer.filter(recs, filter)).toHaveLength(1);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('RecommendationValidator', () => {
  let validator: RecommendationValidator;
  beforeEach(() => { validator = new RecommendationValidator(DEFAULT_RECOMMENDATION_CONFIG); });
  it('validates a valid recommendation', () => {
    const rec = createMockRecommendation();
    const result = validator.validateRecommendation(rec);
    expect(result.valid).toBe(true);
  });
  it('fails for missing id', () => {
    const rec = createMockRecommendation({ id: '' });
    expect(validator.validateRecommendation(rec).valid).toBe(false);
  });
  it('fails for missing title', () => {
    const rec = createMockRecommendation({ title: '' });
    expect(validator.validateRecommendation(rec).valid).toBe(false);
  });
  it('fails for invalid category', () => {
    const rec = createMockRecommendation({ category: 'invalid' as RecommendationCategory });
    expect(validator.validateRecommendation(rec).valid).toBe(false);
  });
  it('fails for invalid priority', () => {
    const rec = createMockRecommendation({ priority: 'invalid' as RecommendationPriority });
    expect(validator.validateRecommendation(rec).valid).toBe(false);
  });
  it('fails for no evidence', () => {
    const rec = createMockRecommendation({
      evidence: { supportingFacts: [], supportingRelationships: [], supportingTrends: [], supportingChanges: [], evidence: createEvidence('', [], [], new Date().toISOString(), 0.5), evidenceCount: 0, sourceProviders: [], confidence: 0.5 },
    });
    expect(validator.validateRecommendation(rec).valid).toBe(false);
  });
  it('fails for score out of range', () => {
    const rec = createMockRecommendation({ scores: { ...createMockRecommendation().scores, impactScore: 2 } });
    expect(validator.validateRecommendation(rec).valid).toBe(false);
  });
  it('warns for low confidence', () => {
    const rec = createMockRecommendation({
      evidence: { supportingFacts: ['f1'], supportingRelationships: [], supportingTrends: [], supportingChanges: [], evidence: createEvidence('test', [{ source: 's', metric: 'm', value: 1, timestamp: new Date().toISOString() }], ['s'], new Date().toISOString(), 0.1), evidenceCount: 1, sourceProviders: ['s'], confidence: 0.1 },
    });
    const result = validator.validateRecommendation(rec);
    expect(result.issues.some(i => i.code === 'REC_LOW_CONFIDENCE')).toBe(true);
  });
  it('fails for negative time', () => {
    const rec = createMockRecommendation({ benefits: { ...createDefaultBenefits(-10) } });
    expect(validator.validateRecommendation(rec).valid).toBe(false);
  });
  it('validates a list', () => {
    const list: RecommendationList = {
      recommendations: [createMockRecommendation()],
      metadata: { listId: 'list1', knowledgeId: 'k1', generatedAt: new Date().toISOString(), recommendationVersion: '1.0.0', generationTimeMs: 10, totalRecommendations: 1, filteredCount: 1 },
      statistics: { totalRecommendations: 1, byCategory: {}, byPriority: {}, byRiskLevel: {}, averageImpact: 0.5, averageSafety: 0.8, averageUrgency: 0.5, averageEffort: 0.2, averageConfidence: 0.8, averageOverall: 0.7, quickWinsCount: 0, safeCount: 1, proRequiredCount: 0, automationEligibleCount: 1, estimatedTotalTime: 60, estimatedTotalSpaceRecovered: 100 },
    };
    expect(validator.validateList(list).valid).toBe(true);
  });
  it('fails for duplicate IDs in list', () => {
    const rec = createMockRecommendation({ id: 'dup' });
    const list: RecommendationList = {
      recommendations: [rec, { ...rec }],
      metadata: { listId: 'list1', knowledgeId: 'k1', generatedAt: new Date().toISOString(), recommendationVersion: '1.0.0', generationTimeMs: 10, totalRecommendations: 2, filteredCount: 2 },
      statistics: { totalRecommendations: 2, byCategory: {}, byPriority: {}, byRiskLevel: {}, averageImpact: 0.5, averageSafety: 0.8, averageUrgency: 0.5, averageEffort: 0.2, averageConfidence: 0.8, averageOverall: 0.7, quickWinsCount: 0, safeCount: 1, proRequiredCount: 0, automationEligibleCount: 1, estimatedTotalTime: 60, estimatedTotalSpaceRecovered: 100 },
    };
    expect(validator.validateList(list).valid).toBe(false);
  });
});

// ── History ──────────────────────────────────────────────────

describe('RecommendationHistory', () => {
  let history: RecommendationHistory;
  beforeEach(() => { history = new RecommendationHistory(DEFAULT_RECOMMENDATION_CONFIG); });
  it('records generated recommendations', () => {
    history.recordGenerated([createMockRecommendation()]);
    expect(history.count).toBe(1);
  });
  it('records selection', () => {
    history.recordSelected('rec1');
    expect(history.count).toBe(1);
  });
  it('records update', () => {
    history.recordUpdated('rec1');
    expect(history.count).toBe(1);
  });
  it('records removal', () => {
    history.recordRemoved('rec1');
    expect(history.count).toBe(1);
  });
  it('records dismissal', () => {
    history.recordDismissed('rec1');
    expect(history.count).toBe(1);
  });
  it('records completion', () => {
    history.recordCompleted('rec1');
    expect(history.count).toBe(1);
  });
  it('deduplicates by ID', () => {
    const rec = createMockRecommendation();
    const deduped = history.deduplicate([rec, { ...rec }, rec]);
    expect(deduped).toHaveLength(1);
  });
  it('getEntriesFor returns entries for a recommendation', () => {
    history.recordSelected('rec1');
    history.recordUpdated('rec1');
    expect(history.getEntriesFor('rec1')).toHaveLength(2);
  });
  it('hasSeen tracks seen IDs', () => {
    history.recordGenerated([createMockRecommendation({ id: 'rec1' })]);
    expect(history.hasSeen('rec1')).toBe(true);
    expect(history.hasSeen('rec2')).toBe(false);
  });
  it('clear resets all', () => {
    history.recordSelected('rec1');
    history.clear();
    expect(history.count).toBe(0);
  });
  it('checkExpired marks expired recommendations', () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const rec = createMockRecommendation({ id: 'rec1', createdAt: oldDate, expiresAt: null });
    const expired = history.checkExpired([rec]);
    expect(expired).toContain('rec1');
    expect(rec.status).toBe('expired');
  });
  it('respects maxHistoryEntries', () => {
    const cfg = createRecommendationConfig({ maxHistoryEntries: 3 });
    const h = new RecommendationHistory(cfg);
    h.recordSelected('r1'); h.recordSelected('r2'); h.recordSelected('r3'); h.recordSelected('r4');
    expect(h.count).toBe(3);
  });
});

// ── Engine ───────────────────────────────────────────────────

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;
  beforeEach(() => { engine = new RecommendationEngine(DEFAULT_RECOMMENDATION_CONFIG); });
  it('generates recommendations from knowledge', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.length).toBeGreaterThan(0);
  });
  it('generates performance recommendations for high CPU', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.some(r => r.category === 'performance')).toBe(true);
  });
  it('generates storage recommendations for high disk usage', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.some(r => r.category === 'storage')).toBe(true);
  });
  it('generates privacy recommendations', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.some(r => r.category === 'privacy')).toBe(true);
  });
  it('generates startup recommendations', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.some(r => r.category === 'startup')).toBe(true);
  });
  it('generates duplicates recommendations', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.some(r => r.category === 'duplicates')).toBe(true);
  });
  it('generates browser recommendations', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.some(r => r.category === 'browser')).toBe(true);
  });
  it('generates windows recommendations', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.some(r => r.category === 'windows')).toBe(true);
  });
  it('generates health recommendations for low score', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.some(r => r.category === 'health')).toBe(true);
  });
  it('generates automation recommendations', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    expect(recs.some(r => r.category === 'automation')).toBe(true);
  });
  it('every recommendation has evidence', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    for (const r of recs) expect(r.evidence.evidenceCount).toBeGreaterThan(0);
  });
  it('every recommendation has supporting facts', async () => {
    const knowledge = await createKnowledge();
    const recs = engine.generate(knowledge);
    for (const r of recs) expect(r.evidence.supportingFacts.length).toBeGreaterThan(0);
  });
  it('returns empty for empty knowledge', () => {
    const emptyKnowledge: KnowledgeObject = {
      metadata: { knowledgeId: 'k1', contextId: 'c1', generatedAt: new Date().toISOString(), knowledgeVersion: '1.0.0', generationTimeMs: 0, factsCount: 0, relationshipsCount: 0, changesCount: 0, trendsCount: 0, summariesCount: 0, insightsCount: 0 },
      facts: [], relationships: [], changes: [], trends: [], summaries: [], insights: [], graph: { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }, provenance: [], statistics: { totalFacts: 0, totalRelationships: 0, totalChanges: 0, totalTrends: 0, totalSummaries: 0, totalInsights: 0, totalEvidencePieces: 0, averageConfidence: 0, factsByCategory: {}, changesByType: {}, trendsByDirection: {}, insightsByType: {}, insightsBySeverity: {}, graphDensity: 0, lastBuildTimeMs: 0, lastBuildAt: null },
    };
    expect(engine.generate(emptyKnowledge)).toHaveLength(0);
  });
});

// ── Builder ──────────────────────────────────────────────────

describe('RecommendationBuilder', () => {
  it('builds recommendations from knowledge', async () => {
    const knowledge = await createKnowledge();
    const builder = new RecommendationBuilder(new RecommendationRegistry(), new RecommendationValidator(DEFAULT_RECOMMENDATION_CONFIG), DEFAULT_RECOMMENDATION_CONFIG);
    const list = await builder.build(knowledge);
    expect(list.metadata).toBeDefined();
    expect(list.recommendations.length).toBeGreaterThan(0);
  });
  it('builds with filter', async () => {
    const knowledge = await createKnowledge();
    const builder = new RecommendationBuilder(new RecommendationRegistry(), new RecommendationValidator(DEFAULT_RECOMMENDATION_CONFIG), DEFAULT_RECOMMENDATION_CONFIG);
    const list = await builder.build(knowledge, { categories: ['performance'] });
    expect(list.recommendations.every(r => r.category === 'performance')).toBe(true);
  });
  it('scores all recommendations', async () => {
    const knowledge = await createKnowledge();
    const builder = new RecommendationBuilder(new RecommendationRegistry(), new RecommendationValidator(DEFAULT_RECOMMENDATION_CONFIG), DEFAULT_RECOMMENDATION_CONFIG);
    const list = await builder.build(knowledge);
    for (const r of list.recommendations) expect(r.scores.overallScore).toBeGreaterThan(0);
  });
  it('ranks recommendations by overall score', async () => {
    const knowledge = await createKnowledge();
    const builder = new RecommendationBuilder(new RecommendationRegistry(), new RecommendationValidator(DEFAULT_RECOMMENDATION_CONFIG), DEFAULT_RECOMMENDATION_CONFIG);
    const list = await builder.build(knowledge);
    for (let i = 1; i < list.recommendations.length; i++) {
      expect(list.recommendations[i]!.scores.overallScore).toBeLessThanOrEqual(list.recommendations[i - 1]!.scores.overallScore);
    }
  });
  it('includes statistics', async () => {
    const knowledge = await createKnowledge();
    const builder = new RecommendationBuilder(new RecommendationRegistry(), new RecommendationValidator(DEFAULT_RECOMMENDATION_CONFIG), DEFAULT_RECOMMENDATION_CONFIG);
    const list = await builder.build(knowledge);
    expect(list.statistics.totalRecommendations).toBeGreaterThan(0);
    expect(list.statistics.averageOverall).toBeGreaterThan(0);
  });
  it('integrates plugin recommendations', async () => {
    const knowledge = await createKnowledge();
    const reg = new RecommendationRegistry();
    reg.registerPlugin({ getPluginName: () => 'custom', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => [createMockRecommendation({ id: 'plugin_rec', category: 'custom' as RecommendationCategory })] });
    const builder = new RecommendationBuilder(reg, new RecommendationValidator(DEFAULT_RECOMMENDATION_CONFIG), DEFAULT_RECOMMENDATION_CONFIG);
    const list = await builder.build(knowledge);
    expect(list.recommendations.some(r => r.id === 'plugin_rec')).toBe(true);
  });
  it('plugin failure does not break build', async () => {
    const knowledge = await createKnowledge();
    const reg = new RecommendationRegistry();
    reg.registerPlugin({ getPluginName: () => 'broken', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => { throw new Error('fail'); } });
    const builder = new RecommendationBuilder(reg, new RecommendationValidator(DEFAULT_RECOMMENDATION_CONFIG), DEFAULT_RECOMMENDATION_CONFIG);
    const list = await builder.build(knowledge);
    expect(list.metadata).toBeDefined();
  });
  it('limits to maxRecommendations', async () => {
    const knowledge = await createKnowledge();
    const cfg = createRecommendationConfig({ maxRecommendations: 2 });
    const builder = new RecommendationBuilder(new RecommendationRegistry(), new RecommendationValidator(cfg), cfg);
    const list = await builder.build(knowledge);
    expect(list.recommendations.length).toBeLessThanOrEqual(2);
  });
});

// ── Manager ──────────────────────────────────────────────────

describe('RecommendationManager', () => {
  let mgr: RecommendationManager;
  beforeEach(() => { mgr = new RecommendationManager(); });
  it('starts with no recommendations', () => { expect(mgr.getRecommendationList()).toBeNull(); expect(mgr.getRecommendations()).toHaveLength(0); });
  it('buildRecommendations returns list', async () => { const k = await createKnowledge(); const list = await mgr.buildRecommendations(k); expect(list.metadata).toBeDefined(); });
  it('getRecommendations returns recommendations', async () => { await mgr.buildRecommendations(await createKnowledge()); expect(mgr.getRecommendations().length).toBeGreaterThan(0); });
  it('getRecommendation returns by ID', async () => { const list = await mgr.buildRecommendations(await createKnowledge()); const id = list.recommendations[0]!.id; expect(mgr.getRecommendation(id)).not.toBeNull(); });
  it('getRecommendation returns null for unknown ID', async () => { await mgr.buildRecommendations(await createKnowledge()); expect(mgr.getRecommendation('unknown')).toBeNull(); });
  it('getTopRecommendations returns top N', async () => { await mgr.buildRecommendations(await createKnowledge()); expect(mgr.getTopRecommendations(3).length).toBeLessThanOrEqual(3); });
  it('getRecommendationsByCategory filters', async () => { await mgr.buildRecommendations(await createKnowledge()); expect(mgr.getRecommendationsByCategory(['performance']).every(r => r.category === 'performance')).toBe(true); });
  it('getRecommendationsByPriority filters', async () => { await mgr.buildRecommendations(await createKnowledge()); const high = mgr.getRecommendationsByPriority(['critical', 'high']); expect(high.every(r => r.priority === 'critical' || r.priority === 'high')).toBe(true); });
  it('getSafeRecommendations returns safe only', async () => { await mgr.buildRecommendations(await createKnowledge()); const safe = mgr.getSafeRecommendations(); expect(safe.every(r => r.safety.riskLevel === 'none' || r.safety.riskLevel === 'low')).toBe(true); });
  it('getQuickWins returns quick wins', async () => { await mgr.buildRecommendations(await createKnowledge()); const qw = mgr.getQuickWins(); for (const r of qw) { expect(r.benefits.estimatedTime).toBeLessThanOrEqual(120); expect(r.scores.impactScore).toBeGreaterThanOrEqual(0.5); } });
  it('getRecommendationStatistics returns stats', async () => { await mgr.buildRecommendations(await createKnowledge()); expect(mgr.getRecommendationStatistics()).not.toBeNull(); });
  it('validateRecommendations validates', async () => { await mgr.buildRecommendations(await createKnowledge()); expect(mgr.validateRecommendations().valid).toBe(true); });
  it('registerPlugin adds plugin', () => { expect(mgr.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => [] })).toBe(true); });
  it('unregisterPlugin removes plugin', () => { mgr.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => [] }); expect(mgr.unregisterPlugin('p')).toBe(true); });
  it('selectRecommendation emits event', async () => { const list = await mgr.buildRecommendations(await createKnowledge()); const id = list.recommendations[0]!.id; mgr.selectRecommendation(id); });
  it('clear resets', async () => { await mgr.buildRecommendations(await createKnowledge()); mgr.clear(); expect(mgr.getRecommendationList()).toBeNull(); });
  it('updateConfig updates', async () => { mgr.updateConfig({ maxRecommendations: 1 }); const list = await mgr.buildRecommendations(await createKnowledge()); expect(list.recommendations.length).toBeLessThanOrEqual(1); });
});

// ── Traceability ─────────────────────────────────────────────

describe('Traceability', () => {
  it('every recommendation has evidence with data points', async () => {
    const mgr = new RecommendationManager();
    await mgr.buildRecommendations(await createKnowledge());
    for (const r of mgr.getRecommendations()) expect(r.evidence.evidence.dataPoints.length).toBeGreaterThan(0);
  });
  it('every recommendation has source providers', async () => {
    const mgr = new RecommendationManager();
    await mgr.buildRecommendations(await createKnowledge());
    for (const r of mgr.getRecommendations()) expect(r.evidence.sourceProviders.length).toBeGreaterThan(0);
  });
  it('every recommendation has confidence', async () => {
    const mgr = new RecommendationManager();
    await mgr.buildRecommendations(await createKnowledge());
    for (const r of mgr.getRecommendations()) expect(r.evidence.confidence).toBeGreaterThan(0);
  });
  it('every recommendation has safety info', async () => {
    const mgr = new RecommendationManager();
    await mgr.buildRecommendations(await createKnowledge());
    for (const r of mgr.getRecommendations()) { expect(r.safety.riskLevel).toBeDefined(); expect(typeof r.safety.rollbackAvailable).toBe('boolean'); expect(typeof r.safety.requiresConfirmation).toBe('boolean'); }
  });
  it('every recommendation has benefits', async () => {
    const mgr = new RecommendationManager();
    await mgr.buildRecommendations(await createKnowledge());
    for (const r of mgr.getRecommendations()) { expect(r.benefits.estimatedTime).toBeGreaterThanOrEqual(0); expect(r.benefits.estimatedBenefit).toBeDefined(); }
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.RecommendationManager).toBeDefined();
    expect(mod.recommendationManager).toBeDefined();
    expect(mod.RecommendationBuilder).toBeDefined();
    expect(mod.RecommendationEngine).toBeDefined();
    expect(mod.RecommendationScorer).toBeDefined();
    expect(mod.RecommendationRanker).toBeDefined();
    expect(mod.RecommendationFilterer).toBeDefined();
    expect(mod.RecommendationValidator).toBeDefined();
    expect(mod.RecommendationHistory).toBeDefined();
    expect(mod.RecommendationRegistry).toBeDefined();
  });
  it('full integration: build from knowledge', async () => {
    const mgr = new RecommendationManager();
    const k = await createKnowledge();
    const list = await mgr.buildRecommendations(k);
    expect(list.recommendations.length).toBeGreaterThan(0);
    expect(list.statistics.totalRecommendations).toBe(list.recommendations.length);
    expect(list.metadata.knowledgeId).toBe(k.metadata.knowledgeId);
  });
  it('full integration: validation passes', async () => {
    const mgr = new RecommendationManager();
    await mgr.buildRecommendations(await createKnowledge());
    expect(mgr.validateRecommendations().valid).toBe(true);
  });
  it('full integration: no execution or system modification', async () => {
    const mgr = new RecommendationManager();
    const list = await mgr.buildRecommendations(await createKnowledge());
    for (const r of list.recommendations) {
      expect(r.status).not.toBe('completed');
      expect(r.futureMetadata).toBeDefined();
    }
  });
  it('full integration: plugin extension works', async () => {
    const mgr = new RecommendationManager();
    mgr.registerPlugin({ getPluginName: () => 'ext', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => [createMockRecommendation({ id: 'ext_rec' })] });
    const list = await mgr.buildRecommendations(await createKnowledge());
    expect(list.recommendations.some(r => r.id === 'ext_rec')).toBe(true);
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('recommendation generation under 150ms', async () => {
    const knowledge = await createKnowledge();
    const mgr = new RecommendationManager();
    const start = performance.now();
    await mgr.buildRecommendations(knowledge);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(150);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('empty knowledge produces empty recommendations', async () => {
    const emptyKnowledge: KnowledgeObject = {
      metadata: { knowledgeId: 'k1', contextId: 'c1', generatedAt: new Date().toISOString(), knowledgeVersion: '1.0.0', generationTimeMs: 0, factsCount: 0, relationshipsCount: 0, changesCount: 0, trendsCount: 0, summariesCount: 0, insightsCount: 0 },
      facts: [], relationships: [], changes: [], trends: [], summaries: [], insights: [], graph: { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }, provenance: [], statistics: { totalFacts: 0, totalRelationships: 0, totalChanges: 0, totalTrends: 0, totalSummaries: 0, totalInsights: 0, totalEvidencePieces: 0, averageConfidence: 0, factsByCategory: {}, changesByType: {}, trendsByDirection: {}, insightsByType: {}, insightsBySeverity: {}, graphDensity: 0, lastBuildTimeMs: 0, lastBuildAt: null },
    };
    const mgr = new RecommendationManager();
    const list = await mgr.buildRecommendations(emptyKnowledge);
    expect(list.recommendations).toHaveLength(0);
    expect(list.metadata).toBeDefined();
  });
  it('partial knowledge produces partial recommendations', async () => {
    const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(DEFAULT_KNOWLEDGE_CONFIG), DEFAULT_KNOWLEDGE_CONFIG);
    const knowledge = await builder.build(createMockContext({ health: createFullContext().health }));
    const mgr = new RecommendationManager();
    const list = await mgr.buildRecommendations(knowledge);
    expect(list.recommendations.some(r => r.category === 'health')).toBe(true);
  });
  it('plugin failure does not break build', async () => {
    const mgr = new RecommendationManager();
    mgr.registerPlugin({ getPluginName: () => 'broken', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildRecommendations: () => { throw new Error('fail'); } });
    const list = await mgr.buildRecommendations(await createKnowledge());
    expect(list.metadata).toBeDefined();
  });
  it('unavailable plugin is skipped', async () => {
    const mgr = new RecommendationManager();
    mgr.registerPlugin({ getPluginName: () => 'unavail', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, buildRecommendations: () => [createMockRecommendation({ id: 'unavail_rec' })] });
    const list = await mgr.buildRecommendations(await createKnowledge());
    expect(list.recommendations.some(r => r.id === 'unavail_rec')).toBe(false);
  });
  it('multiple builds work correctly', async () => {
    const mgr = new RecommendationManager();
    const k1 = await createKnowledge();
    await mgr.buildRecommendations(k1);
    const list1 = mgr.getRecommendations();
    expect(list1.length).toBeGreaterThan(0);
    const k2 = await createKnowledge();
    await mgr.buildRecommendations(k2);
    expect(mgr.getRecommendations().length).toBeGreaterThan(0);
  });
  it('configuration with disabled history still works', async () => {
    const cfg = createRecommendationConfig({ enableHistory: false });
    const mgr = new RecommendationManager(cfg);
    await mgr.buildRecommendations(await createKnowledge());
    expect(mgr.getRecommendations().length).toBeGreaterThan(0);
  });
});
