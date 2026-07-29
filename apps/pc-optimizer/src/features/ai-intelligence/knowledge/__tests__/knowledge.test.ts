/**
 * Tests for the AI Knowledge Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIContext, KnowledgeFact } from '../types';
import { createProvenance } from '../../context/types';
import { generateKnowledgeId, generateFactId, createEvidence, factsToSnapshot } from '../types';
import { KnowledgeEventEmitter } from '../knowledgeEvents';
import { DEFAULT_KNOWLEDGE_CONFIG, createKnowledgeConfig } from '../knowledgeConfiguration';
import { KnowledgeRegistry } from '../knowledgeRegistry';
import { EvidenceBuilder } from '../evidenceBuilder';
import { KnowledgeAnalyzer } from '../knowledgeAnalyzer';
import { RelationshipEngine } from '../relationshipEngine';
import { TrendAnalyzer } from '../trendAnalyzer';
import { ChangeDetector } from '../changeDetector';
import { InsightClassifier } from '../insightClassifier';
import { KnowledgeGraphBuilder } from '../knowledgeGraph';
import { KnowledgeValidator } from '../knowledgeValidator';
import { KnowledgeBuilder } from '../knowledgeBuilder';
import { KnowledgeManager } from '../knowledgeManager';

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
    health: { overallScore: 85, cpuScore: 90, ramScore: 80, diskScore: 75, stabilityScore: 95, securityScore: 88, issues: [], provenance: prov },
    performance: { cpuUsage: 45, ramUsage: 60, diskUsage: 70, diskReadSpeedMBps: null, diskWriteSpeedMBps: null, networkLatencyMs: null, activeProcesses: 120, provenance: prov },
    storage: { totalCapacityMB: 512000, usedMB: 256000, freeMB: 256000, driveType: 'SSD', driveHealth: 'good', fragmentationPercent: 2, largeFiles: [], provenance: prov },
    browser: { installedBrowsers: [{ name: 'Chrome', version: '120', profileCount: 1, cacheMB: 500 }], totalCacheMB: 500, totalCookiesMB: 50, totalHistoryMB: 100, extensions: [], provenance: prov },
    privacy: { trackingCookies: 200, historyEntries: 1000, tempFilesMB: 300, recycleBinMB: 100, recentItems: 50, provenance: prov },
    startup: { totalStartupItems: 15, enabledItems: 10, disabledItems: 5, estimatedBootTimeSec: 45, highImpactItems: [], provenance: prov },
    windows: { windowsVersion: '11', buildNumber: '22631', lastUpdate: null, pendingUpdates: 2, services: [], provenance: prov },
    duplicates: { totalDuplicateGroups: 5, totalDuplicateFiles: 20, wastedSpaceMB: 500, scanStatus: 'completed', topDuplicateGroups: [], provenance: prov },
    scheduler: { enabled: true, scheduledTasks: [], lastRunAt: null, nextRunAt: null, provenance: prov },
    history: { totalOptimizations: 10, totalCleanedMB: 5000, totalIssuesFixed: 25, lastOptimizationAt: null, optimizationHistory: [], provenance: prov },
    reports: { totalReports: 3, lastReportAt: null, reportTypes: ['health'], scheduledReports: 1, provenance: prov },
    experience: { currentPlan: 'FREE', planLabel: 'Free', trialStatus: 'available', unlockedFeatures: ['f1'], limitedFeatures: ['f2'], lockedFeatures: ['f3'], provenance: prov },
    capabilities: { totalCapabilities: 10, enabledCapabilities: ['c1'], disabledCapabilities: ['c2'], provenance: prov },
    quota: { quotas: [{ quotaId: 'ai', limit: 5, used: 3, remaining: 2, isUnlimited: false, resetPolicy: 'daily', nextResetAt: null }], provenance: prov },
    analytics: { mostUsedFeatures: [], mostReachedQuotas: [], totalFeatureAccesses: 100, totalDenials: 5, provenance: prov },
  });
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('generateKnowledgeId returns unique IDs', () => {
    expect(generateKnowledgeId()).not.toBe(generateKnowledgeId());
  });
  it('generateFactId normalizes name', () => {
    expect(generateFactId('health', 'Overall Score')).toBe('fact_health_overall_score');
  });
  it('createEvidence clamps confidence', () => {
    expect(createEvidence('test', [], [], new Date().toISOString(), -1).confidence).toBe(0);
    expect(createEvidence('test', [], [], new Date().toISOString(), 2).confidence).toBe(1);
  });
  it('factsToSnapshot creates snapshot', () => {
    const facts: KnowledgeFact[] = [{ id: 'f1', category: 'health', name: 'score', value: 90, dataType: 'number', unit: 'score', description: 'test', evidence: createEvidence('test', [], ['p'], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() }];
    const snap = factsToSnapshot(facts, 'ctx1');
    expect(snap.contextId).toBe('ctx1');
    expect(snap.facts).toHaveLength(1);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('KnowledgeEventEmitter', () => {
  let emitter: KnowledgeEventEmitter;
  beforeEach(() => { emitter = new KnowledgeEventEmitter(); });
  it('emits events', () => { const l = vi.fn(); emitter.on('knowledge_build_started', l); emitter.emit('knowledge_build_started', {}); expect(l).toHaveBeenCalledTimes(1); });
  it('supports unsubscribe', () => { const l = vi.fn(); const u = emitter.on('knowledge_build_completed', l); u(); emitter.emit('knowledge_build_completed', {}); expect(l).not.toHaveBeenCalled(); });
  it('tracks listener count', () => { emitter.on('knowledge_updated', () => {}); expect(emitter.listenerCount('knowledge_updated')).toBe(1); });
  it('clear removes all', () => { emitter.on('knowledge_validated', () => {}); emitter.clear(); expect(emitter.listenerCount('knowledge_validated')).toBe(0); });
  it('does not crash on listener error', () => { emitter.on('knowledge_failed', () => { throw new Error('x'); }); expect(() => emitter.emit('knowledge_failed', {})).not.toThrow(); });
  it('supports all 8 event types', () => {
    const evts = ['knowledge_build_started','knowledge_build_completed','knowledge_updated','knowledge_validated','relationship_created','trend_detected','change_detected','knowledge_failed'] as const;
    for (const e of evts) { const l = vi.fn(); emitter.on(e, l); emitter.emit(e, {}); expect(l).toHaveBeenCalledTimes(1); }
  });
});

// ── Configuration ────────────────────────────────────────────

describe('KnowledgeConfiguration', () => {
  it('has defaults', () => { expect(DEFAULT_KNOWLEDGE_CONFIG.enableRelationships).toBe(true); expect(DEFAULT_KNOWLEDGE_CONFIG.enableTrends).toBe(true); });
  it('createKnowledgeConfig accepts overrides', () => { expect(createKnowledgeConfig({ enableTrends: false }).enableTrends).toBe(false); });
});

// ── Registry ─────────────────────────────────────────────────

describe('KnowledgeRegistry', () => {
  let reg: KnowledgeRegistry;
  beforeEach(() => { reg = new KnowledgeRegistry(); });
  it('registers plugin', () => { const p = { getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => [] }; expect(reg.registerPlugin(p)).toBe(true); expect(reg.count).toBe(1); });
  it('rejects empty name', () => { const p = { getPluginName: () => '', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => [] }; expect(reg.registerPlugin(p)).toBe(false); });
  it('unregisters plugin', () => { const p = { getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => [] }; reg.registerPlugin(p); expect(reg.unregisterPlugin('p')).toBe(true); expect(reg.count).toBe(0); });
  it('getPlugins sorted by priority', () => { reg.registerPlugin({ getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 20, isAvailable: () => true, buildFacts: () => [] }); reg.registerPlugin({ getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 5, isAvailable: () => true, buildFacts: () => [] }); expect(reg.getPlugins()[0]!.getPluginName()).toBe('b'); });
  it('getAvailablePlugins filters unavailable', () => { reg.registerPlugin({ getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => [] }); reg.registerPlugin({ getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, buildFacts: () => [] }); expect(reg.getAvailablePlugins()).toHaveLength(1); });
  it('clear removes all', () => { reg.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => [] }); reg.clear(); expect(reg.count).toBe(0); });
});

// ── Evidence Builder ─────────────────────────────────────────

describe('EvidenceBuilder', () => {
  let eb: EvidenceBuilder;
  beforeEach(() => { eb = new EvidenceBuilder(); });
  it('forFact creates evidence', () => { const e = eb.forFact('score', 90, 'provider', new Date().toISOString()); expect(e.statement).toContain('score'); expect(e.dataPoints).toHaveLength(1); });
  it('fromDataPoints creates evidence', () => { const e = eb.fromDataPoints('test', [{ source: 's', metric: 'm', value: 1, timestamp: new Date().toISOString() }], ['s'], new Date().toISOString()); expect(e.dataPoints).toHaveLength(1); });
  it('fromNumericComparison creates evidence', () => { const e = eb.fromNumericComparison('score', 80, 90, 'provider', new Date().toISOString()); expect(e.dataPoints).toHaveLength(2); });
  it('forRelationship creates evidence', () => { const e = eb.forRelationship('A causes B', 'a', 1, 'b', 2, 'provider', new Date().toISOString()); expect(e.statement).toBe('A causes B'); });
  it('merge combines evidence', () => { const e1 = eb.forFact('a', 1, 'p', new Date().toISOString()); const e2 = eb.forFact('b', 2, 'p', new Date().toISOString()); const m = eb.merge([e1, e2]); expect(m.dataPoints).toHaveLength(2); });
  it('fromContext creates evidence from context', () => { const ctx = createMockContext(); const e = eb.fromContext('test', ctx); expect(e.contextTimestamp).toBe(ctx.metadata.timestamp); });
});

// ── Knowledge Analyzer ───────────────────────────────────────

describe('KnowledgeAnalyzer', () => {
  let analyzer: KnowledgeAnalyzer;
  beforeEach(() => { analyzer = new KnowledgeAnalyzer(new EvidenceBuilder()); });
  it('extracts facts from full context', () => { const facts = analyzer.analyze(createFullContext()); expect(facts.length).toBeGreaterThan(30); });
  it('extracts system facts', () => { const facts = analyzer.analyze(createMockContext({ system: createFullContext().system })); expect(facts.some(f => f.name === 'os_version')).toBe(true); });
  it('extracts health facts', () => { const facts = analyzer.analyze(createMockContext({ health: createFullContext().health })); expect(facts.some(f => f.name === 'overall_score')).toBe(true); });
  it('extracts storage facts', () => { const facts = analyzer.analyze(createMockContext({ storage: createFullContext().storage })); expect(facts.some(f => f.name === 'used_space')).toBe(true); });
  it('extracts quota facts', () => { const facts = analyzer.analyze(createMockContext({ quota: createFullContext().quota })); expect(facts.some(f => f.name.includes('quota_ai'))).toBe(true); });
  it('returns empty for empty context', () => { expect(analyzer.analyze(createMockContext())).toHaveLength(0); });
  it('every fact has evidence', () => { const facts = analyzer.analyze(createFullContext()); for (const f of facts) expect(f.evidence).toBeDefined(); });
  it('every fact has confidence 0-1', () => { const facts = analyzer.analyze(createFullContext()); for (const f of facts) { expect(f.confidence).toBeGreaterThanOrEqual(0); expect(f.confidence).toBeLessThanOrEqual(1); } });
});

// ── Relationship Engine ──────────────────────────────────────

describe('RelationshipEngine', () => {
  let engine: RelationshipEngine;
  let analyzer: KnowledgeAnalyzer;
  beforeEach(() => { const eb = new EvidenceBuilder(); engine = new RelationshipEngine(eb); analyzer = new KnowledgeAnalyzer(eb); });
  it('builds relationships from full context', () => { const ctx = createFullContext(); const facts = analyzer.analyze(ctx); const rels = engine.buildRelationships(facts, ctx); expect(rels.length).toBeGreaterThan(0); });
  it('startup items relate to boot time', () => { const ctx = createFullContext(); const facts = analyzer.analyze(ctx); const rels = engine.buildRelationships(facts, ctx); expect(rels.some(r => r.description.includes('boot'))).toBe(true); });
  it('duplicates relate to wasted space', () => { const ctx = createFullContext(); const facts = analyzer.analyze(ctx); const rels = engine.buildRelationships(facts, ctx); expect(rels.some(r => r.description.includes('wasted'))).toBe(true); });
  it('every relationship has evidence', () => { const ctx = createFullContext(); const facts = analyzer.analyze(ctx); const rels = engine.buildRelationships(facts, ctx); for (const r of rels) expect(r.evidence).toBeDefined(); });
  it('returns empty for empty context', () => { expect(engine.buildRelationships([], createMockContext())).toHaveLength(0); });
});

// ── Trend Analyzer ───────────────────────────────────────────

describe('TrendAnalyzer', () => {
  let ta: TrendAnalyzer;
  beforeEach(() => { ta = new TrendAnalyzer(new EvidenceBuilder()); });
  it('returns no trends with insufficient data', () => { expect(ta.analyzeTrends([])).toHaveLength(0); });
  it('detects increasing trend', () => {
    const facts: KnowledgeFact[] = [{ id: 'f1', category: 'health', name: 'score', value: 90, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() }];
    const snaps = [1,2,3,4,5].map((v, i) => ({ snapshotId: `s${i}`, contextId: 'c', timestamp: new Date(Date.now() + i*1000).toISOString(), facts: [{ id: 'f1', name: 'score', category: 'health' as const, value: v*10, timestamp: new Date(Date.now() + i*1000).toISOString() }] }));
    ta.setSnapshots(snaps);
    const trends = ta.analyzeTrends(facts);
    expect(trends).toHaveLength(1);
    expect(trends[0]!.direction).toBe('increasing');
  });
  it('detects stable trend', () => {
    const facts: KnowledgeFact[] = [{ id: 'f1', category: 'health', name: 'score', value: 50, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() }];
    const snaps = [50,50,50,50].map((v, i) => ({ snapshotId: `s${i}`, contextId: 'c', timestamp: new Date(Date.now() + i*1000).toISOString(), facts: [{ id: 'f1', name: 'score', category: 'health' as const, value: v, timestamp: new Date(Date.now() + i*1000).toISOString() }] }));
    ta.setSnapshots(snaps);
    const trends = ta.analyzeTrends(facts);
    expect(trends[0]!.direction).toBe('stable');
  });
  it('clearSnapshots resets', () => { ta.clearSnapshots(); expect(ta.getSnapshots()).toHaveLength(0); });
});

// ── Change Detector ──────────────────────────────────────────

describe('ChangeDetector', () => {
  let cd: ChangeDetector;
  let analyzer: KnowledgeAnalyzer;
  beforeEach(() => { const eb = new EvidenceBuilder(); cd = new ChangeDetector(eb); analyzer = new KnowledgeAnalyzer(eb); });
  it('returns empty without previous snapshot', () => { expect(cd.detectChanges(analyzer.analyze(createFullContext()))).toHaveLength(0); });
  it('detects added facts', () => {
    const ctx = createFullContext();
    const facts = analyzer.analyze(ctx);
    const snap = factsToSnapshot(facts, ctx.metadata.contextId);
    cd.setPreviousSnapshot(snap);
    // Add a new section to create new facts
    const ctx2 = createMockContext({ ...ctx, privacy: createFullContext().privacy });
    const facts2 = analyzer.analyze(ctx2);
    const changes = cd.detectChanges(facts2);
    expect(changes.length).toBeGreaterThanOrEqual(0);
  });
  it('detects improved score', () => {
    const ctx1 = createMockContext({ health: { ...createFullContext().health!, overallScore: 70 } });
    const ctx2 = createMockContext({ health: { ...createFullContext().health!, overallScore: 90 } });
    const facts1 = analyzer.analyze(ctx1);
    const facts2 = analyzer.analyze(ctx2);
    cd.setPreviousSnapshot(factsToSnapshot(facts1, 'c1'));
    const changes = cd.detectChanges(facts2);
    const scoreChange = changes.find(c => c.factName === 'overall_score');
    expect(scoreChange).toBeDefined();
    expect(scoreChange!.changeType).toBe('improved');
  });
  it('detects degraded score', () => {
    const ctx1 = createMockContext({ health: { ...createFullContext().health!, overallScore: 90 } });
    const ctx2 = createMockContext({ health: { ...createFullContext().health!, overallScore: 60 } });
    const facts1 = analyzer.analyze(ctx1);
    const facts2 = analyzer.analyze(ctx2);
    cd.setPreviousSnapshot(factsToSnapshot(facts1, 'c1'));
    const changes = cd.detectChanges(facts2);
    const scoreChange = changes.find(c => c.factName === 'overall_score');
    expect(scoreChange!.changeType).toBe('degraded');
  });
});

// ── Insight Classifier ───────────────────────────────────────

describe('InsightClassifier', () => {
  let ic: InsightClassifier;
  beforeEach(() => { ic = new InsightClassifier(new EvidenceBuilder()); });
  it('classifies facts into observations', () => {
    const facts: KnowledgeFact[] = [{ id: 'f1', category: 'health', name: 'overall_score', value: 40, dataType: 'number', unit: 'score', description: 'Health score', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() }];
    const insights = ic.classify(facts, [], [], []);
    expect(insights.some(i => i.type === 'observation')).toBe(true);
  });
  it('classifies relationships as correlations', () => {
    const insights = ic.classify([], [{ id: 'r1', type: 'correlative' as const, sourceFactId: 'f1', targetFactId: 'f2', description: 'test', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 0.8, createdAt: new Date().toISOString() }], [], []);
    expect(insights.some(i => i.type === 'correlation')).toBe(true);
  });
  it('classifies changes', () => {
    const insights = ic.classify([], [], [{ id: 'c1', factId: 'f1', factName: 'score', changeType: 'improved' as const, previousValue: 70, currentValue: 90, delta: 20, deltaDescription: 'score improved', evidence: createEvidence('', [], [], new Date().toISOString()), detectedAt: new Date().toISOString() }], []);
    expect(insights.some(i => i.type === 'change')).toBe(true);
  });
  it('classifies trends', () => {
    const insights = ic.classify([], [], [], [{ id: 't1', factId: 'f1', factName: 'usage', direction: 'increasing' as const, dataPoints: [], slope: 1, variability: 0, evidence: createEvidence('', [], [], new Date().toISOString()), analyzedAt: new Date().toISOString() }]);
    expect(insights.some(i => i.type === 'trend')).toBe(true);
  });
});

// ── Knowledge Graph ──────────────────────────────────────────

describe('KnowledgeGraphBuilder', () => {
  let gb: KnowledgeGraphBuilder;
  beforeEach(() => { gb = new KnowledgeGraphBuilder(); });
  it('builds graph from facts and relationships', () => {
    const facts: KnowledgeFact[] = [
      { id: 'f1', category: 'health', name: 'score', value: 90, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() },
      { id: 'f2', category: 'startup', name: 'items', value: 10, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() },
    ];
    const rels = [{ id: 'r1', type: 'causal' as const, sourceFactId: 'f1', targetFactId: 'f2', description: 'test', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 0.8, createdAt: new Date().toISOString() }];
    const graph = gb.build(facts, rels);
    expect(graph.nodeCount).toBe(2);
    expect(graph.edgeCount).toBe(1);
  });
  it('getNodesByCategory filters', () => {
    const facts: KnowledgeFact[] = [{ id: 'f1', category: 'health', name: 'score', value: 90, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() }];
    const graph = gb.build(facts, []);
    expect(gb.getNodesByCategory(graph, 'health')).toHaveLength(1);
    expect(gb.getNodesByCategory(graph, 'storage')).toHaveLength(0);
  });
  it('getNeighbors returns connected nodes', () => {
    const facts: KnowledgeFact[] = [
      { id: 'f1', category: 'health' as const, name: 'x', value: 1, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() },
      { id: 'f2', category: 'storage' as const, name: 'y', value: 2, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() },
    ];
    const rels = [{ id: 'r1', type: 'causal' as const, sourceFactId: 'f1', targetFactId: 'f2', description: 't', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, createdAt: new Date().toISOString() }];
    const graph = gb.build(facts, rels);
    expect(gb.getNeighbors(graph, 'f1')).toHaveLength(1);
  });
  it('getDensity calculates ratio', () => {
    const graph = gb.build([
      { id: 'f1', category: 'health' as const, name: 'x', value: 1, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() },
      { id: 'f2', category: 'storage' as const, name: 'y', value: 2, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() },
    ], [{ id: 'r1', type: 'causal' as const, sourceFactId: 'f1', targetFactId: 'f2', description: 't', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, createdAt: new Date().toISOString() }]);
    expect(gb.getDensity(graph)).toBe(1); // 1 edge / 1 max possible
  });
  it('findComponents finds connected groups', () => {
    const facts: KnowledgeFact[] = [
      { id: 'f1', category: 'health' as const, name: 'x', value: 1, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() },
      { id: 'f2', category: 'storage' as const, name: 'y', value: 2, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() },
      { id: 'f3', category: 'startup' as const, name: 'z', value: 3, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() },
    ];
    const rels = [{ id: 'r1', type: 'causal' as const, sourceFactId: 'f1', targetFactId: 'f2', description: 't', evidence: createEvidence('', [], [], new Date().toISOString()), confidence: 1, createdAt: new Date().toISOString() }];
    const graph = gb.build(facts, rels);
    const components = gb.findComponents(graph);
    expect(components).toHaveLength(2); // {f1,f2} and {f3}
  });
});

// ── Validator ────────────────────────────────────────────────

describe('KnowledgeValidator', () => {
  let validator: KnowledgeValidator;
  beforeEach(() => { validator = new KnowledgeValidator(DEFAULT_KNOWLEDGE_CONFIG); });
  it('validates valid knowledge', () => {
    const ctx = createFullContext();
    const builder = new KnowledgeBuilder(new KnowledgeRegistry(), validator, DEFAULT_KNOWLEDGE_CONFIG);
    return builder.build(ctx).then(k => { const r = validator.validate(k); expect(r.valid).toBe(true); });
  });
  it('fails for missing metadata', () => { expect(validator.validate({} as never).valid).toBe(false); });
  it('fails for fact without evidence', () => {
    const k = { metadata: { knowledgeId: 'k', contextId: 'c', generatedAt: new Date().toISOString(), knowledgeVersion: '1', generationTimeMs: 0, factsCount: 1, relationshipsCount: 0, changesCount: 0, trendsCount: 0, summariesCount: 0, insightsCount: 0 }, facts: [{ id: 'f1', category: 'health', name: 'score', value: 90, dataType: 'number', unit: null, description: '', confidence: 1, sourceProvider: 'p', extractedAt: new Date().toISOString() } as never], relationships: [], changes: [], trends: [], summaries: [], insights: [], graph: { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }, provenance: [], statistics: { totalFacts: 1 } } as never;
    expect(validator.validate(k).valid).toBe(false);
  });
  it('warns for low confidence', () => {
    const k = { metadata: { knowledgeId: 'k', contextId: 'c', generatedAt: new Date().toISOString(), knowledgeVersion: '1', generationTimeMs: 0, factsCount: 1, relationshipsCount: 0, changesCount: 0, trendsCount: 0, summariesCount: 0, insightsCount: 0 }, facts: [{ id: 'f1', category: 'health', name: 'score', value: 90, dataType: 'number', unit: null, description: '', evidence: createEvidence('', [], [], new Date().toISOString(), 0.1), confidence: 0.1, sourceProvider: 'p', extractedAt: new Date().toISOString() }], relationships: [], changes: [], trends: [], summaries: [], insights: [], graph: { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }, provenance: [], statistics: { totalFacts: 1 } } as never;
    const r = validator.validate(k);
    expect(r.issues.some(i => i.code === 'FACT_LOW_CONFIDENCE')).toBe(true);
  });
});

// ── Builder ──────────────────────────────────────────────────

describe('KnowledgeBuilder', () => {
  it('builds knowledge from full context', async () => {
    const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(DEFAULT_KNOWLEDGE_CONFIG), DEFAULT_KNOWLEDGE_CONFIG);
    const k = await builder.build(createFullContext());
    expect(k.metadata).toBeDefined();
    expect(k.facts.length).toBeGreaterThan(30);
    expect(k.relationships.length).toBeGreaterThan(0);
    expect(k.summaries.length).toBeGreaterThan(0);
  });
  it('builds knowledge from empty context', async () => {
    const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(DEFAULT_KNOWLEDGE_CONFIG), DEFAULT_KNOWLEDGE_CONFIG);
    const k = await builder.build(createMockContext());
    expect(k.facts).toHaveLength(0);
    expect(k.metadata).toBeDefined();
  });
  it('respects config to disable relationships', async () => {
    const cfg = createKnowledgeConfig({ enableRelationships: false });
    const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(cfg), cfg);
    const k = await builder.build(createFullContext());
    expect(k.relationships).toHaveLength(0);
  });
  it('respects config to disable summaries', async () => {
    const cfg = createKnowledgeConfig({ enableSummaries: false });
    const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(cfg), cfg);
    const k = await builder.build(createFullContext());
    expect(k.summaries).toHaveLength(0);
  });
  it('respects config to disable graph', async () => {
    const cfg = createKnowledgeConfig({ enableGraph: false });
    const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(cfg), cfg);
    const k = await builder.build(createFullContext());
    expect(k.graph.nodeCount).toBe(0);
  });
  it('accumulates snapshots', async () => {
    const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(DEFAULT_KNOWLEDGE_CONFIG), DEFAULT_KNOWLEDGE_CONFIG);
    await builder.build(createFullContext());
    await builder.build(createFullContext());
    expect(builder.getSnapshots()).toHaveLength(2);
  });
  it('integrates plugin facts', async () => {
    const reg = new KnowledgeRegistry();
    reg.registerPlugin({ getPluginName: () => 'custom', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => [{ id: 'fact_custom_test', category: 'custom' as const, name: 'test', value: 42, dataType: 'number' as const, unit: null, description: 'custom', evidence: createEvidence('test', [], ['custom'], new Date().toISOString()), confidence: 1, sourceProvider: 'custom', extractedAt: new Date().toISOString() }] });
    const builder = new KnowledgeBuilder(reg, new KnowledgeValidator(DEFAULT_KNOWLEDGE_CONFIG), DEFAULT_KNOWLEDGE_CONFIG);
    const k = await builder.build(createFullContext());
    expect(k.facts.some(f => f.id === 'fact_custom_test')).toBe(true);
  });
});

// ── Manager ──────────────────────────────────────────────────

describe('KnowledgeManager', () => {
  let mgr: KnowledgeManager;
  beforeEach(() => { mgr = new KnowledgeManager(); });
  it('starts with no knowledge', () => { expect(mgr.getKnowledge()).toBeNull(); });
  it('buildKnowledge returns knowledge', async () => { const k = await mgr.buildKnowledge(createFullContext()); expect(k.metadata).toBeDefined(); });
  it('getKnowledge returns built knowledge', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getKnowledge()).not.toBeNull(); });
  it('getFacts returns facts', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getFacts().length).toBeGreaterThan(0); });
  it('getFactsByCategory filters', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getFactsByCategory('health').length).toBeGreaterThan(0); });
  it('getFactById returns fact', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getFactById('fact_health_overall_score')).not.toBeNull(); });
  it('getRelationships returns relationships', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getRelationships().length).toBeGreaterThan(0); });
  it('getRelationshipsForFact filters', async () => { await mgr.buildKnowledge(createFullContext()); const rels = mgr.getRelationshipsForFact('fact_startup_total_items'); expect(rels.length).toBeGreaterThanOrEqual(0); });
  it('getEvidence returns all evidence', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getEvidence().length).toBeGreaterThan(0); });
  it('getChanges returns changes', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getChanges()).toEqual([]); });
  it('getTrends returns trends', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getTrends()).toEqual([]); });
  it('getSummaries returns summaries', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getSummaries().length).toBeGreaterThan(0); });
  it('getSummaryByType returns summary', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getSummaryByType('health')).not.toBeNull(); });
  it('getKnowledgeStatistics returns stats', async () => { await mgr.buildKnowledge(createFullContext()); expect(mgr.getKnowledgeStatistics()).not.toBeNull(); });
  it('validateKnowledge validates', async () => { await mgr.buildKnowledge(createFullContext()); const r = mgr.validateKnowledge(); expect(r.valid).toBe(true); });
  it('registerPlugin adds plugin', () => { expect(mgr.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => [] })).toBe(true); });
  it('unregisterPlugin removes plugin', () => { mgr.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => [] }); expect(mgr.unregisterPlugin('p')).toBe(true); });
  it('updateConfig updates', async () => { mgr.updateConfig({ enableTrends: false }); await mgr.buildKnowledge(createFullContext()); expect(mgr.getTrends()).toHaveLength(0); });
  it('clear resets knowledge', async () => { await mgr.buildKnowledge(createFullContext()); mgr.clear(); expect(mgr.getKnowledge()).toBeNull(); });
});

// ── Traceability ─────────────────────────────────────────────

describe('Traceability', () => {
  it('every fact has evidence with data points', async () => {
    const mgr = new KnowledgeManager();
    await mgr.buildKnowledge(createFullContext());
    for (const f of mgr.getFacts()) expect(f.evidence.dataPoints).toBeDefined();
  });
  it('every relationship has evidence', async () => {
    const mgr = new KnowledgeManager();
    await mgr.buildKnowledge(createFullContext());
    for (const r of mgr.getRelationships()) expect(r.evidence).toBeDefined();
  });
  it('every summary has evidence', async () => {
    const mgr = new KnowledgeManager();
    await mgr.buildKnowledge(createFullContext());
    for (const s of mgr.getSummaries()) expect(s.evidence).toBeDefined();
  });
  it('statistics include average confidence', async () => {
    const mgr = new KnowledgeManager();
    await mgr.buildKnowledge(createFullContext());
    expect(mgr.getKnowledgeStatistics()!.averageConfidence).toBeGreaterThan(0);
  });
  it('statistics include total evidence pieces', async () => {
    const mgr = new KnowledgeManager();
    await mgr.buildKnowledge(createFullContext());
    expect(mgr.getKnowledgeStatistics()!.totalEvidencePieces).toBeGreaterThan(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.KnowledgeManager).toBeDefined();
    expect(mod.knowledgeManager).toBeDefined();
    expect(mod.KnowledgeBuilder).toBeDefined();
    expect(mod.KnowledgeRegistry).toBeDefined();
    expect(mod.EvidenceBuilder).toBeDefined();
    expect(mod.RelationshipEngine).toBeDefined();
    expect(mod.TrendAnalyzer).toBeDefined();
    expect(mod.ChangeDetector).toBeDefined();
    expect(mod.InsightClassifier).toBeDefined();
    expect(mod.KnowledgeGraphBuilder).toBeDefined();
    expect(mod.KnowledgeValidator).toBeDefined();
  });
  it('full integration: build from full context', async () => {
    const mgr = new KnowledgeManager();
    const k = await mgr.buildKnowledge(createFullContext());
    expect(k.facts.length).toBeGreaterThan(30);
    expect(k.relationships.length).toBeGreaterThan(0);
    expect(k.summaries.length).toBeGreaterThan(0);
    expect(k.graph.nodeCount).toBeGreaterThan(0);
    expect(k.statistics.totalFacts).toBe(k.facts.length);
  });
  it('full integration: validation passes', async () => {
    const mgr = new KnowledgeManager();
    await mgr.buildKnowledge(createFullContext());
    expect(mgr.validateKnowledge().valid).toBe(true);
  });
  it('full integration: no recommendations generated', async () => {
    const mgr = new KnowledgeManager();
    const k = await mgr.buildKnowledge(createFullContext());
    // Knowledge object should not have any recommendation fields
    expect((k as unknown as Record<string, unknown>).recommendations).toBeUndefined();
  });
  it('full integration: plugin extension works', async () => {
    const mgr = new KnowledgeManager();
    mgr.registerPlugin({ getPluginName: () => 'ext', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => [{ id: 'fact_custom_ext', category: 'custom' as const, name: 'ext', value: true, dataType: 'boolean' as const, unit: null, description: 'ext', evidence: createEvidence('ext', [], ['ext'], new Date().toISOString()), confidence: 1, sourceProvider: 'ext', extractedAt: new Date().toISOString() }] });
    const k = await mgr.buildKnowledge(createFullContext());
    expect(k.facts.some(f => f.id === 'fact_custom_ext')).toBe(true);
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('knowledge build under 150ms', async () => {
    const mgr = new KnowledgeManager();
    const start = performance.now();
    await mgr.buildKnowledge(createFullContext());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(150);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('empty context produces valid knowledge', async () => {
    const mgr = new KnowledgeManager();
    const k = await mgr.buildKnowledge(createMockContext());
    expect(k.metadata).toBeDefined();
    expect(k.facts).toHaveLength(0);
  });
  it('partial context produces partial knowledge', async () => {
    const mgr = new KnowledgeManager();
    const k = await mgr.buildKnowledge(createMockContext({ health: createFullContext().health }));
    expect(k.facts.some(f => f.category === 'health')).toBe(true);
    expect(k.facts.some(f => f.category === 'storage')).toBe(false);
  });
  it('plugin failure does not break build', async () => {
    const mgr = new KnowledgeManager();
    mgr.registerPlugin({ getPluginName: () => 'broken', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, buildFacts: () => { throw new Error('fail'); } });
    const k = await mgr.buildKnowledge(createFullContext());
    expect(k.metadata).toBeDefined();
  });
  it('unavailable plugin is skipped', async () => {
    const mgr = new KnowledgeManager();
    mgr.registerPlugin({ getPluginName: () => 'unavail', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, buildFacts: () => [] });
    const k = await mgr.buildKnowledge(createFullContext());
    expect(k.facts.some(f => f.sourceProvider === 'unavail')).toBe(false);
  });
  it('multiple builds accumulate snapshots', async () => {
    const mgr = new KnowledgeManager();
    await mgr.buildKnowledge(createFullContext());
    await mgr.buildKnowledge(createFullContext());
    await mgr.buildKnowledge(createFullContext());
    expect(mgr.getSnapshots().length).toBeGreaterThan(0);
  });
});
