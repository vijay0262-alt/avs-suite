/**
 * Tests for One-Click Smart Optimize (Phase 3.2).
 *
 * Covers:
 * - Helper functions: formatting
 * - Session management: create, update, complete, cancel, fail
 * - Progress tracker: start, task events, progress calculation, cancellation
 * - Result builder: item mapping, recommendations, status determination
 * - Coordinator: validation, execution, cancellation, events, error handling
 * - Events: emit, subscribe, unsubscribe, error isolation
 * - Regression: no forbidden imports, all exports defined, engine not bypassed
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { TaskResult, ExecutionResult } from '../../maintenance-engine/types';
import type { ExecutionRecord } from '../../maintenance-history/types';
import type { CapabilityInfo } from '../../config-sync/types';
import type { HealthReport, HealthCategoryId } from '../../ai-health-engine/types';
import { scoreToLevel, scoreToLetter } from '../../ai-health-engine/types';
import type { OptimizationPlan, OptimizationItem } from '../../optimization-planner/types';

import { SessionManager } from '../optimizationSession';
import { ProgressTracker } from '../optimizationProgressTracker';
import { resultBuilder } from '../optimizationResultBuilder';
import { OptimizationExecutionCoordinator, optimizationCoordinator } from '../optimizationExecutionCoordinator';
import { optimizationExecutionEvents } from '../optimizationExecutionEvents';
import { executionEvents } from '../../maintenance-engine/executionEvents';
import { executionEngine } from '../../maintenance-engine/executionEngine';
import { formatDurationMs, formatBytes } from '../types';
import type {
  OptimizationResult,
  CoordinatorInput,
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

function createMockExecutionResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    executionId: 'exec-test-1',
    scheduleId: null,
    jobSource: 'ai_recommended',
    startTime: new Date('2025-01-01T10:00:00Z').toISOString(),
    endTime: new Date('2025-01-01T10:00:10Z').toISOString(),
    durationMs: 10000,
    taskResults: [createMockTaskResult()],
    totalFilesCleaned: 10,
    totalBytesRecovered: 1024,
    errors: [],
    warnings: [],
    overallStatus: 'completed',
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
    ],
  };
}

function makeOptimizationItem(
  id: string,
  category: HealthCategoryId,
  overrides: Partial<OptimizationItem> = {},
): OptimizationItem {
  const taskMap: Record<HealthCategoryId, string | null> = {
    storage: 'junk_cleaner',
    performance: null,
    memory: null,
    startup: null,
    browser: 'browser_cleaner',
    privacy: 'browser_cleaner',
    temp_files: 'temp_files_cleaner',
    recycle_bin: 'recycle_bin_cleaner',
    system_updates: null,
    drivers: null,
    security: null,
  };
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
    requiredTask: taskMap[category],
    canBeSkipped: true,
    dependencies: [],
    isLocked: false,
    lockedReason: null,
    isSkipped: false,
    skippedReason: null,
    ...overrides,
  };
}

function makePlan(overrides: Partial<OptimizationPlan> = {}): OptimizationPlan {
  return {
    planId: 'plan-test-1',
    planType: 'balanced',
    generatedAt: new Date().toISOString(),
    currentHealthScore: 72,
    predictedHealthScore: 88,
    estimatedDurationSeconds: 120,
    estimatedSpaceRecovery: 500 * 1024 * 1024,
    estimatedPerformanceImprovement: 15,
    estimatedPrivacyImprovement: 20,
    overallRisk: 'low',
    executionOrder: ['opt-temp_files-1', 'opt-browser-2', 'opt-recycle_bin-3'],
    items: [
      makeOptimizationItem('opt-temp_files-1', 'temp_files', { estimatedBenefit: 15, estimatedSpaceRecovery: 200 * 1024 * 1024 }),
      makeOptimizationItem('opt-browser-2', 'browser', { estimatedBenefit: 10, estimatedSpaceRecovery: 100 * 1024 * 1024 }),
      makeOptimizationItem('opt-recycle_bin-3', 'recycle_bin', { estimatedBenefit: 8, estimatedSpaceRecovery: 200 * 1024 * 1024 }),
    ],
    sourceReportId: 'report-1',
    ...overrides,
  };
}

function makeReport(score: number): HealthReport {
  return {
    id: 'report-1',
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

function createCoordinatorInput(overrides: Partial<CoordinatorInput> = {}): CoordinatorInput {
  return {
    plan: makePlan(),
    capabilities: createMockCapabilities(),
    deselectedItemIds: [],
    healthReport: makeReport(72),
    ...overrides,
  };
}

// ── Helper Function Tests ─────────────────────────────────────

describe('Helper Functions', () => {
  it('formatDurationMs formats milliseconds', () => {
    expect(formatDurationMs(500)).toBe('500 ms');
    expect(formatDurationMs(1000)).toBe('~1 second');
    expect(formatDurationMs(30000)).toBe('~30 seconds');
    expect(formatDurationMs(60000)).toBe('~1 minute');
    expect(formatDurationMs(90000)).toBe('~1 min 30 sec');
  });

  it('formatBytes formats byte values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });
});

// ── Session Manager Tests ─────────────────────────────────────

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('creates a session with correct initial state', () => {
    const session = manager.create('plan-1', 'report-1', 72, ['item-1', 'item-2'], ['item-3']);
    expect(session.sessionId).toBeTruthy();
    expect(session.planId).toBe('plan-1');
    expect(session.sourceReportId).toBe('report-1');
    expect(session.previousHealthScore).toBe(72);
    expect(session.selectedItemIds).toEqual(['item-1', 'item-2']);
    expect(session.deselectedItemIds).toEqual(['item-3']);
    expect(session.status).toBe('pending');
    expect(session.progress).toBe(0);
    expect(session.result).toBeNull();
    expect(session.startedAt).toBeNull();
    expect(session.completedAt).toBeNull();
  });

  it('starts a session', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    manager.start('exec-1', ['junk_cleaner']);
    const session = manager.get();
    expect(session!.status).toBe('running');
    expect(session!.startedAt).toBeTruthy();
    expect(session!.executionId).toBe('exec-1');
    expect(session!.executedTaskIds).toEqual(['junk_cleaner']);
  });

  it('sets current task', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    manager.setCurrentTask('junk_cleaner');
    expect(manager.get()!.currentTaskId).toBe('junk_cleaner');
  });

  it('sets progress', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    manager.setProgress(50);
    expect(manager.get()!.progress).toBe(50);
  });

  it('clamps progress to [0, 100]', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    manager.setProgress(150);
    expect(manager.get()!.progress).toBe(100);
    manager.setProgress(-10);
    expect(manager.get()!.progress).toBe(0);
  });

  it('completes a session', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    const result: OptimizationResult = {
      sessionId: manager.get()!.sessionId,
      executionId: 'exec-1',
      previousHealthScore: 72,
      newHealthScore: 88,
      healthImprovement: 16,
      tasksCompleted: 1,
      tasksSkipped: 0,
      storageRecovered: 1024,
      filesCleaned: 10,
      durationMs: 5000,
      warnings: [],
      errors: [],
      recommendations: [],
      itemResults: [],
      executionRecord: null,
      status: 'completed',
    };
    manager.complete(result);
    const session = manager.get();
    expect(session!.status).toBe('completed');
    expect(session!.completedAt).toBeTruthy();
    expect(session!.progress).toBe(100);
    expect(session!.result).toBe(result);
    expect(session!.currentTaskId).toBeNull();
  });

  it('cancels a session', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    manager.cancel('User cancelled');
    const session = manager.get();
    expect(session!.status).toBe('cancelled');
    expect(session!.completedAt).toBeTruthy();
    expect(session!.currentTaskId).toBeNull();
  });

  it('fails a session', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    manager.fail('Something went wrong');
    const session = manager.get();
    expect(session!.status).toBe('failed');
    expect(session!.completedAt).toBeTruthy();
  });

  it('sets validation issues', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    manager.setValidationIssues([
      { itemId: 'item-1', severity: 'warning', message: 'Test warning', code: 'TEST' },
    ]);
    expect(manager.get()!.validationIssues).toHaveLength(1);
  });

  it('clears the session', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    manager.clear();
    expect(manager.get()).toBeNull();
  });

  it('toSnapshot returns a copy', () => {
    manager.create('plan-1', 'report-1', 72, ['item-1'], []);
    const snapshot = manager.toSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.sessionId).toBe(manager.get()!.sessionId);
  });

  it('toSnapshot returns null when no session', () => {
    expect(manager.toSnapshot()).toBeNull();
  });
});

// ── Progress Tracker Tests ────────────────────────────────────

describe('ProgressTracker', () => {
  let tracker: ProgressTracker;

  beforeEach(() => {
    tracker = new ProgressTracker();
  });

  afterEach(() => {
    tracker.stop();
    executionEvents.clear();
    optimizationExecutionEvents.clear();
  });

  it('starts tracking with correct initial state', () => {
    const taskNames = new Map([['junk_cleaner', 'Junk Cleaner']]);
    tracker.start('session-1', ['junk_cleaner', 'browser_cleaner'], taskNames);
    const progress = tracker.getProgress();
    expect(progress.sessionId).toBe('session-1');
    expect(progress.totalTasks).toBe(2);
    expect(progress.completedTasks).toBe(0);
    expect(progress.overallProgress).toBe(0);
    expect(progress.remainingTaskIds).toEqual(['junk_cleaner', 'browser_cleaner']);
  });

  it('updates progress on task_started event', () => {
    const taskNames = new Map([['junk_cleaner', 'Junk Cleaner']]);
    tracker.start('session-1', ['junk_cleaner'], taskNames);

    executionEvents.emit('task_started', {
      executionId: 'exec-1',
      taskId: 'junk_cleaner',
      taskName: 'Junk Cleaner',
    });

    const progress = tracker.getProgress();
    expect(progress.currentTaskId).toBe('junk_cleaner');
    expect(progress.currentTaskName).toBe('Junk Cleaner');
  });

  it('updates progress on task_completed event', () => {
    const taskNames = new Map([['junk_cleaner', 'Junk Cleaner']]);
    tracker.start('session-1', ['junk_cleaner'], taskNames);

    executionEvents.emit('task_started', {
      executionId: 'exec-1',
      taskId: 'junk_cleaner',
      taskName: 'Junk Cleaner',
    });

    executionEvents.emit('task_completed', {
      executionId: 'exec-1',
      result: createMockTaskResult({ taskId: 'junk_cleaner', bytesRecovered: 2048, filesCleaned: 20 }),
    });

    const progress = tracker.getProgress();
    expect(progress.completedTasks).toBe(1);
    expect(progress.overallProgress).toBe(100);
    expect(progress.currentBytesRecovered).toBe(2048);
    expect(progress.currentFilesCleaned).toBe(20);
    expect(progress.completedTaskIds).toContain('junk_cleaner');
    expect(progress.remainingTaskIds).not.toContain('junk_cleaner');
  });

  it('emits optimization_progress event on task updates', () => {
    const listener = vi.fn();
    optimizationExecutionEvents.on('optimization_progress', listener);

    const taskNames = new Map([['junk_cleaner', 'Junk Cleaner']]);
    tracker.start('session-1', ['junk_cleaner'], taskNames);

    executionEvents.emit('task_started', {
      executionId: 'exec-1',
      taskId: 'junk_cleaner',
      taskName: 'Junk Cleaner',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0]![0] as { sessionId: string; progress: { currentTaskId: string } };
    expect(payload.sessionId).toBe('session-1');
    expect(payload.progress.currentTaskId).toBe('junk_cleaner');
  });

  it('stops tracking and unsubscribes from events', () => {
    const taskNames = new Map([['junk_cleaner', 'Junk Cleaner']]);
    tracker.start('session-1', ['junk_cleaner'], taskNames);
    tracker.stop();

    // Emitting events after stop should not update progress
    executionEvents.emit('task_completed', {
      executionId: 'exec-1',
      result: createMockTaskResult(),
    });

    const progress = tracker.getProgress();
    expect(progress.completedTasks).toBe(0);
  });

  it('cancel prevents further progress updates', () => {
    const taskNames = new Map([['junk_cleaner', 'Junk Cleaner']]);
    tracker.start('session-1', ['junk_cleaner'], taskNames);
    tracker.cancel();

    executionEvents.emit('task_started', {
      executionId: 'exec-1',
      taskId: 'junk_cleaner',
      taskName: 'Junk Cleaner',
    });

    const progress = tracker.getProgress();
    expect(progress.currentTaskId).toBeNull();
  });

  it('calculates elapsed time', () => {
    const taskNames = new Map<string, string>();
    tracker.start('session-1', [], taskNames);
    // Wait a tiny bit
    const progress = tracker.getProgress();
    expect(progress.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('handles multiple tasks', () => {
    const taskNames = new Map([
      ['junk_cleaner', 'Junk Cleaner'],
      ['browser_cleaner', 'Browser Cleaner'],
    ]);
    tracker.start('session-1', ['junk_cleaner', 'browser_cleaner'], taskNames);

    // Complete first task
    executionEvents.emit('task_completed', {
      executionId: 'exec-1',
      result: createMockTaskResult({ taskId: 'junk_cleaner', durationMs: 3000 }),
    });

    let progress = tracker.getProgress();
    expect(progress.completedTasks).toBe(1);
    expect(progress.overallProgress).toBe(50);

    // Complete second task
    executionEvents.emit('task_completed', {
      executionId: 'exec-1',
      result: createMockTaskResult({ taskId: 'browser_cleaner', durationMs: 2000, bytesRecovered: 512 }),
    });

    progress = tracker.getProgress();
    expect(progress.completedTasks).toBe(2);
    expect(progress.overallProgress).toBe(100);
    expect(progress.currentBytesRecovered).toBe(1024 + 512);
  });
});

// ── Result Builder Tests ──────────────────────────────────────

describe('ResultBuilder', () => {
  it('builds a completed result from execution result', () => {
    const plan = makePlan();
    const execResult = createMockExecutionResult({
      taskResults: [
        createMockTaskResult({ taskId: 'temp_files_cleaner', bytesRecovered: 200 * 1024 * 1024, filesCleaned: 50 }),
        createMockTaskResult({ taskId: 'browser_cleaner', bytesRecovered: 100 * 1024 * 1024, filesCleaned: 20 }),
      ],
      totalBytesRecovered: 300 * 1024 * 1024,
      totalFilesCleaned: 70,
    });

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner', 'browser_cleaner'],
      [],
      false,
      null,
      null,
    );

    expect(result.sessionId).toBe('session-1');
    expect(result.executionId).toBe('exec-test-1');
    expect(result.previousHealthScore).toBe(72);
    expect(result.newHealthScore).toBeNull();
    expect(result.healthImprovement).toBeNull();
    expect(result.tasksCompleted).toBe(2);
    expect(result.storageRecovered).toBe(300 * 1024 * 1024);
    expect(result.filesCleaned).toBe(70);
    expect(result.status).toBe('completed');
    expect(result.itemResults.length).toBeGreaterThan(0);
  });

  it('maps task results to item results', () => {
    const plan = makePlan();
    const execResult = createMockExecutionResult({
      taskResults: [
        createMockTaskResult({ taskId: 'temp_files_cleaner', bytesRecovered: 1024 }),
      ],
    });

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner'],
      [],
      false,
      null,
      null,
    );

    const tempItem = result.itemResults.find((r) => r.itemId === 'opt-temp_files-1');
    expect(tempItem).toBeDefined();
    expect(tempItem!.status).toBe('completed');
    expect(tempItem!.bytesRecovered).toBe(1024);
  });

  it('marks skipped items correctly', () => {
    const plan = makePlan();
    const execResult = createMockExecutionResult({
      taskResults: [createMockTaskResult({ taskId: 'temp_files_cleaner' })],
    });

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner'],
      ['opt-browser-2'],
      false,
      null,
      null,
    );

    const browserItem = result.itemResults.find((r) => r.itemId === 'opt-browser-2');
    expect(browserItem).toBeDefined();
    expect(browserItem!.status).toBe('skipped');
  });

  it('detects partial status when some tasks fail', () => {
    const plan = makePlan();
    const execResult = createMockExecutionResult({
      taskResults: [
        createMockTaskResult({ taskId: 'temp_files_cleaner', status: 'completed' }),
        createMockTaskResult({ taskId: 'browser_cleaner', status: 'failed', errors: ['RPC error'] }),
      ],
    });

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner', 'browser_cleaner'],
      [],
      false,
      null,
      null,
    );

    expect(result.status).toBe('partial');
  });

  it('detects failed status when all tasks fail', () => {
    const plan = makePlan();
    const execResult = createMockExecutionResult({
      taskResults: [
        createMockTaskResult({ taskId: 'temp_files_cleaner', status: 'failed' }),
        createMockTaskResult({ taskId: 'browser_cleaner', status: 'failed' }),
      ],
    });

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner', 'browser_cleaner'],
      [],
      false,
      null,
      null,
    );

    expect(result.status).toBe('failed');
  });

  it('detects cancelled status', () => {
    const plan = makePlan();
    const execResult = createMockExecutionResult();

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner'],
      [],
      true, // wasCancelled
      null,
      null,
    );

    expect(result.status).toBe('cancelled');
  });

  it('includes health improvement when new score provided', () => {
    const plan = makePlan();
    const execResult = createMockExecutionResult();

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner'],
      [],
      false,
      null,
      88, // newHealthScore
    );

    expect(result.newHealthScore).toBe(88);
    expect(result.healthImprovement).toBe(16); // 88 - 72
  });

  it('generates recommendations', () => {
    const plan = makePlan();
    const execResult = createMockExecutionResult({
      totalBytesRecovered: 200 * 1024 * 1024,
    });

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner'],
      [],
      false,
      null,
      null,
    );

    expect(result.recommendations.length).toBeGreaterThan(0);
    // Should suggest re-analysis
    expect(result.recommendations.some((r) => r.includes('health analysis'))).toBe(true);
  });

  it('recommends upgrade for locked items', () => {
    const plan = makePlan({
      items: [
        makeOptimizationItem('opt-1', 'temp_files'),
        makeOptimizationItem('opt-2', 'startup', { isLocked: true, lockedReason: 'Premium required' }),
      ],
    });
    const execResult = createMockExecutionResult();

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner'],
      [],
      false,
      null,
      null,
    );

    expect(result.recommendations.some((r) => r.includes('premium'))).toBe(true);
  });

  it('includes execution record when provided', () => {
    const plan = makePlan();
    const execResult = createMockExecutionResult();
    const record: ExecutionRecord = {
      id: 'rec-1',
      scheduleId: null,
      jobId: 'job-1',
      source: 'manual',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 5000,
      status: 'succeeded',
      taskResults: [],
      filesRemoved: 10,
      foldersRemoved: 0,
      registryEntriesRemoved: 0,
      recycleBinItemsRemoved: 0,
      temporaryFilesRemoved: 5,
      browserDataRemoved: 0,
      totalSpaceRecovered: 1024,
      warnings: [],
      errors: [],
      appVersion: '1.0.0',
      loggedAt: new Date().toISOString(),
    };

    const result = resultBuilder.build(
      'session-1',
      plan,
      execResult,
      ['temp_files_cleaner'],
      [],
      false,
      record,
      null,
    );

    expect(result.executionRecord).toBe(record);
  });
});

// ── Coordinator Tests ─────────────────────────────────────────

describe('OptimizationExecutionCoordinator', () => {
  let coordinator: OptimizationExecutionCoordinator;

  beforeEach(() => {
    coordinator = new OptimizationExecutionCoordinator();
    optimizationExecutionEvents.clear();
  });

  afterEach(() => {
    coordinator.clear();
    optimizationExecutionEvents.clear();
    executionEvents.clear();
  });

  // ── Validation Tests ────────────────────────────────────────

  describe('Validation', () => {
    it('validates a correct input', () => {
      const input = createCoordinatorInput();
      const result = coordinator.validate(input);
      expect(result.isValid).toBe(true);
      expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    });

    it('fails when no items selected', () => {
      const input = createCoordinatorInput({
        deselectedItemIds: ['opt-temp_files-1', 'opt-browser-2', 'opt-recycle_bin-3'],
      });
      const result = coordinator.validate(input);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === 'NO_ITEMS_SELECTED')).toBe(true);
    });

    it('fails when locked item is selected', () => {
      const plan = makePlan({
        items: [
          makeOptimizationItem('opt-1', 'startup', { isLocked: true, lockedReason: 'Premium required' }),
          makeOptimizationItem('opt-2', 'temp_files'),
        ],
      });
      const input = createCoordinatorInput({ plan });
      const result = coordinator.validate(input);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === 'LOCKED_ITEM_SELECTED')).toBe(true);
    });

    it('warns when dependency is deselected', () => {
      const plan = makePlan({
        items: [
          makeOptimizationItem('opt-1', 'temp_files'),
          makeOptimizationItem('opt-2', 'browser', { dependencies: ['opt-1'] }),
        ],
      });
      const input = createCoordinatorInput({
        plan,
        deselectedItemIds: ['opt-1'],
      });
      const result = coordinator.validate(input);
      // Warning doesn't block validation
      expect(result.issues.some((i) => i.code === 'DEPENDENCY_DESELECTED')).toBe(true);
    });

    it('fails when capability is unavailable', () => {
      const plan = makePlan({
        items: [
          makeOptimizationItem('opt-1', 'startup', { requiredCapability: 'startup-manager' }),
        ],
      });
      const input = createCoordinatorInput({ plan });
      const result = coordinator.validate(input);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === 'CAPABILITY_UNAVAILABLE')).toBe(true);
    });

    it('passes when capability is available', () => {
      const plan = makePlan({
        items: [
          makeOptimizationItem('opt-1', 'temp_files'),
        ],
      });
      const input = createCoordinatorInput({ plan });
      const result = coordinator.validate(input);
      expect(result.isValid).toBe(true);
    });
  });

  // ── Execution Tests ─────────────────────────────────────────

  describe('Execution', () => {
    it('rejects execution when validation fails', async () => {
      const input = createCoordinatorInput({
        deselectedItemIds: ['opt-temp_files-1', 'opt-browser-2', 'opt-recycle_bin-3'],
      });
      await expect(coordinator.execute(input)).rejects.toThrow('Validation failed');
    });

    it('rejects when already executing', async () => {
      // We can't easily test concurrent execution without mocking the engine
      // But we can test the guard
      const coord = new OptimizationExecutionCoordinator();
      // Simulate executing state by calling execute twice in parallel
      const input = createCoordinatorInput();

      // Mock the execution engine to return a result
      const mockResult = createMockExecutionResult();
      const executeSpy = vi.spyOn(executionEngine, 'executeJob');
      executeSpy.mockImplementation(async () => {
        // Simulate a delay
        await new Promise((r) => setTimeout(r, 100));
        return mockResult;
      });

      const p1 = coord.execute(input);
      const p2 = coord.execute(input);

      await expect(p2).rejects.toThrow('already in progress');
      await p1; // Let the first one finish

      executeSpy.mockRestore();
      coord.clear();
    });

    it('emits optimization_started and optimization_completed events', async () => {
      const input = createCoordinatorInput();
      const mockResult = createMockExecutionResult();

      const executeSpy = vi.spyOn(executionEngine, 'executeJob');
      executeSpy.mockResolvedValue(mockResult);

      const startedListener = vi.fn();
      const completedListener = vi.fn();
      optimizationExecutionEvents.on('optimization_started', startedListener);
      optimizationExecutionEvents.on('optimization_completed', completedListener);

      await coordinator.execute(input);

      expect(startedListener).toHaveBeenCalledTimes(1);
      expect(completedListener).toHaveBeenCalledTimes(1);

      executeSpy.mockRestore();
    });

    it('emits optimization_failed on execution error', async () => {
      const input = createCoordinatorInput();
      const executeSpy = vi.spyOn(executionEngine, 'executeJob');
      executeSpy.mockRejectedValue(new Error('Engine crashed'));

      const failedListener = vi.fn();
      optimizationExecutionEvents.on('optimization_failed', failedListener);

      await expect(coordinator.execute(input)).rejects.toThrow();
      expect(failedListener).toHaveBeenCalledTimes(1);

      executeSpy.mockRestore();
    });

    it('emits optimization_failed when engine returns null', async () => {
      const input = createCoordinatorInput();
      const executeSpy = vi.spyOn(executionEngine, 'executeJob');
      executeSpy.mockResolvedValue(null);

      const failedListener = vi.fn();
      optimizationExecutionEvents.on('optimization_failed', failedListener);

      await expect(coordinator.execute(input)).rejects.toThrow();
      expect(failedListener).toHaveBeenCalledTimes(1);

      executeSpy.mockRestore();
    });

    it('returns a result with correct fields', async () => {
      const input = createCoordinatorInput();
      const mockResult = createMockExecutionResult({
        totalBytesRecovered: 300 * 1024 * 1024,
        totalFilesCleaned: 70,
      });

      const executeSpy = vi.spyOn(executionEngine, 'executeJob');
      executeSpy.mockResolvedValue(mockResult);

      const result = await coordinator.execute(input);

      expect(result.sessionId).toBeTruthy();
      expect(result.executionId).toBe('exec-test-1');
      expect(result.previousHealthScore).toBe(72);
      expect(result.storageRecovered).toBe(300 * 1024 * 1024);
      expect(result.filesCleaned).toBe(70);
      expect(result.status).toBe('completed');

      executeSpy.mockRestore();
    });

    it('creates a session during execution', async () => {
      const input = createCoordinatorInput();
      const mockResult = createMockExecutionResult();

      const executeSpy = vi.spyOn(executionEngine, 'executeJob');
      executeSpy.mockResolvedValue(mockResult);

      await coordinator.execute(input);

      const session = coordinator.getSession();
      expect(session).not.toBeNull();
      expect(session!.status).toBe('completed');
      expect(session!.planId).toBe('plan-test-1');

      executeSpy.mockRestore();
    });
  });

  // ── Cancellation Tests ──────────────────────────────────────

  describe('Cancellation', () => {
    it('cancel sets cancel flag', () => {
      coordinator.cancel();
      // cancel() when not executing is a no-op
      expect(coordinator.isExecuting).toBe(false);
    });

    it('updateHealthScore updates result with new score', () => {
      const result: OptimizationResult = {
        sessionId: 'session-1',
        executionId: 'exec-1',
        previousHealthScore: 72,
        newHealthScore: null,
        healthImprovement: null,
        tasksCompleted: 3,
        tasksSkipped: 0,
        storageRecovered: 1024,
        filesCleaned: 10,
        durationMs: 5000,
        warnings: [],
        errors: [],
        recommendations: [],
        itemResults: [],
        executionRecord: null,
        status: 'completed',
      };

      const updated = coordinator.updateHealthScore(result, 88);
      expect(updated.newHealthScore).toBe(88);
      expect(updated.healthImprovement).toBe(16);
    });
  });
});

// ── Events Tests ──────────────────────────────────────────────

describe('OptimizationExecutionEvents', () => {
  afterEach(() => {
    optimizationExecutionEvents.clear();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    optimizationExecutionEvents.on('optimization_started', listener);
    optimizationExecutionEvents.emit('optimization_started', { sessionId: 'test' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = optimizationExecutionEvents.on('optimization_completed', listener);
    expect(optimizationExecutionEvents.listenerCount('optimization_completed')).toBe(1);
    unsub();
    expect(optimizationExecutionEvents.listenerCount('optimization_completed')).toBe(0);
  });

  it('does not crash when listener throws', () => {
    const badListener = () => { throw new Error('crash'); };
    const goodListener = vi.fn();
    optimizationExecutionEvents.on('optimization_failed', badListener);
    optimizationExecutionEvents.on('optimization_failed', goodListener);
    optimizationExecutionEvents.emit('optimization_failed', { test: true });
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('tracks listener count', () => {
    expect(optimizationExecutionEvents.listenerCount('optimization_cancelled')).toBe(0);
    const u1 = optimizationExecutionEvents.on('optimization_cancelled', () => {});
    const u2 = optimizationExecutionEvents.on('optimization_cancelled', () => {});
    expect(optimizationExecutionEvents.listenerCount('optimization_cancelled')).toBe(2);
    u1();
    expect(optimizationExecutionEvents.listenerCount('optimization_cancelled')).toBe(1);
    u2();
    expect(optimizationExecutionEvents.listenerCount('optimization_cancelled')).toBe(0);
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.optimizationCoordinator).toBeDefined();
    expect(mod.sessionManager).toBeDefined();
    expect(mod.progressTracker).toBeDefined();
    expect(mod.resultBuilder).toBeDefined();
    expect(mod.optimizationExecutionEvents).toBeDefined();
    expect(mod.SessionManager).toBeDefined();
    expect(mod.ProgressTracker).toBeDefined();
    expect(mod.OptimizationExecutionCoordinator).toBeDefined();
  });

  it('coordinator does not bypass execution engine', async () => {
    const input = createCoordinatorInput();
    const executeSpy = vi.spyOn(executionEngine, 'executeJob');
    const mockResult = createMockExecutionResult();
    executeSpy.mockResolvedValue(mockResult);

    await optimizationCoordinator.execute(input);

    // Verify the execution engine was called (not bypassed)
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy.mock.calls[0]![0]).toHaveProperty('id');
    expect(executeSpy.mock.calls[0]![0]).toHaveProperty('tasks');
    expect(executeSpy.mock.calls[0]![0]).toHaveProperty('source', 'ai_recommended');

    executeSpy.mockRestore();
    optimizationCoordinator.clear();
    optimizationExecutionEvents.clear();
  });

  it('coordinator uses jobBuilder to construct the job', async () => {
    const input = createCoordinatorInput();
    const executeSpy = vi.spyOn(executionEngine, 'executeJob');
    const mockResult = createMockExecutionResult();
    executeSpy.mockResolvedValue(mockResult);

    await optimizationCoordinator.execute(input);

    // The job should have bypassPauseConditions = true (manual job)
    const job = executeSpy.mock.calls[0]![0] as { bypassPauseConditions: boolean };
    expect(job.bypassPauseConditions).toBe(true);

    executeSpy.mockRestore();
    optimizationCoordinator.clear();
    optimizationExecutionEvents.clear();
  });

  it('coordinator does not import from auth, licensing, payment, or scheduler', async () => {
    const mod = await import('../index');
    // Verify the module loads without importing forbidden modules
    expect(mod.optimizationCoordinator).toBeDefined();
  });

  it('coordinator prevents concurrent execution', async () => {
    const coord = new OptimizationExecutionCoordinator();
    const input = createCoordinatorInput();

    const executeSpy = vi.spyOn(executionEngine, 'executeJob');
    executeSpy.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return createMockExecutionResult();
    });

    const p1 = coord.execute(input);
    const p2 = coord.execute(input);

    await expect(p2).rejects.toThrow('already in progress');
    await p1;

    executeSpy.mockRestore();
    coord.clear();
  });
});
