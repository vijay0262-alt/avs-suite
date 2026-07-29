/**
 * Tests for Core AI Dashboard Widgets.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  CoreWidgetDataBundle,
  HealthOverviewData,
  RecommendationData,
  QuickWinsData,
  PredictionData,
  AchievementData,
  OptimizationActivityData,
  DeviceProfileData,
} from '../types';
import {
  getHealthStatus,
  getHealthTrend,
  createDefaultCoreWidgetConfig,
  createDefaultAccessibilityConfig,
} from '../types';
import {
  DEFAULT_CORE_WIDGET_CONFIG,
  createCoreWidgetConfig,
  createAccessibilityConfig,
} from '../widgetConfiguration';
import { DashboardSummaryProvider } from '../dashboardSummaryProvider';
import { WidgetCoordinator } from '../widgetCoordinator';
import { DashboardCoordinator } from '../dashboardCoordinator';
import { HealthOverviewProvider } from '../healthOverviewWidget';
import { RecommendationProvider } from '../recommendationWidget';
import { QuickWinsProvider } from '../quickWinsWidget';
import { PredictionProvider } from '../predictionWidget';
import { AchievementProvider } from '../achievementWidget';
import { OptimizationHistoryProvider } from '../optimizationHistoryWidget';
import { DeviceProfileProvider } from '../deviceProfileWidget';
import type { AIContext } from '../../../ai-intelligence/context/types';
import type { KnowledgeObject } from '../../../ai-intelligence/knowledge/types';
import type { RecommendationList, Recommendation } from '../../../ai-intelligence/recommendations/types';
import type { PredictionList, Prediction } from '../../../ai-intelligence/predictions/types';
import type { DeviceProfile } from '../../../ai-intelligence/device-profile/types';

// ── Mock Data Builders ───────────────────────────────────────

function createMockAIContext(overrides: Partial<AIContext> = {}): AIContext {
  return {
    metadata: {
      contextId: 'ctx_1',
      timestamp: new Date().toISOString(),
      contextVersion: '1.0.0',
      appVersion: '1.0.0',
      platform: 'win32',
      language: 'en',
      currentPlan: 'FREE',
      generationTimeMs: 10,
    },
    health: {
      overallScore: 85,
      cpuScore: 90,
      ramScore: 80,
      diskScore: 75,
      stabilityScore: 85,
      securityScore: 88,
      issues: [],
      provenance: {
        providerName: 'health',
        providerVersion: '1.0.0',
        collectedAt: new Date().toISOString(),
        confidence: 0.92,
        evidence: [],
      },
    },
    history: {
      totalOptimizations: 15,
      totalCleanedMB: 2048,
      totalIssuesFixed: 30,
      lastOptimizationAt: new Date().toISOString(),
      optimizationHistory: [
        { timestamp: new Date().toISOString(), type: 'junk_clean', itemsProcessed: 100, spaceFreedMB: 500, durationSec: 30 },
        { timestamp: new Date().toISOString(), type: 'startup_optimize', itemsProcessed: 5, spaceFreedMB: 0, durationSec: 10 },
      ],
      provenance: {
        providerName: 'history',
        providerVersion: '1.0.0',
        collectedAt: new Date().toISOString(),
        confidence: 0.95,
        evidence: [],
      },
    },
    ...overrides,
  } as AIContext;
}

function createMockKnowledge(overrides: Partial<KnowledgeObject> = {}): KnowledgeObject {
  return {
    metadata: {
      knowledgeId: 'k_1',
      contextId: 'ctx_1',
      generatedAt: new Date().toISOString(),
      knowledgeVersion: '1.0.0',
      generationTimeMs: 20,
      factsCount: 5,
      relationshipsCount: 2,
      changesCount: 1,
      trendsCount: 1,
      summariesCount: 1,
      insightsCount: 0,
    },
    facts: [
      { id: 'f1', category: 'health', name: 'overall_health', value: 85, dataType: 'number', unit: null, description: 'Health score is 85', evidence: { statement: 'test', dataPoints: [], sourceProviders: [], contextTimestamp: '', confidence: 0.9 }, confidence: 0.9, sourceProvider: 'health', extractedAt: new Date().toISOString() },
    ],
    relationships: [],
    changes: [
      { id: 'c1', factId: 'f1', factName: 'overall_health', changeType: 'increase', previousValue: 80, currentValue: 85, delta: 5, deltaDescription: 'Health score improved by 5 points', evidence: { statement: 'test', dataPoints: [], sourceProviders: [], contextTimestamp: '', confidence: 0.9 }, detectedAt: new Date().toISOString() },
    ],
    trends: [
      { id: 't1', factId: 'f1', factName: 'overall_health', direction: 'increasing', dataPoints: [], slope: 0.5, variability: 0.1, evidence: { statement: 'test', dataPoints: [], sourceProviders: [], contextTimestamp: '', confidence: 0.9 }, analyzedAt: new Date().toISOString() },
    ],
    summaries: [
      { type: 'health', title: 'System health is good', statements: [{ text: 'Health score is 85', factIds: ['f1'], confidence: 0.9 }], evidence: { statement: 'test', dataPoints: [], sourceProviders: [], contextTimestamp: '', confidence: 0.9 }, confidence: 0.9, generatedAt: new Date().toISOString() },
    ],
    insights: [],
    graph: { nodes: [], edges: [] },
    provenance: [],
    statistics: { totalFacts: 5, totalRelationships: 2, totalChanges: 1, totalTrends: 1, totalSummaries: 1, totalInsights: 0, averageConfidence: 0.9, knowledgeCoverage: 0.85 },
    ...overrides,
  } as unknown as KnowledgeObject;
}

function createMockRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec_1',
    title: 'Clean temporary files',
    summary: 'Clean 500MB of temp files',
    description: 'Remove temporary files to free up disk space',
    category: 'storage',
    priority: 'high',
    scores: { impactScore: 0.8, safetyScore: 0.95, urgencyScore: 0.7, effortScore: 0.9, confidenceScore: 0.85, overallScore: 0.82 },
    evidence: { supportingFacts: [], supportingRelationships: [], supportingTrends: [], supportingChanges: [], evidence: { statement: 'test', dataPoints: [], sourceProviders: [], contextTimestamp: '', confidence: 0.85 }, evidenceCount: 3, sourceProviders: ['storage'], confidence: 0.85 },
    benefits: { estimatedTime: 30, estimatedBenefit: '500MB recovered', estimatedSpaceRecovered: 500, estimatedPerformanceGain: 5, estimatedPrivacyImprovement: null, estimatedHealthIncrease: 3 },
    safety: { riskLevel: 'none', rollbackAvailable: true, requiresConfirmation: false, automaticExecutionAllowed: true, automationEligible: true, warnings: [] },
    requiresPro: false,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    status: 'active',
    futureMetadata: {},
    ...overrides,
  };
}

function createMockRecommendationList(recs: Recommendation[] = [createMockRecommendation()]): RecommendationList {
  return {
    recommendations: recs,
    metadata: { listId: 'rl_1', knowledgeId: 'k_1', generatedAt: new Date().toISOString(), recommendationVersion: '1.0.0', generationTimeMs: 15, totalRecommendations: recs.length, filteredCount: 0 },
    statistics: { totalRecommendations: recs.length, byCategory: {}, byPriority: {}, byRiskLevel: {}, averageImpact: 0.8, averageSafety: 0.9, averageUrgency: 0.7, averageEffort: 0.8, averageConfidence: 0.85, averageOverall: 0.82, quickWinsCount: 0, safeCount: 0, proRequiredCount: 0, automationEligibleCount: 0, estimatedTotalTime: 0, estimatedTotalSpaceRecovered: 0 },
  };
}

function createMockPrediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    id: 'pred_1',
    title: 'Storage will be full in 30 days',
    summary: 'At current rate, disk will be full in 30 days',
    description: 'Based on trend analysis, storage will reach capacity',
    category: 'storage',
    predictionType: 'storage_capacity',
    currentValue: 80,
    predictedValue: 100,
    unit: '%',
    predictionDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    timeHorizon: '30d',
    confidenceScore: 0.82,
    trend: 'increasing',
    trendSlope: 0.5,
    riskLevel: 'high',
    impactLevel: 'high',
    evidence: { relatedFacts: [], relatedTrends: [], relatedKnowledge: [], historicalDataPoints: [], evidence: { statement: 'test', dataPoints: [], sourceProviders: [], contextTimestamp: '', confidence: 0.82 }, evidenceCount: 5, sourceProviders: ['storage'], confidence: 0.82, historicalSamples: 10, dataFreshness: 1, modelVersion: '1.0.0', assumptions: [] },
    relatedKnowledge: [],
    relatedInsights: [],
    generatedAt: new Date().toISOString(),
    expiresAt: null,
    status: 'active',
    futureMetadata: {},
    ...overrides,
  };
}

function createMockPredictionList(preds: Prediction[] = [createMockPrediction()]): PredictionList {
  return {
    predictions: preds,
    metadata: { listId: 'pl_1', knowledgeId: 'k_1', generatedAt: new Date().toISOString(), predictionVersion: '1.0.0', generationTimeMs: 20, totalPredictions: preds.length, historicalSnapshots: 5 },
    statistics: { totalPredictions: preds.length, byType: {}, byCategory: {}, byRiskLevel: {}, byTimeHorizon: {}, byTrend: {}, averageConfidence: 0.82, criticalCount: 0, highRiskCount: 1, fulfilledCount: 0, expiredCount: 0 },
  };
}

function createMockDeviceProfile(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  return {
    id: 'dp_1',
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deviceName: 'DESKTOP-GAMING',
    platform: 'win32',
    hardwareSummary: {
      cpuModel: 'Intel i7-12700K',
      cpuCores: 12,
      totalMemoryMB: 32768,
      gpuModel: 'RTX 3080',
      storageType: 'SSD',
      storageCapacityMB: 1048576,
      driveCount: 2,
      performanceTier: 'high_end',
      displayCount: 2,
      hasBattery: false,
      details: { ramCapacity: 'high', cpuTier: 'high', gpuTier: 'high', storageTier: 'high', isLaptop: false, isServer: false, isVirtualMachine: false },
      confidence: 0.9,
    },
    softwareSummary: { installedAppCount: 50, developerToolCount: 5, creativeSoftwareCount: 2, gameCount: 10, officeSuiteCount: 1, browserCount: 3, virtualizationCount: 0, securitySoftwareCount: 1, backgroundServiceCount: 20, categories: [], confidence: 0.85 },
    usageSummary: { optimizationFrequency: 'high', browsingActivity: 'medium', startupBehavior: 'moderate', diskGrowthRate: 'moderate', storageConsumption: 'medium', maintenanceHabits: 'proactive', sessionDuration: 'long', applicationCategories: [], confidence: 0.8 },
    workloadSummary: { primaryWorkload: 'gaming', secondaryWorkloads: ['development'], workloadScores: { gaming: 0.8, development: 0.3 }, confidence: 0.85 },
    primaryProfile: 'gaming_pc',
    secondaryProfiles: [{ profileType: 'developer_workstation', score: 0.3, weight: 0.2, evidence: [] }],
    profileScores: [{ profileType: 'gaming_pc', score: 0.8, weight: 0.6, evidence: [] }],
    confidenceScore: 0.88,
    evidence: { relatedFacts: [], relatedKnowledge: [], relatedPredictions: [], contextEvidence: [], knowledgeEvidence: [], evidenceCount: 10, sourceProviders: [], confidence: 0.88, historicalStability: 0.9, profileConsistency: 0.85, dataFreshness: 1, assumptions: [] },
    changeHistory: [{ id: 'ch_1', timestamp: new Date().toISOString(), changeType: 'new', fromProfile: null, toProfile: 'gaming_pc', fromScore: null, toScore: 0.8, description: 'Initial profile', metadata: {} }],
    futureMetadata: {},
    ...overrides,
  } as DeviceProfile;
}

function createMockDataBundle(overrides: Partial<CoreWidgetDataBundle> = {}): CoreWidgetDataBundle {
  return {
    aiContext: createMockAIContext(),
    knowledge: createMockKnowledge(),
    recommendations: createMockRecommendationList(),
    insights: null,
    predictions: createMockPredictionList(),
    deviceProfile: createMockDeviceProfile(),
    ...overrides,
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('getHealthStatus returns correct status', () => {
    expect(getHealthStatus(95)).toBe('excellent');
    expect(getHealthStatus(80)).toBe('good');
    expect(getHealthStatus(65)).toBe('fair');
    expect(getHealthStatus(45)).toBe('poor');
    expect(getHealthStatus(20)).toBe('critical');
    expect(getHealthStatus(0)).toBe('unknown');
  });
  it('getHealthTrend maps trend directions', () => {
    expect(getHealthTrend('improving')).toBe('improving');
    expect(getHealthTrend('increasing')).toBe('improving');
    expect(getHealthTrend('stable')).toBe('stable');
    expect(getHealthTrend('declining')).toBe('declining');
    expect(getHealthTrend('decreasing')).toBe('declining');
    expect(getHealthTrend('oscillating')).toBe('unknown');
    expect(getHealthTrend(null)).toBe('unknown');
  });
  it('createDefaultCoreWidgetConfig has 7 widgets', () => {
    const cfg = createDefaultCoreWidgetConfig();
    expect(cfg.widgetOrder.length).toBe(7);
    expect(cfg.widgetOrder).toContain('health_overview');
    expect(cfg.widgetOrder).toContain('recommendations');
    expect(cfg.widgetOrder).toContain('quick_wins');
    expect(cfg.widgetOrder).toContain('predictions');
    expect(cfg.widgetOrder).toContain('achievements');
    expect(cfg.widgetOrder).toContain('optimization_activity');
    expect(cfg.widgetOrder).toContain('device_profile');
  });
  it('createDefaultAccessibilityConfig has all features', () => {
    const cfg = createDefaultAccessibilityConfig();
    expect(cfg.keyboardNavigation).toBe(true);
    expect(cfg.screenReaderCompatibility).toBe(true);
    expect(cfg.responsiveLayouts).toBe(true);
    expect(cfg.highContrastCompatibility).toBe(true);
    expect(cfg.reducedMotionSupport).toBe(true);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('CoreWidgetConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_CORE_WIDGET_CONFIG.widgetOrder.length).toBe(7);
    expect(DEFAULT_CORE_WIDGET_CONFIG.parallelLoading).toBe(true);
    expect(DEFAULT_CORE_WIDGET_CONFIG.enableEvents).toBe(true);
  });
  it('createCoreWidgetConfig accepts overrides', () => {
    const cfg = createCoreWidgetConfig({ parallelLoading: false });
    expect(cfg.parallelLoading).toBe(false);
    expect(cfg.enableEvents).toBe(true);
  });
  it('createCoreWidgetConfig merges widgetVisibility', () => {
    const cfg = createCoreWidgetConfig({ widgetVisibility: { predictions: false } });
    expect(cfg.widgetVisibility.predictions).toBe(false);
    expect(cfg.widgetVisibility.health_overview).toBe(true);
  });
  it('createCoreWidgetConfig merges refreshIntervalsMs', () => {
    const cfg = createCoreWidgetConfig({ refreshIntervalsMs: { health_overview: 5000 } });
    expect(cfg.refreshIntervalsMs.health_overview).toBe(5000);
  });
  it('createCoreWidgetConfig merges priorityRules', () => {
    const cfg = createCoreWidgetConfig({ priorityRules: { achievements: 'high' } });
    expect(cfg.priorityRules.achievements).toBe('high');
  });
  it('createCoreWidgetConfig merges featureFlags', () => {
    const cfg = createCoreWidgetConfig({ featureFlags: { enablePredictions: false } });
    expect(cfg.featureFlags.enablePredictions).toBe(false);
    expect(cfg.featureFlags.enableHealthOverview).toBe(true);
  });
  it('createCoreWidgetConfig overrides widgetOrder', () => {
    const cfg = createCoreWidgetConfig({ widgetOrder: ['health_overview', 'recommendations'] });
    expect(cfg.widgetOrder).toEqual(['health_overview', 'recommendations']);
  });
  it('createAccessibilityConfig accepts overrides', () => {
    const cfg = createAccessibilityConfig({ reducedMotionSupport: false });
    expect(cfg.reducedMotionSupport).toBe(false);
    expect(cfg.keyboardNavigation).toBe(true);
  });
});

// ── Dashboard Summary Provider ───────────────────────────────

describe('DashboardSummaryProvider', () => {
  let provider: DashboardSummaryProvider;
  beforeEach(() => { provider = new DashboardSummaryProvider(); });

  it('produces summary from full bundle', () => {
    const bundle = createMockDataBundle();
    const summary = provider.getSummary(bundle);
    expect(summary.healthScore).toBe(85);
    expect(summary.healthStatus).toBe('good');
    expect(summary.totalRecommendations).toBe(1);
    expect(summary.totalOptimizations).toBe(15);
    expect(summary.totalStorageRecovered).toBe(2048);
    expect(summary.deviceProfile).toBe('gaming_pc');
  });
  it('handles null bundle data', () => {
    const bundle: CoreWidgetDataBundle = {
      aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null,
    };
    const summary = provider.getSummary(bundle);
    expect(summary.healthScore).toBe(0);
    expect(summary.healthStatus).toBe('unknown');
    expect(summary.totalRecommendations).toBe(0);
    expect(summary.deviceProfile).toBe('unknown');
  });
  it('counts critical recommendations', () => {
    const bundle = createMockDataBundle({
      recommendations: createMockRecommendationList([
        createMockRecommendation({ id: 'r1', priority: 'critical' }),
        createMockRecommendation({ id: 'r2', priority: 'high' }),
        createMockRecommendation({ id: 'r3', priority: 'low' }),
      ]),
    });
    const summary = provider.getSummary(bundle);
    expect(summary.criticalRecommendations).toBe(2);
  });
  it('extracts upcoming concerns from high-risk predictions', () => {
    const bundle = createMockDataBundle({
      predictions: createMockPredictionList([
        createMockPrediction({ id: 'p1', riskLevel: 'high', title: 'Storage full soon' }),
        createMockPrediction({ id: 'p2', riskLevel: 'critical', title: 'Disk failure risk' }),
        createMockPrediction({ id: 'p3', riskLevel: 'low', title: 'Minor cache growth' }),
      ]),
    });
    const summary = provider.getSummary(bundle);
    expect(summary.upcomingConcerns).toContain('Storage full soon');
    expect(summary.upcomingConcerns).toContain('Disk failure risk');
    expect(summary.upcomingConcerns).not.toContain('Minor cache growth');
  });
});

// ── Widget Coordinator ───────────────────────────────────────

describe('WidgetCoordinator', () => {
  let coord: WidgetCoordinator;
  beforeEach(() => { coord = new WidgetCoordinator(); });

  it('initWidget creates loading state', () => {
    coord.initWidget('health_overview');
    expect(coord.getWidgetState('health_overview')?.state).toBe('loading');
  });
  it('setWidgetState updates state', () => {
    coord.initWidget('health_overview');
    coord.setWidgetState('health_overview', 'ready');
    expect(coord.getWidgetState('health_overview')?.state).toBe('ready');
  });
  it('setWidgetState sets lastUpdated on ready', () => {
    coord.initWidget('health_overview');
    coord.setWidgetState('health_overview', 'ready');
    expect(coord.getWidgetState('health_overview')?.lastUpdated).not.toBeNull();
  });
  it('selectWidget sets selected', () => {
    coord.initWidget('health_overview');
    coord.selectWidget('health_overview');
    expect(coord.getSelectedWidget()).toBe('health_overview');
  });
  it('sendMessage delivers to target', () => {
    let received = false;
    coord.onMessage('recommendations', () => { received = true; });
    coord.sendMessage({ from: 'health_overview', to: 'recommendations', type: 'refresh', data: {}, timestamp: new Date().toISOString() });
    expect(received).toBe(true);
  });
  it('broadcastRefresh sends to all global handlers', () => {
    let received = false;
    coord.onGlobalMessage(() => { received = true; });
    coord.broadcastRefresh('health_overview');
    expect(received).toBe(true);
  });
  it('setSharedFilter stores and broadcasts', () => {
    let received = false;
    coord.onGlobalMessage((msg) => {
      if (msg.type === 'filter') received = true;
    });
    coord.setSharedFilter({ key: 'category', value: 'storage', appliedBy: 'recommendations' });
    expect(coord.getSharedFilter('category')?.value).toBe('storage');
    expect(received).toBe(true);
  });
  it('startGlobalRefresh sets all widgets to refreshing', () => {
    coord.initWidget('health_overview');
    coord.initWidget('recommendations');
    coord.startGlobalRefresh();
    expect(coord.getWidgetState('health_overview')?.state).toBe('refreshing');
    expect(coord.getWidgetState('recommendations')?.state).toBe('refreshing');
    expect(coord.isRefreshing()).toBe(true);
  });
  it('finishGlobalRefresh stops refreshing', () => {
    coord.initWidget('health_overview');
    coord.startGlobalRefresh();
    coord.finishGlobalRefresh();
    expect(coord.isRefreshing()).toBe(false);
  });
  it('isDashboardReady returns true when all widgets settled', () => {
    coord.initWidget('health_overview');
    coord.setWidgetState('health_overview', 'ready');
    expect(coord.isDashboardReady()).toBe(true);
  });
  it('isDashboardReady returns false when loading', () => {
    coord.initWidget('health_overview');
    expect(coord.isDashboardReady()).toBe(false);
  });
  it('emits widget_selected event', () => {
    let received = false;
    coord.on('widget_selected', () => { received = true; });
    coord.initWidget('health_overview');
    coord.selectWidget('health_overview');
    expect(received).toBe(true);
  });
  it('emits dashboard_ready event', () => {
    let received = false;
    coord.on('dashboard_ready', () => { received = true; });
    coord.emitDashboardReady();
    expect(received).toBe(true);
  });
  it('emits dashboard_error event', () => {
    let received = false;
    coord.on('dashboard_error', () => { received = true; });
    coord.emitDashboardError('test error');
    expect(received).toBe(true);
  });
  it('emits widget_loaded event', () => {
    let received = false;
    coord.on('widget_loaded', () => { received = true; });
    coord.emitWidgetLoaded('health_overview');
    expect(received).toBe(true);
  });
  it('emits widget_updated event', () => {
    let received = false;
    coord.on('widget_updated', () => { received = true; });
    coord.emitWidgetUpdated('health_overview');
    expect(received).toBe(true);
  });
  it('clear resets all state', () => {
    coord.initWidget('health_overview');
    coord.selectWidget('health_overview');
    coord.clear();
    expect(coord.getSelectedWidget()).toBeNull();
    expect(coord.getAllWidgetStates().length).toBe(0);
  });
  it('getAllSharedFilters returns all', () => {
    coord.setSharedFilter({ key: 'cat', value: 'health', appliedBy: 'health_overview' });
    coord.setSharedFilter({ key: 'pri', value: 'high', appliedBy: 'recommendations' });
    expect(coord.getAllSharedFilters().length).toBe(2);
  });
  it('removeSharedFilter removes filter', () => {
    coord.setSharedFilter({ key: 'cat', value: 'health', appliedBy: 'health_overview' });
    coord.removeSharedFilter('cat');
    expect(coord.getSharedFilter('cat')).toBeUndefined();
  });
  it('does not crash on handler error', () => {
    coord.onMessage('health_overview', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    coord.sendMessage({ from: 'recommendations', to: 'health_overview', type: 'refresh', data: {}, timestamp: new Date().toISOString() });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Health Overview Provider ─────────────────────────────────

describe('HealthOverviewProvider', () => {
  let provider: HealthOverviewProvider;
  beforeEach(() => { provider = new HealthOverviewProvider(); });

  it('loads health data from AI context', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as HealthOverviewData;
    expect(data.overallScore).toBe(85);
    expect(data.cpuScore).toBe(90);
    expect(data.healthStatus).toBe('good');
    expect(data.categoryBreakdown.length).toBe(5);
  });
  it('returns empty data when no health context', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: { aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null } } as never) as HealthOverviewData;
    expect(data.overallScore).toBe(0);
    expect(data.healthStatus).toBe('unknown');
  });
  it('extracts health trend from knowledge', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as HealthOverviewData;
    expect(data.healthTrend).toBe('improving');
  });
  it('extracts recent changes from knowledge', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as HealthOverviewData;
    expect(data.recentChanges.length).toBeGreaterThan(0);
    expect(data.recentChanges[0]).toContain('Health score');
  });
  it('extracts health summary from knowledge', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as HealthOverviewData;
    expect(data.healthSummary).toBe('System health is good');
  });
  it('refresh returns same as load', async () => {
    await provider.initialize();
    const ctx = { options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never;
    const loaded = await provider.load(ctx) as HealthOverviewData;
    const refreshed = await provider.refresh(ctx) as HealthOverviewData;
    expect(refreshed.overallScore).toBe(loaded.overallScore);
  });
  it('validate returns true after initialize', async () => {
    await provider.initialize();
    expect(provider.validate()).toBe(true);
  });
  it('validate returns false before initialize', () => {
    expect(provider.validate()).toBe(false);
  });
  it('dispose resets initialized', async () => {
    await provider.initialize();
    await provider.dispose();
    expect(provider.validate()).toBe(false);
  });
});

// ── Recommendation Provider ──────────────────────────────────

describe('RecommendationProvider', () => {
  let provider: RecommendationProvider;
  beforeEach(() => { provider = new RecommendationProvider(); });

  it('loads recommendations sorted by priority', async () => {
    await provider.initialize();
    const bundle = createMockDataBundle({
      recommendations: createMockRecommendationList([
        createMockRecommendation({ id: 'r1', priority: 'low', title: 'Low priority' }),
        createMockRecommendation({ id: 'r2', priority: 'critical', title: 'Critical' }),
        createMockRecommendation({ id: 'r3', priority: 'high', title: 'High' }),
      ]),
    });
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: bundle } as never) as RecommendationData;
    expect(data.recommendations[0]?.title).toBe('Critical');
    expect(data.recommendations[1]?.title).toBe('High');
    expect(data.recommendations[2]?.title).toBe('Low priority');
  });
  it('limits to top 5', async () => {
    await provider.initialize();
    const recs = Array.from({ length: 10 }, (_, i) => createMockRecommendation({ id: `r${i}`, priority: 'medium', title: `Rec ${i}` }));
    const bundle = createMockDataBundle({ recommendations: createMockRecommendationList(recs) });
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: bundle } as never) as RecommendationData;
    expect(data.recommendations.length).toBe(5);
  });
  it('counts critical recommendations', async () => {
    await provider.initialize();
    const bundle = createMockDataBundle({
      recommendations: createMockRecommendationList([
        createMockRecommendation({ id: 'r1', priority: 'critical' }),
        createMockRecommendation({ id: 'r2', priority: 'high' }),
        createMockRecommendation({ id: 'r3', priority: 'low' }),
      ]),
    });
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: bundle } as never) as RecommendationData;
    expect(data.criticalCount).toBe(2);
    expect(data.totalCount).toBe(3);
  });
  it('returns empty when no recommendations', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: { aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null } } as never) as RecommendationData;
    expect(data.recommendations.length).toBe(0);
  });
  it('extracts estimated benefit and time', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as RecommendationData;
    expect(data.recommendations[0]?.estimatedBenefit).toBe('500MB recovered');
    expect(data.recommendations[0]?.estimatedTime).toBe(30);
  });
});

// ── Quick Wins Provider ──────────────────────────────────────

describe('QuickWinsProvider', () => {
  let provider: QuickWinsProvider;
  beforeEach(() => { provider = new QuickWinsProvider(); });

  it('filters safe and fast recommendations', async () => {
    await provider.initialize();
    const bundle = createMockDataBundle({
      recommendations: createMockRecommendationList([
        createMockRecommendation({ id: 'r1', safety: { riskLevel: 'none', rollbackAvailable: true, requiresConfirmation: false, automaticExecutionAllowed: true, automationEligible: true, warnings: [] }, benefits: { estimatedTime: 30, estimatedBenefit: 'fast', estimatedSpaceRecovered: 100, estimatedPerformanceGain: 5, estimatedPrivacyImprovement: null, estimatedHealthIncrease: 2 } }),
        createMockRecommendation({ id: 'r2', safety: { riskLevel: 'high', rollbackAvailable: false, requiresConfirmation: true, automaticExecutionAllowed: false, automationEligible: false, warnings: ['danger'] }, benefits: { estimatedTime: 30, estimatedBenefit: 'risky', estimatedSpaceRecovered: 0, estimatedPerformanceGain: 0, estimatedPrivacyImprovement: null, estimatedHealthIncrease: 0 } }),
      ]),
    });
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: bundle } as never) as QuickWinsData;
    expect(data.quickWins.length).toBe(1);
    expect(data.quickWins[0]?.id).toBe('r1');
  });
  it('calculates totals', async () => {
    await provider.initialize();
    const bundle = createMockDataBundle({
      recommendations: createMockRecommendationList([
        createMockRecommendation({ id: 'r1', benefits: { estimatedTime: 30, estimatedBenefit: 'a', estimatedSpaceRecovered: 100, estimatedPerformanceGain: 5, estimatedPrivacyImprovement: null, estimatedHealthIncrease: 2 } }),
        createMockRecommendation({ id: 'r2', benefits: { estimatedTime: 20, estimatedBenefit: 'b', estimatedSpaceRecovered: 200, estimatedPerformanceGain: 10, estimatedPrivacyImprovement: null, estimatedHealthIncrease: 3 } }),
      ]),
    });
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: bundle } as never) as QuickWinsData;
    expect(data.totalStorageRecovery).toBe(300);
    expect(data.totalPerformanceGain).toBe(15);
  });
  it('detects smart optimize compatibility', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as QuickWinsData;
    expect(data.smartOptimizeCompatible).toBe(true);
  });
  it('returns empty when no recommendations', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: { aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null } } as never) as QuickWinsData;
    expect(data.quickWins.length).toBe(0);
    expect(data.smartOptimizeCompatible).toBe(false);
  });
});

// ── Prediction Provider ──────────────────────────────────────

describe('PredictionProvider', () => {
  let provider: PredictionProvider;
  beforeEach(() => { provider = new PredictionProvider(); });

  it('loads predictions', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as PredictionData;
    expect(data.predictions.length).toBe(1);
    expect(data.predictions[0]?.title).toBe('Storage will be full in 30 days');
  });
  it('extracts storage prediction', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as PredictionData;
    expect(data.storagePrediction).not.toBeNull();
  });
  it('extracts upcoming concerns', async () => {
    await provider.initialize();
    const bundle = createMockDataBundle({
      predictions: createMockPredictionList([
        createMockPrediction({ id: 'p1', riskLevel: 'high', title: 'Storage full' }),
        createMockPrediction({ id: 'p2', riskLevel: 'low', title: 'Minor growth' }),
      ]),
    });
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: bundle } as never) as PredictionData;
    expect(data.upcomingConcerns).toContain('Storage full');
    expect(data.upcomingConcerns).not.toContain('Minor growth');
  });
  it('calculates average confidence', async () => {
    await provider.initialize();
    const bundle = createMockDataBundle({
      predictions: createMockPredictionList([
        createMockPrediction({ id: 'p1', confidenceScore: 0.8 }),
        createMockPrediction({ id: 'p2', confidenceScore: 0.9 }),
      ]),
    });
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: bundle } as never) as PredictionData;
    expect(data.predictionConfidence).toBeCloseTo(0.85, 1);
  });
  it('returns empty when no predictions', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: { aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null } } as never) as PredictionData;
    expect(data.predictions.length).toBe(0);
    expect(data.predictionConfidence).toBe(0);
  });
});

// ── Achievement Provider ─────────────────────────────────────

describe('AchievementProvider', () => {
  let provider: AchievementProvider;
  beforeEach(() => { provider = new AchievementProvider(); });

  it('creates achievement for first optimization', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as AchievementData;
    expect(data.achievements.length).toBeGreaterThan(0);
    expect(data.achievements.some((a) => a.id === 'first_optimization')).toBe(true);
  });
  it('creates milestone for storage recovered', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as AchievementData;
    expect(data.milestones.some((m) => m.id === 'storage_warrior')).toBe(true);
  });
  it('tracks total storage recovered', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as AchievementData;
    expect(data.totalStorageRecovered).toBe(2048);
  });
  it('builds historical improvements', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as AchievementData;
    expect(data.historicalImprovements.length).toBeGreaterThan(0);
  });
  it('returns empty when no history', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: { aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null } } as never) as AchievementData;
    expect(data.achievements.length).toBe(0);
    expect(data.totalStorageRecovered).toBe(0);
  });
});

// ── Optimization History Provider ────────────────────────────

describe('OptimizationHistoryProvider', () => {
  let provider: OptimizationHistoryProvider;
  beforeEach(() => { provider = new OptimizationHistoryProvider(); });

  it('loads recent optimizations', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as OptimizationActivityData;
    expect(data.recentOptimizations.length).toBe(2);
    expect(data.totalOptimizations).toBe(15);
  });
  it('calculates total time saved', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as OptimizationActivityData;
    expect(data.totalTimeSavedSec).toBe(40);
  });
  it('tracks total cleaned MB', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as OptimizationActivityData;
    expect(data.totalCleanedMB).toBe(2048);
  });
  it('returns empty when no history', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: { aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null } } as never) as OptimizationActivityData;
    expect(data.recentOptimizations.length).toBe(0);
    expect(data.rollbackAvailable).toBe(false);
  });
});

// ── Device Profile Provider ──────────────────────────────────

describe('DeviceProfileProvider', () => {
  let provider: DeviceProfileProvider;
  beforeEach(() => { provider = new DeviceProfileProvider(); });

  it('loads device profile data', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as DeviceProfileData;
    expect(data.deviceName).toBe('DESKTOP-GAMING');
    expect(data.primaryProfile).toBe('gaming_pc');
    expect(data.hardwareTier).toBe('high_end');
  });
  it('extracts secondary profiles', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as DeviceProfileData;
    expect(data.secondaryProfiles.length).toBe(1);
    expect(data.secondaryProfiles[0]?.profile).toBe('developer_workstation');
  });
  it('extracts hardware info', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as DeviceProfileData;
    expect(data.cpuModel).toBe('Intel i7-12700K');
    expect(data.cpuCores).toBe(12);
    expect(data.totalMemoryMB).toBe(32768);
  });
  it('extracts recent changes', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: createMockDataBundle() } as never) as DeviceProfileData;
    expect(data.recentChanges.length).toBe(1);
  });
  it('returns empty when no profile', async () => {
    await provider.initialize();
    const data = await provider.load({ options: {}, cachedData: null, dataBundle: { aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null } } as never) as DeviceProfileData;
    expect(data.deviceName).toBe('Unknown');
    expect(data.primaryProfile).toBe('unknown');
  });
});

// ── Dashboard Coordinator ────────────────────────────────────

describe('DashboardCoordinator', () => {
  let coord: DashboardCoordinator;
  beforeEach(() => { coord = new DashboardCoordinator(); });

  it('buildDashboard loads all widgets', async () => {
    const bundle = createMockDataBundle();
    await coord.buildDashboard(bundle);
    expect(coord.getWidgetState('health_overview')).toBe('ready');
    expect(coord.getWidgetState('recommendations')).toBe('ready');
    expect(coord.getWidgetState('quick_wins')).toBe('ready');
    expect(coord.getWidgetState('predictions')).toBe('ready');
    expect(coord.getWidgetState('device_profile')).toBe('ready');
  });
  it('getDashboardSummary returns summary', async () => {
    await coord.buildDashboard(createMockDataBundle());
    const summary = coord.getDashboardSummary();
    expect(summary).not.toBeNull();
    expect(summary!.healthScore).toBe(85);
  });
  it('getHealthWidget returns health data', async () => {
    await coord.buildDashboard(createMockDataBundle());
    const health = coord.getHealthWidget();
    expect(health).not.toBeNull();
    expect(health!.overallScore).toBe(85);
  });
  it('getRecommendationWidget returns recommendation data', async () => {
    await coord.buildDashboard(createMockDataBundle());
    const recs = coord.getRecommendationWidget();
    expect(recs).not.toBeNull();
    expect(recs!.recommendations.length).toBe(1);
  });
  it('getPredictionWidget returns prediction data', async () => {
    await coord.buildDashboard(createMockDataBundle());
    const preds = coord.getPredictionWidget();
    expect(preds).not.toBeNull();
    expect(preds!.predictions.length).toBe(1);
  });
  it('getQuickWins returns quick wins data', async () => {
    await coord.buildDashboard(createMockDataBundle());
    const qw = coord.getQuickWins();
    expect(qw).not.toBeNull();
    expect(qw!.quickWins.length).toBe(1);
  });
  it('getAchievements returns achievement data', async () => {
    await coord.buildDashboard(createMockDataBundle());
    const ach = coord.getAchievements();
    expect(ach).not.toBeNull();
    expect(ach!.totalStorageRecovered).toBe(2048);
  });
  it('getDeviceProfile returns device profile data', async () => {
    await coord.buildDashboard(createMockDataBundle());
    const dp = coord.getDeviceProfile();
    expect(dp).not.toBeNull();
    expect(dp!.deviceName).toBe('DESKTOP-GAMING');
  });
  it('refreshWidgets refreshes all widgets', async () => {
    await coord.buildDashboard(createMockDataBundle());
    await coord.refreshWidgets();
    expect(coord.getWidgetState('health_overview')).toBe('ready');
  });
  it('refreshWidgets refreshes specific widgets', async () => {
    await coord.buildDashboard(createMockDataBundle());
    await coord.refreshWidgets(['health_overview']);
    expect(coord.getWidgetState('health_overview')).toBe('ready');
  });
  it('selectWidget sets selected', async () => {
    await coord.buildDashboard(createMockDataBundle());
    coord.selectWidget('health_overview');
    expect(coord.getSelectedWidget()).toBe('health_overview');
  });
  it('emits dashboard_ready event', async () => {
    let ready = false;
    coord.on('dashboard_ready', () => { ready = true; });
    await coord.buildDashboard(createMockDataBundle());
    expect(ready).toBe(true);
  });
  it('emits widget_loaded events', async () => {
    const loaded: string[] = [];
    coord.on('widget_loaded', (payload) => {
      loaded.push(payload.widgetId ?? '');
    });
    await coord.buildDashboard(createMockDataBundle());
    expect(loaded.length).toBeGreaterThan(0);
  });
  it('emits dashboard_refreshed event on refresh', async () => {
    let refreshed = false;
    coord.on('dashboard_refreshed', () => { refreshed = true; });
    await coord.buildDashboard(createMockDataBundle());
    await coord.refreshWidgets();
    expect(refreshed).toBe(true);
  });
  it('respects feature flags — disabled widget is unavailable', async () => {
    const cfg = createCoreWidgetConfig({ featureFlags: { enablePredictions: false, enableHealthOverview: true, enableRecommendations: true, enableQuickWins: true, enableAchievements: true, enableOptimizationActivity: true, enableDeviceProfile: true, futureFlags: {} } });
    const coord2 = new DashboardCoordinator(cfg);
    await coord2.buildDashboard(createMockDataBundle());
    expect(coord2.getWidgetState('predictions')).toBe('unavailable');
    expect(coord2.getWidgetState('health_overview')).toBe('ready');
  });
  it('respects widget visibility — hidden widget not loaded', async () => {
    const cfg = createCoreWidgetConfig({ widgetVisibility: { health_overview: false, recommendations: true, quick_wins: true, predictions: true, achievements: true, optimization_activity: true, device_profile: true } });
    const coord2 = new DashboardCoordinator(cfg);
    await coord2.buildDashboard(createMockDataBundle());
    expect(coord2.getWidgetState('health_overview')).toBe('unavailable');
  });
  it('clear resets all state', async () => {
    await coord.buildDashboard(createMockDataBundle());
    coord.clear();
    expect(coord.getDashboardSummary()).toBeNull();
    expect(coord.getHealthWidget()).toBeNull();
  });
  it('getAllWidgetStates returns all states', async () => {
    await coord.buildDashboard(createMockDataBundle());
    const states = coord.getAllWidgetStates();
    expect(states.length).toBe(7);
  });
  it('updateConfig updates config', () => {
    coord.updateConfig({ parallelLoading: false });
    expect(coord.config.parallelLoading).toBe(false);
  });
  it('handles empty bundle gracefully', async () => {
    const bundle: CoreWidgetDataBundle = { aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null };
    await coord.buildDashboard(bundle);
    expect(coord.getWidgetState('health_overview')).toBe('empty');
  });
  it('handles errors gracefully', async () => {
    const badBundle = createMockDataBundle();
    // Corrupt the AI context to cause an error path
    badBundle.aiContext = { ...badBundle.aiContext, health: undefined } as AIContext;
    await coord.buildDashboard(badBundle);
    // Health widget should be in empty state (no health data)
    expect(coord.getWidgetState('health_overview')).toBe('empty');
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.DashboardCoordinator).toBeDefined();
    expect(module.WidgetCoordinator).toBeDefined();
    expect(module.DashboardSummaryProvider).toBeDefined();
    expect(module.HealthOverviewProvider).toBeDefined();
    expect(module.RecommendationProvider).toBeDefined();
    expect(module.QuickWinsProvider).toBeDefined();
    expect(module.PredictionProvider).toBeDefined();
    expect(module.AchievementProvider).toBeDefined();
    expect(module.OptimizationHistoryProvider).toBeDefined();
    expect(module.DeviceProfileProvider).toBeDefined();
    expect(module.DEFAULT_CORE_WIDGET_CONFIG).toBeDefined();
    expect(module.createCoreWidgetConfig).toBeDefined();
  });
  it('full lifecycle: build → get data → refresh → clear', async () => {
    const coord = new DashboardCoordinator();
    await coord.buildDashboard(createMockDataBundle());
    expect(coord.getHealthWidget()?.overallScore).toBe(85);
    expect(coord.getRecommendationWidget()?.recommendations.length).toBe(1);
    await coord.refreshWidgets();
    expect(coord.getDashboardSummary()?.healthScore).toBe(85);
    coord.clear();
    expect(coord.getHealthWidget()).toBeNull();
  });
  it('widgets load independently', async () => {
    const coord = new DashboardCoordinator();
    const bundle = createMockDataBundle();
    // Build with only health data
    const healthOnly: CoreWidgetDataBundle = { ...bundle, recommendations: null, predictions: null, deviceProfile: null };
    await coord.buildDashboard(healthOnly);
    expect(coord.getHealthWidget()?.overallScore).toBe(85);
    expect(coord.getRecommendationWidget()?.recommendations.length).toBe(0);
    expect(coord.getDeviceProfile()?.deviceName).toBe('Unknown');
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('dashboard builds under 500ms', async () => {
    const coord = new DashboardCoordinator();
    const start = performance.now();
    await coord.buildDashboard(createMockDataBundle());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('refreshWidgets without build does not crash', async () => {
    const coord = new DashboardCoordinator();
    let errored = false;
    coord.on('dashboard_error', () => { errored = true; });
    await coord.refreshWidgets();
    expect(errored).toBe(true);
  });
  it('buildDashboard with all null data', async () => {
    const coord = new DashboardCoordinator();
    const bundle: CoreWidgetDataBundle = { aiContext: null, knowledge: null, recommendations: null, insights: null, predictions: null, deviceProfile: null };
    await coord.buildDashboard(bundle);
    expect(coord.getWidgetState('health_overview')).toBe('empty');
    expect(coord.getWidgetState('recommendations')).toBe('empty');
    expect(coord.getWidgetState('device_profile')).toBe('empty');
  });
  it('coordinator with sequential loading', async () => {
    const cfg = createCoreWidgetConfig({ parallelLoading: false });
    const coord = new DashboardCoordinator(cfg);
    await coord.buildDashboard(createMockDataBundle());
    expect(coord.getHealthWidget()?.overallScore).toBe(85);
  });
  it('widget states include loading, ready, empty, unavailable, permission_denied, error', async () => {
    const cfg = createCoreWidgetConfig({
      featureFlags: { enableHealthOverview: true, enableRecommendations: false, enableQuickWins: true, enablePredictions: true, enableAchievements: true, enableOptimizationActivity: true, enableDeviceProfile: true, futureFlags: {} },
      widgetVisibility: { health_overview: true, recommendations: true, quick_wins: false, predictions: true, achievements: true, optimization_activity: true, device_profile: true },
    });
    const coord = new DashboardCoordinator(cfg);
    await coord.buildDashboard(createMockDataBundle());
    expect(coord.getWidgetState('recommendations')).toBe('unavailable');
    expect(coord.getWidgetState('quick_wins')).toBe('unavailable');
  });
});
