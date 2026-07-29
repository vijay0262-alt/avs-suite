/**
 * Tests for EPIC 3 PHASE A PART 7 — Optimization Intelligence Report Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  PipelineExecution,
  ExecutionStepResult,
} from '../../execution-pipeline/types';
import type {
  OptimizationPlanV2,
  PlanStep,
} from '../../optimization-planner/types';
import type {
  OptimizationReport,
} from '../types';
import {
  createDefaultReportConfiguration,
  generateReportId,
  generateComparisonId,
  generateHistoryId,
  formatDuration,
  formatBytes,
  formatDelta,
  determineTrend,
} from '../types';
import {
  DEFAULT_REPORT_CONFIGURATION,
  createReportConfiguration,
  isSectionEnabled,
  isSectionVisible,
  getTemplate,
} from '../reportConfiguration';
import { ReportEvents } from '../reportEvents';
import { HealthDeltaAnalyzer } from '../healthDeltaAnalyzer';
import { PerformanceDeltaAnalyzer } from '../performanceDeltaAnalyzer';
import { StorageDeltaAnalyzer } from '../storageDeltaAnalyzer';
import { PrivacyDeltaAnalyzer } from '../privacyDeltaAnalyzer';
import { PredictionDeltaAnalyzer } from '../predictionDeltaAnalyzer';
import { RecommendationDeltaAnalyzer } from '../recommendationDeltaAnalyzer';
import { BenefitAnalyzer } from '../benefitAnalyzer';
import { ReportFormatter } from '../reportFormatter';
import { ReportExporter } from '../reportExporter';
import { ReportValidator } from '../reportValidator';
import { OptimizationReportAnalyzer } from '../reportAnalyzer';
import { OptimizationReportBuilder } from '../reportBuilder';
import { ReportHistory } from '../reportHistory';
import { OptimizationReportManager } from '../reportManager';

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

function createMockExecution(overrides: Partial<PipelineExecution> = {}): PipelineExecution {
  const stepResults = overrides.stepResults ?? [
    createMockStepResult('step_1', 'Clean Temp Files'),
    createMockStepResult('step_2', 'Clean Browser Cache'),
  ];
  return {
    id: overrides.id ?? 'exec_test_1',
    planId: overrides.planId ?? 'plan_test_1',
    status: overrides.status ?? 'completed',
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    completedAt: overrides.completedAt ?? new Date().toISOString(),
    currentStage: overrides.currentStage ?? null,
    completedStages: overrides.completedStages ?? [],
    failedStages: overrides.failedStages ?? [],
    progress: overrides.progress ?? 100,
    estimatedRemainingTime: overrides.estimatedRemainingTime ?? 0,
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    verificationStatus: overrides.verificationStatus ?? 'verified',
    healthBefore: overrides.healthBefore !== undefined ? overrides.healthBefore : 88,
    healthAfter: overrides.healthAfter !== undefined ? overrides.healthAfter : 94,
    stepResults,
    errors: overrides.errors ?? [],
    warnings: overrides.warnings ?? [],
    executionMetadata: overrides.executionMetadata ?? {},
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('createDefaultReportConfiguration has all sections', () => {
    const cfg = createDefaultReportConfiguration();
    expect(cfg.templates).toBeDefined();
    expect(cfg.sections).toBeDefined();
    expect(cfg.exportOptions).toBeDefined();
    expect(cfg.comparisonRules).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
  });
  it('generateReportId produces unique ids', () => {
    expect(generateReportId()).not.toBe(generateReportId());
    expect(generateReportId()).toContain('rpt_');
  });
  it('generateComparisonId produces unique ids', () => {
    expect(generateComparisonId()).toContain('cmp_');
  });
  it('generateHistoryId produces unique ids', () => {
    expect(generateHistoryId()).toContain('rph_');
  });
  it('formatDuration formats minutes and seconds', () => {
    expect(formatDuration(102000)).toBe('1m 42s');
    expect(formatDuration(30000)).toBe('30s');
  });
  it('formatBytes formats correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1048576)).toBe('1.00 MB');
    expect(formatBytes(1073741824)).toBe('1.00 GB');
  });
  it('formatDelta formats before → after', () => {
    expect(formatDelta(88, 94)).toBe('88 → 94 (+6)');
    expect(formatDelta(null, 90)).toBe('N/A');
  });
  it('determineTrend identifies trends', () => {
    expect(determineTrend(80, 90)).toBe('improved');
    expect(determineTrend(90, 80)).toBe('declined');
    expect(determineTrend(90, 90)).toBe('unchanged');
    expect(determineTrend(null, 90)).toBe('unknown');
  });
});

// ── Configuration ────────────────────────────────────────────

describe('ReportConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_REPORT_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_REPORT_CONFIGURATION.rollbackDurationHours).toBe(24);
  });
  it('createReportConfiguration accepts overrides', () => {
    const cfg = createReportConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
  });
  it('merges featureFlags', () => {
    const cfg = createReportConfiguration({ featureFlags: { enableExport: false } });
    expect(cfg.featureFlags.enableExport).toBe(false);
    expect(cfg.featureFlags.enableHealthDelta).toBe(true);
  });
  it('merges comparisonRules', () => {
    const cfg = createReportConfiguration({ comparisonRules: { compareHealthDelta: false } });
    expect(cfg.comparisonRules.compareHealthDelta).toBe(false);
  });
  it('merges sections', () => {
    const cfg = createReportConfiguration({ sections: { benefits: { enabled: false, visible: false } } });
    expect(cfg.sections.benefits.enabled).toBe(false);
  });
  it('isSectionEnabled checks config', () => {
    expect(isSectionEnabled(DEFAULT_REPORT_CONFIGURATION, 'execution_summary')).toBe(true);
  });
  it('isSectionVisible checks config', () => {
    expect(isSectionVisible(DEFAULT_REPORT_CONFIGURATION, 'health_delta')).toBe(true);
  });
  it('getTemplate returns template', () => {
    expect(getTemplate(DEFAULT_REPORT_CONFIGURATION, 'full')).toBeDefined();
    expect(getTemplate(DEFAULT_REPORT_CONFIGURATION, 'nonexistent')).toBeNull();
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
    const unsub = events.on('report_exported', () => { received = true; });
    unsub();
    events.emitExported('r1');
    expect(received).toBe(false);
  });
  it('emitComparisonGenerated works', () => {
    let received = false;
    events.on('comparison_generated', () => { received = true; });
    events.emitComparisonGenerated('r1');
    expect(received).toBe(true);
  });
  it('emitUpdated works', () => {
    let received = false;
    events.on('report_updated', () => { received = true; });
    events.emitUpdated('r1');
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

// ── Health Delta Analyzer ────────────────────────────────────

describe('HealthDeltaAnalyzer', () => {
  let analyzer: HealthDeltaAnalyzer;
  beforeEach(() => { analyzer = new HealthDeltaAnalyzer(); });

  it('analyzes improvement', () => {
    const result = analyzer.analyze(createMockExecution({ healthBefore: 80, healthAfter: 90 }));
    expect(result.delta).toBe(10);
    expect(result.trend).toBe('improved');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reasonForChange).toContain('improved by 10');
  });
  it('analyzes decline', () => {
    const result = analyzer.analyze(createMockExecution({ healthBefore: 90, healthAfter: 80 }));
    expect(result.delta).toBe(-10);
    expect(result.trend).toBe('declined');
  });
  it('analyzes unchanged', () => {
    const result = analyzer.analyze(createMockExecution({ healthBefore: 90, healthAfter: 90 }));
    expect(result.delta).toBe(0);
    expect(result.trend).toBe('unchanged');
  });
  it('analyzes null values', () => {
    const result = analyzer.analyze(createMockExecution({ healthBefore: null, healthAfter: null }));
    expect(result.delta).toBeNull();
    expect(result.trend).toBe('unknown');
    expect(result.reasonForChange).toContain('could not be determined');
  });
  it('identifies contributing factors', () => {
    const result = analyzer.analyze(createMockExecution());
    expect(result.contributingFactors.length).toBeGreaterThan(0);
    expect(result.contributingFactors.some((f) => f.includes('completed'))).toBe(true);
  });
});

// ── Performance/Storage/Privacy Delta Analyzers ──────────────

describe('Delta Analyzers', () => {
  it('PerformanceDeltaAnalyzer computes delta', () => {
    const a = new PerformanceDeltaAnalyzer();
    const result = a.analyze(70, 80, {} as never);
    expect(result.delta).toBe(10);
    expect(result.trend).toBe('improved');
  });
  it('StorageDeltaAnalyzer computes delta', () => {
    const a = new StorageDeltaAnalyzer();
    const result = a.analyze(1000, 400, {} as never);
    expect(result.delta).toBe(-600);
  });
  it('StorageDeltaAnalyzer analyzeRecovered', () => {
    const a = new StorageDeltaAnalyzer();
    const result = a.analyzeRecovered(1048576);
    expect(result.formatted).toBe('1.00 MB');
    expect(result.trend).toBe('improved');
  });
  it('PrivacyDeltaAnalyzer computes delta', () => {
    const a = new PrivacyDeltaAnalyzer();
    const result = a.analyze(60, 70, {} as never);
    expect(result.delta).toBe(10);
    expect(result.trend).toBe('improved');
  });
});

// ── Prediction Delta Analyzer ────────────────────────────────

describe('PredictionDeltaAnalyzer', () => {
  let analyzer: PredictionDeltaAnalyzer;
  beforeEach(() => { analyzer = new PredictionDeltaAnalyzer(); });

  it('analyzes predictions with health improvement', () => {
    const exec = createMockExecution({ healthBefore: 80, healthAfter: 90 });
    const plan = createMockPlan();
    const predictions = analyzer.analyze(exec, plan, 10);
    expect(predictions.some((p) => p.prediction === 'System Health Forecast')).toBe(true);
  });
  it('includes storage forecast', () => {
    const exec = createMockExecution();
    const plan = createMockPlan({ estimatedStorageRecovery: 1800 });
    const predictions = analyzer.analyze(exec, plan, 6);
    expect(predictions.some((p) => p.prediction === 'Storage Growth Forecast')).toBe(true);
  });
  it('includes startup forecast', () => {
    const exec = createMockExecution();
    const plan = createMockPlan({ estimatedStartupGain: 1.6 });
    const predictions = analyzer.analyze(exec, plan, 6);
    expect(predictions.some((p) => p.prediction === 'Startup Performance Forecast')).toBe(true);
  });
  it('returns empty for no gains', () => {
    const exec = createMockExecution({ healthBefore: 90, healthAfter: 90 });
    const plan = createMockPlan({ estimatedStorageRecovery: 0, estimatedStartupGain: 0, estimatedPerformanceGain: 0, estimatedPrivacyGain: 0 });
    const predictions = analyzer.analyze(exec, plan, 0);
    expect(predictions.length).toBe(0);
  });
});

// ── Recommendation Delta Analyzer ────────────────────────────

describe('RecommendationDeltaAnalyzer', () => {
  let analyzer: RecommendationDeltaAnalyzer;
  beforeEach(() => { analyzer = new RecommendationDeltaAnalyzer(); });

  it('finds resolved recommendations', () => {
    const exec = createMockExecution();
    const plan = createMockPlan();
    const result = analyzer.analyze(exec, plan);
    expect(result.resolved.length).toBe(2);
  });
  it('finds remaining recommendations', () => {
    const exec = createMockExecution({
      stepResults: [createMockStepResult('step_1', 'Clean Temp Files')],
    });
    const plan = createMockPlan();
    const result = analyzer.analyze(exec, plan);
    expect(result.remaining.length).toBe(1);
    expect(result.remaining[0]?.id).toBe('step_2');
  });
  it('new recommendations are empty by default', () => {
    const exec = createMockExecution();
    const plan = createMockPlan();
    const result = analyzer.analyze(exec, plan);
    expect(result.newRecommendations.length).toBe(0);
  });
});

// ── Benefit Analyzer ─────────────────────────────────────────

describe('BenefitAnalyzer', () => {
  let analyzer: BenefitAnalyzer;
  beforeEach(() => { analyzer = new BenefitAnalyzer(); });

  it('analyzes benefits', () => {
    const exec = createMockExecution();
    const plan = createMockPlan();
    const result = analyzer.analyze(exec, plan);
    expect(result.storageRecovered).toBeGreaterThan(0);
    expect(result.startupImprovement).toBe(1.6);
    expect(result.privacyImprovement).toBe(4);
    expect(result.performanceImprovement).toBe(5);
  });
  it('formats benefits', () => {
    const exec = createMockExecution();
    const plan = createMockPlan({ estimatedStorageRecovery: 1073741824 });
    const result = analyzer.analyze(exec, plan);
    expect(result.formatted.storage).toBe('1.00 GB');
    expect(result.formatted.startup).toBe('1.6 seconds');
    expect(result.formatted.privacy).toBe('+4');
  });
  it('computes maintenance reduction', () => {
    const exec = createMockExecution();
    const plan = createMockPlan();
    const result = analyzer.analyze(exec, plan);
    expect(result.maintenanceReduction).toBe(2);
  });
  it('computes time saved', () => {
    const exec = createMockExecution();
    const plan = createMockPlan();
    const result = analyzer.analyze(exec, plan);
    expect(result.timeSaved).toBeGreaterThan(0);
  });
});

// ── Formatter ────────────────────────────────────────────────

describe('ReportFormatter', () => {
  let fmt: ReportFormatter;
  beforeEach(() => { fmt = new ReportFormatter(createDefaultReportConfiguration()); });

  it('formats execution summary', () => {
    const exec = createMockExecution();
    const summary = fmt.formatExecutionSummary(exec);
    expect(summary.completedSteps).toBe(2);
    expect(summary.skippedSteps).toBe(0);
    expect(summary.failedSteps).toBe(0);
  });
  it('formats completed actions', () => {
    const exec = createMockExecution();
    const plan = createMockPlan();
    const actions = fmt.formatCompletedActions(exec, plan);
    expect(actions.length).toBe(2);
    expect(actions[0]?.title).toBe('Clean Temp Files');
  });
  it('formats skipped actions', () => {
    const exec = createMockExecution({
      stepResults: [createMockStepResult('step_3', 'Large Downloads', 'skipped')],
    });
    const plan = createMockPlan();
    const actions = fmt.formatSkippedActions(exec, plan);
    expect(actions.length).toBe(1);
  });
  it('formats visual metrics', () => {
    const exec = createMockExecution({ healthBefore: 88, healthAfter: 94 });
    const plan = createMockPlan();
    const metrics = fmt.formatVisualMetrics(exec, plan);
    expect(metrics.healthDelta.delta).toBe(6);
    expect(metrics.executionTimeline.length).toBe(2);
  });
  it('formats report as JSON', () => {
    const report = { id: 'r1', title: 'Test' } as OptimizationReport;
    const result = fmt.formatReport(report, 'json');
    expect(result).toContain('"id": "r1"');
  });
  it('formats report as markdown', () => {
    const report = { id: 'r1', title: 'Test Report', overallResult: 'success', duration: 60000, generatedAt: '2024-01-01', healthDelta: 6, healthBefore: 88, healthAfter: 94, storageRecovered: 1073741824, confidence: 0.85, rollbackAvailable: true } as OptimizationReport;
    const result = fmt.formatReport(report, 'markdown');
    expect(result).toContain('# Test Report');
    expect(result).toContain('Health Delta');
  });
  it('formats report as dashboard', () => {
    const report = { id: 'r1', title: 'Test', overallResult: 'success', duration: 60000, healthDelta: 6, healthBefore: 88, healthAfter: 94, storageRecovered: 1073741824, confidence: 0.85, rollbackAvailable: true, generatedAt: '2024-01-01' } as OptimizationReport;
    const result = fmt.formatReport(report, 'dashboard');
    expect(result).toContain('Test');
    expect(result).toContain('Health');
  });
});

// ── Exporter ─────────────────────────────────────────────────

describe('ReportExporter', () => {
  let exporter: ReportExporter;
  beforeEach(() => { exporter = new ReportExporter(createDefaultReportConfiguration()); });

  it('exports to JSON', () => {
    const report = { id: 'r1', executionId: 'e1', title: 'Test', overallResult: 'success', duration: 60000, generatedAt: '2024-01-01', healthDelta: null, healthBefore: null, healthAfter: null, storageRecovered: 0, startupImprovement: 0, privacyImprovement: 0, performanceImprovement: 0, recommendationsResolved: 0, recommendationsRemaining: 0, predictionsUpdated: 0, rollbackAvailable: false, confidence: 0.8, summary: '', status: 'generated', planId: 'p1', sections: [], visualMetrics: {} as never, nextBestActions: [], evidence: [], futureMetadata: {} } as OptimizationReport;
    const result = exporter.export(report, 'json');
    expect(result.format).toBe('json');
    expect(result.mimeType).toBe('application/json');
    expect(result.content).toContain('"id": "r1"');
  });
  it('exports to HTML', () => {
    const report = { id: 'r1', executionId: 'e1', title: 'Test', overallResult: 'success', duration: 60000, generatedAt: '2024-01-01', healthDelta: 6, healthBefore: 88, healthAfter: 94, storageRecovered: 1073741824, startupImprovement: 1.6, privacyImprovement: 4, performanceImprovement: 5, recommendationsResolved: 2, recommendationsRemaining: 0, predictionsUpdated: 3, rollbackAvailable: true, confidence: 0.85, summary: '', status: 'generated', planId: 'p1', sections: [], visualMetrics: {} as never, nextBestActions: [], evidence: [], futureMetadata: {} } as OptimizationReport;
    const result = exporter.export(report, 'html');
    expect(result.format).toBe('html');
    expect(result.mimeType).toBe('text/html');
    expect(result.content).toContain('<html');
  });
  it('exports to Markdown', () => {
    const report = { id: 'r1', executionId: 'e1', title: 'Test', overallResult: 'success', duration: 60000, generatedAt: '2024-01-01', healthDelta: 6, healthBefore: 88, healthAfter: 94, storageRecovered: 0, startupImprovement: 0, privacyImprovement: 0, performanceImprovement: 0, recommendationsResolved: 0, recommendationsRemaining: 0, predictionsUpdated: 0, rollbackAvailable: false, confidence: 0.8, summary: '', status: 'generated', planId: 'p1', sections: [], visualMetrics: {} as never, nextBestActions: [], evidence: [], futureMetadata: {} } as OptimizationReport;
    const result = exporter.export(report, 'markdown');
    expect(result.format).toBe('markdown');
    expect(result.content).toContain('# Test');
  });
  it('exports to CSV', () => {
    const report = { id: 'r1', executionId: 'e1', title: 'Test', overallResult: 'success', duration: 60000, generatedAt: '2024-01-01', healthDelta: 6, healthBefore: 88, healthAfter: 94, storageRecovered: 0, startupImprovement: 0, privacyImprovement: 0, performanceImprovement: 0, recommendationsResolved: 0, recommendationsRemaining: 0, predictionsUpdated: 0, rollbackAvailable: false, confidence: 0.8, summary: '', status: 'generated', planId: 'p1', sections: [], visualMetrics: {} as never, nextBestActions: [], evidence: [], futureMetadata: {} } as OptimizationReport;
    const result = exporter.export(report, 'csv');
    expect(result.format).toBe('csv');
    expect(result.content).toContain('"Field","Value"');
    expect(result.content).toContain('"Report ID"');
  });
  it('exports to PDF (interface)', () => {
    const report = { id: 'r1', executionId: 'e1', title: 'Test', overallResult: 'success', duration: 60000, generatedAt: '2024-01-01', healthDelta: null, healthBefore: null, healthAfter: null, storageRecovered: 0, startupImprovement: 0, privacyImprovement: 0, performanceImprovement: 0, recommendationsResolved: 0, recommendationsRemaining: 0, predictionsUpdated: 0, rollbackAvailable: false, confidence: 0.8, summary: '', status: 'generated', planId: 'p1', sections: [], visualMetrics: {} as never, nextBestActions: [], evidence: [], futureMetadata: {} } as OptimizationReport;
    const result = exporter.export(report, 'pdf');
    expect(result.format).toBe('pdf');
    expect(result.mimeType).toBe('application/pdf');
  });
  it('getSupportedFormats returns all', () => {
    expect(exporter.getSupportedFormats()).toEqual(['json', 'html', 'markdown', 'csv', 'pdf']);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('ReportValidator', () => {
  let validator: ReportValidator;
  beforeEach(() => { validator = new ReportValidator(); });

  it('validates correct report', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1', duration: 60000, overallResult: 'success', healthBefore: 88, healthAfter: 94, healthDelta: 6, storageRecovered: 100, startupImprovement: 1, privacyImprovement: 2, performanceImprovement: 3, confidence: 0.85, recommendationsResolved: 1, recommendationsRemaining: 1, predictionsUpdated: 2 } as OptimizationReport;
    const result = validator.validate(report);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
  it('fails for missing report id', () => {
    const report = { id: '', executionId: 'e1', planId: 'p1', duration: 60000, overallResult: 'success', healthBefore: 88, healthAfter: 94, healthDelta: 6, storageRecovered: 0, startupImprovement: 0, privacyImprovement: 0, performanceImprovement: 0, confidence: 0.8, recommendationsResolved: 0, recommendationsRemaining: 0, predictionsUpdated: 0 } as OptimizationReport;
    const result = validator.validate(report);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NO_REPORT_ID')).toBe(true);
  });
  it('fails for negative storage', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1', duration: 60000, overallResult: 'success', healthBefore: null, healthAfter: null, healthDelta: null, storageRecovered: -100, startupImprovement: 0, privacyImprovement: 0, performanceImprovement: 0, confidence: 0.8, recommendationsResolved: 0, recommendationsRemaining: 0, predictionsUpdated: 0 } as OptimizationReport;
    const result = validator.validate(report);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NEGATIVE_STORAGE')).toBe(true);
  });
  it('fails for health delta mismatch', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1', duration: 60000, overallResult: 'success', healthBefore: 80, healthAfter: 90, healthDelta: 20, storageRecovered: 0, startupImprovement: 0, privacyImprovement: 0, performanceImprovement: 0, confidence: 0.8, recommendationsResolved: 0, recommendationsRemaining: 0, predictionsUpdated: 0 } as OptimizationReport;
    const result = validator.validate(report);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'HEALTH_DELTA_MISMATCH')).toBe(true);
  });
  it('warns for low confidence', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1', duration: 60000, overallResult: 'success', healthBefore: null, healthAfter: null, healthDelta: null, storageRecovered: 0, startupImprovement: 0, privacyImprovement: 0, performanceImprovement: 0, confidence: 0.3, recommendationsResolved: 0, recommendationsRemaining: 0, predictionsUpdated: 0 } as OptimizationReport;
    const result = validator.validate(report);
    expect(result.warnings.some((w) => w.code === 'LOW_CONFIDENCE')).toBe(true);
  });
  it('warns for failed with health gain', () => {
    const report = { id: 'r1', executionId: 'e1', planId: 'p1', duration: 60000, overallResult: 'failed', healthBefore: 80, healthAfter: 90, healthDelta: 10, storageRecovered: 0, startupImprovement: 0, privacyImprovement: 0, performanceImprovement: 0, confidence: 0.8, recommendationsResolved: 0, recommendationsRemaining: 0, predictionsUpdated: 0 } as OptimizationReport;
    const result = validator.validate(report);
    expect(result.warnings.some((w) => w.code === 'FAILED_WITH_HEALTH_GAIN')).toBe(true);
  });
});

// ── Report Analyzer ──────────────────────────────────────────

describe('OptimizationReportAnalyzer', () => {
  let analyzer: OptimizationReportAnalyzer;
  beforeEach(() => { analyzer = new OptimizationReportAnalyzer(createDefaultReportConfiguration()); });

  it('analyzes health', () => {
    const result = analyzer.analyzeHealth(createMockExecution({ healthBefore: 80, healthAfter: 90 }));
    expect(result.delta).toBe(10);
  });
  it('analyzes benefits', () => {
    const result = analyzer.analyzeBenefits(createMockExecution(), createMockPlan());
    expect(result.storageRecovered).toBeGreaterThan(0);
  });
  it('analyzes predictions', () => {
    const result = analyzer.analyzePredictions(createMockExecution(), createMockPlan(), 6);
    expect(result.length).toBeGreaterThan(0);
  });
  it('analyzes recommendations', () => {
    const result = analyzer.analyzeRecommendations(createMockExecution(), createMockPlan());
    expect(result.resolved.length).toBe(2);
  });
  it('generates next best actions', () => {
    const exec = createMockExecution({
      stepResults: [createMockStepResult('step_1', 'Clean Temp Files')],
    });
    const result = analyzer.generateNextBestActions(exec, createMockPlan());
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(3);
  });
  it('analyzeAll returns all analyses', () => {
    const result = analyzer.analyzeAll(createMockExecution(), createMockPlan());
    expect(result.health).toBeDefined();
    expect(result.benefits).toBeDefined();
    expect(result.predictions).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(result.nextBestActions).toBeDefined();
  });
  it('respects feature flags — predictions disabled', () => {
    const cfg = createReportConfiguration({ featureFlags: { enablePredictions: false } });
    const a = new OptimizationReportAnalyzer(cfg);
    expect(a.analyzePredictions(createMockExecution(), createMockPlan(), 6).length).toBe(0);
  });
});

// ── Report Builder ───────────────────────────────────────────

describe('OptimizationReportBuilder', () => {
  let builder: OptimizationReportBuilder;
  beforeEach(() => { builder = new OptimizationReportBuilder(createDefaultReportConfiguration()); });

  it('builds a complete report', () => {
    const exec = createMockExecution();
    const plan = createMockPlan();
    const report = builder.build(exec, plan);
    expect(report.id).toContain('rpt_');
    expect(report.executionId).toBe(exec.id);
    expect(report.planId).toBe(exec.planId);
  });
  it('sets overall result to success', () => {
    const report = builder.build(createMockExecution(), createMockPlan());
    expect(report.overallResult).toBe('success');
  });
  it('sets overall result to partial', () => {
    const exec = createMockExecution({
      stepResults: [
        createMockStepResult('step_1', 'Clean Temp Files'),
        createMockStepResult('step_2', 'Clean Browser Cache', 'failed', { error: 'denied' }),
      ],
    });
    const report = builder.build(exec, createMockPlan());
    expect(report.overallResult).toBe('partial');
  });
  it('sets overall result to failed', () => {
    const exec = createMockExecution({
      stepResults: [createMockStepResult('step_1', 'Clean Temp Files', 'failed', { error: 'crashed' })],
    });
    const report = builder.build(exec, createMockPlan());
    expect(report.overallResult).toBe('failed');
  });
  it('sets health delta', () => {
    const report = builder.build(createMockExecution({ healthBefore: 88, healthAfter: 94 }), createMockPlan());
    expect(report.healthDelta).toBe(6);
  });
  it('includes all sections', () => {
    const report = builder.build(createMockExecution(), createMockPlan());
    expect(report.sections.length).toBe(8);
  });
  it('includes visual metrics', () => {
    const report = builder.build(createMockExecution(), createMockPlan());
    expect(report.visualMetrics.healthDelta).toBeDefined();
    expect(report.visualMetrics.storageDelta).toBeDefined();
  });
  it('includes next best actions', () => {
    const exec = createMockExecution({
      stepResults: [createMockStepResult('step_1', 'Clean Temp Files')],
    });
    const report = builder.build(exec, createMockPlan());
    expect(report.nextBestActions.length).toBeGreaterThan(0);
  });
  it('includes evidence', () => {
    const report = builder.build(createMockExecution(), createMockPlan());
    expect(report.evidence.length).toBeGreaterThan(0);
  });
  it('includes confidence', () => {
    const report = builder.build(createMockExecution(), createMockPlan());
    expect(report.confidence).toBeGreaterThan(0);
    expect(report.confidence).toBeLessThanOrEqual(1);
  });
  it('respects section config — disabled section', () => {
    const cfg = createReportConfiguration({ sections: { benefits: { enabled: false, visible: false } } });
    const b = new OptimizationReportBuilder(cfg);
    const report = b.build(createMockExecution(), createMockPlan());
    expect(report.sections.some((s) => s.type === 'benefits')).toBe(false);
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

// ── Report Manager ───────────────────────────────────────────

describe('OptimizationReportManager', () => {
  let manager: OptimizationReportManager;
  beforeEach(() => { manager = new OptimizationReportManager(); });

  it('generates a report', () => {
    const exec = createMockExecution();
    const plan = createMockPlan();
    const report = manager.generateReport(exec, plan);
    expect(report.id).toContain('rpt_');
    expect(manager.getReport(report.id)).toBeDefined();
  });
  it('emits report_generated event', () => {
    let emitted = false;
    manager.on('report_generated', () => { emitted = true; });
    manager.generateReport(createMockExecution(), createMockPlan());
    expect(emitted).toBe(true);
  });
  it('events disabled does not emit', () => {
    const cfg = createReportConfiguration({ enableEvents: false });
    const m = new OptimizationReportManager(cfg);
    let emitted = false;
    m.on('report_generated', () => { emitted = true; });
    m.generateReport(createMockExecution(), createMockPlan());
    expect(emitted).toBe(false);
  });
  it('getReport returns undefined for unknown', () => {
    expect(manager.getReport('unknown')).toBeUndefined();
  });
  it('getReports returns all', () => {
    manager.generateReport(createMockExecution({ id: 'e1' }), createMockPlan());
    manager.generateReport(createMockExecution({ id: 'e2' }), createMockPlan());
    expect(manager.getReports().length).toBe(2);
  });
  it('getReportByExecution finds report', () => {
    manager.generateReport(createMockExecution({ id: 'e1' }), createMockPlan());
    expect(manager.getReportByExecution('e1')).toBeDefined();
  });
  it('exportReport returns export result', () => {
    const report = manager.generateReport(createMockExecution(), createMockPlan());
    const result = manager.exportReport(report.id, 'json');
    expect(result).not.toBeNull();
    expect(result!.format).toBe('json');
  });
  it('exportReport returns null for unknown', () => {
    expect(manager.exportReport('unknown', 'json')).toBeNull();
  });
  it('exportReport emits event', () => {
    let emitted = false;
    manager.on('report_exported', () => { emitted = true; });
    const report = manager.generateReport(createMockExecution(), createMockPlan());
    manager.exportReport(report.id, 'json');
    expect(emitted).toBe(true);
  });
  it('compareReports returns comparison', () => {
    const reportA = manager.generateReport(createMockExecution({ id: 'e1', healthBefore: 80, healthAfter: 85 }), createMockPlan());
    const reportB = manager.generateReport(createMockExecution({ id: 'e2', healthBefore: 80, healthAfter: 90 }), createMockPlan());
    const comparison = manager.compareReports(reportA.id, reportB.id);
    expect(comparison).not.toBeNull();
    expect(comparison!.reportAId).toBe(reportA.id);
    expect(comparison!.reportBId).toBe(reportB.id);
  });
  it('compareReports returns null for unknown', () => {
    expect(manager.compareReports('unknown', 'also_unknown')).toBeNull();
  });
  it('compareReports emits comparison_generated event', () => {
    let emitted = false;
    manager.on('comparison_generated', () => { emitted = true; });
    const reportA = manager.generateReport(createMockExecution({ id: 'e1' }), createMockPlan());
    const reportB = manager.generateReport(createMockExecution({ id: 'e2' }), createMockPlan());
    manager.compareReports(reportA.id, reportB.id);
    expect(emitted).toBe(true);
  });
  it('getReportStatistics returns stats', () => {
    manager.generateReport(createMockExecution({ id: 'e1' }), createMockPlan());
    const stats = manager.getReportStatistics();
    expect(stats.totalReports).toBe(1);
    expect(stats.byResult.success).toBe(1);
  });
  it('getReportStatistics with no reports returns zeros', () => {
    const stats = manager.getReportStatistics();
    expect(stats.totalReports).toBe(0);
  });
  it('validateReport returns validation result', () => {
    const report = manager.generateReport(createMockExecution(), createMockPlan());
    const result = manager.validateReport(report.id);
    expect(result).not.toBeNull();
    expect(result!.valid).toBe(true);
  });
  it('validateReport returns null for unknown', () => {
    expect(manager.validateReport('unknown')).toBeNull();
  });
  it('markViewed updates status', () => {
    const report = manager.generateReport(createMockExecution(), createMockPlan());
    expect(manager.markViewed(report.id)).toBe(true);
    expect(manager.getReport(report.id)?.status).toBe('viewed');
  });
  it('markViewed returns false for unknown', () => {
    expect(manager.markViewed('unknown')).toBe(false);
  });
  it('updateConfig updates rules', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
  it('clear resets everything', () => {
    manager.generateReport(createMockExecution(), createMockPlan());
    manager.clear();
    expect(manager.getReports().length).toBe(0);
    expect(manager.history.count).toBe(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.OptimizationReportManager).toBeDefined();
    expect(module.OptimizationReportBuilder).toBeDefined();
    expect(module.OptimizationReportAnalyzer).toBeDefined();
    expect(module.BenefitAnalyzer).toBeDefined();
    expect(module.HealthDeltaAnalyzer).toBeDefined();
    expect(module.PerformanceDeltaAnalyzer).toBeDefined();
    expect(module.StorageDeltaAnalyzer).toBeDefined();
    expect(module.PrivacyDeltaAnalyzer).toBeDefined();
    expect(module.PredictionDeltaAnalyzer).toBeDefined();
    expect(module.RecommendationDeltaAnalyzer).toBeDefined();
    expect(module.ReportFormatter).toBeDefined();
    expect(module.ReportExporter).toBeDefined();
    expect(module.ReportValidator).toBeDefined();
    expect(module.ReportHistory).toBeDefined();
    expect(module.ReportEvents).toBeDefined();
    expect(module.DEFAULT_REPORT_CONFIGURATION).toBeDefined();
  });
  it('full lifecycle: generate → export → compare', () => {
    const manager = new OptimizationReportManager();
    const reportA = manager.generateReport(
      createMockExecution({ id: 'e1', healthBefore: 80, healthAfter: 90 }),
      createMockPlan(),
    );
    const reportB = manager.generateReport(
      createMockExecution({ id: 'e2', healthBefore: 85, healthAfter: 88 }),
      createMockPlan(),
    );
    manager.markViewed(reportA.id);
    manager.exportReport(reportA.id, 'json');
    manager.exportReport(reportA.id, 'markdown');
    const comparison = manager.compareReports(reportA.id, reportB.id);
    expect(comparison).not.toBeNull();
    const stats = manager.getReportStatistics();
    expect(stats.totalReports).toBe(2);
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('report generation under 200ms', () => {
    const manager = new OptimizationReportManager();
    const start = performance.now();
    manager.generateReport(createMockExecution(), createMockPlan());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles null health values', () => {
    const manager = new OptimizationReportManager();
    const report = manager.generateReport(
      createMockExecution({ healthBefore: null, healthAfter: null }),
      createMockPlan(),
    );
    expect(report.healthDelta).toBeNull();
  });
  it('handles no completed steps', () => {
    const manager = new OptimizationReportManager();
    const report = manager.generateReport(
      createMockExecution({
        stepResults: [createMockStepResult('step_1', 'Test', 'failed', { error: 'crashed' })],
      }),
      createMockPlan(),
    );
    expect(report.overallResult).toBe('failed');
  });
  it('handles all steps skipped', () => {
    const manager = new OptimizationReportManager();
    const report = manager.generateReport(
      createMockExecution({
        stepResults: [createMockStepResult('step_1', 'Test', 'skipped')],
      }),
      createMockPlan(),
    );
    expect(report.sections.some((s) => s.type === 'skipped_actions')).toBe(true);
  });
  it('handles rolling_back state', () => {
    const manager = new OptimizationReportManager();
    const report = manager.generateReport(
      createMockExecution({ status: 'rolling_back' }),
      createMockPlan(),
    );
    expect(report.overallResult).toBe('rolled_back');
  });
  it('handles recovered state', () => {
    const manager = new OptimizationReportManager();
    const report = manager.generateReport(
      createMockExecution({ status: 'recovered' }),
      createMockPlan(),
    );
    expect(report.overallResult).toBe('rolled_back');
  });
  it('handles zero storage recovered', () => {
    const manager = new OptimizationReportManager();
    const report = manager.generateReport(
      createMockExecution(),
      createMockPlan({ estimatedStorageRecovery: 0 }),
    );
    expect(report.storageRecovered).toBe(0);
  });
});
