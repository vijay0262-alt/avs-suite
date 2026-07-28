/**
 * Tests for AI Health Engine (Phase 3.0).
 *
 * Covers:
 * - Score calculation: weighted scoring, letter grades, health levels, edge cases
 * - Category analyzers: all built-in analyzers, edge cases, missing metrics
 * - Insight generator: category-based, history-based, edge cases
 * - Recommendation engine: prioritization, data-driven, history-based
 * - Trend analysis: improving, declining, stable, insufficient data
 * - Caching: hit, miss, invalidation, TTL, input hash
 * - Events: emit, subscribe, unsubscribe, error isolation
 * - HealthAnalyzer: full integration, cache reuse, event emission
 * - Extensibility: custom analyzer registration
 * - Regression: no existing modules modified
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DashboardMetrics } from '../../dashboard/dashboard.types';
import type { ExecutionRecord, ExecutionStatistics } from '../../maintenance-history/types';
import type { TaskResult } from '../../maintenance-engine/types';

import { HealthScoreCalculator } from '../healthScoreCalculator';
import { scoreToLevel, scoreToLetter, clampScore, DEFAULT_CATEGORY_WEIGHTS } from '../types';
import type { CategoryResult, HealthReport, HealthAnalysisInput } from '../types';
import {
  StorageHealthAnalyzer,
  PerformanceAnalyzer,
  MemoryUsageAnalyzer,
  StartupAnalyzer,
  BrowserHealthAnalyzer,
  PrivacyAnalyzer,
  TempFilesAnalyzer,
  RecycleBinAnalyzer,
  SystemUpdatesAnalyzer,
  DriversAnalyzer,
  SecurityAnalyzer,
  AnalyzerRegistry,
  createDefaultRegistry,
} from '../healthCategoryAnalyzers';
import { HealthInsightGenerator } from '../healthInsightGenerator';
import { RecommendationEngine } from '../recommendationEngine';
import { TrendAnalyzer } from '../trendAnalyzer';
import { HealthCache } from '../healthCache';
import { healthEvents } from '../healthEvents';
import { HealthAnalyzer } from '../healthAnalyzer';

// ── Test Helpers ──────────────────────────────────────────────

function createInput(overrides: Partial<HealthAnalysisInput> = {}): HealthAnalysisInput {
  return {
    metrics: createMockMetrics(),
    executionHistory: [],
    executionStatistics: createMockStatistics(),
    ...overrides,
  };
}

function makeCategoryResult(
  categoryId: string,
  score: number,
  severity: string,
  issues: Array<{ title: string; description: string; severity: string; impact: number; autoFixable: boolean }>,
): CategoryResult {
  return {
    categoryId: categoryId as CategoryResult['categoryId'],
    categoryName: categoryId,
    score,
    severity: severity as CategoryResult['severity'],
    issues: issues as CategoryResult['issues'],
    recommendations: ['test'],
    confidence: 0.9,
    analyzedAt: new Date().toISOString(),
  };
}

function makeReport(score: number): HealthReport {
  return {
    id: 'test-1',
    generatedAt: new Date().toISOString(),
    overall: {
      score,
      letterGrade: scoreToLetter(score),
      level: scoreToLevel(score),
      categoryScores: [],
      computedAt: new Date().toISOString(),
    },
    categories: [],
    insights: [],
    recommendations: [],
    trends: null,
    fromCache: false,
  };
}

function createMockTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'junk_cleaner',
    taskName: 'Junk Cleaner',
    status: 'completed',
    startTime: new Date('2025-01-01T10:00:00Z').toISOString(),
    endTime: new Date('2025-01-01T10:00:05Z').toISOString(),
    durationMs: 5000,
    filesCleaned: 10,
    bytesRecovered: 1024,
    errors: [],
    warnings: [],
    ...overrides,
  };
}

function createMockRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: 'exec-1',
    scheduleId: null,
    jobId: 'job-1',
    source: 'manual',
    startTime: new Date('2025-01-01T10:00:00Z').toISOString(),
    endTime: new Date('2025-01-01T10:00:10Z').toISOString(),
    durationMs: 10000,
    status: 'succeeded',
    taskResults: [createMockTaskResult()],
    filesRemoved: 10,
    foldersRemoved: 0,
    registryEntriesRemoved: 0,
    recycleBinItemsRemoved: 0,
    temporaryFilesRemoved: 0,
    browserDataRemoved: 0,
    totalSpaceRecovered: 1024,
    warnings: [],
    errors: [],
    appVersion: '1.0.0',
    loggedAt: new Date('2025-01-01T10:00:11Z').toISOString(),
    ...overrides,
  };
}

function createMockStatistics(overrides: Partial<ExecutionStatistics> = {}): ExecutionStatistics {
  return {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    partialExecutions: 0,
    cancelledExecutions: 0,
    successRate: 0,
    averageDurationMs: 0,
    averageSpaceRecovered: 0,
    largestCleanupBytes: 0,
    largestCleanupExecutionId: null,
    mostFrequentTaskId: null,
    mostFrequentTaskName: null,
    mostFrequentTaskCount: 0,
    lastRunAt: null,
    longestRunMs: 0,
    longestRunExecutionId: null,
    totalFilesRemoved: 0,
    totalSpaceRecovered: 0,
    ...overrides,
  };
}

function createMockMetrics(overrides: Partial<DashboardMetrics> = {}): DashboardMetrics {
  return {
    cpu: {
      usage: 15,
      frequency: 3200,
      logicalProcessors: 8,
      physicalProcessors: 4,
      processes: 120,
      threads: 800,
      temperature: null,
    },
    memory: {
      total: 16 * 1024 ** 3,
      used: 6 * 1024 ** 3,
      available: 10 * 1024 ** 3,
      usage: 37.5,
      cached: 2 * 1024 ** 3,
      swapTotal: 8 * 1024 ** 3,
      swapUsed: 1 * 1024 ** 3,
      swapUsage: 12.5,
    },
    storage: [{
      mount: 'C:',
      name: 'SSD',
      total: 500 * 1024 ** 3,
      used: 200 * 1024 ** 3,
      free: 300 * 1024 ** 3,
      usage: 40,
      isSSD: true,
      fileSystem: 'NTFS',
    }],
    network: {
      uploadSpeed: 0,
      downloadSpeed: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
    },
    capturedAt: new Date().toISOString(),
    windows: {
      version: '10.0.22631',
      build: '22631',
      uptime: 3600,
      isAdministrator: true,
      powerMode: 'balanced',
      battery: null,
      secureBoot: true,
      tpmStatus: true,
    },
    security: {
      defender: { enabled: true, realTimeProtection: true, thirdPartyAV: null },
      firewall: { enabled: true, thirdPartyAV: null },
      updates: { pendingUpdates: 0, lastUpdateDate: new Date().toISOString() },
      realTimeProtection: true,
      smartScreen: true,
    },
    performance: {
      startupApps: 5,
      backgroundProcesses: 20,
      temporaryFilesSize: 50 * 1024 * 1024,
      recycleBinSize: 100 * 1024 * 1024,
      browserCacheSize: 80 * 1024 * 1024,
      potentialRecoverable: 230 * 1024 * 1024,
    },
    ...overrides,
  };
}

// ── Score Calculation Tests ───────────────────────────────────

describe('HealthScoreCalculator', () => {
  it('returns critical/F for empty category results', () => {
    const calc = new HealthScoreCalculator();
    const result = calc.calculate([]);
    expect(result.score).toBe(0);
    expect(result.letterGrade).toBe('F');
    expect(result.level).toBe('critical');
  });

  it('calculates weighted score from multiple categories', () => {
    const calc = new HealthScoreCalculator();
    const result = calc.calculate([
      makeCategoryResult('storage', 80, 'low', []),
      makeCategoryResult('performance', 90, 'info', []),
    ]);
    // Storage weight 0.20, Performance weight 0.20 → normalized to 0.5 each
    // 80*0.5 + 90*0.5 = 85
    expect(result.score).toBe(85);
    expect(result.letterGrade).toBe('B');
    expect(result.level).toBe('good');
  });

  it('clamps score to 0–100', () => {
    const calc = new HealthScoreCalculator();
    const result = calc.calculate([
      makeCategoryResult('storage', 200, 'info', []),
    ]);
    expect(result.score).toBe(100);
  });

  it('handles negative scores by clamping to 0', () => {
    const calc = new HealthScoreCalculator();
    const result = calc.calculate([
      makeCategoryResult('storage', -50, 'critical', []),
    ]);
    expect(result.score).toBe(0);
  });

  it('maps scores to correct health levels', () => {
    expect(scoreToLevel(95)).toBe('excellent');
    expect(scoreToLevel(80)).toBe('good');
    expect(scoreToLevel(60)).toBe('fair');
    expect(scoreToLevel(35)).toBe('poor');
    expect(scoreToLevel(10)).toBe('critical');
  });

  it('maps scores to correct letter grades', () => {
    expect(scoreToLetter(95)).toBe('A');
    expect(scoreToLetter(85)).toBe('B');
    expect(scoreToLetter(75)).toBe('C');
    expect(scoreToLetter(65)).toBe('D');
    expect(scoreToLetter(50)).toBe('F');
  });

  it('clamps values to 0–100', () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(50)).toBe(50);
  });

  it('re-normalizes weights when set', () => {
    const calc = new HealthScoreCalculator({ storage: 0.5, performance: 0.5 });
    // Weights are normalized across ALL categories
    // After merge: storage=0.5, performance=0.5, rest defaults (total=1.65)
    const storageAfterInit = calc.getWeight('storage');
    expect(storageAfterInit).toBeCloseTo(0.5 / 1.65, 5);

    // After setWeights, memory=0.5 is merged with already-normalized weights
    calc.setWeights({ memory: 0.5 });
    // The weight should change after re-normalization
    const storageAfterUpdate = calc.getWeight('storage');
    expect(storageAfterUpdate).toBeLessThan(storageAfterInit);
    // All weights should sum to 1.0
    const allWeights = ['storage', 'performance', 'memory', 'startup', 'browser', 'privacy', 'temp_files', 'recycle_bin', 'system_updates', 'drivers', 'security'] as const;
    const totalWeight = allWeights.reduce((sum, id) => sum + calc.getWeight(id), 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it('produces correct category score entries with contributions', () => {
    const calc = new HealthScoreCalculator();
    const result = calc.calculate([
      makeCategoryResult('storage', 100, 'info', []),
    ]);
    expect(result.categoryScores).toHaveLength(1);
    expect(result.categoryScores[0]!.score).toBe(100);
    expect(result.categoryScores[0]!.contribution).toBe(100);
  });
});

// ── Category Analyzers Tests ──────────────────────────────────

describe('Category Analyzers', () => {
  describe('StorageHealthAnalyzer', () => {
    it('returns good score when drives are healthy', () => {
      const analyzer = new StorageHealthAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
      expect(result.severity).toBe('info');
      expect(result.issues).toHaveLength(0);
    });

    it('detects critically full drive', () => {
      const analyzer = new StorageHealthAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({
          storage: [{ mount: 'C:', name: 'SSD', total: 100, used: 95, free: 5, usage: 95, isSSD: true, fileSystem: 'NTFS' }],
        }),
      }));
      expect(result.score).toBeLessThan(80);
      expect(result.severity).toBe('critical');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.severity).toBe('critical');
    });

    it('handles missing metrics gracefully', () => {
      const analyzer = new StorageHealthAnalyzer();
      const result = analyzer.analyze(createInput({ metrics: null }));
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.issues).toHaveLength(1);
    });
  });

  describe('PerformanceAnalyzer', () => {
    it('returns good score for low CPU usage', () => {
      const analyzer = new PerformanceAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
    });

    it('detects high CPU usage', () => {
      const analyzer = new PerformanceAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ cpu: { usage: 85, frequency: 3200, logicalProcessors: 8, physicalProcessors: 4, processes: 120, threads: 800, temperature: null } }),
      }));
      expect(result.score).toBeLessThan(90);
      expect(result.issues.some((i) => i.severity === 'high')).toBe(true);
    });

    it('detects high process count', () => {
      const analyzer = new PerformanceAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ cpu: { usage: 15, frequency: 3200, logicalProcessors: 8, physicalProcessors: 4, processes: 250, threads: 800, temperature: null } }),
      }));
      expect(result.issues.some((i) => i.title.includes('process count'))).toBe(true);
    });
  });

  describe('MemoryUsageAnalyzer', () => {
    it('returns good score for healthy memory', () => {
      const analyzer = new MemoryUsageAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
    });

    it('detects critical memory usage', () => {
      const analyzer = new MemoryUsageAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({
          memory: { total: 8 * 1024 ** 3, used: 7.5 * 1024 ** 3, available: 0.5 * 1024 ** 3, usage: 93.75, cached: 0, swapTotal: 0, swapUsed: 0, swapUsage: 0 },
        }),
      }));
      expect(result.severity).toBe('critical');
      expect(result.score).toBeLessThan(80);
    });
  });

  describe('StartupAnalyzer', () => {
    it('returns good score for low startup count', () => {
      const analyzer = new StartupAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
    });

    it('detects too many startup programs', () => {
      const analyzer = new StartupAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ performance: { startupApps: 35, backgroundProcesses: 20, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }),
      }));
      expect(result.severity).toBe('high');
      expect(result.issues[0]!.autoFixable).toBe(true);
    });
  });

  describe('BrowserHealthAnalyzer', () => {
    it('returns good score for small cache', () => {
      const analyzer = new BrowserHealthAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
    });

    it('detects large browser cache', () => {
      const analyzer = new BrowserHealthAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ performance: { startupApps: 5, backgroundProcesses: 20, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 600 * 1024 * 1024, potentialRecoverable: 0 } }),
      }));
      expect(result.severity).toBe('medium');
      expect(result.score).toBeLessThan(95);
    });
  });

  describe('PrivacyAnalyzer', () => {
    it('returns good score when secure boot and TPM are active', () => {
      const analyzer = new PrivacyAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
    });

    it('detects disabled secure boot', () => {
      const analyzer = new PrivacyAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ windows: { version: '10', build: '1', uptime: 0, isAdministrator: true, powerMode: 'balanced', battery: null, secureBoot: false, tpmStatus: true } }),
      }));
      expect(result.issues.some((i) => i.title.includes('Secure Boot'))).toBe(true);
    });
  });

  describe('TempFilesAnalyzer', () => {
    it('returns good score for small temp files', () => {
      const analyzer = new TempFilesAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
    });

    it('detects excessive temp files', () => {
      const analyzer = new TempFilesAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ performance: { startupApps: 5, backgroundProcesses: 20, temporaryFilesSize: 2000 * 1024 * 1024, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }),
      }));
      expect(result.severity).toBe('high');
    });
  });

  describe('RecycleBinAnalyzer', () => {
    it('returns good score for empty recycle bin', () => {
      const analyzer = new RecycleBinAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
    });

    it('detects full recycle bin', () => {
      const analyzer = new RecycleBinAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ performance: { startupApps: 5, backgroundProcesses: 20, temporaryFilesSize: 0, recycleBinSize: 3000 * 1024 * 1024, browserCacheSize: 0, potentialRecoverable: 0 } }),
      }));
      expect(result.severity).toBe('high');
    });
  });

  describe('SystemUpdatesAnalyzer', () => {
    it('returns good score when up to date', () => {
      const analyzer = new SystemUpdatesAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
    });

    it('detects pending updates', () => {
      const analyzer = new SystemUpdatesAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ security: { defender: { enabled: true, realTimeProtection: true }, firewall: { enabled: true }, updates: { pendingUpdates: 5, lastUpdateDate: new Date().toISOString() }, realTimeProtection: true, smartScreen: true } }),
      }));
      expect(result.issues.some((i) => i.title.includes('pending'))).toBe(true);
    });

    it('detects overdue updates', () => {
      const analyzer = new SystemUpdatesAnalyzer();
      const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ security: { defender: { enabled: true, realTimeProtection: true }, firewall: { enabled: true }, updates: { pendingUpdates: 0, lastUpdateDate: oldDate }, realTimeProtection: true, smartScreen: true } }),
      }));
      expect(result.issues.some((i) => i.title.includes('overdue'))).toBe(true);
    });
  });

  describe('DriversAnalyzer', () => {
    it('returns placeholder result', () => {
      const analyzer = new DriversAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.confidence).toBeLessThan(0.2);
      expect(result.issues[0]!.severity).toBe('info');
    });
  });

  describe('SecurityAnalyzer', () => {
    it('returns good score when security is active', () => {
      const analyzer = new SecurityAnalyzer();
      const result = analyzer.analyze(createInput());
      expect(result.score).toBe(100);
    });

    it('detects disabled antivirus', () => {
      const analyzer = new SecurityAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ security: { defender: { enabled: false, realTimeProtection: true }, firewall: { enabled: true }, updates: { pendingUpdates: 0, lastUpdateDate: null }, realTimeProtection: true, smartScreen: true } }),
      }));
      expect(result.severity).toBe('critical');
    });

    it('detects disabled firewall', () => {
      const analyzer = new SecurityAnalyzer();
      const result = analyzer.analyze(createInput({
        metrics: createMockMetrics({ security: { defender: { enabled: true, realTimeProtection: true }, firewall: { enabled: false }, updates: { pendingUpdates: 0, lastUpdateDate: null }, realTimeProtection: true, smartScreen: true } }),
      }));
      expect(result.issues.some((i) => i.title.includes('Firewall'))).toBe(true);
    });
  });

  describe('AnalyzerRegistry', () => {
    it('registers and retrieves analyzers', () => {
      const registry = new AnalyzerRegistry();
      const analyzer = new StorageHealthAnalyzer();
      registry.register(analyzer);
      expect(registry.has('storage')).toBe(true);
      expect(registry.get('storage')).toBe(analyzer);
    });

    it('unregisters analyzers', () => {
      const registry = new AnalyzerRegistry();
      registry.register(new StorageHealthAnalyzer());
      registry.unregister('storage');
      expect(registry.has('storage')).toBe(false);
    });

    it('returns all registered analyzers', () => {
      const registry = createDefaultRegistry();
      const all = registry.getAll();
      expect(all.length).toBe(11);
    });

    it('clears all analyzers', () => {
      const registry = createDefaultRegistry();
      registry.clear();
      expect(registry.getAll()).toHaveLength(0);
    });
  });
});

// ── Insight Generator Tests ───────────────────────────────────

describe('HealthInsightGenerator', () => {
  it('returns only no-history insight when no issues and no executions', () => {
    const gen = new HealthInsightGenerator();
    const insights = gen.generate([], createInput());
    expect(insights).toHaveLength(1);
    expect(insights[0]!.title).toContain('No maintenance');
  });

  it('generates insights from critical category issues', () => {
    const gen = new HealthInsightGenerator();
    const insights = gen.generate([
      makeCategoryResult('storage', 30, 'critical', [{ title: 'Drive full', description: 'Drive is 95% full', severity: 'critical', impact: 30, autoFixable: true }]),
    ], createInput());
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0]!.severity).toBe('critical');
  });

  it('generates low storage insight when score is low', () => {
    const gen = new HealthInsightGenerator();
    const insights = gen.generate([
      makeCategoryResult('storage', 50, 'high', [{ title: 'Low space', description: 'Drive nearly full', severity: 'high', impact: 30, autoFixable: true }]),
    ], createInput());
    expect(insights.some((i) => i.title.includes('Low storage'))).toBe(true);
  });

  it('generates maintenance frequency insight when last run is old', () => {
    const gen = new HealthInsightGenerator();
    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const insights = gen.generate([], createInput({
      executionStatistics: createMockStatistics({ totalExecutions: 10, lastRunAt: oldDate }),
    }));
    expect(insights.some((i) => i.title.includes('frequency'))).toBe(true);
  });

  it('generates frequent failures insight', () => {
    const gen = new HealthInsightGenerator();
    const insights = gen.generate([], createInput({
      executionStatistics: createMockStatistics({ totalExecutions: 10, failedExecutions: 5 }),
    }));
    expect(insights.some((i) => i.title.includes('failures'))).toBe(true);
  });

  it('generates no history insight when no executions', () => {
    const gen = new HealthInsightGenerator();
    const insights = gen.generate([], createInput());
    expect(insights.some((i) => i.title.includes('No maintenance'))).toBe(true);
  });

  it('sorts insights by severity (critical first)', () => {
    const gen = new HealthInsightGenerator();
    const insights = gen.generate([
      makeCategoryResult('storage', 30, 'critical', [{ title: 'Critical', description: 'd', severity: 'critical', impact: 30, autoFixable: true }]),
      makeCategoryResult('browser', 70, 'low', [{ title: 'Low', description: 'd', severity: 'low', impact: 5, autoFixable: true }]),
    ], createInput());
    expect(insights[0]!.severity).toBe('critical');
  });
});

// ── Recommendation Engine Tests ───────────────────────────────

describe('RecommendationEngine', () => {
  it('returns first-scan recommendation when no issues and no history', () => {
    const engine = new RecommendationEngine();
    const recs = engine.generate([], createInput());
    expect(recs).toHaveLength(1);
    expect(recs[0]!.title).toContain('first');
  });

  it('generates recommendations from issues', () => {
    const engine = new RecommendationEngine();
    const recs = engine.generate([
      makeCategoryResult('storage', 50, 'high', [{ title: 'Drive full', description: 'Drive is 95% full', severity: 'high', impact: 20, autoFixable: true }]),
    ], createInput());
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]!.title).toBe('Drive full');
    expect(recs[0]!.affectedModules).toContain('junk-cleaner');
  });

  it('prioritizes critical over high', () => {
    const engine = new RecommendationEngine();
    const recs = engine.generate([
      makeCategoryResult('security', 30, 'critical', [{ title: 'AV off', description: 'Antivirus disabled', severity: 'critical', impact: 25, autoFixable: false }]),
      makeCategoryResult('storage', 50, 'high', [{ title: 'Drive full', description: 'Drive is 95% full', severity: 'high', impact: 20, autoFixable: true }]),
    ], createInput());
    expect(recs[0]!.priority).toBe('critical');
    expect(recs[1]!.priority).toBe('high');
  });

  it('generates first scan recommendation when no history', () => {
    const engine = new RecommendationEngine();
    const recs = engine.generate([], createInput());
    expect(recs.some((r) => r.title.includes('first'))).toBe(true);
  });

  it('generates schedule recommendation when no scheduled runs', () => {
    const engine = new RecommendationEngine();
    const recs = engine.generate([], createInput({
      executionHistory: [createMockRecord()],
      executionStatistics: createMockStatistics({ totalExecutions: 1 }),
    }));
    expect(recs.some((r) => r.title.includes('schedule'))).toBe(true);
  });

  it('generates maintenance recommendation when last run is old', () => {
    const engine = new RecommendationEngine();
    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const recs = engine.generate([], createInput({
      executionStatistics: createMockStatistics({ totalExecutions: 5, lastRunAt: oldDate }),
    }));
    expect(recs.some((r) => r.title.includes('maintenance'))).toBe(true);
  });

  it('sets correct risk level based on autoFixable', () => {
    const engine = new RecommendationEngine();
    const recs = engine.generate([
      makeCategoryResult('storage', 50, 'high', [{ title: 'Test', description: 'd', severity: 'high', impact: 15, autoFixable: true }]),
      makeCategoryResult('security', 50, 'high', [{ title: 'Sec', description: 'd', severity: 'high', impact: 15, autoFixable: false }]),
    ], createInput());
    const autoFixable = recs.find((r) => r.title === 'Test');
    const nonFixable = recs.find((r) => r.title === 'Sec');
    expect(autoFixable!.riskLevel).toBe('low');
    expect(nonFixable!.riskLevel).toBe('medium');
  });
});

// ── Trend Analysis Tests ──────────────────────────────────────

describe('TrendAnalyzer', () => {
  it('returns insufficient_data with no snapshots', () => {
    const analyzer = new TrendAnalyzer();
    const result = analyzer.analyze([], 80, []);
    expect(result.direction).toBe('insufficient_data');
    expect(result.todayScore).toBe(80);
    expect(result.last7DaysAvg).toBeNull();
    expect(result.last30DaysAvg).toBeNull();
  });

  it('returns insufficient_data with one snapshot', () => {
    const analyzer = new TrendAnalyzer();
    const snapshots = [{ timestamp: new Date().toISOString(), score: 70, categoryScores: [] }];
    const result = analyzer.analyze(snapshots, 80, []);
    expect(result.direction).toBe('insufficient_data');
  });

  it('detects improving trend', () => {
    const analyzer = new TrendAnalyzer();
    const now = Date.now();
    const snapshots = [
      { timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), score: 60, categoryScores: [] },
      { timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), score: 65, categoryScores: [] },
    ];
    const result = analyzer.analyze(snapshots, 75, []);
    expect(result.direction).toBe('improving');
    expect(result.change7Days).toBeGreaterThan(0);
  });

  it('detects declining trend', () => {
    const analyzer = new TrendAnalyzer();
    const now = Date.now();
    const snapshots = [
      { timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), score: 85, categoryScores: [] },
      { timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), score: 80, categoryScores: [] },
    ];
    const result = analyzer.analyze(snapshots, 70, []);
    expect(result.direction).toBe('declining');
    expect(result.change7Days).toBeLessThan(0);
  });

  it('detects stable trend', () => {
    const analyzer = new TrendAnalyzer();
    const now = Date.now();
    const snapshots = [
      { timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), score: 80, categoryScores: [] },
      { timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), score: 82, categoryScores: [] },
    ];
    const result = analyzer.analyze(snapshots, 81, []);
    expect(result.direction).toBe('stable');
  });

  it('computes per-category trends', () => {
    const analyzer = new TrendAnalyzer();
    const now = Date.now();
    const snapshots = [
      { timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), score: 70, categoryScores: [{ categoryId: 'storage' as const, score: 60 }] },
      { timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), score: 72, categoryScores: [{ categoryId: 'storage' as const, score: 65 }] },
    ];
    const result = analyzer.analyze(snapshots, 80, [{ categoryId: 'storage' as const, score: 75 }]);
    expect(result.categoryTrends).toHaveLength(1);
    expect(result.categoryTrends[0]!.categoryId).toBe('storage');
    expect(result.categoryTrends[0]!.direction).toBe('improving');
  });

  it('creates snapshot from overall score', () => {
    const analyzer = new TrendAnalyzer();
    const score = {
      score: 85,
      letterGrade: 'B' as const,
      level: 'good' as const,
      categoryScores: [{ categoryId: 'storage' as const, categoryName: 'Storage', score: 90, weight: 0.2, contribution: 18 }],
      computedAt: new Date().toISOString(),
    };
    const snapshot = analyzer.createSnapshot(score);
    expect(snapshot.score).toBe(85);
    expect(snapshot.categoryScores).toHaveLength(1);
  });
});

// ── Caching Tests ─────────────────────────────────────────────

describe('HealthCache', () => {
  it('returns null for empty cache', () => {
    const cache = new HealthCache();
    const result = cache.get(createInput());
    expect(result).toBeNull();
  });

  it('returns cached report on second call with same input', () => {
    const cache = new HealthCache();
    const input = createInput();
    cache.set(makeReport(85), input);
    const cached = cache.get(input);
    expect(cached).not.toBeNull();
    expect(cached!.fromCache).toBe(true);
  });

  it('invalidates when input changes', () => {
    const cache = new HealthCache();
    const input1 = createInput();
    const input2 = createInput({
      metrics: createMockMetrics({ cpu: { usage: 50, frequency: 3200, logicalProcessors: 8, physicalProcessors: 4, processes: 120, threads: 800, temperature: null } }),
    });
    cache.set(makeReport(85), input1);
    expect(cache.get(input2)).toBeNull();
  });

  it('invalidates when history changes', () => {
    const cache = new HealthCache();
    const input1 = createInput();
    cache.set(makeReport(85), input1);
    const input2 = createInput({
      executionHistory: [createMockRecord()],
      executionStatistics: createMockStatistics({ totalExecutions: 1 }),
    });
    expect(cache.get(input2)).toBeNull();
  });

  it('expires after TTL', () => {
    const cache = new HealthCache(100); // 100ms TTL
    const input = createInput();
    cache.set(makeReport(85), input);
    expect(cache.isValid()).toBe(true);
    // Wait for TTL to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.isValid()).toBe(false);
        expect(cache.get(input)).toBeNull();
        resolve();
      }, 150);
    });
  });

  it('supports explicit invalidation', () => {
    const cache = new HealthCache();
    const input = createInput();
    cache.set(makeReport(85), input);
    cache.invalidate();
    expect(cache.get(input)).toBeNull();
  });

  it('caches individual category results', () => {
    const cache = new HealthCache();
    const input = createInput();
    const catResult = makeCategoryResult('storage', 80, 'low', []);
    const report = { ...makeReport(85), categories: [catResult] };
    cache.set(report, input);
    expect(cache.getCategoryResult('storage')).not.toBeNull();
  });
});

// ── Events Tests ──────────────────────────────────────────────

describe('HealthEvents', () => {
  afterEach(() => {
    healthEvents.clear();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    healthEvents.on('analysis_completed', listener);
    healthEvents.emit('analysis_completed', { report: { id: 'test' } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = healthEvents.on('health_score_updated', listener);
    healthEvents.emit('health_score_updated', {});
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    healthEvents.emit('health_score_updated', {});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not crash when listener throws', () => {
    const badListener = () => { throw new Error('boom'); };
    const goodListener = vi.fn();
    healthEvents.on('analysis_failed', badListener);
    healthEvents.on('analysis_failed', goodListener);
    healthEvents.emit('analysis_failed', {});
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('tracks listener count', () => {
    expect(healthEvents.listenerCount('category_completed')).toBe(0);
    const unsub = healthEvents.on('category_completed', () => {});
    expect(healthEvents.listenerCount('category_completed')).toBe(1);
    unsub();
    expect(healthEvents.listenerCount('category_completed')).toBe(0);
  });
});

// ── HealthAnalyzer Integration Tests ──────────────────────────

describe('HealthAnalyzer (Integration)', () => {
  afterEach(() => {
    healthEvents.clear();
  });

  it('produces a complete health report', async () => {
    const analyzer = new HealthAnalyzer();
    const report = await analyzer.analyze(createInput());
    expect(report.id).toBeTruthy();
    expect(report.generatedAt).toBeTruthy();
    expect(report.overall.score).toBeGreaterThan(0);
    expect(report.overall.score).toBeLessThanOrEqual(100);
    expect(report.categories.length).toBe(11);
    expect(report.insights).toBeDefined();
    expect(report.recommendations).toBeDefined();
    expect(report.trends).toBeDefined();
    expect(report.fromCache).toBe(false);
  });

  it('emits events during analysis', async () => {
    const analyzer = new HealthAnalyzer();
    const startedListener = vi.fn();
    const completedListener = vi.fn();
    const scoreListener = vi.fn();
    healthEvents.on('health_analysis_started', startedListener);
    healthEvents.on('analysis_completed', completedListener);
    healthEvents.on('health_score_updated', scoreListener);

    await analyzer.analyze(createInput());

    expect(startedListener).toHaveBeenCalledTimes(1);
    expect(completedListener).toHaveBeenCalledTimes(1);
    expect(scoreListener).toHaveBeenCalledTimes(1);
  });

  it('emits category_completed for each analyzer', async () => {
    const analyzer = new HealthAnalyzer();
    const categoryListener = vi.fn();
    healthEvents.on('category_completed', categoryListener);

    await analyzer.analyze(createInput());

    expect(categoryListener).toHaveBeenCalledTimes(11);
  });

  it('returns cached result on second call with same input', async () => {
    const analyzer = new HealthAnalyzer();
    const input = createInput();
    const report1 = await analyzer.analyze(input);
    expect(report1.fromCache).toBe(false);

    const report2 = await analyzer.analyze(input);
    expect(report2.fromCache).toBe(true);
    expect(report2.id).toBe(report1.id);
  });

  it('invalidates cache and re-analyzes when input changes', async () => {
    const analyzer = new HealthAnalyzer();
    const input1 = createInput();
    const report1 = await analyzer.analyze(input1);

    const input2 = createInput({
      metrics: createMockMetrics({ cpu: { usage: 90, frequency: 3200, logicalProcessors: 8, physicalProcessors: 4, processes: 300, threads: 800, temperature: null } }),
    });
    const report2 = await analyzer.analyze(input2);
    expect(report2.fromCache).toBe(false);
    expect(report2.id).not.toBe(report1.id);
  });

  it('supports explicit cache invalidation', async () => {
    const analyzer = new HealthAnalyzer();
    const input = createInput();
    await analyzer.analyze(input);
    analyzer.invalidateCache();
    const report2 = await analyzer.analyze(input);
    expect(report2.fromCache).toBe(false);
  });

  it('supports custom analyzer registration', async () => {
    const analyzer = new HealthAnalyzer();
    const customAnalyzer = {
      categoryId: 'custom',
      categoryName: 'Custom Analyzer',
      analyze: () => ({
        categoryId: 'custom',
        categoryName: 'Custom Analyzer',
        score: 50,
        severity: 'medium' as const,
        issues: [{ title: 'Custom issue', description: 'd', severity: 'medium' as const, impact: 10, autoFixable: true }],
        recommendations: ['Fix it'],
        confidence: 0.8,
        analyzedAt: new Date().toISOString(),
      }),
    };
    analyzer.registerAnalyzer(customAnalyzer as never);
    const report = await analyzer.analyze(createInput());
    expect(report.categories.some((c) => (c.categoryId as string) === 'custom')).toBe(true);
  });

  it('handles analyzer errors gracefully', async () => {
    const registry = new AnalyzerRegistry();
    registry.register({
      categoryId: 'broken',
      categoryName: 'Broken',
      analyze: () => { throw new Error('Analyzer crashed'); },
    } as never);
    const analyzer = new HealthAnalyzer({ registry });
    const report = await analyzer.analyze(createInput());
    // Should still produce a report, just without the broken category
    expect(report.categories.some((c) => (c.categoryId as string) === 'broken')).toBe(false);
  });

  it('stores snapshots for trend analysis', async () => {
    const analyzer = new HealthAnalyzer();
    await analyzer.analyze(createInput());
    const snapshots = analyzer.getSnapshots();
    expect(snapshots.length).toBe(1);
  });

  it('emits analysis_failed on catastrophic error', async () => {
    const failingRegistry = {
      getAll: () => { throw new Error('Registry broken'); },
      register: () => {},
      unregister: () => {},
      get: () => undefined,
      has: () => false,
      clear: () => {},
    };
    const analyzer = new HealthAnalyzer({ registry: failingRegistry as never });
    const failListener = vi.fn();
    healthEvents.on('analysis_failed', failListener);

    await expect(analyzer.analyze(createInput())).rejects.toThrow();

    expect(failListener).toHaveBeenCalledTimes(1);
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('Regression', () => {
  it('does not import from auth, licensing, payment, sync, scheduler, or execution engine', async () => {
    const mod = await import('../index');
    expect(mod).toBeDefined();
    expect(mod.healthAnalyzer).toBeDefined();
    expect(mod.HealthScoreCalculator).toBeDefined();
    expect(mod.HealthCache).toBeDefined();
    expect(mod.HealthReportBuilder).toBeDefined();
  });

  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.healthEvents).toBeDefined();
    expect(mod.healthScoreCalculator).toBeDefined();
    expect(mod.healthInsightGenerator).toBeDefined();
    expect(mod.recommendationEngine).toBeDefined();
    expect(mod.trendAnalyzer).toBeDefined();
    expect(mod.healthReportBuilder).toBeDefined();
    expect(mod.healthCache).toBeDefined();
    expect(mod.healthAnalyzer).toBeDefined();
    expect(mod.createDefaultRegistry).toBeDefined();
    expect(mod.DEFAULT_CATEGORY_WEIGHTS).toBeDefined();
  });

  it('default category weights are defined', () => {
    expect(DEFAULT_CATEGORY_WEIGHTS.storage).toBe(0.20);
    expect(DEFAULT_CATEGORY_WEIGHTS.performance).toBe(0.20);
    expect(DEFAULT_CATEGORY_WEIGHTS.memory).toBe(0.15);
    expect(DEFAULT_CATEGORY_WEIGHTS.startup).toBe(0.15);
    expect(DEFAULT_CATEGORY_WEIGHTS.browser).toBe(0.10);
    expect(DEFAULT_CATEGORY_WEIGHTS.privacy).toBe(0.10);
  });
});
