/**
 * Tests for EPIC 3 PHASE A PART 7 — Optimization Intelligence Report.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  ExecutionReport,
  ExecutionStepResult,
} from '../../execution-pipeline/types';
import type {
  OptimizationPlanV2,
  PlanStep,
} from '../../optimization-planner/types';
import type {
  IntelligenceReport,
} from '../types';
import {
  createDefaultReportConfiguration,
  generateReportId,
  generateReportHistoryId,
  formatDuration,
  formatStorage,
  formatHealthDelta,
  determineHealthTrend,
} from '../types';
import {
  DEFAULT_REPORT_CONFIGURATION,
  createReportConfiguration,
} from '../reportConfiguration';
import { ReportEvents } from '../reportEvents';
import { ReportEvidenceCollector } from '../reportEvidenceCollector';
import { ReportHealthDelta } from '../reportHealthDelta';
import { ReportStoryGenerator } from '../reportStoryGenerator';
import { ReportFormatter } from '../reportFormatter';
import { ReportRegistry } from '../reportRegistry';
import { ReportHistory } from '../reportHistory';
import { ReportBuilder } from '../reportBuilder';
import { ReportManager } from '../reportManager';

// ── Mock Data Builders ───────────────────────────────────────

function createMockStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    id: overrides.id ?? 'step_1',
    title: overrides.title ?? 'Clean Temp Files',
    description: overrides.description ?? 'Remove temporary files',
    category: overrides.category ?? 'storage',
    estimatedDuration: overrides.estimatedDuration ?? 30,
    estimatedBenefit: overrides.estimatedBenefit ?? 'Improves storage',
    riskLevel: overrides.riskLevel ?? 'low',
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    rollbackMethod: overrides.rollbackMethod ?? 'automatic',
    rollbackConfidence: overrides.rollbackConfidence ?? 0.9,
    estimatedRollbackTime: overrides.estimatedRollbackTime ?? 15,
    relatedRecommendation: overrides.relatedRecommendation ?? 'rec_1',
    confidence: overrides.confidence ?? 0.85,
    status: overrides.status ?? 'pending',
    priority: overrides.priority ?? 'high',
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockPlan(overrides: Partial<OptimizationPlanV2> = {}): OptimizationPlanV2 {
  const steps = overrides.steps ?? [
    createMockStep(),
    createMockStep({ id: 'step_2', title: 'Clean Browser Cache', category: 'privacy' }),
  ];
  return {
    id: overrides.id ?? 'plan_test_1',
    title: overrides.title ?? 'Quick Optimize',
    description: overrides.description ?? 'A quick optimization plan',
    summary: overrides.summary ?? '2 steps, ~60s',
    generatedAt: overrides.generatedAt ?? new Date().toISOString(),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 1800000).toISOString(),
    planType: overrides.planType ?? 'quick_optimize',
    estimatedDuration: overrides.estimatedDuration ?? 60,
    estimatedHealthGain: overrides.estimatedHealthGain ?? 6,
    estimatedStorageRecovery: overrides.estimatedStorageRecovery ?? 1800,
    estimatedPerformanceGain: overrides.estimatedPerformanceGain ?? 5,
    estimatedPrivacyGain: overrides.estimatedPrivacyGain ?? 4,
    estimatedStartupGain: overrides.estimatedStartupGain ?? 1.6,
    estimatedRisk: overrides.estimatedRisk ?? 'low',
    confidenceScore: overrides.confidenceScore ?? 0.85,
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    requiresConfirmation: overrides.requiresConfirmation ?? false,
    recommendedOrder: overrides.recommendedOrder ?? steps.map((s) => s.id),
    steps,
    relatedRecommendations: overrides.relatedRecommendations ?? ['rec_1', 'rec_2'],
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockStepResult(
  stepId: string,
  stepTitle: string,
  status: ExecutionStepResult['status'] = 'completed',
  overrides: Partial<ExecutionStepResult> = {},
): ExecutionStepResult {
  return {
    stepId,
    stepTitle,
    status,
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    completedAt: overrides.completedAt ?? new Date().toISOString(),
    durationMs: overrides.durationMs ?? 5000,
    error: overrides.error ?? null,
    warnings: overrides.warnings ?? [],
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    rollbackExecuted: overrides.rollbackExecuted ?? false,
    output: overrides.output ?? { cleaned: true, itemsRemoved: 42 },
  };
}

function createMockExecutionReport(overrides: Partial<ExecutionReport> = {}): ExecutionReport {
  const completed = overrides.completedSteps ?? [
    createMockStepResult('step_1', 'Clean Temp Files'),
    createMockStepResult('step_2', 'Clean Browser Cache'),
  ];
  return {
    executionId: overrides.executionId ?? 'exec_test_1',
    planId: overrides.planId ?? 'plan_test_1',
    summary: overrides.summary ?? 'Execution completed: 2 completed, 0 failed, 0 skipped',
    completedSteps: completed,
    skippedSteps: overrides.skippedSteps ?? [],
    failedSteps: overrides.failedSteps ?? [],
    totalDurationMs: overrides.totalDurationMs ?? 102000,
    healthBefore: overrides.healthBefore !== undefined ? overrides.healthBefore : 88,
    healthAfter: overrides.healthAfter !== undefined ? overrides.healthAfter : 94,
    healthDelta: overrides.healthDelta !== undefined ? overrides.healthDelta : 6,
    storageRecovered: overrides.storageRecovered ?? 1800,
    performanceImprovement: overrides.performanceImprovement ?? 5,
    warnings: overrides.warnings ?? [],
    errors: overrides.errors ?? [],
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    evidence: overrides.evidence ?? [],
    generatedAt: overrides.generatedAt ?? new Date().toISOString(),
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('createDefaultReportConfiguration has all sections', () => {
    const cfg = createDefaultReportConfiguration();
    expect(cfg.formattingRules).toBeDefined();
    expect(cfg.storyRules).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
    expect(cfg.rollbackDurationHours).toBe(24);
  });
  it('generateReportId produces unique ids', () => {
    expect(generateReportId()).not.toBe(generateReportId());
    expect(generateReportId()).toContain('report_');
  });
  it('generateReportHistoryId produces unique ids', () => {
    expect(generateReportHistoryId()).toContain('rhist_');
  });
  it('formatDuration formats minutes and seconds', () => {
    expect(formatDuration(102000)).toBe('1m 42s');
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(0)).toBe('0s');
  });
  it('formatStorage formats bytes correctly', () => {
    expect(formatStorage(0)).toBe('0 B');
    expect(formatStorage(1024)).toBe('1.00 KB');
    expect(formatStorage(1048576)).toBe('1.00 MB');
    expect(formatStorage(1073741824)).toBe('1.00 GB');
  });
  it('formatStorage formats large values with auto units', () => {
    expect(formatStorage(1932735283)).toBe('1.80 GB');
  });
  it('formatHealthDelta formats before → after (+delta)', () => {
    expect(formatHealthDelta(88, 94)).toBe('88 → 94 (+6)');
    expect(formatHealthDelta(90, 85)).toBe('90 → 85 (-5)');
    expect(formatHealthDelta(null, 90)).toBe('N/A');
  });
  it('determineHealthTrend identifies improvement', () => {
    expect(determineHealthTrend(80, 90)).toBe('improved');
    expect(determineHealthTrend(90, 80)).toBe('declined');
    expect(determineHealthTrend(90, 90)).toBe('unchanged');
    expect(determineHealthTrend(null, 90)).toBe('unknown');
  });
});

// ── Configuration ────────────────────────────────────────────

describe('ReportConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_REPORT_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_REPORT_CONFIGURATION.formattingRules.timeFormat).toBe('compact');
  });
  it('createReportConfiguration accepts overrides', () => {
    const cfg = createReportConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
  });
  it('merges formattingRules', () => {
    const cfg = createReportConfiguration({ formattingRules: { maxHighlights: 3 } });
    expect(cfg.formattingRules.maxHighlights).toBe(3);
    expect(cfg.formattingRules.showEvidence).toBe(true);
  });
  it('merges storyRules', () => {
    const cfg = createReportConfiguration({ storyRules: { tone: 'friendly' } });
    expect(cfg.storyRules.tone).toBe('friendly');
  });
  it('merges featureFlags', () => {
    const cfg = createReportConfiguration({ featureFlags: { enableStories: false } });
    expect(cfg.featureFlags.enableStories).toBe(false);
    expect(cfg.featureFlags.enableHealthDelta).toBe(true);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('ReportEvents', () => {
  let events: ReportEvents;
  beforeEach(() => { events = new ReportEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('report_generated', () => { received = true; });
    events.emitGenerated('r1');
    expect(received).toBe(true);
  });
  it('off removes listener', () => {
    let received = false;
    const listener = () => { received = true; };
    events.on('report_viewed', listener);
    events.off('report_viewed', listener);
    events.emitViewed('r1');
    expect(received).toBe(false);
  });
  it('on returns unsubscribe function', () => {
    let received = false;
    const unsub = events.on('report_shared', () => { received = true; });
    unsub();
    events.emitShared('r1');
    expect(received).toBe(false);
  });
  it('emitArchived works', () => {
    let received = false;
    events.on('report_archived', () => { received = true; });
    events.emitArchived('r1');
    expect(received).toBe(true);
  });
  it('emitRegenerated works', () => {
    let received = false;
    events.on('report_regenerated', () => { received = true; });
    events.emitRegenerated('r1');
    expect(received).toBe(true);
  });
  it('clear removes all', () => {
    events.on('report_generated', () => {});
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });
  it('listenerCount returns correct count', () => {
    events.on('report_generated', () => {});
    events.on('report_viewed', () => {});
    expect(events.listenerCount()).toBe(2);
    expect(events.listenerCount('report_generated')).toBe(1);
  });
  it('does not crash on listener error', () => {
    events.on('report_generated', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    events.emitGenerated('r1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Evidence Collector ───────────────────────────────────────

describe('ReportEvidenceCollector', () => {
  let collector: ReportEvidenceCollector;
  beforeEach(() => { collector = new ReportEvidenceCollector(); });

  it('collects from execution report', () => {
    const report = createMockExecutionReport();
    const evidence = collector.collectFromExecution(report);
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.some((e) => e.source === 'execution_pipeline')).toBe(true);
  });
  it('collects from completed steps', () => {
    const step = createMockStepResult('s1', 'Test Step');
    const evidence = collector.collectFromStep(step);
    expect(evidence.some((e) => e.metric === 'step_status')).toBe(true);
    expect(evidence.some((e) => e.metric === 'step_duration')).toBe(true);
  });
  it('collects from step output', () => {
    const step = createMockStepResult('s1', 'Test Step', 'completed', { output: { filesRemoved: 42 } });
    const evidence = collector.collectFromStep(step);
    expect(evidence.some((e) => e.metric === 'step_output_filesRemoved')).toBe(true);
  });
  it('collects health evidence', () => {
    const evidence = collector.collectHealthEvidence(80, 90, new Date().toISOString());
    expect(evidence.length).toBe(2);
    expect(evidence[0]?.metric).toBe('health_before');
    expect(evidence[1]?.metric).toBe('health_after');
  });
  it('collects storage evidence', () => {
    const evidence = collector.collectStorageEvidence(1048576, new Date().toISOString());
    expect(evidence.length).toBe(1);
    expect(evidence[0]?.metric).toBe('storage_recovered');
  });
  it('returns empty for zero storage', () => {
    const evidence = collector.collectStorageEvidence(0, new Date().toISOString());
    expect(evidence.length).toBe(0);
  });
  it('evidence has descriptions', () => {
    const report = createMockExecutionReport();
    const evidence = collector.collectFromExecution(report);
    expect(every(evidence, (e) => e.description.length > 0)).toBe(true);
  });
});

function every<T>(arr: T[], predicate: (item: T) => boolean): boolean {
  return arr.every(predicate);
}

// ── Health Delta ─────────────────────────────────────────────

describe('ReportHealthDelta', () => {
  let hd: ReportHealthDelta;
  beforeEach(() => { hd = new ReportHealthDelta(); });

  it('computes positive delta', () => {
    const result = hd.compute(80, 90);
    expect(result.delta).toBe(10);
    expect(result.trend).toBe('improved');
    expect(result.formatted).toBe('80 → 90 (+10)');
  });
  it('computes negative delta', () => {
    const result = hd.compute(90, 80);
    expect(result.delta).toBe(-10);
    expect(result.trend).toBe('declined');
  });
  it('computes unchanged delta', () => {
    const result = hd.compute(90, 90);
    expect(result.delta).toBe(0);
    expect(result.trend).toBe('unchanged');
  });
  it('computes unknown for null values', () => {
    const result = hd.compute(null, 90);
    expect(result.delta).toBeNull();
    expect(result.trend).toBe('unknown');
  });
  it('formatCompact produces correct string', () => {
    expect(hd.formatCompact(88, 94)).toBe('88 → 94 (+6)');
  });
  it('formatPercentage produces correct string', () => {
    expect(hd.formatPercentage(80, 90)).toBe('80% → 90% (+10%)');
  });
  it('isImprovement detects improvement', () => {
    expect(hd.isImprovement(hd.compute(80, 90))).toBe(true);
    expect(hd.isImprovement(hd.compute(90, 80))).toBe(false);
  });
  it('isSignificant detects threshold', () => {
    expect(hd.isSignificant(hd.compute(80, 90), 5)).toBe(true);
    expect(hd.isSignificant(hd.compute(80, 82), 5)).toBe(false);
  });
  it('describeTrend produces readable text', () => {
    expect(hd.describeTrend(hd.compute(80, 90))).toContain('improved by 10');
    expect(hd.describeTrend(hd.compute(90, 80))).toContain('declined by 10');
    expect(hd.describeTrend(hd.compute(90, 90))).toContain('remained stable');
    expect(hd.describeTrend(hd.compute(null, 90))).toContain('could not be determined');
  });
});

// ── Story Generator ──────────────────────────────────────────

describe('ReportStoryGenerator', () => {
  let gen: ReportStoryGenerator;
  beforeEach(() => { gen = new ReportStoryGenerator(createDefaultReportConfiguration()); });

  it('generates success story', () => {
    const report = createMockExecutionReport();
    const plan = createMockPlan();
    const story = gen.generate(report, plan);
    expect(story.outcome).toBe('success');
    expect(story.title).toContain('Optimization Complete');
    expect(story.narrative.length).toBeGreaterThan(0);
    expect(story.highlights.length).toBeGreaterThan(0);
  });
  it('generates partial story for mixed results', () => {
    const report = createMockExecutionReport({
      completedSteps: [createMockStepResult('step_1', 'Clean Temp Files')],
      failedSteps: [createMockStepResult('step_2', 'Clean Browser Cache', 'failed', { error: 'permission denied' })],
    });
    const plan = createMockPlan();
    const story = gen.generate(report, plan);
    expect(story.outcome).toBe('partial');
    expect(story.title).toContain('Partially Complete');
  });
  it('generates failed story', () => {
    const report = createMockExecutionReport({
      completedSteps: [],
      failedSteps: [createMockStepResult('step_1', 'Clean Temp Files', 'failed', { error: 'crashed' })],
    });
    const plan = createMockPlan();
    const story = gen.generate(report, plan);
    expect(story.outcome).toBe('failed');
    expect(story.title).toContain('Failed');
  });
  it('includes health delta in highlights', () => {
    const report = createMockExecutionReport({ healthDelta: 6 });
    const plan = createMockPlan();
    const story = gen.generate(report, plan);
    expect(story.highlights.some((h) => h.includes('Health score improved by 6'))).toBe(true);
  });
  it('includes storage in highlights', () => {
    const report = createMockExecutionReport({ storageRecovered: 1073741824 });
    const plan = createMockPlan();
    const story = gen.generate(report, plan);
    expect(story.highlights.some((h) => h.includes('storage recovered'))).toBe(true);
  });
  it('includes rollback in highlights', () => {
    const report = createMockExecutionReport({ rollbackAvailable: true, healthDelta: 0, storageRecovered: 0 });
    const plan = createMockPlan({ estimatedStartupGain: 0, estimatedPrivacyGain: 0, estimatedPerformanceGain: 0 });
    const story = gen.generate(report, plan);
    expect(story.highlights.some((h) => h.includes('Rollback available'))).toBe(true);
  });
  it('narrative includes health improvement', () => {
    const report = createMockExecutionReport({ healthBefore: 80, healthAfter: 90, healthDelta: 10 });
    const plan = createMockPlan();
    const story = gen.generate(report, plan);
    expect(story.narrative).toContain('Health score improved');
  });
  it('narrative includes action names', () => {
    const report = createMockExecutionReport();
    const plan = createMockPlan();
    const story = gen.generate(report, plan);
    expect(story.narrative).toContain('clean temp files');
  });
  it('narrative includes skipped actions', () => {
    const report = createMockExecutionReport({
      skippedSteps: [createMockStepResult('step_3', 'Large Downloads Folder', 'skipped')],
    });
    const plan = createMockPlan();
    const story = gen.generate(report, plan);
    expect(story.narrative).toContain('skipped');
  });
  it('confidenceScore blends success rate and plan confidence', () => {
    const report = createMockExecutionReport();
    const plan = createMockPlan({ confidenceScore: 0.9 });
    const story = gen.generate(report, plan);
    expect(story.confidenceScore).toBeGreaterThan(0);
    expect(story.confidenceScore).toBeLessThanOrEqual(1);
  });
  it('respects maxHighlights limit', () => {
    const cfg = createReportConfiguration({ formattingRules: { maxHighlights: 2 } });
    const g = new ReportStoryGenerator(cfg);
    const report = createMockExecutionReport({ healthDelta: 6, storageRecovered: 1073741824 });
    const plan = createMockPlan({ estimatedStartupGain: 1.6, estimatedPrivacyGain: 4 });
    const story = g.generate(report, plan);
    expect(story.highlights.length).toBeLessThanOrEqual(2);
  });
  it('respects maxNarrativeLength', () => {
    const cfg = createReportConfiguration({ storyRules: { maxNarrativeLength: 50 } });
    const g = new ReportStoryGenerator(cfg);
    const report = createMockExecutionReport();
    const plan = createMockPlan();
    const story = g.generate(report, plan);
    expect(story.narrative.length).toBeLessThanOrEqual(53);
  });
});

// ── Formatter ────────────────────────────────────────────────

describe('ReportFormatter', () => {
  let fmt: ReportFormatter;
  beforeEach(() => { fmt = new ReportFormatter(createDefaultReportConfiguration()); });

  it('formats execution time', () => {
    const result = fmt.formatExecutionTime(102000);
    expect(result.formatted).toBe('1m 42s');
  });
  it('formats health delta', () => {
    const result = fmt.formatHealthDelta(88, 94);
    expect(result.delta).toBe(6);
    expect(result.formatted).toBe('88 → 94 (+6)');
    expect(result.trend).toBe('improved');
  });
  it('formats storage', () => {
    const result = fmt.formatStorage(1073741824);
    expect(result.formatted).toBe('1.00 GB');
  });
  it('formats startup improvement', () => {
    const result = fmt.formatStartup(1.6);
    expect(result.formatted).toBe('1.6 seconds');
  });
  it('formats zero startup', () => {
    const result = fmt.formatStartup(0);
    expect(result.formatted).toBe('No improvement');
  });
  it('formats privacy improvement', () => {
    const result = fmt.formatPrivacy(4);
    expect(result.formatted).toBe('+4');
  });
  it('formats zero privacy', () => {
    const result = fmt.formatPrivacy(0);
    expect(result.formatted).toBe('No change');
  });
  it('formats performance improvement', () => {
    const result = fmt.formatPerformance(5);
    expect(result.formatted).toBe('+5');
  });
  it('formats completed actions', () => {
    const steps = [createMockStepResult('step_1', 'Clean Temp Files')];
    const plan = createMockPlan();
    const actions = fmt.formatActions(steps, plan, 'check');
    expect(actions.length).toBe(1);
    expect(actions[0]?.icon).toBe('check');
    expect(actions[0]?.title).toBe('Clean Temp Files');
  });
  it('formats skipped actions with skip icon', () => {
    const steps = [createMockStepResult('step_3', 'Large Downloads', 'skipped')];
    const plan = createMockPlan();
    const actions = fmt.formatActions(steps, plan, 'skip');
    expect(actions[0]?.icon).toBe('skip');
  });
  it('formats predictions', () => {
    const plan = createMockPlan({ estimatedStorageRecovery: 1800, estimatedStartupGain: 1.6 });
    const predictions = fmt.formatPredictions(plan, 6);
    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions.some((p) => p.prediction === 'System health trend')).toBe(true);
    expect(predictions.some((p) => p.prediction === 'Storage growth')).toBe(true);
  });
  it('formats recommendations remaining', () => {
    const result = fmt.formatRecommendationsRemaining(2, { low: 2 });
    expect(result.count).toBe(2);
    expect(result.summary).toContain('2 items remaining');
  });
  it('formats zero recommendations remaining', () => {
    const result = fmt.formatRecommendationsRemaining(0, {});
    expect(result.summary).toBe('All recommendations addressed');
  });
  it('formats rollback display', () => {
    const result = fmt.formatRollback(true, 2);
    expect(result.available).toBe(true);
    expect(result.formatted).toContain('Available for 24 hours');
    expect(result.stepsRollbackable).toBe(2);
  });
  it('formats rollback unavailable', () => {
    const result = fmt.formatRollback(false, 0);
    expect(result.available).toBe(false);
    expect(result.formatted).toBe('Not available');
  });
});

// ── Registry ─────────────────────────────────────────────────

describe('ReportRegistry', () => {
  let registry: ReportRegistry;
  beforeEach(() => { registry = new ReportRegistry(); });

  it('registers reports', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1' } as IntelligenceReport;
    expect(registry.register(report)).toBe(true);
    expect(registry.count).toBe(1);
  });
  it('rejects duplicate ids', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1' } as IntelligenceReport;
    registry.register(report);
    expect(registry.register(report)).toBe(false);
  });
  it('gets by id', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1' } as IntelligenceReport;
    registry.register(report);
    expect(registry.get('r1')).toBeDefined();
    expect(registry.get('unknown')).toBeUndefined();
  });
  it('gets by execution id', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1' } as IntelligenceReport;
    registry.register(report);
    expect(registry.getByExecution('e1')).toBeDefined();
    expect(registry.getByExecution('unknown')).toBeUndefined();
  });
  it('gets by plan id', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1' } as IntelligenceReport;
    registry.register(report);
    expect(registry.getByPlan('p1').length).toBe(1);
  });
  it('unregisters reports', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1' } as IntelligenceReport;
    registry.register(report);
    expect(registry.unregister('r1')).toBe(true);
    expect(registry.count).toBe(0);
  });
  it('clear removes all', () => {
    registry.register({ id: 'r1', executionId: 'e1', planId: 'p1' } as IntelligenceReport);
    registry.clear();
    expect(registry.count).toBe(0);
  });
});

// ── History ──────────────────────────────────────────────────

describe('ReportHistory', () => {
  let history: ReportHistory;
  beforeEach(() => { history = new ReportHistory(); });

  it('records entries', () => {
    history.record('r1', 'generated');
    expect(history.count).toBe(1);
  });
  it('getAll returns all', () => {
    history.record('r1', 'generated');
    history.record('r2', 'viewed');
    expect(history.getAll().length).toBe(2);
  });
  it('getRecent returns last N', () => {
    for (let i = 0; i < 5; i++) history.record(`r${i}`, 'generated');
    expect(history.getRecent(2).length).toBe(2);
  });
  it('getByReport filters by report', () => {
    history.record('r1', 'generated');
    history.record('r2', 'viewed');
    expect(history.getByReport('r1').length).toBe(1);
  });
  it('getByAction filters by action', () => {
    history.record('r1', 'generated');
    history.record('r2', 'viewed');
    expect(history.getByAction('generated').length).toBe(1);
  });
  it('clear removes all', () => {
    history.record('r1', 'generated');
    history.clear();
    expect(history.count).toBe(0);
  });
  it('trims to max entries', () => {
    const h = new ReportHistory(5);
    for (let i = 0; i < 10; i++) h.record(`r${i}`, 'generated');
    expect(h.count).toBe(5);
  });
});

// ── Report Builder ───────────────────────────────────────────

describe('ReportBuilder', () => {
  let builder: ReportBuilder;
  beforeEach(() => { builder = new ReportBuilder(createDefaultReportConfiguration()); });

  it('builds a complete report', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.id).toContain('report_');
    expect(report.executionId).toBe(execReport.executionId);
    expect(report.planId).toBe(execReport.planId);
  });
  it('sets headline from story', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.headline).toContain('Optimization Complete');
  });
  it('formats execution time', () => {
    const execReport = createMockExecutionReport({ totalDurationMs: 102000 });
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.executionTime.formatted).toBe('1m 42s');
  });
  it('formats health delta display', () => {
    const execReport = createMockExecutionReport({ healthBefore: 88, healthAfter: 94, healthDelta: 6 });
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.healthDelta.before).toBe(88);
    expect(report.healthDelta.after).toBe(94);
    expect(report.healthDelta.delta).toBe(6);
    expect(report.healthDelta.formatted).toBe('88 → 94 (+6)');
  });
  it('formats storage recovered', () => {
    const execReport = createMockExecutionReport({ storageRecovered: 1073741824 });
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.storageRecovered.formatted).toBe('1.00 GB');
  });
  it('formats startup improvement', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan({ estimatedStartupGain: 1.6 });
    const report = builder.build(execReport, plan);
    expect(report.startupImprovement.secondsSaved).toBe(1.6);
    expect(report.startupImprovement.formatted).toBe('1.6 seconds');
  });
  it('formats privacy improvement', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan({ estimatedPrivacyGain: 4 });
    const report = builder.build(execReport, plan);
    expect(report.privacyImprovement.formatted).toBe('+4');
  });
  it('lists completed actions', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.actionsCompleted.length).toBe(2);
    expect(report.actionsCompleted[0]?.icon).toBe('check');
  });
  it('lists skipped actions', () => {
    const execReport = createMockExecutionReport({
      skippedSteps: [createMockStepResult('step_3', 'Large Downloads', 'skipped')],
    });
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.actionsSkipped.length).toBe(1);
    expect(report.actionsSkipped[0]?.icon).toBe('skip');
  });
  it('lists failed actions', () => {
    const execReport = createMockExecutionReport({
      failedSteps: [createMockStepResult('step_3', 'Registry Cleanup', 'failed', { error: 'denied' })],
    });
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.actionsFailed.length).toBe(1);
    expect(report.actionsFailed[0]?.icon).toBe('error');
  });
  it('generates predictions', () => {
    const execReport = createMockExecutionReport({ healthDelta: 6 });
    const plan = createMockPlan({ estimatedStorageRecovery: 1800 });
    const report = builder.build(execReport, plan);
    expect(report.predictionsUpdated.length).toBeGreaterThan(0);
  });
  it('formats rollback info', () => {
    const execReport = createMockExecutionReport({ rollbackAvailable: true });
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.rollbackInfo.available).toBe(true);
    expect(report.rollbackInfo.formatted).toContain('Available for 24 hours');
  });
  it('collects evidence', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.evidence.length).toBeGreaterThan(0);
  });
  it('generates story', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.story.title).toContain('Optimization Complete');
    expect(report.story.narrative.length).toBeGreaterThan(0);
  });
  it('sets metadata', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = builder.build(execReport, plan);
    expect(report.metadata.planTitle).toBe('Quick Optimize');
    expect(report.metadata.completedSteps).toBe(2);
  });
  it('respects feature flags — disable health delta', () => {
    const cfg = createReportConfiguration({ featureFlags: { enableHealthDelta: false } });
    const b = new ReportBuilder(cfg);
    const execReport = createMockExecutionReport({ healthBefore: 88, healthAfter: 94 });
    const plan = createMockPlan();
    const report = b.build(execReport, plan);
    expect(report.healthDelta.formatted).toBe('N/A');
  });
  it('respects feature flags — disable stories', () => {
    const cfg = createReportConfiguration({ featureFlags: { enableStories: false } });
    const b = new ReportBuilder(cfg);
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = b.build(execReport, plan);
    expect(report.story.narrative).toBe('');
  });
  it('respects feature flags — disable evidence', () => {
    const cfg = createReportConfiguration({ featureFlags: { enableEvidence: false } });
    const b = new ReportBuilder(cfg);
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = b.build(execReport, plan);
    expect(report.evidence.length).toBe(0);
  });
  it('accepts recommendations remaining', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = builder.build(execReport, plan, {
      recommendationsRemaining: 2,
      recommendationPriorityBreakdown: { low: 2 },
    });
    expect(report.recommendationsRemaining.count).toBe(2);
    expect(report.recommendationsRemaining.summary).toContain('2 items remaining');
  });
});

// ── Report Manager ───────────────────────────────────────────

describe('ReportManager', () => {
  let manager: ReportManager;
  beforeEach(() => { manager = new ReportManager(); });

  it('generates a report', () => {
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = manager.generateReport(execReport, plan);
    expect(report.id).toContain('report_');
    expect(manager.getReport(report.id)).toBeDefined();
  });
  it('emits report_generated event', () => {
    let emitted = false;
    manager.on('report_generated', () => { emitted = true; });
    manager.generateReport(createMockExecutionReport(), createMockPlan());
    expect(emitted).toBe(true);
  });
  it('events disabled does not emit', () => {
    const cfg = createReportConfiguration({ enableEvents: false });
    const m = new ReportManager(cfg);
    let emitted = false;
    m.on('report_generated', () => { emitted = true; });
    m.generateReport(createMockExecutionReport(), createMockPlan());
    expect(emitted).toBe(false);
  });
  it('getReport returns undefined for unknown', () => {
    expect(manager.getReport('unknown')).toBeUndefined();
  });
  it('getReports returns all', () => {
    manager.generateReport(createMockExecutionReport({ executionId: 'e1' }), createMockPlan());
    manager.generateReport(createMockExecutionReport({ executionId: 'e2' }), createMockPlan());
    expect(manager.getReports().length).toBe(2);
  });
  it('getReportByExecution finds report', () => {
    manager.generateReport(createMockExecutionReport({ executionId: 'e1' }), createMockPlan());
    expect(manager.getReportByExecution('e1')).toBeDefined();
    expect(manager.getReportByExecution('unknown')).toBeUndefined();
  });
  it('regenerateReport replaces existing', () => {
    const execReport = createMockExecutionReport({ executionId: 'e1' });
    const plan = createMockPlan();
    const original = manager.generateReport(execReport, plan);
    const regenerated = manager.regenerateReport(execReport, plan);
    expect(regenerated.id).not.toBe(original.id);
    expect(manager.getReport(original.id)).toBeUndefined();
    expect(manager.getReport(regenerated.id)).toBeDefined();
  });
  it('getReportStatistics returns stats', () => {
    manager.generateReport(createMockExecutionReport({ executionId: 'e1' }), createMockPlan());
    const stats = manager.getReportStatistics();
    expect(stats.totalReports).toBe(1);
    expect(stats.byOutcome.success).toBe(1);
  });
  it('getReportStatistics with no reports returns zeros', () => {
    const stats = manager.getReportStatistics();
    expect(stats.totalReports).toBe(0);
    expect(stats.averageHealthDelta).toBe(0);
  });
  it('shareReport returns true for existing', () => {
    const report = manager.generateReport(createMockExecutionReport(), createMockPlan());
    expect(manager.shareReport(report.id)).toBe(true);
  });
  it('shareReport returns false for unknown', () => {
    expect(manager.shareReport('unknown')).toBe(false);
  });
  it('archiveReport returns true for existing', () => {
    const report = manager.generateReport(createMockExecutionReport(), createMockPlan());
    expect(manager.archiveReport(report.id)).toBe(true);
  });
  it('archiveReport returns false for unknown', () => {
    expect(manager.archiveReport('unknown')).toBe(false);
  });
  it('markViewed records history', () => {
    const report = manager.generateReport(createMockExecutionReport(), createMockPlan());
    manager.markViewed(report.id);
    expect(manager.history.getByReport(report.id).some((e) => e.action === 'viewed')).toBe(true);
  });
  it('updateConfig updates rules', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
  it('clear resets everything', () => {
    manager.generateReport(createMockExecutionReport(), createMockPlan());
    manager.clear();
    expect(manager.getReports().length).toBe(0);
    expect(manager.history.count).toBe(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.ReportManager).toBeDefined();
    expect(module.ReportBuilder).toBeDefined();
    expect(module.ReportFormatter).toBeDefined();
    expect(module.ReportEvidenceCollector).toBeDefined();
    expect(module.ReportHealthDelta).toBeDefined();
    expect(module.ReportStoryGenerator).toBeDefined();
    expect(module.ReportRegistry).toBeDefined();
    expect(module.ReportHistory).toBeDefined();
    expect(module.ReportEvents).toBeDefined();
    expect(module.DEFAULT_REPORT_CONFIGURATION).toBeDefined();
  });
  it('full lifecycle: generate → view → share → archive', () => {
    const manager = new ReportManager();
    const execReport = createMockExecutionReport({ healthBefore: 88, healthAfter: 94, healthDelta: 6 });
    const plan = createMockPlan();
    const report = manager.generateReport(execReport, plan);
    expect(report.headline).toContain('Optimization Complete');
    expect(report.healthDelta.formatted).toBe('88 → 94 (+6)');
    manager.markViewed(report.id);
    manager.shareReport(report.id);
    manager.archiveReport(report.id);
    const history = manager.history.getByReport(report.id);
    expect(history.length).toBe(4);
  });
  it('produces user-facing report matching the spec', () => {
    const manager = new ReportManager();
    const execReport = createMockExecutionReport({
      totalDurationMs: 102000,
      healthBefore: 88,
      healthAfter: 94,
      healthDelta: 6,
      storageRecovered: 1932735283,
      completedSteps: [
        createMockStepResult('step_1', 'Temporary files cleaned'),
        createMockStepResult('step_2', 'Browser cache optimized'),
        createMockStepResult('step_3', 'Startup entries optimized'),
      ],
      skippedSteps: [
        createMockStepResult('step_4', 'Large Downloads folder', 'skipped'),
      ],
      rollbackAvailable: true,
    });
    const plan = createMockPlan({
      estimatedStartupGain: 1.6,
      estimatedPrivacyGain: 4,
      steps: [
        createMockStep({ id: 'step_1', title: 'Temporary files cleaned' }),
        createMockStep({ id: 'step_2', title: 'Browser cache optimized', category: 'privacy' }),
        createMockStep({ id: 'step_3', title: 'Startup entries optimized', category: 'startup' }),
        createMockStep({ id: 'step_4', title: 'Large Downloads folder', category: 'storage' }),
      ],
    });
    const report = manager.generateReport(execReport, plan, {
      recommendationsRemaining: 2,
      recommendationPriorityBreakdown: { low: 2 },
    });

    expect(report.executionTime.formatted).toBe('1m 42s');
    expect(report.healthDelta.formatted).toBe('88 → 94 (+6)');
    expect(report.storageRecovered.formatted).toBe('1.80 GB');
    expect(report.startupImprovement.formatted).toBe('1.6 seconds');
    expect(report.privacyImprovement.formatted).toBe('+4');
    expect(report.actionsCompleted.length).toBe(3);
    expect(report.actionsSkipped.length).toBe(1);
    expect(report.actionsSkipped[0]?.title).toBe('Large Downloads folder');
    expect(report.recommendationsRemaining.count).toBe(2);
    expect(report.rollbackInfo.available).toBe(true);
    expect(report.rollbackInfo.formatted).toContain('24 hours');
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('report generation is fast', () => {
    const manager = new ReportManager();
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const start = performance.now();
    manager.generateReport(execReport, plan);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles null health values', () => {
    const manager = new ReportManager();
    const execReport = createMockExecutionReport({ healthBefore: null, healthAfter: null, healthDelta: null });
    const plan = createMockPlan();
    const report = manager.generateReport(execReport, plan);
    expect(report.healthDelta.formatted).toBe('N/A');
    expect(report.healthDelta.trend).toBe('unknown');
  });
  it('handles zero storage recovered', () => {
    const manager = new ReportManager();
    const execReport = createMockExecutionReport({ storageRecovered: 0 });
    const plan = createMockPlan();
    const report = manager.generateReport(execReport, plan);
    expect(report.storageRecovered.formatted).toBe('0 B');
  });
  it('handles no completed steps', () => {
    const manager = new ReportManager();
    const execReport = createMockExecutionReport({
      completedSteps: [],
      failedSteps: [createMockStepResult('step_1', 'Test', 'failed', { error: 'crashed' })],
    });
    const plan = createMockPlan();
    const report = manager.generateReport(execReport, plan);
    expect(report.story.outcome).toBe('failed');
    expect(report.actionsCompleted.length).toBe(0);
  });
  it('handles all steps skipped', () => {
    const manager = new ReportManager();
    const execReport = createMockExecutionReport({
      completedSteps: [],
      skippedSteps: [createMockStepResult('step_1', 'Test', 'skipped')],
    });
    const plan = createMockPlan();
    const report = manager.generateReport(execReport, plan);
    expect(report.actionsSkipped.length).toBe(1);
  });
  it('handles rollback unavailable', () => {
    const manager = new ReportManager();
    const execReport = createMockExecutionReport({ rollbackAvailable: false });
    const plan = createMockPlan();
    const report = manager.generateReport(execReport, plan);
    expect(report.rollbackInfo.available).toBe(false);
  });
  it('handles zero recommendations remaining', () => {
    const manager = new ReportManager();
    const execReport = createMockExecutionReport();
    const plan = createMockPlan();
    const report = manager.generateReport(execReport, plan, { recommendationsRemaining: 0 });
    expect(report.recommendationsRemaining.summary).toBe('All recommendations addressed');
  });
});
