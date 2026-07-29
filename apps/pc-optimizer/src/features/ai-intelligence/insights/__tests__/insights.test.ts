/**
 * Tests for the AI Insight Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIContext, KnowledgeObject } from '../../knowledge/types';
import { createProvenance } from '../../context/types';
import { createEvidence } from '../../knowledge/types';
import { KnowledgeBuilder } from '../../knowledge/knowledgeBuilder';
import { KnowledgeRegistry } from '../../knowledge/knowledgeRegistry';
import { KnowledgeValidator } from '../../knowledge/knowledgeValidator';
import { DEFAULT_KNOWLEDGE_CONFIG } from '../../knowledge/knowledgeConfiguration';
import { RecommendationManager } from '../../recommendations/recommendationManager';
import type { Recommendation } from '../../recommendations/types';
import type {
  Insight, InsightList, InsightType, InsightPriority,
} from '../types';
import {
  generateInsightId, generateInsightListId, clampScore,
  createInsightEvidence, estimateReadingTime,
} from '../types';
import { InsightEventEmitter } from '../insightEvents';
import { DEFAULT_INSIGHT_CONFIG, createInsightConfig } from '../insightConfiguration';
import { InsightRegistry } from '../insightRegistry';
import { InsightFormatter } from '../insightFormatter';
import { InsightPrioritizer } from '../insightPrioritizer';
import { InsightComposer } from '../insightComposer';
import { InsightValidator } from '../insightValidator';
import { InsightTimelineManager } from '../insightTimeline';
import { InsightHistory } from '../insightHistory';
import { InsightGenerator } from '../insightGenerator';
import { InsightBuilder } from '../insightBuilder';
import { InsightManager } from '../insightManager';

function createMockContext(sections: Partial<AIContext> = {}): AIContext {
  return {
    metadata: { contextId: 'test-ctx', timestamp: new Date().toISOString(), contextVersion: '1.0.0', appVersion: '1.0.0', platform: 'win32', language: 'en-US', currentPlan: 'FREE', generationTimeMs: 5 },
    provenance: [], ...sections,
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

async function createRecommendations(knowledge: KnowledgeObject): Promise<Recommendation[]> {
  const mgr = new RecommendationManager();
  const list = await mgr.buildRecommendations(knowledge);
  return list.recommendations;
}

function createMockInsight(overrides: Partial<Insight> = {}): Insight {
  const now = new Date().toISOString();
  return {
    id: generateInsightId('health_summary', 'Test'),
    title: 'Test Insight', subtitle: 'Test subtitle', summary: 'Test summary',
    description: 'Test description', category: 'health', type: 'health_summary',
    priority: 'recommended', generatedAt: now, expiresAt: null,
    importanceScore: 0.6, confidenceScore: 0.8, estimatedReadingTime: 1,
    relatedRecommendations: [], relatedKnowledge: ['k1'], relatedFacts: ['f1'],
    evidence: { relatedFacts: ['f1'], relatedRecommendations: [], relatedKnowledge: ['k1'], evidence: createEvidence('test', [{ source: 's', metric: 'm', value: 1, timestamp: now }], ['s'], now, 0.8), evidenceCount: 1, sourceProviders: ['s'], confidence: 0.8 },
    status: 'active', futureMetadata: {}, ...overrides,
  };
}

// ── Types & Helpers ──────────────────────────────────────────
describe('Types & Helpers', () => {
  it('generateInsightId returns unique IDs', () => { expect(generateInsightId('test', 'A')).not.toBe(generateInsightId('test', 'A')); });
  it('generateInsightListId returns unique IDs', () => { expect(generateInsightListId()).not.toBe(generateInsightListId()); });
  it('clampScore clamps to [0,1]', () => { expect(clampScore(-1)).toBe(0); expect(clampScore(2)).toBe(1); expect(clampScore(0.5)).toBe(0.5); });
  it('estimateReadingTime returns at least 1', () => { expect(estimateReadingTime('hello')).toBe(1); });
  it('createInsightEvidence builds evidence', () => {
    const ev = createInsightEvidence([], [], ['k1']);
    expect(ev.relatedKnowledge).toEqual(['k1']);
    expect(ev.confidence).toBe(0);
  });
});

// ── Events ───────────────────────────────────────────────────
describe('InsightEventEmitter', () => {
  let emitter: InsightEventEmitter;
  beforeEach(() => { emitter = new InsightEventEmitter(); });
  it('emits events', () => { const l = vi.fn(); emitter.on('insight_generated', l); emitter.emit('insight_generated', {}); expect(l).toHaveBeenCalledTimes(1); });
  it('supports unsubscribe', () => { const l = vi.fn(); const u = emitter.on('insight_viewed', l); u(); emitter.emit('insight_viewed', {}); expect(l).not.toHaveBeenCalled(); });
  it('tracks listener count', () => { emitter.on('insight_archived', () => {}); expect(emitter.listenerCount('insight_archived')).toBe(1); });
  it('clear removes all', () => { emitter.on('insight_expired', () => {}); emitter.clear(); expect(emitter.listenerCount('insight_expired')).toBe(0); });
  it('does not crash on listener error', () => { emitter.on('achievement_unlocked', () => { throw new Error('x'); }); expect(() => emitter.emit('achievement_unlocked', {})).not.toThrow(); });
  it('supports all 7 event types', () => {
    const evts = ['insight_generated','insight_expired','insight_viewed','insight_archived','achievement_unlocked','milestone_reached','timeline_updated'] as const;
    for (const e of evts) { const l = vi.fn(); emitter.on(e, l); emitter.emit(e, {}); expect(l).toHaveBeenCalledTimes(1); }
  });
});

// ── Configuration ────────────────────────────────────────────
describe('InsightConfiguration', () => {
  it('has defaults', () => { expect(DEFAULT_INSIGHT_CONFIG.insightVersion).toBe('1.0.0'); expect(DEFAULT_INSIGHT_CONFIG.maxInsights).toBe(50); });
  it('createInsightConfig accepts overrides', () => { expect(createInsightConfig({ maxInsights: 10 }).maxInsights).toBe(10); });
  it('merges nested priorityRules', () => { expect(createInsightConfig({ priorityRules: { ...DEFAULT_INSIGHT_CONFIG.priorityRules, criticalThreshold: 0.9 } }).priorityRules.criticalThreshold).toBe(0.9); });
  it('merges nested expirationRules', () => { expect(createInsightConfig({ expirationRules: { ...DEFAULT_INSIGHT_CONFIG.expirationRules, defaultExpirationHours: 48 } }).expirationRules.defaultExpirationHours).toBe(48); });
  it('merges nested formattingRules', () => { expect(createInsightConfig({ formattingRules: { ...DEFAULT_INSIGHT_CONFIG.formattingRules, defaultFormat: 'markdown' } }).formattingRules.defaultFormat).toBe('markdown'); });
});

// ── Registry ─────────────────────────────────────────────────
describe('InsightRegistry', () => {
  let reg: InsightRegistry;
  beforeEach(() => { reg = new InsightRegistry(); });
  it('registers plugin', () => { const p = { getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => [] }; expect(reg.registerPlugin(p)).toBe(true); expect(reg.count).toBe(1); });
  it('rejects empty name', () => { const p = { getPluginName: () => '', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => [] }; expect(reg.registerPlugin(p)).toBe(false); });
  it('unregisters plugin', () => { const p = { getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => [] }; reg.registerPlugin(p); expect(reg.unregisterPlugin('p')).toBe(true); expect(reg.count).toBe(0); });
  it('getPlugins sorted by priority', () => { reg.registerPlugin({ getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 20, isAvailable: () => true, generateInsights: () => [] }); reg.registerPlugin({ getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 5, isAvailable: () => true, generateInsights: () => [] }); expect(reg.getPlugins()[0]!.getPluginName()).toBe('b'); });
  it('getAvailablePlugins filters unavailable', () => { reg.registerPlugin({ getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => [] }); reg.registerPlugin({ getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, generateInsights: () => [] }); expect(reg.getAvailablePlugins()).toHaveLength(1); });
  it('clear removes all', () => { reg.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => [] }); reg.clear(); expect(reg.count).toBe(0); });
});

// ── Prioritizer ──────────────────────────────────────────────
describe('InsightPrioritizer', () => {
  let p: InsightPrioritizer;
  beforeEach(() => { p = new InsightPrioritizer(DEFAULT_INSIGHT_CONFIG.priorityRules); });
  it('derives critical', () => { expect(p.derivePriority(0.9, 'health_summary')).toBe('critical'); });
  it('derives important', () => { expect(p.derivePriority(0.7, 'health_summary')).toBe('important'); });
  it('derives recommended', () => { expect(p.derivePriority(0.5, 'health_summary')).toBe('recommended'); });
  it('derives informational', () => { expect(p.derivePriority(0.1, 'health_summary')).toBe('informational'); });
  it('achievement is always celebration', () => { expect(p.derivePriority(0.1, 'achievement')).toBe('celebration'); });
  it('milestone is always celebration', () => { expect(p.derivePriority(0.1, 'milestone')).toBe('celebration'); });
  it('prioritizeAll assigns priorities', () => { const insights = [createMockInsight(), createMockInsight({ id: 'i2' })]; p.prioritizeAll(insights); expect(insights[0]!.priority).toBeDefined(); });
  it('sortByPriority sorts correctly', () => {
    const insights = [createMockInsight({ id: 'i1', priority: 'informational' }), createMockInsight({ id: 'i2', priority: 'critical' }), createMockInsight({ id: 'i3', priority: 'recommended' })];
    const sorted = p.sortByPriority(insights);
    expect(sorted[0]!.id).toBe('i2');
  });
});

// ── Formatter ────────────────────────────────────────────────
describe('InsightFormatter', () => {
  let f: InsightFormatter;
  beforeEach(() => { f = new InsightFormatter(DEFAULT_INSIGHT_CONFIG.formattingRules); });
  it('formats dashboard', () => { const r = f.format(createMockInsight(), 'dashboard'); expect(r.format).toBe('dashboard'); expect(r.title).toBeDefined(); expect(r.body).toBeDefined(); });
  it('formats notification', () => { const r = f.format(createMockInsight(), 'notification'); expect(r.format).toBe('notification'); expect(r.body.length).toBeLessThanOrEqual(200); });
  it('formats conversation', () => { const r = f.format(createMockInsight(), 'conversation'); expect(r.format).toBe('conversation'); });
  it('formats report', () => { const r = f.format(createMockInsight(), 'report'); expect(r.format).toBe('report'); expect(r.body).toContain('## Summary'); });
  it('formats email', () => { const r = f.format(createMockInsight(), 'email'); expect(r.format).toBe('email'); });
  it('formats mobile', () => { const r = f.format(createMockInsight(), 'mobile'); expect(r.format).toBe('mobile'); expect(r.title.length).toBeLessThanOrEqual(50); });
  it('formats plain_text', () => { const r = f.format(createMockInsight(), 'plain_text'); expect(r.format).toBe('plain_text'); });
  it('formats rich_text', () => { const r = f.format(createMockInsight(), 'rich_text'); expect(r.format).toBe('rich_text'); expect(r.body).toContain('<h3>'); });
  it('formats markdown', () => { const r = f.format(createMockInsight(), 'markdown'); expect(r.format).toBe('markdown'); expect(r.body).toContain('###'); });
  it('formatAll formats multiple', () => { const r = f.formatAll([createMockInsight(), createMockInsight({ id: 'i2' })], 'dashboard'); expect(r).toHaveLength(2); });
});

// ── Validator ────────────────────────────────────────────────
describe('InsightValidator', () => {
  let v: InsightValidator;
  beforeEach(() => { v = new InsightValidator(DEFAULT_INSIGHT_CONFIG); });
  it('validates valid insight', () => { expect(v.validateInsight(createMockInsight()).valid).toBe(true); });
  it('fails for missing id', () => { expect(v.validateInsight(createMockInsight({ id: '' })).valid).toBe(false); });
  it('fails for missing title', () => { expect(v.validateInsight(createMockInsight({ title: '' })).valid).toBe(false); });
  it('fails for invalid type', () => { expect(v.validateInsight(createMockInsight({ type: 'invalid' as InsightType })).valid).toBe(false); });
  it('fails for invalid priority', () => { expect(v.validateInsight(createMockInsight({ priority: 'invalid' as InsightPriority })).valid).toBe(false); });
  it('fails for no evidence', () => { const i = createMockInsight(); i.evidence.evidenceCount = 0; i.evidence.sourceProviders = []; expect(v.validateInsight(i).valid).toBe(false); });
  it('fails for score out of range', () => { expect(v.validateInsight(createMockInsight({ importanceScore: 2 })).valid).toBe(false); });
  it('warns for low confidence', () => { const i = createMockInsight(); i.confidenceScore = 0.1; i.evidence.confidence = 0.1; const r = v.validateInsight(i); expect(r.issues.some(x => x.code === 'INSIGHT_LOW_CONFIDENCE')).toBe(true); });
  it('validates list', () => {
    const list: InsightList = { insights: [createMockInsight()], metadata: { listId: 'l1', knowledgeId: 'k1', recommendationListId: null, generatedAt: new Date().toISOString(), insightVersion: '1.0.0', generationTimeMs: 10, totalInsights: 1 }, statistics: { totalInsights: 1, byType: {}, byCategory: {}, byPriority: {}, averageImportance: 0.5, averageConfidence: 0.8, achievementsCount: 0, milestonesCount: 0, criticalCount: 0, celebrationCount: 0, estimatedTotalReadingTime: 1 } };
    expect(v.validateList(list).valid).toBe(true);
  });
  it('fails for duplicate IDs in list', () => {
    const i = createMockInsight({ id: 'dup' });
    const list: InsightList = { insights: [i, { ...i }], metadata: { listId: 'l1', knowledgeId: 'k1', recommendationListId: null, generatedAt: new Date().toISOString(), insightVersion: '1.0.0', generationTimeMs: 10, totalInsights: 2 }, statistics: { totalInsights: 2, byType: {}, byCategory: {}, byPriority: {}, averageImportance: 0.5, averageConfidence: 0.8, achievementsCount: 0, milestonesCount: 0, criticalCount: 0, celebrationCount: 0, estimatedTotalReadingTime: 2 } };
    expect(v.validateList(list).valid).toBe(false);
  });
});

// ── History ──────────────────────────────────────────────────
describe('InsightHistory', () => {
  let h: InsightHistory;
  beforeEach(() => { h = new InsightHistory(DEFAULT_INSIGHT_CONFIG); });
  it('records generated', () => { h.recordGenerated([createMockInsight()]); expect(h.count).toBe(1); });
  it('records viewed', () => { h.recordViewed('i1'); expect(h.count).toBe(1); });
  it('records archived', () => { h.recordArchived('i1'); expect(h.count).toBe(1); });
  it('records expired', () => { h.recordExpired('i1'); expect(h.count).toBe(1); });
  it('records dismissed', () => { h.recordDismissed('i1'); expect(h.count).toBe(1); });
  it('deduplicates by ID', () => { const i = createMockInsight(); expect(h.deduplicate([i, { ...i }])).toHaveLength(1); });
  it('getEntriesFor returns entries', () => { h.recordViewed('i1'); h.recordArchived('i1'); expect(h.getEntriesFor('i1')).toHaveLength(2); });
  it('hasSeen tracks IDs', () => { h.recordGenerated([createMockInsight({ id: 'i1' })]); expect(h.hasSeen('i1')).toBe(true); expect(h.hasSeen('i2')).toBe(false); });
  it('clear resets', () => { h.recordViewed('i1'); h.clear(); expect(h.count).toBe(0); });
  it('checkExpired marks expired', () => { const i = createMockInsight({ id: 'i1', expiresAt: new Date(Date.now() - 1000).toISOString() }); const expired = h.checkExpired([i]); expect(expired).toContain('i1'); expect(i.status).toBe('expired'); });
});

// ── Timeline ─────────────────────────────────────────────────
describe('InsightTimelineManager', () => {
  let t: InsightTimelineManager;
  beforeEach(() => { t = new InsightTimelineManager(DEFAULT_INSIGHT_CONFIG); });
  it('adds insight entry', () => { t.addInsight(createMockInsight()); expect(t.count).toBe(1); });
  it('adds achievement entry', () => { t.addAchievement('Test', 'Desc', 'health', new Date().toISOString(), 0.9); expect(t.count).toBe(1); });
  it('adds milestone entry', () => { t.addMilestone('Test', 'Desc', 'health', new Date().toISOString(), 0.8); expect(t.count).toBe(1); });
  it('adds system change entry', () => { t.addSystemChange('Test', 'Desc', 'health', new Date().toISOString()); expect(t.count).toBe(1); });
  it('adds optimization event', () => { t.addOptimizationEvent('Test', 'Desc', new Date().toISOString()); expect(t.count).toBe(1); });
  it('getTimeline returns entries for period', () => { t.addInsight(createMockInsight()); const tl = t.getTimeline('daily'); expect(tl.totalEntries).toBe(1); expect(tl.period).toBe('daily'); });
  it('getEntriesByType filters', () => { t.addAchievement('A', 'D', 'health', new Date().toISOString(), 0.5); t.addMilestone('M', 'D', 'health', new Date().toISOString(), 0.5); expect(t.getEntriesByType('achievement')).toHaveLength(1); });
  it('clear resets', () => { t.addInsight(createMockInsight()); t.clear(); expect(t.count).toBe(0); });
  it('respects maxTimelineEntries', () => {
    const cfg = createInsightConfig({ maxTimelineEntries: 3 });
    const tl = new InsightTimelineManager(cfg);
    for (let i = 0; i < 5; i++) tl.addInsight(createMockInsight({ id: `i${i}` }));
    expect(tl.count).toBe(3);
  });
});

// ── Composer ─────────────────────────────────────────────────
describe('InsightComposer', () => {
  let c: InsightComposer;
  beforeEach(() => { c = new InsightComposer(DEFAULT_INSIGHT_CONFIG); });
  it('composes morning brief', async () => { const k = await createKnowledge(); const insight = c.composeMorningBrief(k, []); expect(insight.type).toBe('morning_brief'); expect(insight.title).toBe('Morning Brief'); });
  it('composes evening summary', async () => { const k = await createKnowledge(); const insight = c.composeEveningSummary(k, []); expect(insight.type).toBe('evening_summary'); });
  it('composes health summary', async () => { const k = await createKnowledge(); const insight = c.composeHealthSummary(k, []); expect(insight.type).toBe('health_summary'); expect(insight.summary).toContain('System health'); });
  it('composes optimization summary', async () => { const k = await createKnowledge(); const insight = c.composeOptimizationSummary(k, []); expect(insight.type).toBe('optimization_summary'); });
  it('composes recommendation summary', async () => { const k = await createKnowledge(); const insight = c.composeRecommendationSummary(k, []); expect(insight.type).toBe('recommendation_summary'); });
  it('composes category summary', async () => { const k = await createKnowledge(); const insight = c.composeCategorySummary(k, [], 'performance', 'performance_summary', 'Performance Summary'); expect(insight.type).toBe('performance_summary'); });
  it('composes system changes', async () => { const k = await createKnowledge(); const insights = c.composeSystemChange(k, []); expect(Array.isArray(insights)).toBe(true); });
  it('composes achievement', async () => { const k = await createKnowledge(); const insight = c.composeAchievement('Test', 'Desc', 'health', 0.9, k); expect(insight.type).toBe('achievement'); });
  it('composes milestone', async () => { const k = await createKnowledge(); const insight = c.composeMilestone('Test', 'Desc', 'health', 100, 100, 0.8, k); expect(insight.type).toBe('milestone'); });
  it('every composed insight has evidence', async () => { const k = await createKnowledge(); const insight = c.composeMorningBrief(k, []); expect(insight.evidence.evidenceCount).toBeGreaterThan(0); });
});

// ── Generator ────────────────────────────────────────────────
describe('InsightGenerator', () => {
  let g: InsightGenerator;
  beforeEach(() => { g = new InsightGenerator(DEFAULT_INSIGHT_CONFIG); });
  it('generates insights from knowledge', async () => { const k = await createKnowledge(); const insights = g.generate(k, []); expect(insights.length).toBeGreaterThan(0); });
  it('generates morning brief', async () => { const k = await createKnowledge(); const insights = g.generate(k, []); expect(insights.some(i => i.type === 'morning_brief')).toBe(true); });
  it('generates health summary', async () => { const k = await createKnowledge(); const insights = g.generate(k, []); expect(insights.some(i => i.type === 'health_summary')).toBe(true); });
  it('generates performance summary', async () => { const k = await createKnowledge(); const insights = g.generate(k, []); expect(insights.some(i => i.type === 'performance_summary')).toBe(true); });
  it('generates storage summary', async () => { const k = await createKnowledge(); const insights = g.generate(k, []); expect(insights.some(i => i.type === 'storage_summary')).toBe(true); });
  it('generates privacy summary', async () => { const k = await createKnowledge(); const insights = g.generate(k, []); expect(insights.some(i => i.type === 'privacy_summary')).toBe(true); });
  it('every insight has evidence', async () => { const k = await createKnowledge(); const insights = g.generate(k, []); for (const i of insights) expect(i.evidence.evidenceCount).toBeGreaterThan(0); });
  it('every insight has confidence', async () => { const k = await createKnowledge(); const insights = g.generate(k, []); for (const i of insights) expect(i.confidenceScore).toBeGreaterThan(0); });
  it('returns empty for empty knowledge', () => {
    const emptyK: KnowledgeObject = { metadata: { knowledgeId: 'k1', contextId: 'c1', generatedAt: new Date().toISOString(), knowledgeVersion: '1.0.0', generationTimeMs: 0, factsCount: 0, relationshipsCount: 0, changesCount: 0, trendsCount: 0, summariesCount: 0, insightsCount: 0 }, facts: [], relationships: [], changes: [], trends: [], summaries: [], insights: [], graph: { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }, provenance: [], statistics: { totalFacts: 0, totalRelationships: 0, totalChanges: 0, totalTrends: 0, totalSummaries: 0, totalInsights: 0, totalEvidencePieces: 0, averageConfidence: 0, factsByCategory: {}, changesByType: {}, trendsByDirection: {}, insightsByType: {}, insightsBySeverity: {}, graphDensity: 0, lastBuildTimeMs: 0, lastBuildAt: null } };
    expect(g.generate(emptyK, [])).toHaveLength(0);
  });
});

// ── Builder ──────────────────────────────────────────────────
describe('InsightBuilder', () => {
  it('builds insights from knowledge and recommendations', async () => {
    const k = await createKnowledge(); const recs = await createRecommendations(k);
    const b = new InsightBuilder(new InsightRegistry(), new InsightValidator(DEFAULT_INSIGHT_CONFIG), DEFAULT_INSIGHT_CONFIG);
    const list = await b.build(k, recs);
    expect(list.metadata).toBeDefined(); expect(list.insights.length).toBeGreaterThan(0);
  });
  it('builds with filter', async () => {
    const k = await createKnowledge(); const recs = await createRecommendations(k);
    const b = new InsightBuilder(new InsightRegistry(), new InsightValidator(DEFAULT_INSIGHT_CONFIG), DEFAULT_INSIGHT_CONFIG);
    const list = await b.build(k, recs, { types: ['morning_brief'] });
    expect(list.insights.every(i => i.type === 'morning_brief')).toBe(true);
  });
  it('prioritizes all insights', async () => {
    const k = await createKnowledge(); const recs = await createRecommendations(k);
    const b = new InsightBuilder(new InsightRegistry(), new InsightValidator(DEFAULT_INSIGHT_CONFIG), DEFAULT_INSIGHT_CONFIG);
    const list = await b.build(k, recs);
    for (const i of list.insights) expect(i.priority).toBeDefined();
  });
  it('includes statistics', async () => {
    const k = await createKnowledge(); const recs = await createRecommendations(k);
    const b = new InsightBuilder(new InsightRegistry(), new InsightValidator(DEFAULT_INSIGHT_CONFIG), DEFAULT_INSIGHT_CONFIG);
    const list = await b.build(k, recs);
    expect(list.statistics.totalInsights).toBeGreaterThan(0);
  });
  it('integrates plugin insights', async () => {
    const k = await createKnowledge(); const recs = await createRecommendations(k);
    const reg = new InsightRegistry();
    reg.registerPlugin({ getPluginName: () => 'custom', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => [createMockInsight({ id: 'plugin_insight' })] });
    const b = new InsightBuilder(reg, new InsightValidator(DEFAULT_INSIGHT_CONFIG), DEFAULT_INSIGHT_CONFIG);
    const list = await b.build(k, recs);
    expect(list.insights.some(i => i.id === 'plugin_insight')).toBe(true);
  });
  it('plugin failure does not break build', async () => {
    const k = await createKnowledge(); const recs = await createRecommendations(k);
    const reg = new InsightRegistry();
    reg.registerPlugin({ getPluginName: () => 'broken', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => { throw new Error('fail'); } });
    const b = new InsightBuilder(reg, new InsightValidator(DEFAULT_INSIGHT_CONFIG), DEFAULT_INSIGHT_CONFIG);
    const list = await b.build(k, recs);
    expect(list.metadata).toBeDefined();
  });
  it('limits to maxInsights', async () => {
    const k = await createKnowledge(); const recs = await createRecommendations(k);
    const cfg = createInsightConfig({ maxInsights: 2 });
    const b = new InsightBuilder(new InsightRegistry(), new InsightValidator(cfg), cfg);
    const list = await b.build(k, recs);
    expect(list.insights.length).toBeLessThanOrEqual(2);
  });
});

// ── Manager ──────────────────────────────────────────────────
describe('InsightManager', () => {
  let mgr: InsightManager;
  beforeEach(() => { mgr = new InsightManager(); });
  it('starts with no insights', () => { expect(mgr.getInsightList()).toBeNull(); expect(mgr.getInsights()).toHaveLength(0); });
  it('generateInsights returns list', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); expect(list.metadata).toBeDefined(); });
  it('getInsights returns insights', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.getInsights().length).toBeGreaterThan(0); });
  it('getInsight returns by ID', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); expect(mgr.getInsight(list.insights[0]!.id)).not.toBeNull(); });
  it('getInsight returns null for unknown', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.getInsight('unknown')).toBeNull(); });
  it('getMorningBrief returns morning brief', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.getMorningBrief()?.type).toBe('morning_brief'); });
  it('getHealthSummary returns health summary', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.getHealthSummary()?.type).toBe('health_summary'); });
  it('getOptimizationSummary returns optimization summary', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.getOptimizationSummary()?.type).toBe('optimization_summary'); });
  it('getAchievements returns achievements', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(Array.isArray(mgr.getAchievements())).toBe(true); });
  it('getMilestones returns milestones', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(Array.isArray(mgr.getMilestones())).toBe(true); });
  it('getTimeline returns timeline', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); const tl = mgr.getTimeline('daily'); expect(tl.period).toBe('daily'); });
  it('getInsightStatistics returns stats', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.getInsightStatistics()).not.toBeNull(); });
  it('validateInsights validates', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.validateInsights().valid).toBe(true); });
  it('registerPlugin adds plugin', () => { expect(mgr.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => [] })).toBe(true); });
  it('unregisterPlugin removes plugin', () => { mgr.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => [] }); expect(mgr.unregisterPlugin('p')).toBe(true); });
  it('viewInsight marks as viewed', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); mgr.viewInsight(list.insights[0]!.id); expect(list.insights[0]!.status).toBe('viewed'); });
  it('archiveInsight marks as archived', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); mgr.archiveInsight(list.insights[0]!.id); expect(list.insights[0]!.status).toBe('archived'); });
  it('formatInsight returns formatted', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); const f = mgr.formatInsight(list.insights[0]!, 'dashboard'); expect(f.format).toBe('dashboard'); });
  it('formatAllInsights formats all', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); const all = mgr.formatAllInsights('markdown'); expect(all.length).toBeGreaterThan(0); });
  it('clear resets', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); mgr.clear(); expect(mgr.getInsightList()).toBeNull(); });
  it('updateConfig updates', async () => { mgr.updateConfig({ maxInsights: 1 }); const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); expect(list.insights.length).toBeLessThanOrEqual(1); });
});

// ── Traceability ─────────────────────────────────────────────
describe('Traceability', () => {
  it('every insight has evidence with data points', async () => { const mgr = new InsightManager(); const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); for (const i of mgr.getInsights()) expect(i.evidence.evidence.dataPoints.length).toBeGreaterThan(0); });
  it('every insight has source providers', async () => { const mgr = new InsightManager(); const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); for (const i of mgr.getInsights()) expect(i.evidence.sourceProviders.length).toBeGreaterThan(0); });
  it('every insight has confidence', async () => { const mgr = new InsightManager(); const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); for (const i of mgr.getInsights()) expect(i.confidenceScore).toBeGreaterThan(0); });
  it('every insight has related knowledge', async () => { const mgr = new InsightManager(); const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); for (const i of mgr.getInsights()) expect(i.relatedKnowledge.length).toBeGreaterThan(0); });
});

// ── Regression ───────────────────────────────────────────────
describe('Regression', () => {
  it('all exports are defined', async () => { const mod = await import('../index'); expect(mod.InsightManager).toBeDefined(); expect(mod.insightManager).toBeDefined(); expect(mod.InsightBuilder).toBeDefined(); expect(mod.InsightGenerator).toBeDefined(); expect(mod.InsightComposer).toBeDefined(); expect(mod.InsightFormatter).toBeDefined(); expect(mod.InsightPrioritizer).toBeDefined(); expect(mod.InsightValidator).toBeDefined(); expect(mod.InsightHistory).toBeDefined(); expect(mod.InsightTimelineManager).toBeDefined(); expect(mod.InsightRegistry).toBeDefined(); });
  it('full integration: generate from knowledge + recommendations', async () => { const mgr = new InsightManager(); const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); expect(list.insights.length).toBeGreaterThan(0); expect(list.statistics.totalInsights).toBe(list.insights.length); expect(list.metadata.knowledgeId).toBe(k.metadata.knowledgeId); });
  it('full integration: validation passes', async () => { const mgr = new InsightManager(); const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.validateInsights().valid).toBe(true); });
  it('full integration: no execution or system modification', async () => { const mgr = new InsightManager(); const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); for (const i of list.insights) { expect(i.status).not.toBe('completed'); expect(i.futureMetadata).toBeDefined(); } });
  it('full integration: plugin extension works', async () => { const mgr = new InsightManager(); mgr.registerPlugin({ getPluginName: () => 'ext', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => [createMockInsight({ id: 'ext_insight' })] }); const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); expect(list.insights.some(i => i.id === 'ext_insight')).toBe(true); });
});

// ── Performance ──────────────────────────────────────────────
describe('Performance', () => {
  it('insight generation under 100ms', async () => { const k = await createKnowledge(); const recs = await createRecommendations(k); const mgr = new InsightManager(); const start = performance.now(); await mgr.generateInsights(k, recs); const elapsed = performance.now() - start; expect(elapsed).toBeLessThan(100); });
});

// ── Edge Cases ───────────────────────────────────────────────
describe('Edge Cases', () => {
  it('empty knowledge produces empty insights', async () => {
    const emptyK: KnowledgeObject = { metadata: { knowledgeId: 'k1', contextId: 'c1', generatedAt: new Date().toISOString(), knowledgeVersion: '1.0.0', generationTimeMs: 0, factsCount: 0, relationshipsCount: 0, changesCount: 0, trendsCount: 0, summariesCount: 0, insightsCount: 0 }, facts: [], relationships: [], changes: [], trends: [], summaries: [], insights: [], graph: { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }, provenance: [], statistics: { totalFacts: 0, totalRelationships: 0, totalChanges: 0, totalTrends: 0, totalSummaries: 0, totalInsights: 0, totalEvidencePieces: 0, averageConfidence: 0, factsByCategory: {}, changesByType: {}, trendsByDirection: {}, insightsByType: {}, insightsBySeverity: {}, graphDensity: 0, lastBuildTimeMs: 0, lastBuildAt: null } };
    const mgr = new InsightManager(); const list = await mgr.generateInsights(emptyK, []); expect(list.insights).toHaveLength(0); expect(list.metadata).toBeDefined();
  });
  it('plugin failure does not break build', async () => { const mgr = new InsightManager(); mgr.registerPlugin({ getPluginName: () => 'broken', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generateInsights: () => { throw new Error('fail'); } }); const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); expect(list.metadata).toBeDefined(); });
  it('unavailable plugin is skipped', async () => { const mgr = new InsightManager(); mgr.registerPlugin({ getPluginName: () => 'unavail', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, generateInsights: () => [createMockInsight({ id: 'unavail_i' })] }); const k = await createKnowledge(); const recs = await createRecommendations(k); const list = await mgr.generateInsights(k, recs); expect(list.insights.some(i => i.id === 'unavail_i')).toBe(false); });
  it('multiple generations work correctly', async () => { const mgr = new InsightManager(); const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.getInsights().length).toBeGreaterThan(0); await mgr.generateInsights(k, recs); expect(mgr.getInsights().length).toBeGreaterThan(0); });
  it('configuration with disabled history still works', async () => { const cfg = createInsightConfig({ enableHistory: false }); const mgr = new InsightManager(cfg); const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.getInsights().length).toBeGreaterThan(0); });
  it('configuration with disabled timeline still works', async () => { const cfg = createInsightConfig({ enableTimeline: false }); const mgr = new InsightManager(cfg); const k = await createKnowledge(); const recs = await createRecommendations(k); await mgr.generateInsights(k, recs); expect(mgr.getInsights().length).toBeGreaterThan(0); });
});
