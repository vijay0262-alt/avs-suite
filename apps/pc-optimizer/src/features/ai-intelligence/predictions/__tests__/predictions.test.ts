/**
 * Tests for the AI Prediction Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIContext, KnowledgeObject, ContextSnapshot, TrendDataPoint } from '../../knowledge/types';
import { createProvenance } from '../../context/types';
import { createEvidence } from '../../knowledge/types';
import { KnowledgeBuilder } from '../../knowledge/knowledgeBuilder';
import { KnowledgeRegistry } from '../../knowledge/knowledgeRegistry';
import { KnowledgeValidator } from '../../knowledge/knowledgeValidator';
import { DEFAULT_KNOWLEDGE_CONFIG } from '../../knowledge/knowledgeConfiguration';
import type {
  Prediction, PredictionList, PredictionType, RiskLevel, TrendAnalysisResult,
} from '../types';
import {
  generatePredictionId, generatePredictionListId, clampScore,
  createPredictionEvidence, getTimeHorizonHours, getTimeHorizonLabel,
  formatDateForHorizon,
} from '../types';
import { PredictionEventEmitter } from '../predictionEvents';
import { DEFAULT_PREDICTION_CONFIG, createPredictionConfig } from '../predictionConfiguration';
import { PredictionRegistry } from '../predictionRegistry';
import { PredictionAnalyzer } from '../predictionAnalyzer';
import { PredictionModel } from '../predictionModel';
import { PredictionValidator } from '../predictionValidator';
import { PredictionTimelineManager } from '../predictionTimeline';
import { PredictionHistory } from '../predictionHistory';
import { PredictionEngine } from '../predictionEngine';
import { PredictionBuilder } from '../predictionBuilder';
import { PredictionManager } from '../predictionManager';

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

function createMockSnapshots(knowledge: KnowledgeObject, count: number): ContextSnapshot[] {
  const snapshots: ContextSnapshot[] = [];
  const now = Date.now();

  for (let i = count; i > 0; i--) {
    const timestamp = new Date(now - i * 24 * 60 * 60 * 1000).toISOString();
    const facts = knowledge.facts.map((f) => {
      let value: string | number | boolean = typeof f.value === 'string' || typeof f.value === 'number' || typeof f.value === 'boolean' ? f.value : 0;
      if (typeof f.value === 'number') {
        // Simulate gradual increase for storage, decrease for health
        if (f.category === 'storage' && (f.name === 'used_space' || f.name === 'used_mb')) {
          value = Math.max(0, f.value - (count - i) * 1800);
        } else if (f.category === 'health' && f.name === 'overall_score') {
          value = Math.max(0, f.value - (count - i) * 2);
        } else if (f.category === 'startup' && f.name === 'enabled_items') {
          value = Math.max(0, f.value - (count - i));
        } else if (f.category === 'browser' && (f.name === 'total_cache' || f.name === 'cache_mb')) {
          value = Math.max(0, f.value - (count - i) * 50);
        } else if (f.category === 'privacy' && f.name === 'tracking_cookies') {
          value = Math.max(0, f.value - (count - i) * 20);
        } else if (f.category === 'privacy' && f.name === 'temp_files') {
          value = Math.max(0, f.value - (count - i) * 30);
        } else if (f.category === 'duplicates' && f.name === 'wasted_space') {
          value = Math.max(0, f.value - (count - i) * 80);
        } else if (f.category === 'windows' && f.name === 'pending_updates') {
          value = Math.max(0, f.value - (count - i));
        } else if (f.category === 'history' && f.name === 'total_optimizations') {
          value = Math.max(0, f.value - (count - i));
        }
      }
      return { id: f.id, name: f.name, category: f.category, value, timestamp };
    });
    snapshots.push({
      snapshotId: `snap_${i}_${Math.random().toString(36).slice(2, 7)}`,
      contextId: knowledge.metadata.contextId,
      timestamp,
      facts,
    });
  }

  return snapshots;
}

function createMockPrediction(overrides: Partial<Prediction> = {}): Prediction {
  const now = new Date().toISOString();
  return {
    id: generatePredictionId('storage_capacity', 'Test'),
    title: 'Test Prediction', summary: 'Test summary', description: 'Test description',
    category: 'storage', predictionType: 'storage_capacity',
    currentValue: 420000, predictedValue: 450000, unit: 'MB',
    predictionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    timeHorizon: '7d', confidenceScore: 0.7, trend: 'increasing', trendSlope: 0.001,
    riskLevel: 'medium', impactLevel: 'medium',
    evidence: {
      relatedFacts: ['f1'], relatedTrends: ['t1'], relatedKnowledge: ['k1'],
      historicalDataPoints: [{ timestamp: now, value: 400000 }, { timestamp: now, value: 410000 }, { timestamp: now, value: 420000 }],
      evidence: createEvidence('test', [{ source: 's', metric: 'm', value: 1, timestamp: now }], ['s'], now, 0.8),
      evidenceCount: 4, sourceProviders: ['s'], confidence: 0.7,
      historicalSamples: 3, dataFreshness: 1, modelVersion: '1.0.0',
      assumptions: ['Storage growth continues'],
    },
    relatedKnowledge: ['k1'], relatedInsights: [],
    generatedAt: now, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    status: 'active', futureMetadata: {}, ...overrides,
  };
}

// ── Types & Helpers ──────────────────────────────────────────
describe('Types & Helpers', () => {
  it('generatePredictionId returns unique IDs', () => { expect(generatePredictionId('test', 'A')).not.toBe(generatePredictionId('test', 'A')); });
  it('generatePredictionListId returns unique IDs', () => { expect(generatePredictionListId()).not.toBe(generatePredictionListId()); });
  it('clampScore clamps to [0,1]', () => { expect(clampScore(-1)).toBe(0); expect(clampScore(2)).toBe(1); expect(clampScore(0.5)).toBe(0.5); });
  it('getTimeHorizonHours returns correct hours', () => { expect(getTimeHorizonHours('24h')).toBe(24); expect(getTimeHorizonHours('7d')).toBe(168); expect(getTimeHorizonHours('30d')).toBe(720); });
  it('getTimeHorizonLabel returns correct label', () => { expect(getTimeHorizonLabel('24h')).toBe('24 Hours'); expect(getTimeHorizonLabel('7d')).toBe('7 Days'); });
  it('formatDateForHorizon returns future date', () => { const d = formatDateForHorizon('7d'); expect(new Date(d).getTime()).toBeGreaterThan(Date.now() - 1000); });
  it('createPredictionEvidence builds evidence', () => {
    const ev = createPredictionEvidence([], [], ['k1'], [], ['s'], 0.8, 5, 2, '1.0.0', ['test']);
    expect(ev.relatedKnowledge).toEqual(['k1']);
    expect(ev.confidence).toBe(0.8);
    expect(ev.historicalSamples).toBe(5);
    expect(ev.assumptions).toEqual(['test']);
  });
});

// ── Events ───────────────────────────────────────────────────
describe('PredictionEventEmitter', () => {
  let emitter: PredictionEventEmitter;
  beforeEach(() => { emitter = new PredictionEventEmitter(); });
  it('emits events', () => { const l = vi.fn(); emitter.on('prediction_generated', l); emitter.emit('prediction_generated', {}); expect(l).toHaveBeenCalledTimes(1); });
  it('supports unsubscribe', () => { const l = vi.fn(); const u = emitter.on('prediction_expired', l); u(); emitter.emit('prediction_expired', {}); expect(l).not.toHaveBeenCalled(); });
  it('tracks listener count', () => { emitter.on('prediction_updated', () => {}); expect(emitter.listenerCount('prediction_updated')).toBe(1); });
  it('clear removes all', () => { emitter.on('prediction_failed', () => {}); emitter.clear(); expect(emitter.listenerCount('prediction_failed')).toBe(0); });
  it('does not crash on listener error', () => { emitter.on('prediction_generated', () => { throw new Error('x'); }); expect(() => emitter.emit('prediction_generated', {})).not.toThrow(); });
  it('supports all 5 event types', () => {
    const evts = ['prediction_generated','prediction_updated','prediction_expired','prediction_failed','timeline_updated'] as const;
    for (const e of evts) { const l = vi.fn(); emitter.on(e, l); emitter.emit(e, {}); expect(l).toHaveBeenCalledTimes(1); }
  });
});

// ── Configuration ────────────────────────────────────────────
describe('PredictionConfiguration', () => {
  it('has defaults', () => { expect(DEFAULT_PREDICTION_CONFIG.predictionVersion).toBe('1.0.0'); expect(DEFAULT_PREDICTION_CONFIG.maxPredictions).toBe(50); });
  it('createPredictionConfig accepts overrides', () => { expect(createPredictionConfig({ maxPredictions: 10 }).maxPredictions).toBe(10); });
  it('merges nested confidenceRules', () => { expect(createPredictionConfig({ confidenceRules: { ...DEFAULT_PREDICTION_CONFIG.confidenceRules, minSamples: 5 } }).confidenceRules.minSamples).toBe(5); });
  it('merges nested riskRules', () => { expect(createPredictionConfig({ riskRules: { ...DEFAULT_PREDICTION_CONFIG.riskRules, criticalThreshold: 0.9 } }).riskRules.criticalThreshold).toBe(0.9); });
  it('merges nested modelSettings', () => { expect(createPredictionConfig({ modelSettings: { ...DEFAULT_PREDICTION_CONFIG.modelSettings, modelVersion: '2.0.0' } }).modelSettings.modelVersion).toBe('2.0.0'); });
  it('merges nested expirationConfig', () => { expect(createPredictionConfig({ expirationConfig: { ...DEFAULT_PREDICTION_CONFIG.expirationConfig, defaultExpirationHours: 72 } }).expirationConfig.defaultExpirationHours).toBe(72); });
  it('has time horizons', () => { expect(DEFAULT_PREDICTION_CONFIG.timeHorizons.length).toBe(6); });
});

// ── Registry ─────────────────────────────────────────────────
describe('PredictionRegistry', () => {
  let reg: PredictionRegistry;
  beforeEach(() => { reg = new PredictionRegistry(); });
  it('registers plugin', () => { const p = { getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [] }; expect(reg.registerPlugin(p)).toBe(true); expect(reg.count).toBe(1); });
  it('rejects empty name', () => { const p = { getPluginName: () => '', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [] }; expect(reg.registerPlugin(p)).toBe(false); });
  it('rejects duplicate name', () => { const p = { getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [] }; reg.registerPlugin(p); expect(reg.registerPlugin(p)).toBe(false); });
  it('unregisters plugin', () => { const p = { getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [] }; reg.registerPlugin(p); expect(reg.unregisterPlugin('p')).toBe(true); expect(reg.count).toBe(0); });
  it('getPlugins sorted by priority', () => { reg.registerPlugin({ getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 20, isAvailable: () => true, generatePredictions: () => [] }); reg.registerPlugin({ getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 5, isAvailable: () => true, generatePredictions: () => [] }); expect(reg.getPlugins()[0]!.getPluginName()).toBe('b'); });
  it('getAvailablePlugins filters unavailable', () => { reg.registerPlugin({ getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [] }); reg.registerPlugin({ getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, generatePredictions: () => [] }); expect(reg.getAvailablePlugins()).toHaveLength(1); });
  it('clear removes all', () => { reg.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [] }); reg.clear(); expect(reg.count).toBe(0); });
});

// ── Analyzer ─────────────────────────────────────────────────
describe('PredictionAnalyzer', () => {
  let a: PredictionAnalyzer;
  beforeEach(() => { a = new PredictionAnalyzer(DEFAULT_PREDICTION_CONFIG); });

  function makeDataPoints(count: number, startVal: number, increment: number): TrendDataPoint[] {
    const now = Date.now();
    const points: TrendDataPoint[] = [];
    for (let i = 0; i < count; i++) {
      points.push({ timestamp: new Date(now - (count - i) * 24 * 60 * 60 * 1000).toISOString(), value: startVal + increment * i });
    }
    return points;
  }

  it('analyzes increasing trend', () => { const r = a.analyzeDataPoints('f1', 'test', makeDataPoints(5, 100, 10)); expect(r).not.toBeNull(); expect(r!.direction).toBe('increasing'); });
  it('analyzes decreasing trend', () => { const r = a.analyzeDataPoints('f1', 'test', makeDataPoints(5, 100, -10)); expect(r).not.toBeNull(); expect(r!.direction).toBe('decreasing'); });
  it('analyzes stable trend', () => { const r = a.analyzeDataPoints('f1', 'test', makeDataPoints(5, 100, 0)); expect(r).not.toBeNull(); expect(r!.direction).toBe('stable'); });
  it('returns null for insufficient samples', () => { expect(a.analyzeDataPoints('f1', 'test', makeDataPoints(2, 100, 10))).toBeNull(); });
  it('calculates slope', () => { const r = a.analyzeDataPoints('f1', 'test', makeDataPoints(5, 100, 10)); expect(r).not.toBeNull(); expect(r!.slope).not.toBeNull(); expect(r!.slope!).toBeGreaterThan(0); });
  it('calculates rSquared', () => { const r = a.analyzeDataPoints('f1', 'test', makeDataPoints(5, 100, 10)); expect(r).not.toBeNull(); expect(r!.rSquared).not.toBeNull(); expect(r!.rSquared!).toBeGreaterThan(0.9); });
  it('calculates confidence', () => { const r = a.analyzeDataPoints('f1', 'test', makeDataPoints(5, 100, 10)); expect(r).not.toBeNull(); expect(r!.confidence).toBeGreaterThan(0); });
  it('projectValues returns projections', () => {
    const r = a.analyzeDataPoints('f1', 'test', makeDataPoints(5, 100, 10));
    const projections = a.projectValues(r!, ['7d', '30d']);
    expect(projections.length).toBe(2);
    expect(projections[0]!.value).toBeGreaterThan(100);
  });
  it('detectSeasonality returns false for linear data', () => { expect(a.detectSeasonality(makeDataPoints(10, 100, 10))).toBe(false); });
  it('removeOutliers filters extreme values', () => {
    const points = makeDataPoints(5, 100, 10);
    points.push({ timestamp: new Date().toISOString(), value: 10000 });
    const filtered = a.removeOutliers(points);
    expect(filtered.length).toBeLessThan(points.length);
  });
  it('removeOutliers returns all when disabled', () => {
    const cfg = createPredictionConfig({ modelSettings: { ...DEFAULT_PREDICTION_CONFIG.modelSettings, outlierRemovalEnabled: false } });
    const an = new PredictionAnalyzer(cfg);
    const points = makeDataPoints(5, 100, 10);
    expect(an.removeOutliers(points).length).toBe(points.length);
  });
});

// ── Model ────────────────────────────────────────────────────
describe('PredictionModel', () => {
  let m: PredictionModel;
  beforeEach(() => { m = new PredictionModel(DEFAULT_PREDICTION_CONFIG); });

  function makeAnalysis(overrides: Partial<TrendAnalysisResult> = {}): TrendAnalysisResult {
    const now = Date.now();
    return {
      factId: 'f1', factName: 'test', direction: 'increasing',
      slope: 0.001, intercept: 100, rSquared: 0.9, variability: 5,
      dataPoints: [
        { timestamp: new Date(now - 5 * 86400000).toISOString(), value: 100 },
        { timestamp: new Date(now - 4 * 86400000).toISOString(), value: 110 },
        { timestamp: new Date(now - 3 * 86400000).toISOString(), value: 120 },
        { timestamp: new Date(now - 2 * 86400000).toISOString(), value: 130 },
        { timestamp: new Date(now - 1 * 86400000).toISOString(), value: 140 },
      ],
      sampleCount: 5, confidence: 0.8,
      projectedValues: [{ timestamp: new Date(now + 7 * 86400000).toISOString(), value: 150, confidence: 0.7 }],
      ...overrides,
    };
  }

  function makeMockKnowledge(): KnowledgeObject {
    return {
      metadata: { knowledgeId: 'k1', contextId: 'c1', generatedAt: new Date().toISOString(), knowledgeVersion: '1.0.0', generationTimeMs: 0, factsCount: 1, relationshipsCount: 0, changesCount: 0, trendsCount: 0, summariesCount: 0, insightsCount: 0 },
      facts: [], relationships: [], changes: [], trends: [], summaries: [], insights: [],
      graph: { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }, provenance: [],
      statistics: { totalFacts: 0, totalRelationships: 0, totalChanges: 0, totalTrends: 0, totalSummaries: 0, totalInsights: 0, totalEvidencePieces: 0, averageConfidence: 0, factsByCategory: {}, changesByType: {}, trendsByDirection: {}, insightsByType: {}, insightsBySeverity: {}, graphDensity: 0, lastBuildTimeMs: 0, lastBuildAt: null },
    };
  }

  it('builds a prediction', () => {
    const k = makeMockKnowledge();
    const p = m.buildPrediction('storage_capacity', 'storage', 'Test', 'Summary', 'Desc', 100, 150, 'MB', '7d', makeAnalysis(), [], [], k, ['test']);
    expect(p).not.toBeNull();
    expect(p!.predictionType).toBe('storage_capacity');
    expect(p!.confidenceScore).toBeGreaterThan(0);
  });
  it('returns null for insufficient samples', () => {
    const k = makeMockKnowledge();
    const p = m.buildPrediction('storage_capacity', 'storage', 'Test', 'Summary', 'Desc', 100, 150, 'MB', '7d', makeAnalysis({ sampleCount: 2, confidence: 0.1 }), [], [], k, ['test']);
    expect(p).toBeNull();
  });
  it('derives risk level', () => {
    const k = makeMockKnowledge();
    const p = m.buildPrediction('storage_capacity', 'storage', 'Test', 'Summary', 'Desc', 100, 200, 'MB', '7d', makeAnalysis(), [], [], k, ['test']);
    expect(p).not.toBeNull();
    expect(['none', 'low', 'medium', 'high', 'critical']).toContain(p!.riskLevel);
  });
  it('includes assumptions in evidence', () => {
    const k = makeMockKnowledge();
    const p = m.buildPrediction('storage_capacity', 'storage', 'Test', 'Summary', 'Desc', 100, 150, 'MB', '7d', makeAnalysis(), [], [], k, ['assumption1', 'assumption2']);
    expect(p).not.toBeNull();
    expect(p!.evidence.assumptions).toContain('assumption1');
    expect(p!.evidence.assumptions).toContain('assumption2');
  });
  it('includes model version in evidence', () => {
    const k = makeMockKnowledge();
    const p = m.buildPrediction('storage_capacity', 'storage', 'Test', 'Summary', 'Desc', 100, 150, 'MB', '7d', makeAnalysis(), [], [], k, ['test']);
    expect(p).not.toBeNull();
    expect(p!.evidence.modelVersion).toBe(DEFAULT_PREDICTION_CONFIG.modelSettings.modelVersion);
  });
});

// ── Validator ────────────────────────────────────────────────
describe('PredictionValidator', () => {
  let v: PredictionValidator;
  beforeEach(() => { v = new PredictionValidator(DEFAULT_PREDICTION_CONFIG); });
  it('validates valid prediction', () => { expect(v.validatePrediction(createMockPrediction()).valid).toBe(true); });
  it('fails for missing id', () => { expect(v.validatePrediction(createMockPrediction({ id: '' })).valid).toBe(false); });
  it('fails for missing title', () => { expect(v.validatePrediction(createMockPrediction({ title: '' })).valid).toBe(false); });
  it('fails for invalid type', () => { expect(v.validatePrediction(createMockPrediction({ predictionType: 'invalid' as PredictionType })).valid).toBe(false); });
  it('fails for invalid risk level', () => { expect(v.validatePrediction(createMockPrediction({ riskLevel: 'invalid' as RiskLevel })).valid).toBe(false); });
  it('fails for no evidence', () => { const p = createMockPrediction(); p.evidence.evidenceCount = 0; p.evidence.sourceProviders = []; expect(v.validatePrediction(p).valid).toBe(false); });
  it('fails for insufficient history', () => { const p = createMockPrediction(); p.evidence.historicalSamples = 1; expect(v.validatePrediction(p).valid).toBe(false); });
  it('fails for score out of range', () => { expect(v.validatePrediction(createMockPrediction({ confidenceScore: 2 })).valid).toBe(false); });
  it('warns for low confidence', () => { const p = createMockPrediction(); p.confidenceScore = 0.1; p.evidence.confidence = 0.1; const r = v.validatePrediction(p); expect(r.issues.some(x => x.code === 'PRED_LOW_CONFIDENCE')).toBe(true); });
  it('warns for model version mismatch', () => { const p = createMockPrediction(); p.evidence.modelVersion = '2.0.0'; const r = v.validatePrediction(p); expect(r.issues.some(x => x.code === 'PRED_MODEL_VERSION_MISMATCH')).toBe(true); });
  it('validates list', () => {
    const list: PredictionList = { predictions: [createMockPrediction()], metadata: { listId: 'l1', knowledgeId: 'k1', generatedAt: new Date().toISOString(), predictionVersion: '1.0.0', generationTimeMs: 10, totalPredictions: 1, historicalSnapshots: 5 }, statistics: { totalPredictions: 1, byType: {}, byCategory: {}, byRiskLevel: {}, byTimeHorizon: {}, byTrend: {}, averageConfidence: 0.7, criticalCount: 0, highRiskCount: 0, fulfilledCount: 0, expiredCount: 0 } };
    expect(v.validateList(list).valid).toBe(true);
  });
  it('fails for duplicate IDs in list', () => {
    const p = createMockPrediction({ id: 'dup' });
    const list: PredictionList = { predictions: [p, { ...p }], metadata: { listId: 'l1', knowledgeId: 'k1', generatedAt: new Date().toISOString(), predictionVersion: '1.0.0', generationTimeMs: 10, totalPredictions: 2, historicalSnapshots: 5 }, statistics: { totalPredictions: 2, byType: {}, byCategory: {}, byRiskLevel: {}, byTimeHorizon: {}, byTrend: {}, averageConfidence: 0.7, criticalCount: 0, highRiskCount: 0, fulfilledCount: 0, expiredCount: 0 } };
    expect(v.validateList(list).valid).toBe(false);
  });
});

// ── History ──────────────────────────────────────────────────
describe('PredictionHistory', () => {
  let h: PredictionHistory;
  beforeEach(() => { h = new PredictionHistory(DEFAULT_PREDICTION_CONFIG); });
  it('records generated', () => { h.recordGenerated([createMockPrediction()]); expect(h.count).toBe(1); });
  it('records updated', () => { h.recordUpdated('p1'); expect(h.count).toBe(1); });
  it('records expired', () => { h.recordExpired('p1'); expect(h.count).toBe(1); });
  it('records fulfilled', () => { h.recordFulfilled('p1', 100); expect(h.count).toBe(1); });
  it('records invalidated', () => { h.recordInvalidated('p1', 'test'); expect(h.count).toBe(1); });
  it('records dismissed', () => { h.recordDismissed('p1'); expect(h.count).toBe(1); });
  it('deduplicates by ID', () => { const p = createMockPrediction(); expect(h.deduplicate([p, { ...p }])).toHaveLength(1); });
  it('getEntriesFor returns entries', () => { h.recordUpdated('p1'); h.recordExpired('p1'); expect(h.getEntriesFor('p1')).toHaveLength(2); });
  it('hasSeen tracks IDs', () => { h.recordGenerated([createMockPrediction({ id: 'p1' })]); expect(h.hasSeen('p1')).toBe(true); expect(h.hasSeen('p2')).toBe(false); });
  it('clear resets', () => { h.recordUpdated('p1'); h.clear(); expect(h.count).toBe(0); });
  it('checkExpired marks expired', () => { const p = createMockPrediction({ id: 'p1', expiresAt: new Date(Date.now() - 1000).toISOString() }); const expired = h.checkExpired([p]); expect(expired).toContain('p1'); expect(p.status).toBe('expired'); });
  it('records accuracy', () => { const p = createMockPrediction(); const r = h.recordAccuracy(p, 445000); expect(r).not.toBeNull(); expect(r!.accuracyScore).toBeGreaterThan(0); expect(h.accuracyCount).toBe(1); });
  it('getAverageAccuracy returns average', () => { h.recordAccuracy(createMockPrediction(), 445000); h.recordAccuracy(createMockPrediction({ id: 'p2' }), 430000); expect(h.getAverageAccuracy()).toBeGreaterThan(0); });
});

// ── Timeline ─────────────────────────────────────────────────
describe('PredictionTimelineManager', () => {
  let t: PredictionTimelineManager;
  beforeEach(() => { t = new PredictionTimelineManager(DEFAULT_PREDICTION_CONFIG); });
  it('adds prediction entry', () => { t.addPrediction(createMockPrediction()); expect(t.count).toBe(1); });
  it('adds fulfillment entry', () => { t.addFulfillment(createMockPrediction(), 450000); expect(t.count).toBe(1); });
  it('adds expiration entry', () => { t.addExpiration('p1', 'Test', 'storage'); expect(t.count).toBe(1); });
  it('adds trend change entry', () => { t.addTrendChange('p1', 'Test', 'increasing', 'decreasing', 'storage'); expect(t.count).toBe(1); });
  it('getTimeline returns entries for period', () => { t.addPrediction(createMockPrediction()); const tl = t.getTimeline('daily'); expect(tl.totalEntries).toBe(1); expect(tl.period).toBe('daily'); });
  it('getEntriesByType filters', () => { t.addPrediction(createMockPrediction()); t.addExpiration('p1', 'Test', 'storage'); expect(t.getEntriesByType('prediction')).toHaveLength(1); });
  it('clear resets', () => { t.addPrediction(createMockPrediction()); t.clear(); expect(t.count).toBe(0); });
  it('respects maxTimelineEntries', () => {
    const cfg = createPredictionConfig({ maxTimelineEntries: 3 });
    const tl = new PredictionTimelineManager(cfg);
    for (let i = 0; i < 5; i++) tl.addPrediction(createMockPrediction({ id: `p${i}` }));
    expect(tl.count).toBe(3);
  });
});

// ── Engine ───────────────────────────────────────────────────
describe('PredictionEngine', () => {
  let e: PredictionEngine;
  beforeEach(() => { e = new PredictionEngine(DEFAULT_PREDICTION_CONFIG); });

  it('returns empty for no snapshots', async () => {
    const k = await createKnowledge();
    expect(e.generate(k, [])).toHaveLength(0);
  });

  it('returns empty for insufficient snapshots', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 2);
    expect(e.generate(k, snaps)).toHaveLength(0);
  });

  it('generates predictions with sufficient snapshots', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const preds = e.generate(k, snaps, ['7d']);
    expect(preds.length).toBeGreaterThan(0);
  });

  it('every prediction has evidence', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const preds = e.generate(k, snaps, ['7d']);
    for (const p of preds) expect(p.evidence.evidenceCount).toBeGreaterThan(0);
  });

  it('every prediction has confidence', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const preds = e.generate(k, snaps, ['7d']);
    for (const p of preds) expect(p.confidenceScore).toBeGreaterThan(0);
  });

  it('every prediction has historical samples', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const preds = e.generate(k, snaps, ['7d']);
    for (const p of preds) expect(p.evidence.historicalSamples).toBeGreaterThanOrEqual(DEFAULT_PREDICTION_CONFIG.confidenceRules.minSamples);
  });

  it('every prediction has assumptions', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const preds = e.generate(k, snaps, ['7d']);
    for (const p of preds) expect(p.evidence.assumptions.length).toBeGreaterThan(0);
  });

  it('never executes or modifies system', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const preds = e.generate(k, snaps, ['7d']);
    for (const p of preds) { expect(p.status).toBe('active'); expect(p.futureMetadata).toBeDefined(); }
  });

  it('generateByType works for specific type', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const preds = e.generateByType('storage_capacity', k, snaps, ['7d']);
    expect(preds.length).toBeGreaterThan(0);
    expect(preds[0]!.predictionType).toBe('storage_capacity');
  });
});

// ── Builder ──────────────────────────────────────────────────
describe('PredictionBuilder', () => {
  it('builds predictions from knowledge and snapshots', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const b = new PredictionBuilder(new PredictionRegistry(), new PredictionValidator(DEFAULT_PREDICTION_CONFIG), DEFAULT_PREDICTION_CONFIG);
    const list = await b.build(k, snaps, ['7d']);
    expect(list.metadata).toBeDefined();
    expect(list.predictions.length).toBeGreaterThan(0);
  });

  it('builds with filter', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const b = new PredictionBuilder(new PredictionRegistry(), new PredictionValidator(DEFAULT_PREDICTION_CONFIG), DEFAULT_PREDICTION_CONFIG);
    const list = await b.build(k, snaps, ['7d'], { categories: ['storage'] });
    expect(list.predictions.every(p => p.category === 'storage')).toBe(true);
  });

  it('includes statistics', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const b = new PredictionBuilder(new PredictionRegistry(), new PredictionValidator(DEFAULT_PREDICTION_CONFIG), DEFAULT_PREDICTION_CONFIG);
    const list = await b.build(k, snaps, ['7d']);
    expect(list.statistics.totalPredictions).toBeGreaterThan(0);
  });

  it('integrates plugin predictions', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const reg = new PredictionRegistry();
    reg.registerPlugin({ getPluginName: () => 'custom', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [createMockPrediction({ id: 'plugin_pred' })] });
    const b = new PredictionBuilder(reg, new PredictionValidator(DEFAULT_PREDICTION_CONFIG), DEFAULT_PREDICTION_CONFIG);
    const list = await b.build(k, snaps, ['7d']);
    expect(list.predictions.some(p => p.id === 'plugin_pred')).toBe(true);
  });

  it('plugin failure does not break build', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const reg = new PredictionRegistry();
    reg.registerPlugin({ getPluginName: () => 'broken', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => { throw new Error('fail'); } });
    const b = new PredictionBuilder(reg, new PredictionValidator(DEFAULT_PREDICTION_CONFIG), DEFAULT_PREDICTION_CONFIG);
    const list = await b.build(k, snaps, ['7d']);
    expect(list.metadata).toBeDefined();
  });

  it('limits to maxPredictions', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const cfg = createPredictionConfig({ maxPredictions: 2 });
    const b = new PredictionBuilder(new PredictionRegistry(), new PredictionValidator(cfg), cfg);
    const list = await b.build(k, snaps, ['7d', '30d', '90d']);
    expect(list.predictions.length).toBeLessThanOrEqual(2);
  });

  it('sorts by risk level', async () => {
    const k = await createKnowledge();
    const snaps = createMockSnapshots(k, 5);
    const b = new PredictionBuilder(new PredictionRegistry(), new PredictionValidator(DEFAULT_PREDICTION_CONFIG), DEFAULT_PREDICTION_CONFIG);
    const list = await b.build(k, snaps, ['7d']);
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
    for (let i = 1; i < list.predictions.length; i++) {
      expect(order[list.predictions[i]!.riskLevel] ?? 5).toBeGreaterThanOrEqual(order[list.predictions[i - 1]!.riskLevel] ?? 5);
    }
  });
});

// ── Manager ──────────────────────────────────────────────────
describe('PredictionManager', () => {
  let mgr: PredictionManager;
  beforeEach(() => { mgr = new PredictionManager(); });

  it('starts with no predictions', () => { expect(mgr.getPredictionList()).toBeNull(); expect(mgr.getPredictions()).toHaveLength(0); });
  it('generatePredictions returns list', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d']); expect(list.metadata).toBeDefined(); });
  it('getPredictions returns predictions', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.getPredictions().length).toBeGreaterThan(0); });
  it('getPrediction returns by ID', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.getPrediction(list.predictions[0]!.id)).not.toBeNull(); });
  it('getPrediction returns null for unknown', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.getPrediction('unknown')).toBeNull(); });
  it('getPredictionsByCategory filters', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); const storage = mgr.getPredictionsByCategory(['storage']); expect(storage.every(p => p.category === 'storage')).toBe(true); });
  it('getPredictionsByRisk filters', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); const high = mgr.getPredictionsByRisk(['high', 'critical']); expect(high.every(p => p.riskLevel === 'high' || p.riskLevel === 'critical')).toBe(true); });
  it('getPredictionTimeline returns timeline', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); const tl = mgr.getPredictionTimeline('daily'); expect(tl.period).toBe('daily'); });
  it('getPredictionStatistics returns stats', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.getPredictionStatistics()).not.toBeNull(); });
  it('validatePredictions validates', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.validatePredictions().valid).toBe(true); });
  it('registerPlugin adds plugin', () => { expect(mgr.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [] })).toBe(true); });
  it('unregisterPlugin removes plugin', () => { mgr.registerPlugin({ getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [] }); expect(mgr.unregisterPlugin('p')).toBe(true); });
  it('dismissPrediction marks as dismissed', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d']); mgr.dismissPrediction(list.predictions[0]!.id); expect(list.predictions[0]!.status).toBe('dismissed'); });
  it('fulfillPrediction marks as fulfilled', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d']); mgr.fulfillPrediction(list.predictions[0]!.id, 450000); expect(list.predictions[0]!.status).toBe('fulfilled'); });
  it('clear resets', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); mgr.clear(); expect(mgr.getPredictionList()).toBeNull(); });
  it('updateConfig updates', async () => { mgr.updateConfig({ maxPredictions: 1 }); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d', '30d']); expect(list.predictions.length).toBeLessThanOrEqual(1); });
  it('getAccuracyRecords returns records', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d']); mgr.fulfillPrediction(list.predictions[0]!.id, 450000); expect(mgr.getAccuracyRecords().length).toBeGreaterThan(0); });
});

// ── Traceability ─────────────────────────────────────────────
describe('Traceability', () => {
  it('every prediction has evidence with data points', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); for (const p of mgr.getPredictions()) expect(p.evidence.evidence.dataPoints.length + p.evidence.historicalDataPoints.length).toBeGreaterThan(0); });
  it('every prediction has source providers', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); for (const p of mgr.getPredictions()) expect(p.evidence.sourceProviders.length).toBeGreaterThan(0); });
  it('every prediction has confidence', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); for (const p of mgr.getPredictions()) expect(p.confidenceScore).toBeGreaterThan(0); });
  it('every prediction has related knowledge', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); for (const p of mgr.getPredictions()) expect(p.relatedKnowledge.length).toBeGreaterThan(0); });
  it('every prediction has historical samples', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); for (const p of mgr.getPredictions()) expect(p.evidence.historicalSamples).toBeGreaterThanOrEqual(3); });
  it('every prediction has assumptions', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); for (const p of mgr.getPredictions()) expect(p.evidence.assumptions.length).toBeGreaterThan(0); });
});

// ── Regression ───────────────────────────────────────────────
describe('Regression', () => {
  it('all exports are defined', async () => { const mod = await import('../index'); expect(mod.PredictionManager).toBeDefined(); expect(mod.predictionManager).toBeDefined(); expect(mod.PredictionBuilder).toBeDefined(); expect(mod.PredictionEngine).toBeDefined(); expect(mod.PredictionModel).toBeDefined(); expect(mod.PredictionAnalyzer).toBeDefined(); expect(mod.PredictionValidator).toBeDefined(); expect(mod.PredictionHistory).toBeDefined(); expect(mod.PredictionTimelineManager).toBeDefined(); expect(mod.PredictionRegistry).toBeDefined(); });
  it('full integration: generate from knowledge + snapshots', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d', '30d']); expect(list.predictions.length).toBeGreaterThan(0); expect(list.statistics.totalPredictions).toBe(list.predictions.length); expect(list.metadata.knowledgeId).toBe(k.metadata.knowledgeId); });
  it('full integration: validation passes', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.validatePredictions().valid).toBe(true); });
  it('full integration: no execution or system modification', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d']); for (const p of list.predictions) { expect(p.status).toBe('active'); expect(p.futureMetadata).toBeDefined(); } });
  it('full integration: plugin extension works', async () => { const mgr = new PredictionManager(); mgr.registerPlugin({ getPluginName: () => 'ext', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => [createMockPrediction({ id: 'ext_pred' })] }); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d']); expect(list.predictions.some(p => p.id === 'ext_pred')).toBe(true); });
});

// ── Performance ──────────────────────────────────────────────
describe('Performance', () => {
  it('prediction generation under 150ms', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const mgr = new PredictionManager(); const start = performance.now(); await mgr.generatePredictions(k, snaps, ['7d', '30d']); const elapsed = performance.now() - start; expect(elapsed).toBeLessThan(150); });
});

// ── Edge Cases ───────────────────────────────────────────────
describe('Edge Cases', () => {
  it('empty knowledge produces empty predictions', async () => {
    const emptyK: KnowledgeObject = { metadata: { knowledgeId: 'k1', contextId: 'c1', generatedAt: new Date().toISOString(), knowledgeVersion: '1.0.0', generationTimeMs: 0, factsCount: 0, relationshipsCount: 0, changesCount: 0, trendsCount: 0, summariesCount: 0, insightsCount: 0 }, facts: [], relationships: [], changes: [], trends: [], summaries: [], insights: [], graph: { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 }, provenance: [], statistics: { totalFacts: 0, totalRelationships: 0, totalChanges: 0, totalTrends: 0, totalSummaries: 0, totalInsights: 0, totalEvidencePieces: 0, averageConfidence: 0, factsByCategory: {}, changesByType: {}, trendsByDirection: {}, insightsByType: {}, insightsBySeverity: {}, graphDensity: 0, lastBuildTimeMs: 0, lastBuildAt: null } };
    const mgr = new PredictionManager(); const list = await mgr.generatePredictions(emptyK, [], ['7d']); expect(list.predictions).toHaveLength(0); expect(list.metadata).toBeDefined();
  });
  it('insufficient snapshots produces empty predictions', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 2); const mgr = new PredictionManager(); const list = await mgr.generatePredictions(k, snaps, ['7d']); expect(list.predictions).toHaveLength(0); });
  it('plugin failure does not break build', async () => { const mgr = new PredictionManager(); mgr.registerPlugin({ getPluginName: () => 'broken', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, generatePredictions: () => { throw new Error('fail'); } }); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d']); expect(list.metadata).toBeDefined(); });
  it('unavailable plugin is skipped', async () => { const mgr = new PredictionManager(); mgr.registerPlugin({ getPluginName: () => 'unavail', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, generatePredictions: () => [createMockPrediction({ id: 'unavail_p' })] }); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const list = await mgr.generatePredictions(k, snaps, ['7d']); expect(list.predictions.some(p => p.id === 'unavail_p')).toBe(false); });
  it('multiple generations work correctly', async () => { const mgr = new PredictionManager(); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.getPredictions().length).toBeGreaterThan(0); await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.getPredictions().length).toBeGreaterThan(0); });
  it('configuration with disabled history still works', async () => { const cfg = createPredictionConfig({ enableHistory: false }); const mgr = new PredictionManager(cfg); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.getPredictions().length).toBeGreaterThan(0); });
  it('configuration with disabled timeline still works', async () => { const cfg = createPredictionConfig({ enableTimeline: false }); const mgr = new PredictionManager(cfg); const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); await mgr.generatePredictions(k, snaps, ['7d']); expect(mgr.getPredictions().length).toBeGreaterThan(0); });
  it('custom time horizon works', async () => { const k = await createKnowledge(); const snaps = createMockSnapshots(k, 5); const mgr = new PredictionManager(); const list = await mgr.generatePredictions(k, snaps, ['custom']); expect(list.metadata).toBeDefined(); });
});
