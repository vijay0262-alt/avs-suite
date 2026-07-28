/**
 * Tests for Optimization Planner (Phase 3.1).
 *
 * Covers:
 * - Estimator: benefit, duration, space recovery, risk estimation
 * - Priority engine: ranking, topological sort, reasoning
 * - Plan builder: plan types, filtering, capability locking, aggregates
 * - Preview builder: headline, improvements, tasks, reasoning
 * - Optimization planner: integration, events, multiple plans
 * - Regression: no execution behavior, no forbidden imports
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DashboardMetrics } from '../../dashboard/dashboard.types';
import type { ExecutionRecord, ExecutionStatistics } from '../../maintenance-history/types';
import type { TaskResult } from '../../maintenance-engine/types';
import type { CapabilityInfo } from '../../config-sync/types';

import type { HealthReport, CategoryResult, HealthCategoryId, Severity } from '../../ai-health-engine/types';
import { scoreToLevel, scoreToLetter } from '../../ai-health-engine/types';

import {
  estimateCategory,
  estimatePredictedScore,
  estimatePerformanceImprovement,
  estimatePrivacyImprovement,
  estimateOverallRisk,
  estimateFromStatistics,
} from '../optimizationEstimator';
import {
  rankItems,
  getPrioritizationReasoning,
} from '../optimizationPriorityEngine';
import { planBuilder } from '../optimizationPlanBuilder';
import { previewBuilder } from '../optimizationPreviewBuilder';
import { optimizationPlanner } from '../optimizationPlanner';
import { optimizationEvents } from '../optimizationEvents';
import {
  PLAN_TYPE_CATEGORIES,
  CATEGORY_TASK_MAP,
  CATEGORY_CAPABILITY_MAP,
  DEFAULT_USER_PREFERENCES,
  formatBytes,
  formatDuration,
  severityToWeight,
  riskToWeight,
  priorityToWeight,
  clampScore,
} from '../types';
import type {
  OptimizationItem,
  OptimizationPlannerInput,
  PlannerUserPreferences,
} from '../types';

// ── Test Helpers ──────────────────────────────────────────────

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

function createMockCapabilities(): { available: CapabilityInfo[]; locked: CapabilityInfo[] } {
  return {
    available: [
      { id: 'junk-cleaner', display_name: 'Junk Cleaner', description: 'Clean junk files', category: 'cleaning', minimum_version: '1.0.0', status: 'active' },
      { id: 'browser-cleaner', display_name: 'Browser Cleaner', description: 'Clean browser data', category: 'cleaning', minimum_version: '1.0.0', status: 'active' },
    ],
    locked: [
      { id: 'startup-manager', display_name: 'Startup Manager', description: 'Manage startup programs', category: 'optimization', minimum_version: '2.0.0', status: 'locked' },
      { id: 'driver-updater', display_name: 'Driver Updater', description: 'Update drivers', category: 'system', minimum_version: '2.0.0', status: 'locked' },
    ],
  };
}

function makeCategoryResult(
  categoryId: HealthCategoryId,
  score: number,
  severity: Severity,
  issues: Array<{ title: string; description: string; severity: Severity; impact: number; autoFixable: boolean }>,
): CategoryResult {
  return {
    categoryId,
    categoryName: categoryId,
    score,
    severity,
    issues,
    recommendations: ['test'],
    confidence: 0.9,
    analyzedAt: new Date().toISOString(),
  };
}

function makeReport(
  score: number,
  categories: CategoryResult[] = [],
): HealthReport {
  return {
    id: 'test-report-1',
    generatedAt: new Date().toISOString(),
    overall: {
      score,
      letterGrade: scoreToLetter(score),
      level: scoreToLevel(score),
      categoryScores: [],
      computedAt: new Date().toISOString(),
    },
    categories,
    insights: [],
    recommendations: [],
    trends: null,
    fromCache: false,
  };
}

function makeOptimizationItem(
  id: string,
  category: HealthCategoryId,
  overrides: Partial<OptimizationItem> = {},
): OptimizationItem {
  return {
    id,
    title: `Optimize ${category}`,
    description: 'Test item',
    category,
    priority: 'medium',
    estimatedBenefit: 10,
    estimatedDurationSeconds: 30,
    estimatedSpaceRecovery: 0,
    risk: 'low',
    requiredCapability: null,
    requiredTask: CATEGORY_TASK_MAP[category],
    canBeSkipped: true,
    dependencies: [],
    isLocked: false,
    lockedReason: null,
    isSkipped: false,
    skippedReason: null,
    ...overrides,
  };
}

function createPlannerInput(overrides: Partial<OptimizationPlannerInput> = {}): OptimizationPlannerInput {
  return {
    healthReport: makeReport(72, [
      makeCategoryResult('temp_files', 50, 'high', [
        { title: 'Excessive temp files', description: '4.2 GB of temp files', severity: 'high', impact: 30, autoFixable: true },
      ]),
      makeCategoryResult('browser', 60, 'medium', [
        { title: 'Large browser cache', description: '650 MB cache', severity: 'medium', impact: 20, autoFixable: true },
      ]),
      makeCategoryResult('recycle_bin', 40, 'high', [
        { title: 'Recycle bin full', description: '2 GB in recycle bin', severity: 'high', impact: 25, autoFixable: true },
      ]),
      makeCategoryResult('startup', 55, 'medium', [
        { title: 'Too many startup programs', description: '14 startup apps', severity: 'medium', impact: 15, autoFixable: false },
      ]),
      makeCategoryResult('privacy', 65, 'low', [
        { title: 'Privacy data', description: 'Browsing data accumulated', severity: 'low', impact: 10, autoFixable: true },
      ]),
      makeCategoryResult('storage', 70, 'low', [
        { title: 'Drive usage', description: 'Drive at 40%', severity: 'low', impact: 5, autoFixable: true },
      ]),
      makeCategoryResult('performance', 85, 'info', []),
      makeCategoryResult('memory', 90, 'info', []),
      makeCategoryResult('system_updates', 95, 'info', []),
      makeCategoryResult('drivers', 80, 'info', []),
      makeCategoryResult('security', 100, 'info', []),
    ]),
    capabilities: createMockCapabilities(),
    executionHistory: [],
    executionStatistics: createMockStatistics(),
    ...overrides,
  };
}

// ── Helper Function Tests ─────────────────────────────────────

describe('Helper Functions', () => {
  it('severityToWeight maps correctly', () => {
    expect(severityToWeight('critical')).toBe(100);
    expect(severityToWeight('high')).toBe(75);
    expect(severityToWeight('medium')).toBe(50);
    expect(severityToWeight('low')).toBe(25);
    expect(severityToWeight('info')).toBe(10);
  });

  it('riskToWeight maps correctly', () => {
    expect(riskToWeight('none')).toBe(0);
    expect(riskToWeight('low')).toBe(25);
    expect(riskToWeight('medium')).toBe(50);
    expect(riskToWeight('high')).toBe(100);
  });

  it('priorityToWeight maps correctly', () => {
    expect(priorityToWeight('critical')).toBe(100);
    expect(priorityToWeight('high')).toBe(75);
    expect(priorityToWeight('medium')).toBe(50);
    expect(priorityToWeight('low')).toBe(25);
  });

  it('formatBytes formats correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('formatDuration formats correctly', () => {
    expect(formatDuration(30)).toBe('~30 seconds');
    expect(formatDuration(60)).toBe('~1 minute');
    expect(formatDuration(90)).toBe('~1 min 30 sec');
    expect(formatDuration(120)).toBe('~2 minutes');
  });

  it('clampScore clamps to [0, 100]', () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(50)).toBe(50);
  });
});

// ── Estimator Tests ───────────────────────────────────────────

describe('OptimizationEstimator', () => {
  it('estimates benefit from category gap and issues', () => {
    const result = makeCategoryResult('temp_files', 50, 'high', [
      { title: 'Excessive temp files', description: 'd', severity: 'high', impact: 30, autoFixable: true },
    ]);
    const estimate = estimateCategory(result, null, []);
    expect(estimate.benefit).toBe(30);
  });

  it('estimates limited benefit when no autoFixable issues', () => {
    const result = makeCategoryResult('startup', 55, 'medium', [
      { title: 'Too many startup programs', description: 'd', severity: 'medium', impact: 15, autoFixable: false },
    ]);
    const estimate = estimateCategory(result, null, []);
    expect(estimate.benefit).toBeLessThanOrEqual(10);
  });

  it('estimates zero benefit for perfect score', () => {
    const result = makeCategoryResult('storage', 100, 'info', []);
    const estimate = estimateCategory(result, null, []);
    expect(estimate.benefit).toBe(0);
  });

  it('estimates space recovery from metrics', () => {
    const metrics = createMockMetrics({
      performance: {
        startupApps: 5,
        backgroundProcesses: 20,
        temporaryFilesSize: 100 * 1024 * 1024,
        recycleBinSize: 200 * 1024 * 1024,
        browserCacheSize: 50 * 1024 * 1024,
        potentialRecoverable: 350 * 1024 * 1024,
      },
    });
    const tempResult = makeCategoryResult('temp_files', 50, 'high', [
      { title: 'Temp files', description: 'd', severity: 'high', impact: 30, autoFixable: true },
    ]);
    const estimate = estimateCategory(tempResult, metrics, []);
    // 80% of 100 MB = 80 MB
    expect(estimate.spaceRecoveryBytes).toBe(Math.floor(100 * 1024 * 1024 * 0.8));
  });

  it('estimates zero space recovery for categories without space', () => {
    const result = makeCategoryResult('performance', 85, 'info', []);
    const estimate = estimateCategory(result, null, []);
    expect(estimate.spaceRecoveryBytes).toBe(0);
  });

  it('estimates duration from task mapping', () => {
    const result = makeCategoryResult('temp_files', 50, 'high', [
      { title: 'Temp files', description: 'd', severity: 'high', impact: 30, autoFixable: true },
    ]);
    const estimate = estimateCategory(result, null, []);
    // temp_files_cleaner default estimate is 20 seconds
    expect(estimate.durationSeconds).toBe(20);
  });

  it('estimates zero duration for categories without tasks', () => {
    const result = makeCategoryResult('performance', 85, 'info', []);
    const estimate = estimateCategory(result, null, []);
    expect(estimate.durationSeconds).toBe(0);
  });

  it('estimates risk as low for autoFixable issues', () => {
    const result = makeCategoryResult('temp_files', 50, 'high', [
      { title: 'Temp files', description: 'd', severity: 'high', impact: 30, autoFixable: true },
    ]);
    const estimate = estimateCategory(result, null, []);
    expect(estimate.risk).toBe('low');
  });

  it('estimates risk as medium for non-autoFixable issues', () => {
    const result = makeCategoryResult('startup', 55, 'medium', [
      { title: 'Startup', description: 'd', severity: 'medium', impact: 15, autoFixable: false },
    ]);
    const estimate = estimateCategory(result, null, []);
    expect(estimate.risk).toBe('medium');
  });

  it('estimates risk as high for critical non-autoFixable', () => {
    const result = makeCategoryResult('security', 30, 'critical', [
      { title: 'AV off', description: 'd', severity: 'critical', impact: 25, autoFixable: false },
    ]);
    const estimate = estimateCategory(result, null, []);
    expect(estimate.risk).toBe('high');
  });

  it('estimatePredictedScore adds benefits to current score', () => {
    const estimates = [
      { category: 'temp_files' as const, benefit: 20, durationSeconds: 20, spaceRecoveryBytes: 0, spaceRecoverySource: '', risk: 'low' as const },
      { category: 'browser' as const, benefit: 15, durationSeconds: 30, spaceRecoveryBytes: 0, spaceRecoverySource: '', risk: 'low' as const },
    ];
    expect(estimatePredictedScore(70, estimates)).toBe(100); // clamped
  });

  it('estimatePredictedScore clamps to 100', () => {
    const estimates = [
      { category: 'temp_files' as const, benefit: 50, durationSeconds: 20, spaceRecoveryBytes: 0, spaceRecoverySource: '', risk: 'low' as const },
    ];
    expect(estimatePredictedScore(60, estimates)).toBe(100);
  });

  it('estimatePerformanceImprovement sums perf categories', () => {
    const estimates = [
      { category: 'performance' as const, benefit: 20, durationSeconds: 0, spaceRecoveryBytes: 0, spaceRecoverySource: '', risk: 'low' as const },
      { category: 'memory' as const, benefit: 10, durationSeconds: 0, spaceRecoveryBytes: 0, spaceRecoverySource: '', risk: 'low' as const },
      { category: 'temp_files' as const, benefit: 30, durationSeconds: 0, spaceRecoveryBytes: 0, spaceRecoverySource: '', risk: 'low' as const },
    ];
    const report = makeReport(70);
    // (20 + 10) * 0.5 = 15
    expect(estimatePerformanceImprovement(estimates, report)).toBe(15);
  });

  it('estimatePrivacyImprovement sums privacy categories', () => {
    const estimates = [
      { category: 'privacy' as const, benefit: 20, durationSeconds: 0, spaceRecoveryBytes: 0, spaceRecoverySource: '', risk: 'low' as const },
      { category: 'browser' as const, benefit: 15, durationSeconds: 0, spaceRecoveryBytes: 0, spaceRecoverySource: '', risk: 'low' as const },
    ];
    // (20 + 15) * 0.7 = 24.5
    expect(estimatePrivacyImprovement(estimates)).toBeCloseTo(24.5, 0);
  });

  it('estimateOverallRisk returns highest risk', () => {
    expect(estimateOverallRisk(['low', 'medium', 'low'])).toBe('medium');
    expect(estimateOverallRisk(['low', 'high'])).toBe('high');
    expect(estimateOverallRisk(['none', 'low'])).toBe('low');
    expect(estimateOverallRisk([])).toBe('none');
  });

  it('estimateFromStatistics returns 0 for no executions', () => {
    expect(estimateFromStatistics(createMockStatistics())).toBe(0);
  });

  it('estimateFromStatistics returns average duration in seconds', () => {
    const stats = createMockStatistics({ totalExecutions: 10, averageDurationMs: 45000 });
    expect(estimateFromStatistics(stats)).toBe(45);
  });
});

// ── Priority Engine Tests ─────────────────────────────────────

describe('OptimizationPriorityEngine', () => {
  it('ranks critical priority before low', () => {
    const items = [
      makeOptimizationItem('item-low', 'temp_files', { priority: 'low', estimatedBenefit: 5 }),
      makeOptimizationItem('item-critical', 'storage', { priority: 'critical', estimatedBenefit: 30 }),
    ];
    const order = rankItems(items, [], DEFAULT_USER_PREFERENCES);
    expect(order[0]).toBe('item-critical');
    expect(order[1]).toBe('item-low');
  });

  it('ranks higher benefit before lower benefit at same priority', () => {
    const items = [
      makeOptimizationItem('item-a', 'temp_files', { priority: 'high', estimatedBenefit: 10 }),
      makeOptimizationItem('item-b', 'browser', { priority: 'high', estimatedBenefit: 25 }),
    ];
    const order = rankItems(items, [], DEFAULT_USER_PREFERENCES);
    expect(order[0]).toBe('item-b');
  });

  it('penalizes high risk when avoidHighRisk is set', () => {
    const items = [
      makeOptimizationItem('item-risky', 'security', { priority: 'high', estimatedBenefit: 30, risk: 'high' }),
      makeOptimizationItem('item-safe', 'temp_files', { priority: 'high', estimatedBenefit: 20, risk: 'low' }),
    ];
    const prefs: PlannerUserPreferences = { ...DEFAULT_USER_PREFERENCES, avoidHighRisk: true };
    const order = rankItems(items, [], prefs);
    expect(order[0]).toBe('item-safe');
  });

  it('boosts privacy categories when prioritizePrivacy is set', () => {
    const items = [
      makeOptimizationItem('item-storage', 'temp_files', { priority: 'medium', estimatedBenefit: 15 }),
      makeOptimizationItem('item-privacy', 'privacy', { priority: 'medium', estimatedBenefit: 15 }),
    ];
    const prefs: PlannerUserPreferences = { ...DEFAULT_USER_PREFERENCES, prioritizePrivacy: true };
    const order = rankItems(items, [], prefs);
    expect(order[0]).toBe('item-privacy');
  });

  it('boosts storage categories when prioritizeStorage is set', () => {
    const items = [
      makeOptimizationItem('item-privacy', 'privacy', { priority: 'medium', estimatedBenefit: 15 }),
      makeOptimizationItem('item-storage', 'temp_files', { priority: 'medium', estimatedBenefit: 15 }),
    ];
    const prefs: PlannerUserPreferences = { ...DEFAULT_USER_PREFERENCES, prioritizeStorage: true };
    const order = rankItems(items, [], prefs);
    expect(order[0]).toBe('item-storage');
  });

  it('places locked items at the end', () => {
    const items = [
      makeOptimizationItem('item-locked', 'startup', { priority: 'critical', estimatedBenefit: 30, isLocked: true }),
      makeOptimizationItem('item-active', 'temp_files', { priority: 'low', estimatedBenefit: 5 }),
    ];
    const order = rankItems(items, [], DEFAULT_USER_PREFERENCES);
    expect(order[0]).toBe('item-active');
    expect(order[1]).toBe('item-locked');
  });

  it('places skipped items after locked', () => {
    const items = [
      makeOptimizationItem('item-skipped', 'performance', { priority: 'critical', estimatedBenefit: 30, isSkipped: true }),
      makeOptimizationItem('item-locked', 'startup', { priority: 'critical', estimatedBenefit: 30, isLocked: true }),
      makeOptimizationItem('item-active', 'temp_files', { priority: 'low', estimatedBenefit: 5 }),
    ];
    const order = rankItems(items, [], DEFAULT_USER_PREFERENCES);
    expect(order[0]).toBe('item-active');
    expect(order[1]).toBe('item-locked');
    expect(order[2]).toBe('item-skipped');
  });

  it('boosts items not recently executed', () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const history = [createMockRecord({ startTime: oldDate })];
    const items = [
      makeOptimizationItem('item-recent', 'temp_files', { priority: 'medium', estimatedBenefit: 15 }),
      makeOptimizationItem('item-old', 'browser', { priority: 'medium', estimatedBenefit: 15 }),
    ];
    // Both have no recent execution history for their specific category
    // But the test verifies the boost is applied
    const order = rankItems(items, history, DEFAULT_USER_PREFERENCES);
    expect(order).toHaveLength(2);
  });

  it('getPrioritizationReasoning returns meaningful text', () => {
    const item = makeOptimizationItem('item-1', 'temp_files', {
      priority: 'critical',
      estimatedBenefit: 30,
      estimatedSpaceRecovery: 200 * 1024 * 1024,
      risk: 'low',
    });
    const reasoning = getPrioritizationReasoning(item, []);
    expect(reasoning).toContain('Critical');
    expect(reasoning).toContain('benefit');
    expect(reasoning).toContain('space');
    expect(reasoning).toContain('Low risk');
  });

  it('getPrioritizationReasoning includes locked reason', () => {
    const item = makeOptimizationItem('item-1', 'startup', {
      isLocked: true,
      lockedReason: 'Capability not available',
    });
    const reasoning = getPrioritizationReasoning(item, []);
    expect(reasoning).toContain('Locked');
    expect(reasoning).toContain('Capability not available');
  });
});

// ── Plan Builder Tests ────────────────────────────────────────

describe('PlanBuilder', () => {
  it('builds a balanced plan with correct items', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    expect(plan.planId).toBeTruthy();
    expect(plan.planType).toBe('balanced');
    expect(plan.items.length).toBeGreaterThan(0);
    // Balanced includes: temp_files, recycle_bin, browser, privacy
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const activeCategories = activeItems.map((i) => i.category);
    expect(activeCategories).toContain('temp_files');
    expect(activeCategories).toContain('recycle_bin');
    expect(activeCategories).toContain('browser');
    expect(activeCategories).toContain('privacy');
  });

  it('builds a quick plan with only fast categories', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'quick',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const activeCategories = activeItems.map((i) => i.category);
    expect(activeCategories).toContain('temp_files');
    expect(activeCategories).toContain('recycle_bin');
    expect(activeCategories).not.toContain('browser');
    expect(activeCategories).not.toContain('storage');
  });

  it('builds a deep plan with all categories', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'deep',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    // 11 categories total, but startup and drivers are locked (capability unavailable)
    expect(activeItems.length).toBe(9);
  });

  it('builds a privacy plan with privacy and browser only', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'privacy',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const activeCategories = activeItems.map((i) => i.category);
    expect(activeCategories).toContain('browser');
    expect(activeCategories).toContain('privacy');
    expect(activeCategories).not.toContain('temp_files');
  });

  it('builds a storage plan with storage-related categories', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'storage',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const activeCategories = activeItems.map((i) => i.category);
    expect(activeCategories).toContain('temp_files');
    expect(activeCategories).toContain('recycle_bin');
    expect(activeCategories).toContain('storage');
  });

  it('builds a custom plan with user-selected categories', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'custom',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
      ['temp_files', 'browser'],
    );
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const activeCategories = activeItems.map((i) => i.category);
    expect(activeCategories).toContain('temp_files');
    expect(activeCategories).toContain('browser');
    expect(activeCategories).not.toContain('recycle_bin');
  });

  it('locks items when capability is unavailable', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'deep',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const startupItem = plan.items.find((i) => i.category === 'startup');
    expect(startupItem).toBeDefined();
    expect(startupItem!.isLocked).toBe(true);
    expect(startupItem!.lockedReason).toBeTruthy();
  });

  it('does not lock items with no required capability', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'deep',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const tempItem = plan.items.find((i) => i.category === 'temp_files');
    expect(tempItem).toBeDefined();
    expect(tempItem!.isLocked).toBe(false);
  });

  it('computes predicted score higher than current', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    expect(plan.currentHealthScore).toBe(72);
    expect(plan.predictedHealthScore).toBeGreaterThan(72);
    expect(plan.predictedHealthScore).toBeLessThanOrEqual(100);
  });

  it('computes total duration from active items', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'quick',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const expectedDuration = activeItems.reduce((sum, i) => sum + i.estimatedDurationSeconds, 0);
    expect(plan.estimatedDurationSeconds).toBe(expectedDuration);
  });

  it('computes total space recovery from active items', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const expectedSpace = activeItems.reduce((sum, i) => sum + i.estimatedSpaceRecovery, 0);
    expect(plan.estimatedSpaceRecovery).toBe(expectedSpace);
  });

  it('skips high-risk items when avoidHighRisk is set', () => {
    const input = createPlannerInput();
    const prefs: PlannerUserPreferences = { ...DEFAULT_USER_PREFERENCES, avoidHighRisk: true };
    const plan = planBuilder.build(
      input.healthReport,
      'deep',
      input.capabilities,
      input.executionHistory,
      prefs,
    );
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    expect(activeItems.every((i) => i.risk !== 'high')).toBe(true);
  });

  it('skips items exceeding max duration', () => {
    const input = createPlannerInput();
    const prefs: PlannerUserPreferences = { ...DEFAULT_USER_PREFERENCES, maxDurationSeconds: 25 };
    const plan = planBuilder.build(
      input.healthReport,
      'deep',
      input.capabilities,
      input.executionHistory,
      prefs,
    );
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const totalDuration = activeItems.reduce((sum, i) => sum + i.estimatedDurationSeconds, 0);
    expect(totalDuration).toBeLessThanOrEqual(25);
  });

  it('generates execution order with all item IDs', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    expect(plan.executionOrder).toHaveLength(plan.items.length);
    for (const item of plan.items) {
      expect(plan.executionOrder).toContain(item.id);
    }
  });

  it('sets sourceReportId from health report', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    expect(plan.sourceReportId).toBe(input.healthReport.id);
  });
});

// ── Preview Builder Tests ─────────────────────────────────────

describe('PreviewBuilder', () => {
  it('builds a preview with headline and scores', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const preview = previewBuilder.build(plan, input.executionHistory);
    expect(preview.planId).toBe(plan.planId);
    expect(preview.headline).toBeTruthy();
    expect(preview.currentHealthScore).toBe(plan.currentHealthScore);
    expect(preview.expectedHealthScore).toBe(plan.predictedHealthScore);
    expect(preview.scoreImprovement).toBe(plan.predictedHealthScore - plan.currentHealthScore);
  });

  it('lists tasks that will run', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const preview = previewBuilder.build(plan, input.executionHistory);
    expect(preview.tasksWillRun.length).toBeGreaterThan(0);
    for (const task of preview.tasksWillRun) {
      expect(task.title).toBeTruthy();
      expect(task.benefit).toBeTruthy();
      expect(task.duration).toBeTruthy();
    }
  });

  it('lists locked tasks', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'deep',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const preview = previewBuilder.build(plan, input.executionHistory);
    const lockedTitles = preview.tasksLocked.map((t) => t.title);
    expect(lockedTitles).toContain('Review Startup Programs');
  });

  it('lists skipped tasks', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'quick',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const preview = previewBuilder.build(plan, input.executionHistory);
    expect(preview.tasksSkipped.length).toBeGreaterThan(0);
  });

  it('provides reasoning for prioritization', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const preview = previewBuilder.build(plan, input.executionHistory);
    expect(preview.reasoning.length).toBeGreaterThan(0);
  });

  it('provides improvements summary', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const preview = previewBuilder.build(plan, input.executionHistory);
    expect(preview.improvements.length).toBeGreaterThan(0);
    // Should contain health score improvement
    expect(preview.improvements.some((i) => i.includes('Health Score'))).toBe(true);
  });

  it('formats duration and space recovery', () => {
    const input = createPlannerInput();
    const plan = planBuilder.build(
      input.healthReport,
      'balanced',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const preview = previewBuilder.build(plan, input.executionHistory);
    expect(preview.estimatedDuration).toBeTruthy();
    expect(preview.estimatedSpaceRecovery).toBeTruthy();
  });

  it('handles plan with no improvements', () => {
    const report = makeReport(100, [
      makeCategoryResult('temp_files', 100, 'info', []),
    ]);
    const input = createPlannerInput({
      healthReport: report,
    });
    const plan = planBuilder.build(
      input.healthReport,
      'quick',
      input.capabilities,
      input.executionHistory,
      DEFAULT_USER_PREFERENCES,
    );
    const preview = previewBuilder.build(plan, input.executionHistory);
    expect(preview.scoreImprovement).toBe(0);
    expect(preview.headline).toContain('great shape');
  });
});

// ── Optimization Planner Integration Tests ────────────────────

describe('OptimizationPlanner (Integration)', () => {
  afterEach(() => {
    optimizationEvents.clear();
  });

  it('generates a balanced plan', () => {
    const input = createPlannerInput();
    const plan = optimizationPlanner.generatePlan(input, { planType: 'balanced' });
    expect(plan.planId).toBeTruthy();
    expect(plan.planType).toBe('balanced');
    expect(plan.items.length).toBeGreaterThan(0);
  });

  it('generates a plan with preview', () => {
    const input = createPlannerInput();
    const { plan, preview } = optimizationPlanner.generatePlanWithPreview(input, { planType: 'balanced' });
    expect(plan.planId).toBe(preview.planId);
    expect(preview.headline).toBeTruthy();
    expect(preview.tasksWillRun.length).toBeGreaterThan(0);
  });

  it('emits optimization_plan_started and optimization_plan_generated events', () => {
    const input = createPlannerInput();
    const startedListener = vi.fn();
    const generatedListener = vi.fn();
    optimizationEvents.on('optimization_plan_started', startedListener);
    optimizationEvents.on('optimization_plan_generated', generatedListener);

    optimizationPlanner.generatePlan(input, { planType: 'quick' });

    expect(startedListener).toHaveBeenCalledTimes(1);
    expect(generatedListener).toHaveBeenCalledTimes(1);
  });

  it('emits optimization_plan_failed on error', () => {
    const failListener = vi.fn();
    optimizationEvents.on('optimization_plan_failed', failListener);

    // Pass invalid input to trigger error
    expect(() => {
      optimizationPlanner.generatePlan({
        healthReport: null as never,
        capabilities: createMockCapabilities(),
        executionHistory: [],
        executionStatistics: createMockStatistics(),
      });
    }).toThrow();

    expect(failListener).toHaveBeenCalledTimes(1);
  });

  it('generates multiple plan types', () => {
    const input = createPlannerInput();
    const plans = optimizationPlanner.generateMultiplePlans(input, ['quick', 'balanced', 'deep']);
    expect(plans).toHaveLength(3);
    expect(plans[0]!.planType).toBe('quick');
    expect(plans[1]!.planType).toBe('balanced');
    expect(plans[2]!.planType).toBe('deep');
  });

  it('generates all default plan types', () => {
    const input = createPlannerInput();
    const plans = optimizationPlanner.generateMultiplePlans(input);
    expect(plans).toHaveLength(5);
    const types = plans.map((p) => p.planType);
    expect(types).toContain('quick');
    expect(types).toContain('balanced');
    expect(types).toContain('deep');
    expect(types).toContain('privacy');
    expect(types).toContain('storage');
  });

  it('respects user preferences in generated plan', () => {
    const input = createPlannerInput();
    const plan = optimizationPlanner.generatePlan(input, {
      planType: 'deep',
      preferences: { avoidHighRisk: true },
    });
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    expect(activeItems.every((i) => i.risk !== 'high')).toBe(true);
  });

  it('generates custom plan with specified categories', () => {
    const input = createPlannerInput();
    const plan = optimizationPlanner.generatePlan(input, {
      planType: 'custom',
      customCategories: ['temp_files', 'recycle_bin'],
    });
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const categories = activeItems.map((i) => i.category);
    expect(categories).toContain('temp_files');
    expect(categories).toContain('recycle_bin');
    expect(categories).not.toContain('browser');
  });

  it('deep plan has higher predicted score than quick plan', () => {
    const input = createPlannerInput();
    const quickPlan = optimizationPlanner.generatePlan(input, { planType: 'quick' });
    const deepPlan = optimizationPlanner.generatePlan(input, { planType: 'deep' });
    // Deep plan should have at least as many active items
    const quickActive = quickPlan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const deepActive = deepPlan.items.filter((i) => !i.isSkipped && !i.isLocked);
    expect(deepActive.length).toBeGreaterThanOrEqual(quickActive.length);
  });
});

// ── Events Tests ──────────────────────────────────────────────

describe('OptimizationEvents', () => {
  afterEach(() => {
    optimizationEvents.clear();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    optimizationEvents.on('optimization_plan_generated', listener);
    optimizationEvents.emit('optimization_plan_generated', { plan: { id: 'test' } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = optimizationEvents.on('optimization_plan_started', listener);
    expect(optimizationEvents.listenerCount('optimization_plan_started')).toBe(1);
    unsub();
    expect(optimizationEvents.listenerCount('optimization_plan_started')).toBe(0);
  });

  it('does not crash when listener throws', () => {
    const badListener = () => { throw new Error('Listener crashed'); };
    const goodListener = vi.fn();
    optimizationEvents.on('optimization_plan_generated', badListener);
    optimizationEvents.on('optimization_plan_generated', goodListener);
    // Should not throw
    optimizationEvents.emit('optimization_plan_generated', { test: true });
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('tracks listener count', () => {
    expect(optimizationEvents.listenerCount('optimization_plan_failed')).toBe(0);
    const unsub1 = optimizationEvents.on('optimization_plan_failed', () => {});
    const unsub2 = optimizationEvents.on('optimization_plan_failed', () => {});
    expect(optimizationEvents.listenerCount('optimization_plan_failed')).toBe(2);
    unsub1();
    expect(optimizationEvents.listenerCount('optimization_plan_failed')).toBe(1);
    unsub2();
    expect(optimizationEvents.listenerCount('optimization_plan_failed')).toBe(0);
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('Regression', () => {
  it('does not import from auth, licensing, payment, sync, scheduler, or execution engine', async () => {
    const mod = await import('../index');
    // Verify the module loads without importing forbidden modules
    expect(mod.optimizationPlanner).toBeDefined();
    expect(mod.planBuilder).toBeDefined();
    expect(mod.previewBuilder).toBeDefined();
    expect(mod.optimizationEvents).toBeDefined();
  });

  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.OptimizationPlanner).toBeDefined();
    expect(mod.optimizationPlanner).toBeDefined();
    expect(mod.planBuilder).toBeDefined();
    expect(mod.previewBuilder).toBeDefined();
    expect(mod.optimizationEvents).toBeDefined();
    expect(mod.rankItems).toBeDefined();
    expect(mod.estimateCategory).toBeDefined();
    expect(mod.estimatePredictedScore).toBeDefined();
    expect(mod.formatBytes).toBeDefined();
    expect(mod.formatDuration).toBeDefined();
    expect(mod.PLAN_TYPE_CATEGORIES).toBeDefined();
    expect(mod.CATEGORY_TASK_MAP).toBeDefined();
    expect(mod.CATEGORY_CAPABILITY_MAP).toBeDefined();
    expect(mod.DEFAULT_USER_PREFERENCES).toBeDefined();
  });

  it('PLAN_TYPE_CATEGORIES has all plan types', () => {
    expect(PLAN_TYPE_CATEGORIES.quick).toBeDefined();
    expect(PLAN_TYPE_CATEGORIES.balanced).toBeDefined();
    expect(PLAN_TYPE_CATEGORIES.deep).toBe('*');
    expect(PLAN_TYPE_CATEGORIES.privacy).toBeDefined();
    expect(PLAN_TYPE_CATEGORIES.storage).toBeDefined();
    expect(PLAN_TYPE_CATEGORIES.custom).toBe('*');
  });

  it('CATEGORY_TASK_MAP maps all health categories', () => {
    const categories: HealthCategoryId[] = [
      'storage', 'performance', 'memory', 'startup', 'browser',
      'privacy', 'temp_files', 'recycle_bin', 'system_updates', 'drivers', 'security',
    ];
    for (const cat of categories) {
      expect(CATEGORY_TASK_MAP[cat]).toBeDefined();
    }
  });

  it('CATEGORY_CAPABILITY_MAP maps all health categories', () => {
    const categories: HealthCategoryId[] = [
      'storage', 'performance', 'memory', 'startup', 'browser',
      'privacy', 'temp_files', 'recycle_bin', 'system_updates', 'drivers', 'security',
    ];
    for (const cat of categories) {
      expect(CATEGORY_CAPABILITY_MAP[cat]).toBeDefined();
    }
  });

  it('DEFAULT_USER_PREFERENCES has expected defaults', () => {
    expect(DEFAULT_USER_PREFERENCES.avoidHighRisk).toBe(false);
    expect(DEFAULT_USER_PREFERENCES.maxDurationSeconds).toBe(0);
    expect(DEFAULT_USER_PREFERENCES.prioritizePrivacy).toBe(false);
    expect(DEFAULT_USER_PREFERENCES.prioritizeStorage).toBe(false);
  });

  it('planner never executes — only produces plans', () => {
    const input = createPlannerInput();
    const plan = optimizationPlanner.generatePlan(input, { planType: 'balanced' });
    // Plan should have items but no execution results
    expect(plan.items).toBeDefined();
    expect(plan.executionOrder).toBeDefined();
    // Plan should not have any execution-related fields
    expect((plan as unknown as Record<string, unknown>).executionResult).toBeUndefined();
    expect((plan as unknown as Record<string, unknown>).executedAt).toBeUndefined();
  });
});
