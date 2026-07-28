/**
 * Tests for AVS AI Assistant Platform (Phase 3.9).
 *
 * Covers:
 * - Types: helpers, sanitization, safety, question keywords
 * - Prompt Template Registry: get, register, fill, fallback
 * - Context Builder: build, availability, getters
 * - Question Router: classify, follow-up, suggestions
 * - Explanation Engine: all 12 question types + fallback
 * - Recommendation Explainer: explain rec, explain item, alternatives
 * - Insight Generator: all insight types, sorting
 * - Conversation History: session, messages, topic, export/import
 * - Conversation Engine: ask, safety, insights, dashboard data
 * - Events: emit, subscribe, listener count
 * - Regression: all exports, no forbidden modifications
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  AssistantContext,
} from '../types';
import type {
  HealthReport,
  HealthRecommendation,
  CategoryResult,
  TrendAnalysis,
} from '../../ai-health-engine/types';
import type {
  OptimizationPlan,
  OptimizationItem,
} from '../../optimization-planner/types';
import type {
  ExecutionRecord,
  ExecutionStatistics,
} from '../../maintenance-history/types';
import {
  sanitizeContent,
  isSafeContent,
  generateMessageId,
  generateConversationId,
  generateInsightId,
  scoreToLevel,
  formatBytes,
  formatDuration,
  FORBIDDEN_PATTERNS,
  QUICK_QUESTIONS,
  QUESTION_KEYWORDS,
} from '../types';
import { PromptTemplateRegistry } from '../promptTemplateRegistry';
import { AssistantContextBuilder } from '../assistantContextBuilder';
import { QuestionRouter } from '../questionRouter';
import { ExplanationEngine } from '../explanationEngine';
import { RecommendationExplainer } from '../recommendationExplainer';
import { InsightGenerator } from '../insightGenerator';
import { ConversationHistory } from '../conversationHistory';
import { ConversationEngine } from '../conversationEngine';
import { AssistantEventEmitter } from '../assistantEvents';
import type { CapabilityInfo } from '../../config-sync/types';

// ── Test Helpers ──────────────────────────────────────────────

function makeCapability(id: string, displayName: string): CapabilityInfo {
  return { id, display_name: displayName, description: 'Test capability', category: 'test', minimum_version: '1.0.0', status: 'available' };
}

function makeCategoryResult(
  categoryId: string,
  score: number,
  issues: { title: string; description: string; severity: string; impact: number; autoFixable: boolean }[] = [],
): CategoryResult {
  return {
    categoryId: categoryId as CategoryResult['categoryId'],
    categoryName: categoryId.replace('_', ' '),
    score,
    severity: score < 40 ? 'high' : score < 60 ? 'medium' : 'low',
    issues: issues as CategoryResult['issues'],
    recommendations: [],
    confidence: 0.85,
    analyzedAt: new Date().toISOString(),
  };
}

function makeHealthReport(overrides: Partial<HealthReport> = {}): HealthReport {
  return {
    id: 'report-1',
    generatedAt: new Date().toISOString(),
    overall: {
      score: 65,
      letterGrade: 'C',
      level: 'fair',
      categoryScores: [
        { categoryId: 'storage', categoryName: 'Storage', score: 55, weight: 0.2, contribution: 11 },
        { categoryId: 'startup', categoryName: 'Startup', score: 40, weight: 0.15, contribution: 6 },
        { categoryId: 'browser', categoryName: 'Browser', score: 70, weight: 0.1, contribution: 7 },
      ],
      computedAt: new Date().toISOString(),
    },
    categories: [
      makeCategoryResult('storage', 55, [{ title: 'Low disk space', description: 'Disk is 85% full', severity: 'medium', impact: 20, autoFixable: true }]),
      makeCategoryResult('startup', 40, [{ title: 'Too many startup items', description: '15 startup items detected', severity: 'high', impact: 30, autoFixable: true }]),
      makeCategoryResult('browser', 70, [{ title: 'Cache is large', description: 'Browser cache is 500MB', severity: 'low', impact: 10, autoFixable: true }]),
      makeCategoryResult('privacy', 60, [{ title: 'Cookies accumulated', description: 'Many tracking cookies', severity: 'medium', impact: 15, autoFixable: true }]),
      makeCategoryResult('system_updates', 50, [{ title: 'Updates pending', description: '3 updates pending', severity: 'medium', impact: 15, autoFixable: false }]),
    ],
    insights: [
      { id: 'ins-1', title: 'Storage is low', severity: 'medium', confidence: 0.8, explanation: 'Disk space is running low', suggestedAction: 'Clean up files', category: 'storage' },
    ],
    recommendations: [
      { id: 'rec-1', title: 'Clean temporary files', priority: 'high', estimatedBenefit: 15, estimatedTimeSeconds: 30, riskLevel: 'low', reason: 'Temp files are accumulating', affectedModules: ['storage'], requiredCapability: null, category: 'storage' },
      { id: 'rec-2', title: 'Disable startup items', priority: 'high', estimatedBenefit: 20, estimatedTimeSeconds: 60, riskLevel: 'low', reason: 'Too many startup items', affectedModules: ['startup'], requiredCapability: 'startup-manager', category: 'startup' },
      { id: 'rec-3', title: 'Clean browser data', priority: 'medium', estimatedBenefit: 10, estimatedTimeSeconds: 20, riskLevel: 'low', reason: 'Browser cache is large', affectedModules: ['browser'], requiredCapability: null, category: 'browser' },
    ],
    trends: null,
    fromCache: false,
    ...overrides,
  };
}

function makeOptimizationItem(overrides: Partial<OptimizationItem> = {}): OptimizationItem {
  return {
    id: 'opt-1',
    title: 'Clean temp files',
    description: 'Remove temporary files',
    category: 'storage',
    priority: 'high',
    estimatedBenefit: 15,
    estimatedDurationSeconds: 30,
    estimatedSpaceRecovery: 500 * 1024 * 1024,
    risk: 'low',
    requiredCapability: null,
    requiredTask: 'temp_files_cleaner',
    canBeSkipped: true,
    dependencies: [],
    isLocked: false,
    lockedReason: null,
    isSkipped: false,
    skippedReason: null,
    ...overrides,
  };
}

function makeOptimizationPlan(overrides: Partial<OptimizationPlan> = {}): OptimizationPlan {
  return {
    planId: 'plan-1',
    planType: 'balanced',
    generatedAt: new Date().toISOString(),
    currentHealthScore: 65,
    predictedHealthScore: 80,
    estimatedDurationSeconds: 120,
    estimatedSpaceRecovery: 1024 * 1024 * 1024,
    estimatedPerformanceImprovement: 15,
    estimatedPrivacyImprovement: 10,
    overallRisk: 'low',
    executionOrder: ['opt-1', 'opt-2'],
    items: [
      makeOptimizationItem(),
      makeOptimizationItem({ id: 'opt-2', title: 'Clean browser data', category: 'browser', estimatedSpaceRecovery: 200 * 1024 * 1024 }),
    ],
    sourceReportId: 'report-1',
    ...overrides,
  };
}

function makeExecutionRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: 'exec-1',
    scheduleId: null,
    jobId: 'job-1',
    source: 'manual',
    startTime: new Date(Date.now() - 86400000).toISOString(),
    endTime: new Date(Date.now() - 86400000 + 60000).toISOString(),
    durationMs: 60000,
    status: 'succeeded',
    taskResults: [],
    filesRemoved: 150,
    foldersRemoved: 5,
    registryEntriesRemoved: 0,
    recycleBinItemsRemoved: 20,
    temporaryFilesRemoved: 100,
    browserDataRemoved: 30,
    totalSpaceRecovered: 500 * 1024 * 1024,
    warnings: [],
    errors: [],
    appVersion: '1.0.0',
    loggedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeExecutionStatistics(overrides: Partial<ExecutionStatistics> = {}): ExecutionStatistics {
  return {
    totalExecutions: 10,
    successfulExecutions: 8,
    failedExecutions: 1,
    partialExecutions: 1,
    cancelledExecutions: 0,
    successRate: 0.8,
    averageDurationMs: 60000,
    averageSpaceRecovered: 400 * 1024 * 1024,
    largestCleanupBytes: 1024 * 1024 * 1024,
    largestCleanupExecutionId: 'exec-1',
    mostFrequentTaskId: 'temp_files_cleaner',
    mostFrequentTaskName: 'Temp Files Cleaner',
    mostFrequentTaskCount: 5,
    lastRunAt: new Date().toISOString(),
    longestRunMs: 120000,
    longestRunExecutionId: 'exec-2',
    totalFilesRemoved: 1000,
    totalSpaceRecovered: 4 * 1024 * 1024 * 1024,
    ...overrides,
  };
}

function makeTrends(overrides: Partial<TrendAnalysis> = {}): TrendAnalysis {
  return {
    direction: 'improving',
    todayScore: 75,
    last7DaysAvg: 68,
    last30DaysAvg: 65,
    change7Days: 7,
    change30Days: 10,
    categoryTrends: [],
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<AssistantContext> = {}): AssistantContext {
  return {
    healthReport: makeHealthReport(),
    optimizationPlan: makeOptimizationPlan(),
    executionHistory: [makeExecutionRecord()],
    executionStatistics: makeExecutionStatistics(),
    executionReport: null,
    capabilities: {
      available: [makeCapability('startup-manager', 'Startup Manager')],
      locked: [makeCapability('driver-updater', 'Driver Updater')],
    },
    trends: makeTrends(),
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Types & Helpers Tests ─────────────────────────────────────

describe('Types & Helpers', () => {
  it('sanitizeContent redacts forbidden patterns', () => {
    const result = sanitizeContent('my password is secret123 and hash is abc');
    expect(result).toContain('[redacted]');
    expect(result).not.toContain('password');
    expect(result).not.toContain('hash');
  });

  it('isSafeContent detects unsafe content', () => {
    expect(isSafeContent('what is my password?')).toBe(false);
    expect(isSafeContent('why is my score low?')).toBe(true);
  });

  it('isSafeContent detects hashes', () => {
    expect(isSafeContent('the sha256 of the file')).toBe(false);
    expect(isSafeContent('the md5 checksum')).toBe(false);
  });

  it('generateMessageId produces unique IDs', () => {
    const id1 = generateMessageId();
    const id2 = generateMessageId();
    expect(id1).not.toBe(id2);
    expect(id1).toContain('msg-');
  });

  it('generateConversationId produces unique IDs', () => {
    const id1 = generateConversationId();
    const id2 = generateConversationId();
    expect(id1).not.toBe(id2);
    expect(id1).toContain('conv-');
  });

  it('generateInsightId produces unique IDs', () => {
    const id1 = generateInsightId();
    const id2 = generateInsightId();
    expect(id1).not.toBe(id2);
    expect(id1).toContain('insight-');
  });

  it('scoreToLevel maps correctly', () => {
    expect(scoreToLevel(95)).toBe('excellent');
    expect(scoreToLevel(80)).toBe('good');
    expect(scoreToLevel(65)).toBe('fair');
    expect(scoreToLevel(45)).toBe('poor');
    expect(scoreToLevel(30)).toBe('critical');
  });

  it('formatBytes formats correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('formatDuration formats correctly', () => {
    expect(formatDuration(30)).toBe('~30 seconds');
    expect(formatDuration(60)).toBe('~1 minute');
    expect(formatDuration(90)).toBe('~1 min 30 sec');
  });

  it('FORBIDDEN_PATTERNS includes sensitive terms', () => {
    expect(FORBIDDEN_PATTERNS).toContain('password');
    expect(FORBIDDEN_PATTERNS).toContain('hash');
    expect(FORBIDDEN_PATTERNS).toContain('token');
  });

  it('QUICK_QUESTIONS has 12 questions', () => {
    expect(QUICK_QUESTIONS.length).toBe(12);
  });

  it('QUESTION_KEYWORDS has entries for all types', () => {
    expect(Object.keys(QUESTION_KEYWORDS).length).toBeGreaterThanOrEqual(12);
    expect(QUESTION_KEYWORDS.why_score_low).toContain('why');
    expect(QUESTION_KEYWORDS.why_score_low).toContain('score');
  });
});

// ── Prompt Template Registry Tests ────────────────────────────

describe('PromptTemplateRegistry', () => {
  let registry: PromptTemplateRegistry;

  beforeEach(() => {
    registry = new PromptTemplateRegistry();
  });

  it('returns template by ID', () => {
    const template = registry.get('why_score_low');
    expect(template).not.toBeNull();
    expect(template!.questionType).toBe('why_score_low');
  });

  it('returns null for unknown ID', () => {
    expect(registry.get('nonexistent' as never)).toBeNull();
  });

  it('returns template by question type', () => {
    const template = registry.getByQuestionType('why_score_low');
    expect(template.id).toBe('why_score_low');
  });

  it('returns fallback for unknown question type', () => {
    const template = registry.getByQuestionType('unknown');
    expect(template.id).toBe('fallback');
  });

  it('registers new template', () => {
    const customId = 'custom' as never;
    registry.register(customId, {
      id: customId,
      questionType: null,
      systemPrompt: 'test',
      contextFormat: 'test {var}',
      responseFormat: 'test',
      variables: ['var'],
    });
    expect(registry.has(customId)).toBe(true);
  });

  it('getAll returns all templates', () => {
    const all = registry.getAll();
    expect(all.length).toBeGreaterThanOrEqual(14);
  });

  it('fillTemplate replaces variables', () => {
    const template = registry.get('why_score_low')!;
    const filled = registry.fillTemplate(template, {
      overallScore: '65',
      healthLevel: 'fair',
      categoryScores: 'storage: 55, startup: 40',
      issues: 'Low disk space',
    });
    expect(filled).toContain('65');
    expect(filled).toContain('fair');
    expect(filled).not.toContain('{overallScore}');
  });
});

// ── Context Builder Tests ─────────────────────────────────────

describe('AssistantContextBuilder', () => {
  let builder: AssistantContextBuilder;

  beforeEach(() => {
    builder = new AssistantContextBuilder();
  });

  it('builds context from input', () => {
    const ctx = builder.build({
      healthReport: makeHealthReport(),
      optimizationPlan: makeOptimizationPlan(),
    });
    expect(ctx.healthReport).not.toBeNull();
    expect(ctx.optimizationPlan).not.toBeNull();
  });

  it('builds empty context with defaults', () => {
    const ctx = builder.build({});
    expect(ctx.healthReport).toBeNull();
    expect(ctx.optimizationPlan).toBeNull();
    expect(ctx.executionHistory).toEqual([]);
  });

  it('hasHealthData detects health report', () => {
    const ctx = builder.build({ healthReport: makeHealthReport() });
    expect(builder.hasHealthData(ctx)).toBe(true);
  });

  it('hasHealthData returns false for empty', () => {
    const ctx = builder.build({});
    expect(builder.hasHealthData(ctx)).toBe(false);
  });

  it('getOverallScore returns score', () => {
    const ctx = builder.build({ healthReport: makeHealthReport() });
    expect(builder.getOverallScore(ctx)).toBe(65);
  });

  it('getOverallScore returns null without report', () => {
    const ctx = builder.build({});
    expect(builder.getOverallScore(ctx)).toBeNull();
  });

  it('getCategoryResult returns category data', () => {
    const ctx = builder.build({ healthReport: makeHealthReport() });
    const result = builder.getCategoryResult(ctx, 'storage');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(55);
  });

  it('getCategoryResult returns null for unknown category', () => {
    const ctx = builder.build({ healthReport: makeHealthReport() });
    expect(builder.getCategoryResult(ctx, 'nonexistent')).toBeNull();
  });

  it('getRecommendations returns recommendation list', () => {
    const ctx = builder.build({ healthReport: makeHealthReport() });
    const recs = builder.getRecommendations(ctx);
    expect(recs.length).toBe(3);
    expect(recs[0]!.title).toBe('Clean temporary files');
  });

  it('getRecentExecutions returns limited list', () => {
    const records = [makeExecutionRecord(), makeExecutionRecord({ id: 'exec-2' })];
    const ctx = builder.build({ executionHistory: records });
    expect(builder.getRecentExecutions(ctx, 1)).toHaveLength(1);
  });

  it('getLastExecution returns first record', () => {
    const records = [makeExecutionRecord(), makeExecutionRecord({ id: 'exec-2' })];
    const ctx = builder.build({ executionHistory: records });
    expect(builder.getLastExecution(ctx)!.id).toBe('exec-1');
  });

  it('getLastExecution returns null for empty', () => {
    const ctx = builder.build({});
    expect(builder.getLastExecution(ctx)).toBeNull();
  });

  it('getOptimizationItems returns items', () => {
    const ctx = builder.build({ optimizationPlan: makeOptimizationPlan() });
    const items = builder.getOptimizationItems(ctx);
    expect(items.length).toBe(2);
  });

  it('getAvailableCapabilities returns capability IDs', () => {
    const ctx = builder.build({
      capabilities: { available: [makeCapability('cap-1', 'Cap 1')], locked: [] },
    });
    expect(builder.getAvailableCapabilities(ctx)).toContain('cap-1');
  });

  it('getDataAvailabilitySummary lists all sources', () => {
    const ctx = builder.build({ healthReport: makeHealthReport() });
    const summary = builder.getDataAvailabilitySummary(ctx);
    expect(summary.length).toBe(5);
    expect(summary.some((s) => s.source === 'Health Report' && s.available)).toBe(true);
  });
});

// ── Question Router Tests ─────────────────────────────────────

describe('QuestionRouter', () => {
  let router: QuestionRouter;

  beforeEach(() => {
    router = new QuestionRouter();
  });

  it('classifies "why is my health score low"', () => {
    const result = router.classify('Why is my health score low?');
    expect(result.type).toBe('why_score_low');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies "what should I optimize first"', () => {
    const result = router.classify('What should I optimize first?');
    expect(result.type).toBe('what_optimize_first');
  });

  it('classifies "how much space can I recover"', () => {
    const result = router.classify('How much space can I recover?');
    expect(result.type).toBe('how_much_recover');
  });

  it('classifies "why do I have duplicate files"', () => {
    const result = router.classify('Why do I have duplicate files?');
    expect(result.type).toBe('why_duplicates');
  });

  it('classifies "what does smart optimize do"', () => {
    const result = router.classify('What does Smart Optimize do?');
    expect(result.type).toBe('what_smart_optimize');
  });

  it('classifies "which recommendations are safest"', () => {
    const result = router.classify('Which recommendations are safest?');
    expect(result.type).toBe('which_safest');
  });

  it('classifies "what happened after my last optimization"', () => {
    const result = router.classify('What happened after my last optimization?');
    expect(result.type).toBe('what_happened_after');
  });

  it('classifies "why did my score improve"', () => {
    const result = router.classify('Why did my score improve?');
    expect(result.type).toBe('why_score_improved');
  });

  it('classifies "why is startup rated poor"', () => {
    const result = router.classify('Why is Startup rated Poor?');
    expect(result.type).toBe('why_startup_poor');
  });

  it('classifies "why is browser privacy low"', () => {
    const result = router.classify('Why is Browser Privacy low?');
    expect(result.type).toBe('why_browser_privacy_low');
  });

  it('classifies "why is windows health fair"', () => {
    const result = router.classify('Why is Windows Health Fair?');
    expect(result.type).toBe('why_windows_fair');
  });

  it('classifies "what changed today"', () => {
    const result = router.classify('What changed today?');
    expect(result.type).toBe('what_changed');
  });

  it('returns unknown for unclassifiable question', () => {
    const result = router.classify('xyz qwerty');
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('isFollowUp detects follow-up indicators', () => {
    expect(router.isFollowUp('why is that?', 'health_score')).toBe(true);
    expect(router.isFollowUp('what is my score?', null)).toBe(false);
  });

  it('suggestFollowUps returns suggestions for each type', () => {
    const suggestions = router.suggestFollowUps('why_score_low');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('getQuickQuestions returns predefined list', () => {
    const questions = router.getQuickQuestions();
    expect(questions.length).toBeGreaterThan(0);
  });
});

// ── Explanation Engine Tests ──────────────────────────────────

describe('ExplanationEngine', () => {
  let engine: ExplanationEngine;
  let ctx: AssistantContext;

  beforeEach(() => {
    ctx = makeContext();
    engine = new ExplanationEngine();
  });

  it('explains why score is low', () => {
    const result = engine.explainByType('why_score_low', ctx);
    expect(result.questionType).toBe('why_score_low');
    expect(result.summary).toContain('65');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('explains why score improved', () => {
    const result = engine.explainByType('why_score_improved', ctx);
    expect(result.questionType).toBe('why_score_improved');
    expect(result.reasoning).toContain('improved');
  });

  it('explains what changed', () => {
    const result = engine.explainByType('what_changed', ctx);
    expect(result.questionType).toBe('what_changed');
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('explains what to optimize first', () => {
    const result = engine.explainByType('what_optimize_first', ctx);
    expect(result.questionType).toBe('what_optimize_first');
    expect(result.recommendedAction).not.toBeNull();
  });

  it('explains why startup is poor', () => {
    const result = engine.explainByType('why_startup_poor', ctx);
    expect(result.questionType).toBe('why_startup_poor');
    expect(result.summary).toContain('40');
  });

  it('explains why duplicates exist', () => {
    const result = engine.explainByType('why_duplicates', ctx);
    expect(result.questionType).toBe('why_duplicates');
    expect(result.reasoning).toContain('Duplicate');
  });

  it('explains how much space can be recovered', () => {
    const result = engine.explainByType('how_much_recover', ctx);
    expect(result.questionType).toBe('how_much_recover');
    expect(result.summary).toContain('recover');
  });

  it('explains what Smart Optimize does', () => {
    const result = engine.explainByType('what_smart_optimize', ctx);
    expect(result.questionType).toBe('what_smart_optimize');
    expect(result.reasoning).toContain('Smart Optimize');
  });

  it('explains why browser privacy is low', () => {
    const result = engine.explainByType('why_browser_privacy_low', ctx);
    expect(result.questionType).toBe('why_browser_privacy_low');
  });

  it('explains why Windows is fair', () => {
    const result = engine.explainByType('why_windows_fair', ctx);
    expect(result.questionType).toBe('why_windows_fair');
  });

  it('explains which recommendations are safest', () => {
    const result = engine.explainByType('which_safest', ctx);
    expect(result.questionType).toBe('which_safest');
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('explains what happened after last optimization', () => {
    const result = engine.explainByType('what_happened_after', ctx);
    expect(result.questionType).toBe('what_happened_after');
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('returns fallback for unknown question type', () => {
    const result = engine.explainByType('unknown', ctx);
    expect(result.questionType).toBe('unknown');
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('returns no-data response when health report is null', () => {
    const emptyCtx: AssistantContext = { ...ctx, healthReport: null };
    const result = engine.explainByType('why_score_low', emptyCtx);
    expect(result.summary).toContain('don\'t have enough data');
  });

  it('explain method classifies and routes', () => {
    const result = engine.explain('Why is my health score low?', ctx);
    expect(result.questionType).toBe('why_score_low');
  });

  it('every explanation includes all required fields', () => {
    const types = ['why_score_low', 'what_optimize_first', 'how_much_recover', 'which_safest'] as const;
    for (const type of types) {
      const result = engine.explainByType(type, ctx);
      expect(result.currentData).toBeDefined();
      expect(result.reasoning).toBeDefined();
      expect(result.evidence).toBeDefined();
      expect(result.expectedBenefit).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.followUpSuggestions).toBeDefined();
    }
  });
});

// ── Recommendation Explainer Tests ────────────────────────────

describe('RecommendationExplainer', () => {
  let explainer: RecommendationExplainer;
  let ctx: AssistantContext;

  beforeEach(() => {
    ctx = makeContext();
    explainer = new RecommendationExplainer();
  });

  it('explains a recommendation', () => {
    const rec = ctx.healthReport!.recommendations[0]!;
    const result = explainer.explainRecommendation(rec, ctx);
    expect(result.recommendationId).toBe(rec.id);
    expect(result.title).toBe(rec.title);
    expect(result.whyRecommended).toBe(rec.reason);
    expect(result.risk).toContain('Low risk');
    expect(result.benefit).toContain('15');
  });

  it('explains an optimization item', () => {
    const item = ctx.optimizationPlan!.items[0]!;
    const result = explainer.explainOptimizationItem(item, ctx);
    expect(result.recommendationId).toBe(item.id);
    expect(result.title).toBe(item.title);
    expect(result.estimatedRecovery).toContain('MB');
  });

  it('explains all recommendations', () => {
    const results = explainer.explainAll(ctx);
    expect(results.length).toBe(3);
  });

  it('explains safest recommendations only', () => {
    const results = explainer.explainSafest(ctx);
    for (const r of results) {
      expect(r.risk).toContain('low');
    }
  });

  it('finds alternative actions', () => {
    const rec = ctx.healthReport!.recommendations[0]!;
    const result = explainer.explainRecommendation(rec, ctx);
    expect(result.alternativeActions).toBeDefined();
  });

  it('resolves capability name', () => {
    const rec = ctx.healthReport!.recommendations[1]!;
    const result = explainer.explainRecommendation(rec, ctx);
    expect(result.requiredCapability).toBe('Startup Manager');
  });

  it('resolves locked capability name', () => {
    const rec: HealthRecommendation = {
      id: 'rec-locked',
      title: 'Update drivers',
      priority: 'medium',
      estimatedBenefit: 10,
      estimatedTimeSeconds: 120,
      riskLevel: 'medium',
      reason: 'Drivers are outdated',
      affectedModules: ['drivers'],
      requiredCapability: 'driver-updater',
      category: 'drivers',
    };
    const result = explainer.explainRecommendation(rec, ctx);
    expect(result.requiredCapability).toContain('requires upgrade');
  });

  it('returns N/A for recovery when no space data', () => {
    const rec: HealthRecommendation = {
      id: 'rec-no-space',
      title: 'Improve performance',
      priority: 'medium',
      estimatedBenefit: 10,
      estimatedTimeSeconds: 60,
      riskLevel: 'medium',
      reason: 'Performance is low',
      affectedModules: ['performance'],
      requiredCapability: null,
      category: 'performance',
    };
    const result = explainer.explainRecommendation(rec, ctx);
    expect(result.estimatedRecovery).toBe('N/A');
  });
});

// ── Insight Generator Tests ───────────────────────────────────

describe('InsightGenerator', () => {
  let generator: InsightGenerator;
  let ctx: AssistantContext;

  beforeEach(() => {
    ctx = makeContext();
    generator = new InsightGenerator();
  });

  it('generates insights from context', () => {
    const insights = generator.generate(ctx);
    expect(insights.length).toBeGreaterThan(0);
  });

  it('generates score improvement insight', () => {
    const insights = generator.generate(ctx);
    const scoreInsight = insights.find((i) => i.type === 'score_improvement');
    expect(scoreInsight).toBeDefined();
    expect(scoreInsight!.title).toContain('improving');
  });

  it('generates startup insight', () => {
    const insights = generator.generate(ctx);
    const startupInsight = insights.find((i) => i.type === 'startup_improvement');
    expect(startupInsight).toBeDefined();
  });

  it('generates storage insight', () => {
    const insights = generator.generate(ctx);
    const storageInsight = insights.find((i) => i.type === 'storage_increase');
    expect(storageInsight).toBeDefined();
  });

  it('generates browser cache insight', () => {
    const insights = generator.generate(ctx);
    const browserInsight = insights.find((i) => i.type === 'browser_cache_growth');
    expect(browserInsight).toBeDefined();
  });

  it('generates windows update insight', () => {
    const insights = generator.generate(ctx);
    const updateInsight = insights.find((i) => i.type === 'windows_update_overdue');
    expect(updateInsight).toBeDefined();
  });

  it('generates duplicate space insight', () => {
    const insights = generator.generate(ctx);
    const dupInsight = insights.find((i) => i.type === 'duplicate_space');
    expect(dupInsight).toBeDefined();
  });

  it('generates privacy concern insight', () => {
    const insights = generator.generate(ctx);
    const privacyInsight = insights.find((i) => i.type === 'privacy_concern');
    expect(privacyInsight).toBeDefined();
  });

  it('generates performance bottleneck insight', () => {
    const ctxWithPerf = makeContext({
      healthReport: makeHealthReport({
        categories: [...makeHealthReport().categories, makeCategoryResult('performance', 45, [{ title: 'High CPU', description: 'CPU usage is high', severity: 'high', impact: 25, autoFixable: false }])],
      }),
    });
    const insights = generator.generate(ctxWithPerf);
    const perfInsight = insights.find((i) => i.type === 'performance_bottleneck');
    expect(perfInsight).toBeDefined();
  });

  it('generates maintenance due insight for no history', () => {
    const emptyCtx = makeContext({ executionHistory: [] });
    const insights = generator.generate(emptyCtx);
    const maintInsight = insights.find((i) => i.type === 'maintenance_due');
    expect(maintInsight).toBeDefined();
  });

  it('insights are sorted by severity', () => {
    const insights = generator.generate(ctx);
    const severityOrder = { high: 0, medium: 1, low: 2, info: 3 };
    for (let i = 1; i < insights.length; i++) {
      expect(severityOrder[insights[i]!.severity]).toBeGreaterThanOrEqual(severityOrder[insights[i - 1]!.severity]);
    }
  });

  it('generateTop returns limited insights', () => {
    const insights = generator.generateTop(ctx, 3);
    expect(insights.length).toBeLessThanOrEqual(3);
  });

  it('every insight has all required fields', () => {
    const insights = generator.generate(ctx);
    for (const insight of insights) {
      expect(insight.id).toBeDefined();
      expect(insight.title).toBeDefined();
      expect(insight.description).toBeDefined();
      expect(insight.severity).toBeDefined();
      expect(insight.evidence).toBeDefined();
      expect(insight.suggestedAction).toBeDefined();
      expect(insight.confidence).toBeGreaterThan(0);
      expect(insight.generatedAt).toBeDefined();
    }
  });
});

// ── Conversation History Tests ────────────────────────────────

describe('ConversationHistory', () => {
  let history: ConversationHistory;

  beforeEach(() => {
    history = new ConversationHistory();
  });

  it('starts a session and returns ID', () => {
    const id = history.startSession();
    expect(id).toContain('conv-');
    expect(history.getActiveSessionId()).toBe(id);
  });

  it('adds messages to session', () => {
    const id = history.startSession();
    const msg = history.addMessage(id, 'user', 'Hello');
    expect(msg).not.toBeNull();
    expect(msg!.content).toBe('Hello');
    expect(history.getMessageCount(id)).toBe(1);
  });

  it('returns null for unknown session', () => {
    expect(history.addMessage('unknown', 'user', 'test')).toBeNull();
  });

  it('tracks conversation topic', () => {
    const id = history.startSession();
    history.addMessage(id, 'user', 'Why is my score low?', 'why_score_low');
    expect(history.getTopic(id)).toBe('health_score');
  });

  it('gets recent messages', () => {
    const id = history.startSession();
    history.addMessage(id, 'user', 'msg1');
    history.addMessage(id, 'assistant', 'resp1');
    history.addMessage(id, 'user', 'msg2');
    const recent = history.getRecentMessages(id, 2);
    expect(recent.length).toBe(2);
    expect(recent[0]!.content).toBe('resp1');
  });

  it('sets and gets context', () => {
    const id = history.startSession();
    const ctx = makeContext();
    history.setContext(id, ctx);
    expect(history.getContext(id)).not.toBeNull();
  });

  it('clears session', () => {
    const id = history.startSession();
    history.addMessage(id, 'user', 'test');
    expect(history.clearSession(id)).toBe(true);
    expect(history.getConversation(id)).toBeNull();
  });

  it('clears all sessions', () => {
    history.startSession();
    history.startSession();
    history.clearAll();
    expect(history.size()).toBe(0);
    expect(history.getActiveSessionId()).toBeNull();
  });

  it('exports and imports session', () => {
    const id = history.startSession();
    history.addMessage(id, 'user', 'test message');
    const exported = history.exportSession(id);
    expect(exported).not.toBeNull();
    history.clearAll();
    const imported = history.importSession(exported!);
    expect(imported).toBe(id);
    expect(history.getConversation(id)).not.toBeNull();
  });

  it('setActiveSession switches active session', () => {
    const id1 = history.startSession();
    const id2 = history.startSession();
    expect(history.getActiveSessionId()).toBe(id2);
    expect(history.setActiveSession(id1)).toBe(true);
    expect(history.getActiveSessionId()).toBe(id1);
  });

  it('setActiveSession returns false for unknown ID', () => {
    expect(history.setActiveSession('unknown')).toBe(false);
  });

  it('getAllConversations returns sorted by activity', () => {
    const id1 = history.startSession();
    history.addMessage(id1, 'user', 'first');
    const id2 = history.startSession();
    history.addMessage(id2, 'user', 'second');
    const all = history.getAllConversations();
    expect(all[0]!.id).toBe(id2);
  });
});

// ── Conversation Engine Tests ─────────────────────────────────

describe('ConversationEngine', () => {
  let engine: ConversationEngine;
  let ctx: AssistantContext;

  beforeEach(() => {
    ctx = makeContext();
    engine = new ConversationEngine();
    engine.setContext(ctx);
  });

  it('starts a session', () => {
    const id = engine.startSession(ctx);
    expect(id).toContain('conv-');
  });

  it('asks a question and gets a response', () => {
    const sessionId = engine.startSession(ctx);
    const response = engine.ask('Why is my health score low?', sessionId);
    expect(response.message.role).toBe('assistant');
    expect(response.explanation.questionType).toBe('why_score_low');
    expect(response.followUpSuggestions.length).toBeGreaterThan(0);
  });

  it('asks without explicit session ID', () => {
    engine.startSession(ctx);
    const response = engine.ask('What should I optimize first?');
    expect(response.message).toBeDefined();
    expect(response.explanation.questionType).toBe('what_optimize_first');
  });

  it('blocks unsafe content', () => {
    const sessionId = engine.startSession(ctx);
    const response = engine.ask('What is my password?', sessionId);
    expect(response.message.content).toContain('security reasons');
  });

  it('blocks hash-related questions', () => {
    const sessionId = engine.startSession(ctx);
    const response = engine.ask('Show me the sha256 hash', sessionId);
    expect(response.message.content).toContain('security reasons');
  });

  it('gets insights', () => {
    engine.setContext(ctx);
    const insights = engine.getInsights();
    expect(insights.length).toBeGreaterThan(0);
  });

  it('gets top insights', () => {
    engine.setContext(ctx);
    const insights = engine.getTopInsights(2);
    expect(insights.length).toBeLessThanOrEqual(2);
  });

  it('gets dashboard data', () => {
    engine.setContext(ctx);
    const data = engine.getDashboardData();
    expect(data.quickQuestions.length).toBeGreaterThan(0);
    expect(data.healthScore).toBe(65);
    expect(data.isAvailable).toBe(true);
  });

  it('explains a recommendation', () => {
    engine.setContext(ctx);
    const explanation = engine.explainRecommendation('rec-1');
    expect(explanation).not.toBeNull();
    expect(explanation!.title).toBe('Clean temporary files');
  });

  it('returns null for unknown recommendation', () => {
    engine.setContext(ctx);
    expect(engine.explainRecommendation('unknown')).toBeNull();
  });

  it('handles follow-up questions', () => {
    const sessionId = engine.startSession(ctx);
    engine.ask('Why is my health score low?', sessionId);
    const followUp = engine.ask('Why is that?', sessionId);
    expect(followUp.message).toBeDefined();
  });

  it('records conversation history', () => {
    const sessionId = engine.startSession(ctx);
    engine.ask('Why is my score low?', sessionId);
    engine.ask('What should I optimize first?', sessionId);
    const messages = engine.getHistory().getMessages(sessionId);
    expect(messages.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Events Tests ──────────────────────────────────────────────

describe('AssistantEvents', () => {
  let emitter: AssistantEventEmitter;

  beforeEach(() => {
    emitter = new AssistantEventEmitter();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    emitter.on('assistant_started', listener);
    emitter.emit('assistant_started', { sessionId: 'test', timestamp: 'now' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = emitter.on('assistant_response_generated', listener);
    unsub();
    emitter.emit('assistant_response_generated', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not crash when listener throws', () => {
    emitter.on('assistant_failed', () => {
      throw new Error('test');
    });
    expect(() => emitter.emit('assistant_failed', {})).not.toThrow();
  });

  it('tracks listener count', () => {
    emitter.on('assistant_started', () => {});
    emitter.on('assistant_started', () => {});
    expect(emitter.listenerCount('assistant_started')).toBe(2);
  });

  it('clear removes all listeners', () => {
    emitter.on('assistant_started', () => {});
    emitter.clear();
    expect(emitter.listenerCount('assistant_started')).toBe(0);
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.conversationEngine).toBeDefined();
    expect(mod.explanationEngine).toBeDefined();
    expect(mod.insightGenerator).toBeDefined();
    expect(mod.questionRouter).toBeDefined();
    expect(mod.assistantContextBuilder).toBeDefined();
    expect(mod.recommendationExplainer).toBeDefined();
    expect(mod.conversationHistory).toBeDefined();
    expect(mod.promptTemplateRegistry).toBeDefined();
    expect(mod.assistantEvents).toBeDefined();
    expect(mod.ConversationEngine).toBeDefined();
    expect(mod.ExplanationEngine).toBeDefined();
    expect(mod.InsightGenerator).toBeDefined();
    expect(mod.QuestionRouter).toBeDefined();
    expect(mod.AssistantContextBuilder).toBeDefined();
    expect(mod.RecommendationExplainer).toBeDefined();
    expect(mod.ConversationHistory).toBeDefined();
    expect(mod.PromptTemplateRegistry).toBeDefined();
    expect(mod.AssistantEventEmitter).toBeDefined();
  });

  it('QUICK_QUESTIONS covers all 12 question types', () => {
    const types = new Set(QUICK_QUESTIONS.map((q) => q.type));
    expect(types.size).toBe(12);
  });

  it('safety filter covers all forbidden patterns', () => {
    expect(FORBIDDEN_PATTERNS.length).toBeGreaterThanOrEqual(8);
    expect(isSafeContent('password')).toBe(false);
    expect(isSafeContent('secret')).toBe(false);
    expect(isSafeContent('credential')).toBe(false);
    expect(isSafeContent('api_key')).toBe(false);
    expect(isSafeContent('token')).toBe(false);
    expect(isSafeContent('hash')).toBe(false);
  });

  it('prompt templates cover all question types', () => {
    const registry = new PromptTemplateRegistry();
    const questionTypes = ['why_score_low', 'why_score_improved', 'what_changed', 'what_optimize_first',
      'why_startup_poor', 'why_duplicates', 'how_much_recover', 'what_smart_optimize',
      'why_browser_privacy_low', 'why_windows_fair', 'which_safest', 'what_happened_after'] as const;
    for (const type of questionTypes) {
      const template = registry.getByQuestionType(type);
      expect(template.id).not.toBe('fallback');
    }
  });

  it('explanation engine never fabricates data', () => {
    const engine = new ExplanationEngine();
    const emptyCtx: AssistantContext = {
      healthReport: null,
      optimizationPlan: null,
      executionHistory: [],
      executionStatistics: null,
      executionReport: null,
      capabilities: { available: [], locked: [] },
      trends: null,
      timestamp: new Date().toISOString(),
    };
    const result = engine.explainByType('why_score_low', emptyCtx);
    expect(result.summary).toContain('don\'t have enough data');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('conversation engine never performs actions automatically', () => {
    const engine = new ConversationEngine();
    engine.setContext(makeContext());
    const sessionId = engine.startSession();
    const response = engine.ask('What should I optimize first?', sessionId);
    expect(response.explanation.recommendedAction).not.toBeNull();
    expect(response.message.content).not.toContain('executed');
    expect(response.message.content).not.toContain('deleted');
    expect(response.message.content).not.toContain('removed');
  });

  it('conversation engine never bypasses confirmation', () => {
    const engine = new ConversationEngine();
    engine.setContext(makeContext());
    const sessionId = engine.startSession();
    const response = engine.ask('Optimize my PC now', sessionId);
    expect(response.message.role).toBe('assistant');
    expect(response.message.content).not.toContain('optimizing');
    expect(response.message.content).not.toContain('starting');
  });

  it('dashboard data includes quick questions, insights, and actions', () => {
    const engine = new ConversationEngine();
    engine.setContext(makeContext());
    const data = engine.getDashboardData();
    expect(data.quickQuestions.length).toBeGreaterThan(0);
    expect(data.suggestedInsights).toBeDefined();
    expect(data.recommendedActions).toBeDefined();
    expect(data.healthScore).not.toBeNull();
  });
});
