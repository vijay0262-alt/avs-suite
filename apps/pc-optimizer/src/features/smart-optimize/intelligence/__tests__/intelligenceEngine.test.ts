/**
 * Automation Intelligence Engine — Comprehensive Test Suite
 *
 * EPIC 4 PHASE A PART 6
 *
 * Tests: Pattern Detection, Ranking, Insights, Prediction, History,
 * Configuration, Events, Regression, Performance, Edge Cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AutomationIntelligenceManager,
  AutomationLearningEngine,
  AutomationHistoryAnalyzer,
  AutomationOutcomeAnalyzer,
  AutomationDecisionAnalyzer,
  AutomationPatternAnalyzer,
  AutomationSuccessPredictor,
  AutomationRankingEngine,
  AutomationRecommendationEngine,
  AutomationStatistics,
  AutomationInsights,
  IntelligenceValidator,
  IntelligenceEvents,
  createDefaultIntelligenceConfiguration,
  createIntelligenceConfiguration,
  createDefaultIntelligenceInput,
  generateIntelligenceId,
  generatePatternId,
  generatePredictionId,
  generateRecommendationId,
  generateInsightId,
  generateTrendId,
  generateRuleStatId,
  riskToScore,
  priorityToScore,
  scoreToRisk,
  scoreToPriority,
} from '../index';
import type {
  IntelligenceInput,
  IntelligenceConfiguration,
  IntelligenceRecommendation,
  DetectedPattern,
  SuccessPrediction,
  AutomationHistoryEntry,
  MaintenanceHistoryEntry,
  AdaptiveHistoryEntry,
  SystemState,
  RiskLevel,
  RecommendationPriority,
  PatternAnalyzerPlugin,
  SuccessPredictorPlugin,
  RankingPlugin,
  RecommendationPlugin,
  InsightPlugin,
  PatternType,
  InsightType,
  RankingFactor,
} from '../types';

// ── Mock Data Helpers ────────────────────────────────────────

function createMockState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    cpuUsage: 10,
    memoryUsage: 20,
    diskActivity: 5,
    batteryLevel: 80,
    powerSource: 'ac',
    userActive: false,
    fullScreenApp: false,
    gamingMode: false,
    windowsUpdateActive: false,
    networkActivity: 5,
    thermalState: 'normal',
    storagePressure: 20,
    isIdle: true,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockAutomationEntry(overrides: Partial<AutomationHistoryEntry> = {}): AutomationHistoryEntry {
  return {
    id: `ah_${Math.random().toString(36).slice(2, 8)}`,
    ruleId: 'rule_1',
    triggerType: 'system_idle',
    outcome: 'executed',
    timestamp: new Date().toISOString(),
    actions: ['notify_user'],
    confidence: 0.8,
    riskLevel: 'low' as RiskLevel,
    approvalRequired: false,
    cooldownApplied: false,
    metadata: {},
    ...overrides,
  };
}

function createMockMaintenanceEntry(overrides: Partial<MaintenanceHistoryEntry> = {}): MaintenanceHistoryEntry {
  return {
    id: `mh_${Math.random().toString(36).slice(2, 8)}`,
    opportunityId: 'opp_1',
    type: 'routine_maintenance',
    outcome: 'completed',
    timestamp: new Date().toISOString(),
    confidence: 0.75,
    duration: 120000,
    expectedBenefit: 0.6,
    actualBenefit: 0.5,
    metadata: {},
    ...overrides,
  };
}

function createMockAdaptiveEntry(overrides: Partial<AdaptiveHistoryEntry> = {}): AdaptiveHistoryEntry {
  return {
    id: `ad_${Math.random().toString(36).slice(2, 8)}`,
    planId: 'plan_1',
    action: 'postpone_step',
    conditionType: 'cpu_usage',
    timestamp: new Date().toISOString(),
    confidence: 0.7,
    metadata: {},
    ...overrides,
  };
}

function createMockInput(overrides: Partial<IntelligenceInput> = {}): IntelligenceInput {
  return {
    ...createDefaultIntelligenceInput(),
    systemState: createMockState(),
    deviceProfileType: 'general',
    healthScore: 65,
    ...overrides,
  };
}

function createMockRecommendation(overrides: Partial<IntelligenceRecommendation> = {}): IntelligenceRecommendation {
  return {
    id: generateRecommendationId(),
    reason: 'Test recommendation',
    supportingEvidence: [
      { source: 'test', metric: 'test_metric', value: 0.8, timestamp: new Date().toISOString(), description: 'Test evidence', futureMetadata: {} },
    ],
    confidence: 0.75,
    historicalSuccess: 0.7,
    expectedBenefit: 0.6,
    risk: 'low' as RiskLevel,
    priority: 'medium' as RecommendationPriority,
    affectedProfiles: ['general'],
    affectedRules: ['rule_1'],
    successPrediction: null,
    alternativeRecommendation: null,
    rank: 0,
    rankScore: 0,
    futureMetadata: {},
    ...overrides,
  };
}

function createMockConfig(overrides: Partial<IntelligenceConfiguration> = {}): IntelligenceConfiguration {
  return { ...createDefaultIntelligenceConfiguration(), ...overrides };
}

// Generate history with specific patterns
function generateAcceptedHistory(count: number, ruleId = 'rule_accepted'): AutomationHistoryEntry[] {
  return Array.from({ length: count }, () =>
    createMockAutomationEntry({ ruleId, outcome: 'executed', confidence: 0.85 }),
  );
}

function generateRejectedHistory(count: number, ruleId = 'rule_rejected'): AutomationHistoryEntry[] {
  return Array.from({ length: count }, () =>
    createMockAutomationEntry({ ruleId, outcome: 'rejected', confidence: 0.6 }),
  );
}

function generateDeferredHistory(count: number, ruleId = 'rule_deferred'): AutomationHistoryEntry[] {
  return Array.from({ length: count }, () =>
    createMockAutomationEntry({ ruleId, outcome: 'deferred', confidence: 0.5 }),
  );
}

function generateCancelledHistory(count: number, ruleId = 'rule_cancelled'): AutomationHistoryEntry[] {
  return Array.from({ length: count }, () =>
    createMockAutomationEntry({ ruleId, outcome: 'cancelled', confidence: 0.4 }),
  );
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('createDefaultIntelligenceConfiguration has all sections', () => {
    const cfg = createDefaultIntelligenceConfiguration();
    expect(cfg.configVersion).toBe('1.0.0');
    expect(cfg.rankingWeights.length).toBeGreaterThan(0);
    expect(cfg.patternRules.length).toBeGreaterThan(0);
    expect(cfg.predictionRules.length).toBeGreaterThan(0);
    expect(cfg.historyRetention).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
  });

  it('createDefaultIntelligenceInput has defaults', () => {
    const input = createDefaultIntelligenceInput();
    expect(input.automationHistory).toEqual([]);
    expect(input.maintenanceHistory).toEqual([]);
    expect(input.adaptiveHistory).toEqual([]);
    expect(input.healthScore).toBe(50);
    expect(input.deviceProfileType).toBe('general');
  });

  it('generateIntelligenceId produces unique ids', () => {
    const ids = new Set([generateIntelligenceId(), generateIntelligenceId(), generateIntelligenceId()]);
    expect(ids.size).toBe(3);
  });

  it('generatePatternId produces unique ids', () => {
    const ids = new Set([generatePatternId(), generatePatternId(), generatePatternId()]);
    expect(ids.size).toBe(3);
  });

  it('generatePredictionId produces unique ids', () => {
    const ids = new Set([generatePredictionId(), generatePredictionId(), generatePredictionId()]);
    expect(ids.size).toBe(3);
  });

  it('generateRecommendationId produces unique ids', () => {
    const ids = new Set([generateRecommendationId(), generateRecommendationId(), generateRecommendationId()]);
    expect(ids.size).toBe(3);
  });

  it('generateInsightId produces unique ids', () => {
    const ids = new Set([generateInsightId(), generateInsightId(), generateInsightId()]);
    expect(ids.size).toBe(3);
  });

  it('generateTrendId produces unique ids', () => {
    const ids = new Set([generateTrendId(), generateTrendId(), generateTrendId()]);
    expect(ids.size).toBe(3);
  });

  it('generateRuleStatId produces unique ids', () => {
    const ids = new Set([generateRuleStatId(), generateRuleStatId(), generateRuleStatId()]);
    expect(ids.size).toBe(3);
  });

  it('riskToScore converts correctly', () => {
    expect(riskToScore('none')).toBe(0);
    expect(riskToScore('low')).toBe(0.2);
    expect(riskToScore('medium')).toBe(0.5);
    expect(riskToScore('high')).toBe(0.8);
    expect(riskToScore('critical')).toBe(1.0);
  });

  it('priorityToScore converts correctly', () => {
    expect(priorityToScore('critical')).toBe(1.0);
    expect(priorityToScore('high')).toBe(0.8);
    expect(priorityToScore('medium')).toBe(0.5);
    expect(priorityToScore('low')).toBe(0.2);
    expect(priorityToScore('informational')).toBe(0.1);
  });

  it('scoreToRisk converts correctly', () => {
    expect(scoreToRisk(0)).toBe('none');
    expect(scoreToRisk(0.15)).toBe('low');
    expect(scoreToRisk(0.3)).toBe('medium');
    expect(scoreToRisk(0.6)).toBe('high');
    expect(scoreToRisk(0.9)).toBe('critical');
  });

  it('scoreToPriority converts correctly', () => {
    expect(scoreToPriority(0.95)).toBe('critical');
    expect(scoreToPriority(0.75)).toBe('high');
    expect(scoreToPriority(0.5)).toBe('medium');
    expect(scoreToPriority(0.15)).toBe('low');
    expect(scoreToPriority(0.05)).toBe('informational');
  });
});

// ── Configuration ────────────────────────────────────────────

describe('IntelligenceConfiguration', () => {
  it('has defaults', () => {
    const cfg = createDefaultIntelligenceConfiguration();
    expect(cfg.configVersion).toBe('1.0.0');
    expect(cfg.minSamplesForPrediction).toBe(3);
    expect(cfg.minConfidenceThreshold).toBe(0.3);
    expect(cfg.analysisIntervalMs).toBe(30000);
  });

  it('createIntelligenceConfiguration accepts overrides', () => {
    const cfg = createIntelligenceConfiguration({ minSamplesForPrediction: 5, enableEvents: false });
    expect(cfg.minSamplesForPrediction).toBe(5);
    expect(cfg.enableEvents).toBe(false);
  });

  it('merges featureFlags', () => {
    const cfg = createIntelligenceConfiguration({ featureFlags: { enablePatternDetection: false } });
    expect(cfg.featureFlags.enablePatternDetection).toBe(false);
    expect(cfg.featureFlags.enableOutcomeAnalysis).toBe(true);
  });

  it('merges historyRetention', () => {
    const cfg = createIntelligenceConfiguration({ historyRetention: { maxAutomationEntries: 100 } });
    expect(cfg.historyRetention.maxAutomationEntries).toBe(100);
    expect(cfg.historyRetention.maxMaintenanceEntries).toBe(500);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('IntelligenceEvents', () => {
  let events: IntelligenceEvents;
  beforeEach(() => { events = new IntelligenceEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('history_analyzed', () => { received = true; });
    events.emitHistoryAnalyzed();
    expect(received).toBe(true);
  });

  it('off removes listener', () => {
    const listener = () => { };
    events.on('patterns_detected', listener);
    expect(events.listenerCount('patterns_detected')).toBe(1);
    events.off('patterns_detected', listener);
    expect(events.listenerCount('patterns_detected')).toBe(0);
  });

  it('on returns unsubscribe function', () => {
    let count = 0;
    const unsub = events.on('insights_generated', () => { count++; });
    events.emitInsightsGenerated();
    expect(count).toBe(1);
    unsub();
    events.emitInsightsGenerated();
    expect(count).toBe(1);
  });

  it('emitRecommendationsRanked works', () => {
    let received = false;
    events.on('recommendations_ranked', () => { received = true; });
    events.emitRecommendationsRanked();
    expect(received).toBe(true);
  });

  it('emitPredictionUpdated works', () => {
    let received = false;
    events.on('prediction_updated', () => { received = true; });
    events.emitPredictionUpdated();
    expect(received).toBe(true);
  });

  it('emitIntelligenceUpdated works', () => {
    let received = false;
    events.on('automation_intelligence_updated', () => { received = true; });
    events.emitIntelligenceUpdated();
    expect(received).toBe(true);
  });

  it('clear removes all', () => {
    events.on('history_analyzed', () => { });
    events.on('patterns_detected', () => { });
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });

  it('listenerCount returns correct count', () => {
    events.on('history_analyzed', () => { });
    events.on('history_analyzed', () => { });
    events.on('patterns_detected', () => { });
    expect(events.listenerCount()).toBe(3);
    expect(events.listenerCount('history_analyzed')).toBe(2);
  });

  it('does not crash on listener error', () => {
    events.on('history_analyzed', () => { throw new Error('test'); });
    expect(() => events.emitHistoryAnalyzed()).not.toThrow();
  });
});

// ── History Analyzer ─────────────────────────────────────────

describe('AutomationHistoryAnalyzer', () => {
  let analyzer: AutomationHistoryAnalyzer;
  beforeEach(() => { analyzer = new AutomationHistoryAnalyzer(); });

  it('analyzes empty history', () => {
    const result = analyzer.analyze(createMockInput());
    expect(result.totalEntries).toBe(0);
    expect(result.dateRange.earliest).toBeNull();
    expect(result.dateRange.latest).toBeNull();
  });

  it('analyzes automation history', () => {
    const entries = [createMockAutomationEntry(), createMockAutomationEntry({ ruleId: 'rule_2' })];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.automationEntries).toBe(2);
    expect(result.uniqueRules).toContain('rule_1');
    expect(result.uniqueRules).toContain('rule_2');
  });

  it('analyzes maintenance history', () => {
    const entries = [createMockMaintenanceEntry(), createMockMaintenanceEntry({ type: 'deep_maintenance' })];
    const result = analyzer.analyze(createMockInput({ maintenanceHistory: entries }));
    expect(result.maintenanceEntries).toBe(2);
    expect(result.uniqueMaintenanceTypes).toContain('routine_maintenance');
    expect(result.uniqueMaintenanceTypes).toContain('deep_maintenance');
  });

  it('analyzes adaptive history', () => {
    const entries = [createMockAdaptiveEntry()];
    const result = analyzer.analyze(createMockInput({ adaptiveHistory: entries }));
    expect(result.adaptiveEntries).toBe(1);
  });

  it('computes date range', () => {
    const entries = [
      createMockAutomationEntry({ timestamp: '2024-01-01T00:00:00Z' }),
      createMockAutomationEntry({ timestamp: '2024-06-01T00:00:00Z' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.dateRange.earliest).toBe('2024-01-01T00:00:00Z');
    expect(result.dateRange.latest).toBe('2024-06-01T00:00:00Z');
  });

  it('filterByRule filters correctly', () => {
    const entries = [createMockAutomationEntry({ ruleId: 'a' }), createMockAutomationEntry({ ruleId: 'b' })];
    expect(analyzer.filterByRule(entries, 'a').length).toBe(1);
  });

  it('filterByOutcome filters correctly', () => {
    const entries = [createMockAutomationEntry({ outcome: 'executed' }), createMockAutomationEntry({ outcome: 'rejected' })];
    expect(analyzer.filterByOutcome(entries, 'executed').length).toBe(1);
  });

  it('filterByTrigger filters correctly', () => {
    const entries = [createMockAutomationEntry({ triggerType: 'system_idle' }), createMockAutomationEntry({ triggerType: 'power_connected' })];
    expect(analyzer.filterByTrigger(entries, 'system_idle').length).toBe(1);
  });

  it('filterByDateRange filters correctly', () => {
    const entries = [
      createMockAutomationEntry({ timestamp: '2024-01-01T00:00:00Z' }),
      createMockAutomationEntry({ timestamp: '2024-06-01T00:00:00Z' }),
    ];
    const filtered = analyzer.filterByDateRange(entries, '2024-03-01T00:00:00Z', '2024-12-01T00:00:00Z');
    expect(filtered.length).toBe(1);
  });

  it('getRecentAutomation returns last N', () => {
    const entries = [createMockAutomationEntry(), createMockAutomationEntry(), createMockAutomationEntry()];
    expect(analyzer.getRecentAutomation(entries, 2).length).toBe(2);
  });

  it('generates evidence', () => {
    const result = analyzer.analyze(createMockInput({ automationHistory: [createMockAutomationEntry()] }));
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.some((e) => e.source === 'automation_history')).toBe(true);
  });
});

// ── Outcome Analyzer ─────────────────────────────────────────

describe('AutomationOutcomeAnalyzer', () => {
  let analyzer: AutomationOutcomeAnalyzer;
  beforeEach(() => { analyzer = new AutomationOutcomeAnalyzer(); });

  it('returns empty metrics for no history', () => {
    const result = analyzer.analyze(createMockInput());
    expect(result.automationMetrics.successRate).toBe(0);
    expect(result.maintenanceMetrics.successRate).toBe(0);
    expect(result.overallSuccessRate).toBe(0);
  });

  it('computes automation success rate', () => {
    const entries = [
      createMockAutomationEntry({ outcome: 'executed' }),
      createMockAutomationEntry({ outcome: 'executed' }),
      createMockAutomationEntry({ outcome: 'rejected' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.automationMetrics.successRate).toBeCloseTo(2 / 3, 1);
  });

  it('computes maintenance success rate', () => {
    const entries = [
      createMockMaintenanceEntry({ outcome: 'completed' }),
      createMockMaintenanceEntry({ outcome: 'cancelled' }),
    ];
    const result = analyzer.analyze(createMockInput({ maintenanceHistory: entries }));
    expect(result.maintenanceMetrics.successRate).toBe(0.5);
  });

  it('computes acceptance rate', () => {
    const entries = [
      createMockAutomationEntry({ outcome: 'approved' }),
      createMockAutomationEntry({ outcome: 'rejected' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.automationMetrics.acceptanceRate).toBe(0.5);
  });

  it('computes rollback frequency', () => {
    const entries = [
      createMockAutomationEntry({ metadata: { rolledBack: true } }),
      createMockAutomationEntry({ metadata: { rolledBack: false } }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.automationMetrics.rollbackFrequency).toBe(0.5);
  });

  it('computes average confidence', () => {
    const entries = [
      createMockAutomationEntry({ confidence: 0.8 }),
      createMockAutomationEntry({ confidence: 0.6 }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.automationMetrics.averageConfidence).toBe(0.7);
  });

  it('detects improving trends', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 4; i++) {
      entries.push(createMockAutomationEntry({ outcome: i < 2 ? 'rejected' : 'executed' }));
    }
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const successTrend = result.trends.find((t) => t.metric === 'success_rate');
    expect(successTrend).toBeDefined();
    expect(successTrend!.direction).toBe('improving');
  });

  it('detects declining trends', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 4; i++) {
      entries.push(createMockAutomationEntry({ outcome: i < 2 ? 'executed' : 'rejected' }));
    }
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const successTrend = result.trends.find((t) => t.metric === 'success_rate');
    expect(successTrend).toBeDefined();
    expect(successTrend!.direction).toBe('declining');
  });

  it('detects stable trends', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 4; i++) {
      entries.push(createMockAutomationEntry({ outcome: 'executed' }));
    }
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const successTrend = result.trends.find((t) => t.metric === 'success_rate');
    expect(successTrend).toBeDefined();
    expect(successTrend!.direction).toBe('stable');
  });

  it('no trends for insufficient data', () => {
    const entries = [createMockAutomationEntry(), createMockAutomationEntry()];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.trends.length).toBe(0);
  });

  it('byOutcome breakdown works', () => {
    const entries = [
      createMockAutomationEntry({ outcome: 'executed' }),
      createMockAutomationEntry({ outcome: 'executed' }),
      createMockAutomationEntry({ outcome: 'rejected' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.automationMetrics.byOutcome['executed']).toBe(2);
    expect(result.automationMetrics.byOutcome['rejected']).toBe(1);
  });
});

// ── Decision Analyzer ────────────────────────────────────────

describe('AutomationDecisionAnalyzer', () => {
  let analyzer: AutomationDecisionAnalyzer;
  beforeEach(() => { analyzer = new AutomationDecisionAnalyzer(); });

  it('returns empty metrics for no history', () => {
    const result = analyzer.analyze(createMockInput());
    expect(result.metrics.totalApprovals).toBe(0);
    expect(result.metrics.approvalRate).toBe(0);
  });

  it('computes approval rate', () => {
    const entries = [
      createMockAutomationEntry({ outcome: 'approved' }),
      createMockAutomationEntry({ outcome: 'rejected' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.metrics.approvalRate).toBe(0.5);
  });

  it('computes rejection rate', () => {
    const entries = [
      createMockAutomationEntry({ outcome: 'approved' }),
      createMockAutomationEntry({ outcome: 'rejected' }),
      createMockAutomationEntry({ outcome: 'rejected' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.metrics.rejectionRate).toBeCloseTo(2 / 3, 1);
  });

  it('computes ignore rate', () => {
    const entries = [
      createMockAutomationEntry({ outcome: 'ignored' }),
      createMockAutomationEntry({ outcome: 'ignored' }),
      createMockAutomationEntry({ outcome: 'executed' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.metrics.ignoreRate).toBeCloseTo(2 / 3, 1);
  });

  it('computes cancel rate', () => {
    const entries = [
      createMockAutomationEntry({ outcome: 'cancelled' }),
      createMockAutomationEntry({ outcome: 'executed' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.metrics.cancelRate).toBe(0.5);
  });

  it('breaks down by rule', () => {
    const entries = [
      createMockAutomationEntry({ ruleId: 'r1', outcome: 'approved' }),
      createMockAutomationEntry({ ruleId: 'r1', outcome: 'rejected' }),
      createMockAutomationEntry({ ruleId: 'r2', outcome: 'approved' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.metrics.byRule['r1']!.total).toBe(2);
    expect(result.metrics.byRule['r1']!.approved).toBe(1);
    expect(result.metrics.byRule['r2']!.approved).toBe(1);
  });

  it('breaks down by trigger', () => {
    const entries = [
      createMockAutomationEntry({ triggerType: 'system_idle', outcome: 'approved' }),
      createMockAutomationEntry({ triggerType: 'power_connected', outcome: 'rejected' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.metrics.byTrigger['system_idle']!.approved).toBe(1);
    expect(result.metrics.byTrigger['power_connected']!.rejected).toBe(1);
  });

  it('breaks down by risk level', () => {
    const entries = [
      createMockAutomationEntry({ riskLevel: 'low', outcome: 'approved' }),
      createMockAutomationEntry({ riskLevel: 'high', outcome: 'rejected' }),
    ];
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.metrics.byRiskLevel['low']!.approved).toBe(1);
    expect(result.metrics.byRiskLevel['high']!.rejected).toBe(1);
  });

  it('generates insights for high approval', () => {
    const entries = generateAcceptedHistory(5);
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.insights.some((i) => i.includes('approve'))).toBe(true);
  });

  it('generates insights for high ignore rate', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) entries.push(createMockAutomationEntry({ outcome: 'ignored' }));
    for (let i = 0; i < 5; i++) entries.push(createMockAutomationEntry({ outcome: 'executed' }));
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.insights.some((i) => i.includes('ignore'))).toBe(true);
  });

  it('generates insights for low approval rules', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) entries.push(createMockAutomationEntry({ ruleId: 'bad_rule', outcome: 'rejected' }));
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    expect(result.insights.some((i) => i.includes('bad_rule'))).toBe(true);
  });

  it('getEvidence returns evidence array', () => {
    const result = analyzer.analyze(createMockInput({ automationHistory: [createMockAutomationEntry()] }));
    const evidence = analyzer.getEvidence(result.metrics);
    expect(evidence.length).toBeGreaterThan(0);
  });
});

// ── Pattern Analyzer ─────────────────────────────────────────

describe('AutomationPatternAnalyzer', () => {
  let analyzer: AutomationPatternAnalyzer;
  beforeEach(() => { analyzer = new AutomationPatternAnalyzer(createMockConfig()); });

  it('detects frequently accepted patterns', () => {
    const entries = generateAcceptedHistory(5);
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const accepted = result.patterns.find((p) => p.type === 'frequently_accepted');
    expect(accepted).toBeDefined();
    expect(accepted!.affectedRules).toContain('rule_accepted');
  });

  it('detects frequently rejected patterns', () => {
    const entries = generateRejectedHistory(5);
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const rejected = result.patterns.find((p) => p.type === 'frequently_rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.affectedRules).toContain('rule_rejected');
  });

  it('detects frequently deferred patterns', () => {
    const entries = generateDeferredHistory(5);
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const deferred = result.patterns.find((p) => p.type === 'frequently_deferred');
    expect(deferred).toBeDefined();
  });

  it('detects frequently cancelled patterns', () => {
    const entries = generateCancelledHistory(5);
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const cancelled = result.patterns.find((p) => p.type === 'frequently_cancelled');
    expect(cancelled).toBeDefined();
  });

  it('detects best maintenance windows', () => {
    const entries: MaintenanceHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(createMockMaintenanceEntry({ outcome: 'completed', timestamp: `2024-01-0${i + 1}T03:00:00Z` }));
    }
    const result = analyzer.analyze(createMockInput({ maintenanceHistory: entries }));
    const windows = result.patterns.find((p) => p.type === 'best_maintenance_windows');
    expect(windows).toBeDefined();
  });

  it('detects most successful strategies', () => {
    const entries: MaintenanceHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(createMockMaintenanceEntry({ type: 'routine_maintenance', outcome: 'completed' }));
    }
    const result = analyzer.analyze(createMockInput({ maintenanceHistory: entries }));
    const strategies = result.patterns.find((p) => p.type === 'most_successful_strategies');
    expect(strategies).toBeDefined();
  });

  it('detects most beneficial recommendations', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(createMockAutomationEntry({ actions: ['generate_optimization_plan'], metadata: { benefit: 0.8 } }));
    }
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const beneficial = result.patterns.find((p) => p.type === 'most_beneficial_recommendations');
    expect(beneficial).toBeDefined();
    expect(beneficial!.affectedActions).toContain('generate_optimization_plan');
  });

  it('detects recurring problems', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(createMockAutomationEntry({ metadata: { problemType: 'high_cpu' } }));
    }
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const problems = result.patterns.find((p) => p.type === 'recurring_problems');
    expect(problems).toBeDefined();
  });

  it('detects recurring improvements', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(createMockAutomationEntry({ outcome: 'executed', metadata: { improvementType: 'startup_speed' } }));
    }
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const improvements = result.patterns.find((p) => p.type === 'recurring_improvements');
    expect(improvements).toBeDefined();
  });

  it('detects most effective profiles', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(createMockAutomationEntry({ outcome: 'executed', metadata: { deviceProfile: 'gaming' } }));
    }
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const profiles = result.patterns.find((p) => p.type === 'most_effective_profiles');
    expect(profiles).toBeDefined();
  });

  it('returns no patterns for empty history', () => {
    const result = analyzer.analyze(createMockInput());
    expect(result.patterns.length).toBe(0);
  });

  it('respects minFrequency threshold', () => {
    const entries = generateAcceptedHistory(2);
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const accepted = result.patterns.find((p) => p.type === 'frequently_accepted');
    expect(accepted).toBeUndefined();
  });

  it('respects disabled pattern rules', () => {
    const cfg = createMockConfig();
    cfg.patternRules = cfg.patternRules.map((r) =>
      r.type === 'frequently_accepted' ? { ...r, enabled: false } : r,
    );
    const analyzer2 = new AutomationPatternAnalyzer(cfg);
    const entries = generateAcceptedHistory(5);
    const result = analyzer2.analyze(createMockInput({ automationHistory: entries }));
    expect(result.patterns.find((p) => p.type === 'frequently_accepted')).toBeUndefined();
  });

  it('registers and uses plugins', () => {
    const plugin: PatternAnalyzerPlugin = {
      getPluginName: () => 'test_plugin',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      getPatternType: () => 'frequently_accepted',
      analyze: () => ({
        id: 'plugin_pattern',
        type: 'frequently_accepted' as PatternType,
        name: 'Plugin Pattern',
        description: 'From plugin',
        confidence: 0.9,
        frequency: 10,
        supportingEvidence: [],
        affectedRules: ['plugin_rule'],
        affectedTriggers: [],
        affectedActions: [],
        metadata: {},
        futureMetadata: {},
      }),
    };
    analyzer.registerPlugin(plugin);
    const entries = generateAcceptedHistory(5);
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const accepted = result.patterns.find((p) => p.type === 'frequently_accepted');
    expect(accepted!.id).toBe('plugin_pattern');
  });

  it('patterns include supporting evidence', () => {
    const entries = generateAcceptedHistory(5);
    const result = analyzer.analyze(createMockInput({ automationHistory: entries }));
    const accepted = result.patterns.find((p) => p.type === 'frequently_accepted');
    expect(accepted!.supportingEvidence.length).toBeGreaterThan(0);
  });
});

// ── Success Predictor ────────────────────────────────────────

describe('AutomationSuccessPredictor', () => {
  let predictor: AutomationSuccessPredictor;
  beforeEach(() => { predictor = new AutomationSuccessPredictor(createMockConfig()); });

  it('returns prediction with defaults for no history', () => {
    const pred = predictor.predict({ futureMetadata: {} }, createMockInput());
    expect(pred.predictedSuccessRate).toBeGreaterThan(0);
    expect(pred.basedOnSamples).toBe(0);
    expect(pred.factors.length).toBeGreaterThan(0);
  });

  it('uses historical success for prediction', () => {
    const entries = generateAcceptedHistory(5);
    const pred = predictor.predict({ ruleId: 'rule_accepted', futureMetadata: {} }, createMockInput({ automationHistory: entries }));
    expect(pred.predictedSuccessRate).toBeGreaterThan(0.5);
    expect(pred.basedOnSamples).toBe(5);
  });

  it('factors include historical success', () => {
    const entries = generateAcceptedHistory(5);
    const pred = predictor.predict({ ruleId: 'rule_accepted', futureMetadata: {} }, createMockInput({ automationHistory: entries }));
    const factor = pred.factors.find((f) => f.name === 'Historical Success');
    expect(factor).toBeDefined();
    expect(factor!.value).toBe(1.0);
  });

  it('factors include risk', () => {
    const pred = predictor.predict({ riskLevel: 'high', futureMetadata: {} }, createMockInput());
    const factor = pred.factors.find((f) => f.name === 'Risk Factor');
    expect(factor).toBeDefined();
    expect(factor!.value).toBeLessThan(0.5);
  });

  it('factors include health score', () => {
    const pred = predictor.predict({ healthScore: 80, futureMetadata: {} }, createMockInput({ healthScore: 80 }));
    const factor = pred.factors.find((f) => f.name === 'Health Score');
    expect(factor).toBeDefined();
    expect(factor!.value).toBe(0.8);
  });

  it('confidence increases with more samples', () => {
    const entries5 = generateAcceptedHistory(5);
    const entries10 = generateAcceptedHistory(10);
    const pred5 = predictor.predict({ ruleId: 'rule_accepted', futureMetadata: {} }, createMockInput({ automationHistory: entries5 }));
    const pred10 = predictor.predict({ ruleId: 'rule_accepted', futureMetadata: {} }, createMockInput({ automationHistory: entries10 }));
    expect(pred10.confidence).toBeGreaterThanOrEqual(pred5.confidence);
  });

  it('includes supporting evidence', () => {
    const entries = generateAcceptedHistory(5);
    const pred = predictor.predict({ ruleId: 'rule_accepted', futureMetadata: {} }, createMockInput({ automationHistory: entries }));
    expect(pred.supportingEvidence.length).toBeGreaterThan(0);
  });

  it('registers and uses plugins', () => {
    const plugin: SuccessPredictorPlugin = {
      getPluginName: () => 'test_predictor',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      predict: () => ({
        id: 'plugin_pred',
        predictedSuccessRate: 0.95,
        confidence: 0.9,
        basedOnSamples: 100,
        supportingEvidence: [],
        factors: [],
        riskLevel: 'low' as RiskLevel,
        futureMetadata: {},
      }),
    };
    predictor.registerPlugin(plugin);
    const pred = predictor.predict({ futureMetadata: {} }, createMockInput());
    expect(pred.id).toBe('plugin_pred');
  });

  it('filters by trigger type', () => {
    const entries = [
      createMockAutomationEntry({ triggerType: 'system_idle', outcome: 'executed' }),
      createMockAutomationEntry({ triggerType: 'power_connected', outcome: 'rejected' }),
    ];
    const pred = predictor.predict({ triggerType: 'system_idle', futureMetadata: {} }, createMockInput({ automationHistory: entries }));
    expect(pred.basedOnSamples).toBe(1);
  });
});

// ── Ranking Engine ───────────────────────────────────────────

describe('AutomationRankingEngine', () => {
  let ranker: AutomationRankingEngine;
  beforeEach(() => { ranker = new AutomationRankingEngine(createMockConfig()); });

  it('ranks recommendations by score', () => {
    const recs = [
      createMockRecommendation({ id: 'low', historicalSuccess: 0.3, expectedBenefit: 0.2 }),
      createMockRecommendation({ id: 'high', historicalSuccess: 0.9, expectedBenefit: 0.8 }),
    ];
    const result = ranker.rank(recs, createMockInput());
    expect(result.ranked[0]!.id).toBe('high');
    expect(result.ranked[0]!.rank).toBe(1);
    expect(result.ranked[1]!.rank).toBe(2);
  });

  it('scores include all enabled factors', () => {
    const recs = [createMockRecommendation()];
    const result = ranker.rank(recs, createMockInput());
    expect(result.scores[recs[0]!.id]).toBeGreaterThan(0);
    expect(result.scores[recs[0]!.id]).toBeLessThanOrEqual(1);
  });

  it('respects disabled weights', () => {
    const cfg = createMockConfig();
    cfg.rankingWeights = cfg.rankingWeights.map((w) =>
      w.factor === 'historical_success' ? { ...w, enabled: false } : w,
    );
    const ranker2 = new AutomationRankingEngine(cfg);
    const recs = [createMockRecommendation({ historicalSuccess: 1.0 })];
    const result = ranker2.rank(recs, createMockInput());
    expect(result.scores[recs[0]!.id]).toBeLessThan(1.0);
  });

  it('handles empty recommendations', () => {
    const result = ranker.rank([], createMockInput());
    expect(result.ranked.length).toBe(0);
  });

  it('handles single recommendation', () => {
    const recs = [createMockRecommendation()];
    const result = ranker.rank(recs, createMockInput());
    expect(result.ranked.length).toBe(1);
    expect(result.ranked[0]!.rank).toBe(1);
  });

  it('device profile scoring works', () => {
    const recs = [
      createMockRecommendation({ id: 'matching', affectedProfiles: ['general'] }),
      createMockRecommendation({ id: 'non_matching', affectedProfiles: ['gaming'] }),
    ];
    const result = ranker.rank(recs, createMockInput({ deviceProfileType: 'general' }));
    expect(result.ranked[0]!.id).toBe('matching');
  });

  it('registers and uses plugins', () => {
    const plugin: RankingPlugin = {
      getPluginName: () => 'test_ranking',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      getFactor: () => 'historical_success' as RankingFactor,
      score: () => 0.99,
    };
    ranker.registerPlugin(plugin);
    const recs = [createMockRecommendation()];
    const result = ranker.rank(recs, createMockInput());
    expect(result.scores[recs[0]!.id]).toBeGreaterThan(0.2);
  });

  it('getEvidence returns evidence', () => {
    const rec = createMockRecommendation();
    const evidence = ranker.getEvidence(rec);
    expect(evidence.length).toBeGreaterThan(0);
  });
});

// ── Recommendation Engine ────────────────────────────────────

describe('AutomationRecommendationEngine', () => {
  let engine: AutomationRecommendationEngine;
  let predictor: AutomationSuccessPredictor;
  let ranker: AutomationRankingEngine;
  let cfg: IntelligenceConfiguration;

  beforeEach(() => {
    cfg = createMockConfig();
    predictor = new AutomationSuccessPredictor(cfg);
    ranker = new AutomationRankingEngine(cfg);
    engine = new AutomationRecommendationEngine(cfg);
  });

  it('generates recommendations from patterns', () => {
    const entries = generateAcceptedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const patternAnalyzer = new AutomationPatternAnalyzer(cfg);
    const patterns = patternAnalyzer.analyze(input).patterns;
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);

    const result = engine.generate(input, { patterns, outcomes, decisions, predictor, ranker });
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('recommendations include reason', () => {
    const entries = generateAcceptedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const patternAnalyzer = new AutomationPatternAnalyzer(cfg);
    const patterns = patternAnalyzer.analyze(input).patterns;
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);

    const result = engine.generate(input, { patterns, outcomes, decisions, predictor, ranker });
    expect(result.recommendations[0]!.reason).toBeDefined();
    expect(result.recommendations[0]!.reason.length).toBeGreaterThan(0);
  });

  it('recommendations include supporting evidence', () => {
    const entries = generateAcceptedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const patternAnalyzer = new AutomationPatternAnalyzer(cfg);
    const patterns = patternAnalyzer.analyze(input).patterns;
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);

    const result = engine.generate(input, { patterns, outcomes, decisions, predictor, ranker });
    expect(result.recommendations[0]!.supportingEvidence.length).toBeGreaterThan(0);
  });

  it('recommendations include success prediction', () => {
    const entries = generateAcceptedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const patternAnalyzer = new AutomationPatternAnalyzer(cfg);
    const patterns = patternAnalyzer.analyze(input).patterns;
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);

    const result = engine.generate(input, { patterns, outcomes, decisions, predictor, ranker });
    expect(result.recommendations[0]!.successPrediction).toBeDefined();
  });

  it('generates low success rate recommendation', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 3; i++) entries.push(createMockAutomationEntry({ outcome: 'rejected' }));
    for (let i = 0; i < 3; i++) entries.push(createMockAutomationEntry({ outcome: 'executed' }));
    const input = createMockInput({ automationHistory: entries });
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);

    const result = engine.generate(input, { patterns: [], outcomes, decisions, predictor, ranker });
    expect(result.recommendations.some((r) => r.reason.includes('success rate'))).toBe(true);
  });

  it('generates high ignore rate recommendation', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 7; i++) entries.push(createMockAutomationEntry({ outcome: 'ignored' }));
    for (let i = 0; i < 3; i++) entries.push(createMockAutomationEntry({ outcome: 'executed' }));
    const input = createMockInput({ automationHistory: entries });
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);

    const result = engine.generate(input, { patterns: [], outcomes, decisions, predictor, ranker });
    expect(result.recommendations.some((r) => r.reason.includes('ignore'))).toBe(true);
  });

  it('generates low health score recommendation', () => {
    const input = createMockInput({ healthScore: 30 });
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);

    const result = engine.generate(input, { patterns: [], outcomes, decisions, predictor, ranker });
    expect(result.recommendations.some((r) => r.reason.includes('Health score'))).toBe(true);
  });

  it('rejected patterns generate alternative recommendations', () => {
    const entries = generateRejectedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const patternAnalyzer = new AutomationPatternAnalyzer(cfg);
    const patterns = patternAnalyzer.analyze(input).patterns;
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);

    const result = engine.generate(input, { patterns, outcomes, decisions, predictor, ranker });
    const rejectedRec = result.recommendations.find((r) => r.reason.includes('rejected'));
    if (rejectedRec) {
      expect(rejectedRec.alternativeRecommendation).toBeDefined();
    }
  });

  it('recommendations are ranked', () => {
    const entries = generateAcceptedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const patternAnalyzer = new AutomationPatternAnalyzer(cfg);
    const patterns = patternAnalyzer.analyze(input).patterns;
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);

    const result = engine.generate(input, { patterns, outcomes, decisions, predictor, ranker });
    for (let i = 0; i < result.recommendations.length - 1; i++) {
      expect(result.recommendations[i]!.rankScore).toBeGreaterThanOrEqual(result.recommendations[i + 1]!.rankScore);
    }
  });

  it('registers and uses plugins', () => {
    const plugin: RecommendationPlugin = {
      getPluginName: () => 'test_recom',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      generate: () => createMockRecommendation({ id: 'plugin_recom', reason: 'From plugin' }),
    };
    engine.registerPlugin(plugin);
    const input = createMockInput();
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = engine.generate(input, { patterns: [], outcomes, decisions, predictor, ranker });
    expect(result.recommendations.some((r) => r.id === 'plugin_recom')).toBe(true);
  });
});

// ── Statistics ───────────────────────────────────────────────

describe('AutomationStatistics', () => {
  let stats: AutomationStatistics;
  let historyAnalyzer: AutomationHistoryAnalyzer;
  beforeEach(() => {
    historyAnalyzer = new AutomationHistoryAnalyzer();
    stats = new AutomationStatistics(historyAnalyzer);
  });

  it('computes empty statistics', () => {
    const result = stats.compute(createMockInput());
    expect(result.totalHistoryEntries).toBe(0);
    expect(result.overallSuccessRate).toBe(0);
  });

  it('computes total entries', () => {
    const input = createMockInput({
      automationHistory: [createMockAutomationEntry()],
      maintenanceHistory: [createMockMaintenanceEntry()],
      adaptiveHistory: [createMockAdaptiveEntry()],
    });
    const result = stats.compute(input);
    expect(result.totalHistoryEntries).toBe(3);
  });

  it('computes overall success rate', () => {
    const input = createMockInput({
      automationHistory: [
        createMockAutomationEntry({ outcome: 'executed' }),
        createMockAutomationEntry({ outcome: 'rejected' }),
      ],
    });
    const result = stats.compute(input);
    expect(result.overallSuccessRate).toBe(0.5);
  });

  it('computes acceptance rate', () => {
    const input = createMockInput({
      automationHistory: [
        createMockAutomationEntry({ outcome: 'approved' }),
        createMockAutomationEntry({ outcome: 'rejected' }),
      ],
    });
    const result = stats.compute(input);
    expect(result.overallAcceptanceRate).toBe(0.5);
  });

  it('computes average confidence', () => {
    const input = createMockInput({
      automationHistory: [
        createMockAutomationEntry({ confidence: 0.8 }),
        createMockAutomationEntry({ confidence: 0.6 }),
      ],
    });
    const result = stats.compute(input);
    expect(result.averageConfidence).toBe(0.7);
  });

  it('computes top rules', () => {
    const input = createMockInput({
      automationHistory: [
        createMockAutomationEntry({ ruleId: 'r1', outcome: 'executed' }),
        createMockAutomationEntry({ ruleId: 'r1', outcome: 'executed' }),
        createMockAutomationEntry({ ruleId: 'r2', outcome: 'rejected' }),
      ],
    });
    const result = stats.compute(input);
    expect(result.topRules.length).toBeGreaterThan(0);
    expect(result.topRules[0]!.ruleId).toBe('r1');
    expect(result.topRules[0]!.successRate).toBe(1.0);
  });

  it('byTriggerType breakdown works', () => {
    const input = createMockInput({
      automationHistory: [
        createMockAutomationEntry({ triggerType: 'system_idle' }),
        createMockAutomationEntry({ triggerType: 'system_idle' }),
        createMockAutomationEntry({ triggerType: 'power_connected' }),
      ],
    });
    const result = stats.compute(input);
    expect(result.byTriggerType['system_idle']).toBe(2);
    expect(result.byTriggerType['power_connected']).toBe(1);
  });

  it('getEvidence returns evidence', () => {
    const result = stats.compute(createMockInput({ automationHistory: [createMockAutomationEntry()] }));
    const evidence = stats.getEvidence(result);
    expect(evidence.length).toBeGreaterThan(0);
  });
});

// ── Insights ─────────────────────────────────────────────────

describe('AutomationInsights', () => {
  let insights: AutomationInsights;
  let cfg: IntelligenceConfiguration;
  beforeEach(() => {
    cfg = createMockConfig();
    insights = new AutomationInsights(cfg);
  });

  it('generates most valuable rule insight', () => {
    const entries = generateAcceptedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    const valuable = result.insights.find((i) => i.type === 'most_valuable_rule');
    expect(valuable).toBeDefined();
  });

  it('generates least useful rule insight', () => {
    const entries = generateRejectedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    const leastUseful = result.insights.find((i) => i.type === 'least_useful_rule');
    expect(leastUseful).toBeDefined();
  });

  it('generates optimization opportunity insight for low health', () => {
    const input = createMockInput({ healthScore: 30 });
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    const opp = result.insights.find((i) => i.type === 'optimization_opportunities');
    expect(opp).toBeDefined();
  });

  it('generates automation effectiveness insight', () => {
    const entries = generateAcceptedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    const effectiveness = result.insights.find((i) => i.type === 'automation_effectiveness');
    expect(effectiveness).toBeDefined();
  });

  it('generates future improvements insight', () => {
    const entries = generateRejectedHistory(7);
    const input = createMockInput({ automationHistory: entries });
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    const future = result.insights.find((i) => i.type === 'future_improvements');
    expect(future).toBeDefined();
  });

  it('generates rule effectiveness insight', () => {
    const entries = [
      ...generateAcceptedHistory(5),
      ...generateRejectedHistory(5),
    ];
    const input = createMockInput({ automationHistory: entries });
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    const ruleEff = result.insights.find((i) => i.type === 'rule_effectiveness');
    expect(ruleEff).toBeDefined();
  });

  it('generates prediction accuracy insight', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(createMockAutomationEntry({
        outcome: 'executed',
        metadata: { predictedSuccess: 0.8 },
      }));
    }
    const input = createMockInput({ automationHistory: entries });
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    const accuracy = result.insights.find((i) => i.type === 'prediction_accuracy');
    expect(accuracy).toBeDefined();
  });

  it('generates health trend insight', () => {
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 4; i++) {
      entries.push(createMockAutomationEntry({ outcome: i < 2 ? 'rejected' : 'executed' }));
    }
    const input = createMockInput({ automationHistory: entries });
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    const healthTrend = result.insights.find((i) => i.type === 'health_trend');
    expect(healthTrend).toBeDefined();
  });

  it('insights include supporting evidence', () => {
    const entries = generateAcceptedHistory(5);
    const input = createMockInput({ automationHistory: entries });
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    for (const insight of result.insights) {
      expect(insight.supportingEvidence.length).toBeGreaterThan(0);
    }
  });

  it('registers and uses plugins', () => {
    const plugin: InsightPlugin = {
      getPluginName: () => 'test_insight',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      getInsightType: () => 'most_valuable_rule' as InsightType,
      generate: () => ({
        id: 'plugin_insight',
        type: 'most_valuable_rule' as InsightType,
        title: 'Plugin Insight',
        description: 'From plugin',
        confidence: 0.9,
        impact: 0.8,
        supportingEvidence: [],
        actionable: true,
        suggestedActions: [],
        futureMetadata: {},
      }),
    };
    insights.registerPlugin(plugin);
    const input = createMockInput();
    const stats = new AutomationStatistics(new AutomationHistoryAnalyzer()).compute(input);
    const outcomes = new AutomationOutcomeAnalyzer().analyze(input);
    const decisions = new AutomationDecisionAnalyzer().analyze(input);
    const result = insights.generate(input, { patterns: [], outcomes, decisions, statistics: stats });
    expect(result.insights.some((i) => i.id === 'plugin_insight')).toBe(true);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('IntelligenceValidator', () => {
  let validator: IntelligenceValidator;
  beforeEach(() => { validator = new IntelligenceValidator(); });

  it('validates correct recommendation', () => {
    const result = validator.validateRecommendation(createMockRecommendation());
    expect(result.valid).toBe(true);
  });

  it('detects missing id', () => {
    const rec = createMockRecommendation();
    rec.id = '';
    const result = validator.validateRecommendation(rec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_ID')).toBe(true);
  });

  it('detects invalid confidence', () => {
    const rec = createMockRecommendation({ confidence: 1.5 });
    const result = validator.validateRecommendation(rec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_CONFIDENCE')).toBe(true);
  });

  it('warns on no evidence', () => {
    const rec = createMockRecommendation({ supportingEvidence: [] });
    const result = validator.validateRecommendation(rec);
    expect(result.warnings.some((w) => w.code === 'NO_EVIDENCE')).toBe(true);
  });

  it('warns on low confidence', () => {
    const rec = createMockRecommendation({ confidence: 0.2 });
    const result = validator.validateRecommendation(rec);
    expect(result.warnings.some((w) => w.code === 'LOW_CONFIDENCE')).toBe(true);
  });

  it('validates correct prediction', () => {
    const pred: SuccessPrediction = {
      id: 'pred_1', predictedSuccessRate: 0.8, confidence: 0.7, basedOnSamples: 10,
      supportingEvidence: [{ source: 'test', metric: 'm', value: 1, timestamp: new Date().toISOString(), description: 'd', futureMetadata: {} }],
      factors: [{ name: 'f', weight: 0.5, value: 0.8, contribution: 0.4, description: 'd' }],
      riskLevel: 'low', futureMetadata: {},
    };
    const result = validator.validatePrediction(pred);
    expect(result.valid).toBe(true);
  });

  it('detects invalid prediction rate', () => {
    const pred: SuccessPrediction = {
      id: 'pred_1', predictedSuccessRate: 1.5, confidence: 0.7, basedOnSamples: 10,
      supportingEvidence: [], factors: [], riskLevel: 'low', futureMetadata: {},
    };
    const result = validator.validatePrediction(pred);
    expect(result.valid).toBe(false);
  });

  it('warns on low samples', () => {
    const pred: SuccessPrediction = {
      id: 'pred_1', predictedSuccessRate: 0.8, confidence: 0.7, basedOnSamples: 1,
      supportingEvidence: [], factors: [], riskLevel: 'low', futureMetadata: {},
    };
    const result = validator.validatePrediction(pred);
    expect(result.warnings.some((w) => w.code === 'LOW_SAMPLES')).toBe(true);
  });

  it('validates correct pattern', () => {
    const pattern: DetectedPattern = {
      id: 'p1', type: 'frequently_accepted', name: 'Test', description: 'd',
      confidence: 0.8, frequency: 5, supportingEvidence: [],
      affectedRules: [], affectedTriggers: [], affectedActions: [],
      metadata: {}, futureMetadata: {},
    };
    const result = validator.validatePattern(pattern);
    expect(result.valid).toBe(true);
  });

  it('detects invalid pattern confidence', () => {
    const pattern: DetectedPattern = {
      id: 'p1', type: 'frequently_accepted', name: 'Test', description: 'd',
      confidence: 1.5, frequency: 5, supportingEvidence: [],
      affectedRules: [], affectedTriggers: [], affectedActions: [],
      metadata: {}, futureMetadata: {},
    };
    const result = validator.validatePattern(pattern);
    expect(result.valid).toBe(false);
  });
});

// ── Learning Engine ──────────────────────────────────────────

describe('AutomationLearningEngine', () => {
  let engine: AutomationLearningEngine;
  beforeEach(() => { engine = new AutomationLearningEngine(createMockConfig()); });

  it('learns from empty history', () => {
    const result = engine.learn(createMockInput());
    expect(result).toBeDefined();
    expect(result.analyzedAt).toBeDefined();
    expect(result.analysisDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('learns from automation history', () => {
    const entries = generateAcceptedHistory(5);
    const result = engine.learn(createMockInput({ automationHistory: entries }));
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.statistics.totalAutomationEntries).toBe(5);
  });

  it('produces all result sections', () => {
    const result = engine.learn(createMockInput({ automationHistory: generateAcceptedHistory(5) }));
    expect(result.patterns).toBeDefined();
    expect(result.outcomes).toBeDefined();
    expect(result.decisions).toBeDefined();
    expect(result.predictions).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(result.insights).toBeDefined();
    expect(result.statistics).toBeDefined();
  });

  it('predictSuccess works standalone', () => {
    const pred = engine.predictSuccess({ futureMetadata: {} }, createMockInput());
    expect(pred).toBeDefined();
    expect(pred.predictedSuccessRate).toBeGreaterThan(0);
  });

  it('detectPatterns works standalone', () => {
    const patterns = engine.detectPatterns(createMockInput({ automationHistory: generateAcceptedHistory(5) }));
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('getStatistics works standalone', () => {
    const stats = engine.getStatistics(createMockInput({ automationHistory: [createMockAutomationEntry()] }));
    expect(stats.totalAutomationEntries).toBe(1);
  });

  it('validate works on learning result', () => {
    const result = engine.learn(createMockInput());
    const validation = engine.validate(result);
    expect(validation).toBeDefined();
  });

  it('respects feature flags', () => {
    const cfg = createMockConfig();
    cfg.featureFlags.enablePatternDetection = false;
    const engine2 = new AutomationLearningEngine(cfg);
    const result = engine2.learn(createMockInput({ automationHistory: generateAcceptedHistory(5) }));
    expect(result.patterns.length).toBe(0);
  });
});

// ── Manager ──────────────────────────────────────────────────

describe('AutomationIntelligenceManager', () => {
  let manager: AutomationIntelligenceManager;
  beforeEach(() => { manager = new AutomationIntelligenceManager(); });

  it('analyzeHistory returns learning result', () => {
    manager.setHistory(generateAcceptedHistory(5));
    const result = manager.analyzeHistory();
    expect(result).toBeDefined();
    expect(result.statistics.totalAutomationEntries).toBe(5);
  });

  it('detectPatterns returns patterns', () => {
    manager.setHistory(generateAcceptedHistory(5));
    const patterns = manager.detectPatterns();
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('generateInsights returns insights', () => {
    manager.setHistory(generateAcceptedHistory(5));
    manager.analyzeHistory();
    const insights = manager.generateInsights();
    expect(insights.length).toBeGreaterThan(0);
  });

  it('rankRecommendations returns ranked recommendations', () => {
    const recs = [
      createMockRecommendation({ id: 'a', historicalSuccess: 0.3 }),
      createMockRecommendation({ id: 'b', historicalSuccess: 0.9 }),
    ];
    const ranked = manager.rankRecommendations(recs);
    expect(ranked[0]!.id).toBe('b');
  });

  it('predictSuccess returns prediction', () => {
    const pred = manager.predictSuccess({ futureMetadata: {} });
    expect(pred).toBeDefined();
    expect(pred.predictedSuccessRate).toBeGreaterThan(0);
  });

  it('getAutomationStatistics returns stats', () => {
    manager.setHistory(generateAcceptedHistory(3));
    manager.analyzeHistory();
    const stats = manager.getAutomationStatistics();
    expect(stats.totalAutomationEntries).toBe(3);
  });

  it('getAutomationInsights returns insights', () => {
    manager.setHistory(generateAcceptedHistory(5));
    manager.analyzeHistory();
    const insights = manager.getAutomationInsights();
    expect(insights.length).toBeGreaterThan(0);
  });

  it('emits history_analyzed event', () => {
    let emitted = false;
    manager.on('history_analyzed', () => { emitted = true; });
    manager.setHistory(generateAcceptedHistory(3));
    manager.analyzeHistory();
    expect(emitted).toBe(true);
  });

  it('emits patterns_detected event', () => {
    let emitted = false;
    manager.on('patterns_detected', () => { emitted = true; });
    manager.setHistory(generateAcceptedHistory(5));
    manager.analyzeHistory();
    expect(emitted).toBe(true);
  });

  it('emits automation_intelligence_updated event', () => {
    let emitted = false;
    manager.on('automation_intelligence_updated', () => { emitted = true; });
    manager.setHistory(generateAcceptedHistory(3));
    manager.analyzeHistory();
    expect(emitted).toBe(true);
  });

  it('events disabled does not emit', () => {
    const cfg = createIntelligenceConfiguration({ enableEvents: false });
    const m = new AutomationIntelligenceManager(cfg);
    let emitted = false;
    m.on('history_analyzed', () => { emitted = true; });
    m.setHistory(generateAcceptedHistory(3));
    m.analyzeHistory();
    expect(emitted).toBe(false);
  });

  it('config is accessible', () => {
    expect(manager.config.configVersion).toBe('1.0.0');
  });

  it('updateConfig updates config', () => {
    manager.updateConfig({ minSamplesForPrediction: 10 });
    expect(manager.config.minSamplesForPrediction).toBe(10);
  });

  it('clear resets state', () => {
    manager.setHistory(generateAcceptedHistory(3));
    manager.analyzeHistory();
    manager.clear();
    expect(manager.getLastResult()).toBeNull();
  });

  it('setSystemState updates state', () => {
    manager.setSystemState(createMockState({ cpuUsage: 90 }));
    manager.analyzeHistory();
  });

  it('setHealthScore updates score', () => {
    manager.setHealthScore(25);
    manager.setHistory(generateAcceptedHistory(3));
    manager.analyzeHistory();
    expect(manager.getAutomationStatistics().totalAutomationEntries).toBe(3);
  });

  it('validate returns result', () => {
    manager.setHistory(generateAcceptedHistory(3));
    manager.analyzeHistory();
    const validation = manager.validate();
    expect(validation).toBeDefined();
  });

  it('registerPatternPlugin adds plugin', () => {
    const plugin: PatternAnalyzerPlugin = {
      getPluginName: () => 'test', getVersion: () => '1.0.0', getPriority: () => 1,
      isAvailable: () => true, getPatternType: () => 'frequently_accepted' as PatternType,
      analyze: () => null,
    };
    expect(() => manager.registerPatternPlugin(plugin)).not.toThrow();
  });

  it('getRecommendations returns recommendations after analysis', () => {
    manager.setHistory(generateAcceptedHistory(5));
    manager.analyzeHistory();
    expect(manager.getRecommendations().length).toBeGreaterThan(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.AutomationIntelligenceManager).toBeDefined();
    expect(module.AutomationLearningEngine).toBeDefined();
    expect(module.AutomationHistoryAnalyzer).toBeDefined();
    expect(module.AutomationOutcomeAnalyzer).toBeDefined();
    expect(module.AutomationDecisionAnalyzer).toBeDefined();
    expect(module.AutomationPatternAnalyzer).toBeDefined();
    expect(module.AutomationSuccessPredictor).toBeDefined();
    expect(module.AutomationRankingEngine).toBeDefined();
    expect(module.AutomationRecommendationEngine).toBeDefined();
    expect(module.AutomationStatistics).toBeDefined();
    expect(module.AutomationInsights).toBeDefined();
    expect(module.IntelligenceValidator).toBeDefined();
    expect(module.IntelligenceEvents).toBeDefined();
    expect(module.DEFAULT_INTELLIGENCE_CONFIGURATION).toBeDefined();
  });

  it('full lifecycle: set history → analyze → insights → stats → validate', () => {
    const manager = new AutomationIntelligenceManager();
    manager.setHistory(generateAcceptedHistory(5), [
      createMockMaintenanceEntry({ outcome: 'completed' }),
    ], [createMockAdaptiveEntry()]);
    manager.setHealthScore(55);
    manager.setDeviceProfileType('general');

    const result = manager.analyzeHistory();
    expect(result.statistics.totalHistoryEntries).toBe(7);

    const insights = manager.getAutomationInsights();
    expect(insights.length).toBeGreaterThan(0);

    const stats = manager.getAutomationStatistics();
    expect(stats.totalAutomationEntries).toBe(5);

    const validation = manager.validate();
    expect(validation).toBeDefined();
  });

  it('built-in pattern rules cover all specified types', () => {
    const cfg = createDefaultIntelligenceConfiguration();
    const types = cfg.patternRules.map((r) => r.type);
    expect(types).toContain('frequently_accepted');
    expect(types).toContain('frequently_rejected');
    expect(types).toContain('best_maintenance_windows');
    expect(types).toContain('most_effective_profiles');
    expect(types).toContain('most_successful_strategies');
    expect(types).toContain('most_beneficial_recommendations');
    expect(types).toContain('recurring_problems');
    expect(types).toContain('recurring_improvements');
    expect(types).toContain('frequently_deferred');
    expect(types).toContain('frequently_cancelled');
  });

  it('built-in ranking weights cover all specified factors', () => {
    const cfg = createDefaultIntelligenceConfiguration();
    const factors = cfg.rankingWeights.map((w) => w.factor);
    expect(factors).toContain('historical_success');
    expect(factors).toContain('benefit');
    expect(factors).toContain('risk');
    expect(factors).toContain('prediction_confidence');
    expect(factors).toContain('health_score');
    expect(factors).toContain('user_preference');
    expect(factors).toContain('automation_history');
    expect(factors).toContain('device_profile');
  });

  it('built-in prediction rules cover all specified factors', () => {
    const cfg = createDefaultIntelligenceConfiguration();
    const factors = cfg.predictionRules.map((r) => r.factor);
    expect(factors).toContain('historical_success');
    expect(factors).toContain('benefit');
    expect(factors).toContain('risk');
    expect(factors).toContain('prediction_confidence');
    expect(factors).toContain('health_score');
  });

  it('every recommendation is explainable', () => {
    const manager = new AutomationIntelligenceManager();
    manager.setHistory(generateAcceptedHistory(5));
    const result = manager.analyzeHistory();
    for (const rec of result.recommendations.recommendations) {
      expect(rec.reason).toBeDefined();
      expect(rec.reason.length).toBeGreaterThan(0);
      expect(rec.supportingEvidence.length).toBeGreaterThan(0);
      expect(rec.confidence).toBeGreaterThanOrEqual(0);
      expect(rec.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('full analysis under 300ms', () => {
    const manager = new AutomationIntelligenceManager();
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push(createMockAutomationEntry({
        ruleId: `rule_${i % 10}`,
        outcome: i % 3 === 0 ? 'rejected' : 'executed',
        confidence: 0.5 + (i % 5) * 0.1,
      }));
    }
    manager.setHistory(entries);
    const start = performance.now();
    manager.analyzeHistory();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(300);
  });

  it('pattern detection under 100ms', () => {
    const analyzer = new AutomationPatternAnalyzer(createMockConfig());
    const entries: AutomationHistoryEntry[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push(createMockAutomationEntry({ ruleId: `rule_${i % 5}` }));
    }
    const start = performance.now();
    analyzer.analyze(createMockInput({ automationHistory: entries }));
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles no history', () => {
    const manager = new AutomationIntelligenceManager();
    const result = manager.analyzeHistory();
    expect(result.statistics.totalHistoryEntries).toBe(0);
    expect(result.patterns.length).toBe(0);
  });

  it('handles single entry', () => {
    const manager = new AutomationIntelligenceManager();
    manager.setHistory([createMockAutomationEntry()]);
    const result = manager.analyzeHistory();
    expect(result.statistics.totalAutomationEntries).toBe(1);
  });

  it('handles all rejected history', () => {
    const manager = new AutomationIntelligenceManager();
    manager.setHistory(generateRejectedHistory(10));
    const result = manager.analyzeHistory();
    expect(result.outcomes.automationMetrics.successRate).toBe(0);
  });

  it('handles all executed history', () => {
    const manager = new AutomationIntelligenceManager();
    manager.setHistory(generateAcceptedHistory(10));
    const result = manager.analyzeHistory();
    expect(result.outcomes.automationMetrics.successRate).toBe(1.0);
  });

  it('handles mixed history sources', () => {
    const manager = new AutomationIntelligenceManager();
    manager.setHistory(
      generateAcceptedHistory(3),
      [createMockMaintenanceEntry({ outcome: 'completed' }), createMockMaintenanceEntry({ outcome: 'cancelled' })],
      [createMockAdaptiveEntry(), createMockAdaptiveEntry({ confidence: 0.9 })],
    );
    const result = manager.analyzeHistory();
    expect(result.statistics.totalHistoryEntries).toBe(7);
  });

  it('handles extreme health score', () => {
    const manager = new AutomationIntelligenceManager();
    manager.setHealthScore(0);
    manager.setHistory(generateAcceptedHistory(3));
    const result = manager.analyzeHistory();
    expect(result.statistics).toBeDefined();
  });

  it('handles high health score', () => {
    const manager = new AutomationIntelligenceManager();
    manager.setHealthScore(100);
    manager.setHistory(generateAcceptedHistory(3));
    const result = manager.analyzeHistory();
    expect(result).toBeDefined();
  });

  it('handles unknown device profile', () => {
    const manager = new AutomationIntelligenceManager();
    manager.setDeviceProfileType('unknown_profile');
    manager.setHistory(generateAcceptedHistory(3));
    const result = manager.analyzeHistory();
    expect(result).toBeDefined();
  });

  it('handles all feature flags disabled', () => {
    const cfg = createIntelligenceConfiguration({
      featureFlags: {
        enablePatternDetection: false,
        enableOutcomeAnalysis: false,
        enableDecisionAnalysis: false,
        enableSuccessPrediction: false,
        enableRanking: false,
        enableRecommendations: false,
        enableInsights: false,
        enableStatistics: false,
        enableHistoryAnalysis: false,
        enableIncrementalUpdates: false,
        futureFlags: {},
      },
    });
    const manager = new AutomationIntelligenceManager(cfg);
    manager.setHistory(generateAcceptedHistory(5));
    const result = manager.analyzeHistory();
    expect(result.patterns.length).toBe(0);
    expect(result.recommendations.recommendations.length).toBe(0);
    expect(result.insights.insights.length).toBe(0);
  });

  it('handles events disabled', () => {
    const cfg = createIntelligenceConfiguration({ enableEvents: false });
    const manager = new AutomationIntelligenceManager(cfg);
    let emitted = false;
    manager.on('history_analyzed', () => { emitted = true; });
    manager.setHistory(generateAcceptedHistory(3));
    manager.analyzeHistory();
    expect(emitted).toBe(false);
  });
});
