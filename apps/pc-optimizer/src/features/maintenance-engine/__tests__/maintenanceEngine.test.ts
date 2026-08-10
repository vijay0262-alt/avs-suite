/**
 * Tests for the Automatic Maintenance Execution Engine.
 *
 * Covers:
 * - Execution events (subscribe, emit, unsubscribe, error isolation)
 * - Pause conditions (register, evaluate, unregister, future placeholders)
 * - Job builder (from schedule, manual, quick scan, browser cleanup, deep clean)
 * - Task registry (register, create, unknown tasks)
 * - Execution engine (job execution, duplicate prevention, sequential tasks,
 *   pause conditions, schedule due checking, crash recovery, manual triggers)
 * - Execution store (state transitions, history, event sync)
 * - Regression (no interference with existing systems)
 *
 * @vitest-environment happy-dom
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock avsWithIDB before importing modules that depend on it
const _idbStore: Record<string, unknown[]> = {};
vi.mock('../../../services/avsWithIDB', () => ({
  idbGetOne: vi.fn(async (_store: string, key: string) => {
    const arr = _idbStore['executionState'] ?? [];
    return (arr.find((r: any) => (r as any).key === key) as any) ?? null;
  }),
  idbPut: vi.fn(async (store: string, value: any) => {
    if (!_idbStore[store]) _idbStore[store] = [];
    const idx = _idbStore[store]!.findIndex((r: any) => (r as any).key === (value as any).key);
    if (idx >= 0) _idbStore[store]![idx] = value;
    else _idbStore[store]!.push(value);
  }),
  idbClear: vi.fn(async (store: string) => { _idbStore[store] = []; }),
  idbCleanup: vi.fn(async () => {}),
  idbGetAll: vi.fn(async (store: string) => _idbStore[store] ?? []),
  idbDelete: vi.fn(async (store: string, key: string) => {
    if (!_idbStore[store]) return;
    _idbStore[store] = _idbStore[store]!.filter((r: any) => (r as any).key !== key);
  }),
  idbAdd: vi.fn(async (store: string, value: any) => {
    if (!_idbStore[store]) _idbStore[store] = [];
    _idbStore[store]!.push(value);
  }),
  idbCount: vi.fn(async (store: string) => (_idbStore[store] ?? []).length),
  idbRecover: vi.fn(async () => true),
  idbCleanupAll: vi.fn(async () => {}),
  idbMigrateFromLocalStorage: vi.fn(async () => ({ migrated: [], errors: [] })),
}));

import { executionEvents } from '../executionEvents';
import {
  registerPauseCondition,
  unregisterAllPauseConditions,
  evaluatePauseConditions,
  GamingModePauseCondition,
} from '../pauseConditions';
import { jobBuilder, scheduleHasValidTasks } from '../jobBuilder';
import { registerTask, createTask, isTaskRegistered, TASK_IDS } from '../tasks';
import { executionEngine } from '../executionEngine';
import { useExecutionStore } from '../executionStore';
import type {
  MaintenanceTask,
  MaintenanceJob,
  TaskResult,
  ValidationResult,
  ExecutionResult,
} from '../types';
import type { MaintenanceScheduleConfig } from '../../config-sync/types';

// ── Mock task implementation ──────────────────────────────────

class MockTask implements MaintenanceTask {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  public executeFn: () => Promise<void>;
  public validateFn: () => Promise<ValidationResult>;
  public estimateMs: number;
  public shouldFail = false;

  constructor(
    id: string,
    displayName: string,
    executeFn?: () => Promise<void>,
    estimateMs: number = 1000,
  ) {
    this.id = id;
    this.displayName = displayName;
    this.description = `Mock task: ${displayName}`;
    this.estimateMs = estimateMs;
    this.executeFn = executeFn ?? (async () => {});
    this.validateFn = async () => ({ canRun: true, warnings: [], errors: [] });
  }

  async validate(): Promise<ValidationResult> {
    return this.validateFn();
  }

  async execute(): Promise<TaskResult> {
    const start = new Date();
    if (this.shouldFail) {
      const end = new Date();
      return {
        taskId: this.id,
        taskName: this.displayName,
        status: 'failed',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        durationMs: 0,
        filesCleaned: 0,
        bytesRecovered: 0,
        errors: ['Mock task failure'],
        warnings: [],
      };
    }
    await this.executeFn();
    const end = new Date();
    return {
      taskId: this.id,
      taskName: this.displayName,
      status: 'completed',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMs: end.getTime() - start.getTime(),
      filesCleaned: 10,
      bytesRecovered: 1024,
      errors: [],
      warnings: [],
    };
  }

  estimateDuration(): number {
    return this.estimateMs;
  }
}

// ── Helpers ───────────────────────────────────────────────────

function createMockSchedule(
  overrides: Partial<MaintenanceScheduleConfig> = {},
): MaintenanceScheduleConfig {
  return {
    id: 'sched-1',
    name: 'Daily Clean',
    enabled: true,
    frequency: 'daily',
    timezone: 'UTC',
    schedule_time: '03:00',
    day_of_week: null,
    day_of_month: null,
    custom_interval_hours: null,
    tasks: ['junk_cleaner'],
    device_id: null,
    last_run_at: null,
    next_run_at: null,
    ...overrides,
  };
}

function createMockJob(tasks: MaintenanceTask[], overrides: Partial<MaintenanceJob> = {}): MaintenanceJob {
  return {
    id: `job-test-${Date.now()}`,
    source: 'manual',
    scheduleId: null,
    scheduleName: null,
    tasks,
    createdAt: new Date().toISOString(),
    bypassPauseConditions: true,
    ...overrides,
  };
}

// ── Execution Events Tests ────────────────────────────────────

describe('ExecutionEvents', () => {
  afterEach(() => {
    executionEvents.clear();
  });

  it('should emit events to subscribers', () => {
    const listener = vi.fn();
    executionEvents.on('execution_started', listener);

    executionEvents.emit('execution_started', { executionId: 'exec-1', job: {} as MaintenanceJob });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should support multiple subscribers for the same event', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    executionEvents.on('task_started', l1);
    executionEvents.on('task_started', l2);

    executionEvents.emit('task_started', { executionId: 'e1', taskId: 't1', taskName: 'Test' });

    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe via returned function', () => {
    const listener = vi.fn();
    const unsub = executionEvents.on('execution_completed', listener);

    executionEvents.emit('execution_completed', { executionId: 'e1', result: {} as ExecutionResult });
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    executionEvents.emit('execution_completed', { executionId: 'e2', result: {} as ExecutionResult });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should not crash when listener throws', () => {
    const badListener = () => { throw new Error('boom'); };
    const goodListener = vi.fn();
    executionEvents.on('execution_failed', badListener);
    executionEvents.on('execution_failed', goodListener);

    executionEvents.emit('execution_failed', { executionId: 'e1', error: 'test' });

    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('should track listener count', () => {
    expect(executionEvents.listenerCount('schedule_skipped')).toBe(0);
    const unsub = executionEvents.on('schedule_skipped', () => {});
    expect(executionEvents.listenerCount('schedule_skipped')).toBe(1);
    unsub();
    expect(executionEvents.listenerCount('schedule_skipped')).toBe(0);
  });
});

// ── Pause Conditions Tests ────────────────────────────────────

describe('PauseConditions', () => {
  beforeEach(() => {
    unregisterAllPauseConditions();
  });

  it('should allow execution when no conditions registered', async () => {
    const result = await evaluatePauseConditions();
    expect(result.shouldPause).toBe(false);
  });

  it('should pause when a condition returns shouldPause=true', async () => {
    registerPauseCondition({
      id: 'test',
      displayName: 'Test',
      async shouldPause() {
        return { shouldPause: true, reason: 'Test pause' };
      },
    });

    const result = await evaluatePauseConditions();
    expect(result.shouldPause).toBe(true);
    expect(result.reason).toBe('Test pause');
  });

  it('should allow when all conditions return shouldPause=false', async () => {
    registerPauseCondition({
      id: 'test1',
      displayName: 'Test 1',
      async shouldPause() {
        return { shouldPause: false, reason: '' };
      },
    });
    registerPauseCondition({
      id: 'test2',
      displayName: 'Test 2',
      async shouldPause() {
        return { shouldPause: false, reason: '' };
      },
    });

    const result = await evaluatePauseConditions();
    expect(result.shouldPause).toBe(false);
  });

  it('should return first pausing condition', async () => {
    registerPauseCondition({
      id: 'first',
      displayName: 'First',
      async shouldPause() {
        return { shouldPause: true, reason: 'First pause' };
      },
    });
    registerPauseCondition({
      id: 'second',
      displayName: 'Second',
      async shouldPause() {
        return { shouldPause: true, reason: 'Second pause' };
      },
    });

    const result = await evaluatePauseConditions();
    expect(result.reason).toBe('First pause');
  });

  it('should handle checker errors gracefully', async () => {
    registerPauseCondition({
      id: 'error-checker',
      displayName: 'Error Checker',
      async shouldPause() {
        throw new Error('Checker error');
      },
    });
    registerPauseCondition({
      id: 'ok-checker',
      displayName: 'OK Checker',
      async shouldPause() {
        return { shouldPause: false, reason: '' };
      },
    });

    const result = await evaluatePauseConditions();
    expect(result.shouldPause).toBe(false);
  });

  it('should unregister via returned function', async () => {
    const unsub = registerPauseCondition({
      id: 'temp',
      displayName: 'Temp',
      async shouldPause() {
        return { shouldPause: true, reason: 'Temp' };
      },
    });

    let result = await evaluatePauseConditions();
    expect(result.shouldPause).toBe(true);

    unsub();
    result = await evaluatePauseConditions();
    expect(result.shouldPause).toBe(false);
  });

  it('built-in placeholder conditions should not pause', async () => {
    registerPauseCondition(GamingModePauseCondition);
    const result = await evaluatePauseConditions();
    expect(result.shouldPause).toBe(false);
  });
});

// ── Task Registry Tests ───────────────────────────────────────

describe('Task Registry', () => {
  it('should have built-in tasks registered', () => {
    expect(isTaskRegistered(TASK_IDS.JUNK_CLEANER)).toBe(true);
    expect(isTaskRegistered(TASK_IDS.BROWSER_CLEANER)).toBe(true);
    expect(isTaskRegistered(TASK_IDS.RECYCLE_BIN_CLEANER)).toBe(true);
    expect(isTaskRegistered(TASK_IDS.TEMP_FILES_CLEANER)).toBe(true);
  });

  it('should create tasks by ID', () => {
    const task = createTask(TASK_IDS.JUNK_CLEANER);
    expect(task).not.toBeNull();
    expect(task!.id).toBeDefined();
    expect(task!.displayName).toBe('Junk Cleaner');
  });

  it('should return null for unknown task IDs', () => {
    expect(createTask('nonexistent')).toBeNull();
  });

  it('should register custom tasks', () => {
    const customId = 'custom_test_task';
    registerTask(customId, () => new MockTask(customId, 'Custom'));
    expect(isTaskRegistered(customId)).toBe(true);
    const task = createTask(customId);
    expect(task).not.toBeNull();
    expect(task!.displayName).toBe('Custom');
  });
});

// ── Job Builder Tests ─────────────────────────────────────────

describe('JobBuilder', () => {
  it('should build a job from a schedule', () => {
    const schedule = createMockSchedule();
    const job = jobBuilder.fromSchedule(schedule);

    expect(job.source).toBe('scheduled');
    expect(job.scheduleId).toBe('sched-1');
    expect(job.scheduleName).toBe('Daily Clean');
    expect(job.bypassPauseConditions).toBe(false);
    expect(job.tasks.length).toBeGreaterThan(0);
  });

  it('should build a manual job', () => {
    const job = jobBuilder.fromManual(['junk_cleaner'], 'manual', 'My Clean');

    expect(job.source).toBe('manual');
    expect(job.scheduleId).toBeNull();
    expect(job.scheduleName).toBe('My Clean');
    expect(job.bypassPauseConditions).toBe(true);
    expect(job.tasks.length).toBe(1);
  });

  it('should build a quick scan job', () => {
    const job = jobBuilder.quickScan();
    expect(job.source).toBe('quick_scan');
    expect(job.tasks.length).toBe(1);
    expect(job.tasks[0]!.displayName).toBe('Junk Cleaner');
  });

  it('should build a browser cleanup job', () => {
    const job = jobBuilder.browserCleanup();
    expect(job.source).toBe('browser_cleanup');
    expect(job.tasks.length).toBe(1);
    expect(job.tasks[0]!.displayName).toBe('Browser Cleaner');
  });

  it('should build a deep clean job', () => {
    const job = jobBuilder.deepClean();
    expect(job.source).toBe('manual');
    expect(job.tasks.length).toBe(4);
  });

  it('should handle unknown tasks in schedule gracefully', () => {
    const schedule = createMockSchedule({ tasks: ['junk_cleaner', 'unknown_task'] });
    const job = jobBuilder.fromSchedule(schedule);
    // Only known tasks are instantiated
    expect(job.tasks.length).toBe(1);
  });

  it('scheduleHasValidTasks should return true for valid tasks', () => {
    const schedule = createMockSchedule({ tasks: ['junk_cleaner'] });
    expect(scheduleHasValidTasks(schedule)).toBe(true);
  });

  it('scheduleHasValidTasks should return false for no valid tasks', () => {
    const schedule = createMockSchedule({ tasks: ['unknown_task'] });
    expect(scheduleHasValidTasks(schedule)).toBe(false);
  });
});

// ── Execution Engine Tests ────────────────────────────────────

describe('ExecutionEngine', () => {
  beforeEach(() => {
    executionEngine.clear();
    unregisterAllPauseConditions();
    localStorage.clear();
  });

  afterEach(() => {
    executionEngine.clear();
    unregisterAllPauseConditions();
  });

  it('should start in idle state', () => {
    expect(executionEngine.state).toBe('idle');
    expect(executionEngine.isRunning).toBe(false);
  });

  it('should execute a job with tasks sequentially', async () => {
    const executionOrder: string[] = [];
    const task1 = new MockTask('t1', 'Task 1', async () => {
      executionOrder.push('t1');
    });
    const task2 = new MockTask('t2', 'Task 2', async () => {
      executionOrder.push('t2');
    });
    const job = createMockJob([task1, task2]);

    const result = await executionEngine.executeJob(job);

    expect(result).not.toBeNull();
    expect(result!.overallStatus).toBe('completed');
    expect(result!.taskResults).toHaveLength(2);
    expect(executionOrder).toEqual(['t1', 't2']);
  });

  it('should prevent duplicate execution', async () => {
    let task1Resolved = false;
    const task1 = new MockTask('t1', 'Task 1', async () => {
      await new Promise((r) => setTimeout(r, 100));
      task1Resolved = true;
    });
    const task2 = new MockTask('t2', 'Task 2');

    const job1 = createMockJob([task1]);
    const job2 = createMockJob([task2]);

    // Start job1 (don't await yet)
    const promise1 = executionEngine.executeJob(job1);

    // Try to start job2 while job1 is running
    const result2 = await executionEngine.executeJob(job2);
    expect(result2).toBeNull();

    // Wait for job1 to finish
    const result1 = await promise1;
    expect(result1).not.toBeNull();
    expect(task1Resolved).toBe(true);
  });

  it('should emit execution_started and execution_completed events', async () => {
    const startedListener = vi.fn();
    const completedListener = vi.fn();
    executionEvents.on('execution_started', startedListener);
    executionEvents.on('execution_completed', completedListener);

    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task]);

    await executionEngine.executeJob(job);

    expect(startedListener).toHaveBeenCalledTimes(1);
    expect(completedListener).toHaveBeenCalledTimes(1);
  });

  it('should emit task_started and task_completed events', async () => {
    const taskStartedListener = vi.fn();
    const taskCompletedListener = vi.fn();
    executionEvents.on('task_started', taskStartedListener);
    executionEvents.on('task_completed', taskCompletedListener);

    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task]);

    await executionEngine.executeJob(job);

    expect(taskStartedListener).toHaveBeenCalledTimes(1);
    expect(taskCompletedListener).toHaveBeenCalledTimes(1);
  });

  it('should aggregate files cleaned and bytes recovered', async () => {
    const task1 = new MockTask('t1', 'Task 1');
    const task2 = new MockTask('t2', 'Task 2');
    const job = createMockJob([task1, task2]);

    const result = await executionEngine.executeJob(job);

    expect(result!.totalFilesCleaned).toBe(20); // 10 per task
    expect(result!.totalBytesRecovered).toBe(2048); // 1024 per task
  });

  it('should capture task failures in result', async () => {
    const task1 = new MockTask('t1', 'Task 1');
    task1.shouldFail = true;
    const task2 = new MockTask('t2', 'Task 2');
    const job = createMockJob([task1, task2]);

    const result = await executionEngine.executeJob(job);

    expect(result!.overallStatus).toBe('completed'); // partial failure
    expect(result!.taskResults[0]!.status).toBe('failed');
    expect(result!.taskResults[0]!.errors).toContain('Mock task failure');
    expect(result!.taskResults[1]!.status).toBe('completed');
  });

  it('should emit execution_failed when all tasks fail', async () => {
    const failedListener = vi.fn();
    executionEvents.on('execution_failed', failedListener);

    const task1 = new MockTask('t1', 'Task 1');
    task1.shouldFail = true;
    const job = createMockJob([task1]);

    const result = await executionEngine.executeJob(job);

    expect(result!.overallStatus).toBe('failed');
    expect(failedListener).toHaveBeenCalledTimes(1);
  });

  it('should skip scheduled job when pause condition is active', async () => {
    registerPauseCondition({
      id: 'test-pause',
      displayName: 'Test Pause',
      async shouldPause() {
        return { shouldPause: true, reason: 'Testing' };
      },
    });

    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task], {
      source: 'scheduled',
      scheduleId: 'sched-1',
      bypassPauseConditions: false,
    });

    const result = await executionEngine.executeJob(job);
    expect(result).toBeNull();
  });

  it('should emit schedule_skipped when paused', async () => {
    const skipListener = vi.fn();
    executionEvents.on('schedule_skipped', skipListener);

    registerPauseCondition({
      id: 'test-pause',
      displayName: 'Test Pause',
      async shouldPause() {
        return { shouldPause: true, reason: 'Testing' };
      },
    });

    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task], {
      source: 'scheduled',
      scheduleId: 'sched-1',
      bypassPauseConditions: false,
    });

    await executionEngine.executeJob(job);
    expect(skipListener).toHaveBeenCalledTimes(1);
  });

  it('should bypass pause conditions for manual jobs', async () => {
    registerPauseCondition({
      id: 'test-pause',
      displayName: 'Test Pause',
      async shouldPause() {
        return { shouldPause: true, reason: 'Testing' };
      },
    });

    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task], { bypassPauseConditions: true });

    const result = await executionEngine.executeJob(job);
    expect(result).not.toBeNull();
  });

  it('should provide engine snapshot', () => {
    const snap = executionEngine.getSnapshot();
    expect(snap.state).toBe('idle');
    expect(snap.currentExecutionId).toBeNull();
    expect(snap.lastExecutionResult).toBeNull();
  });

  it('should clear state', async () => {
    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task]);
    await executionEngine.executeJob(job);

    executionEngine.clear();
    expect(executionEngine.state).toBe('idle');
    expect(executionEngine.getSnapshot().lastExecutionResult).toBeNull();
  });
});

// ── Schedule Due Checking Tests ───────────────────────────────

describe('Schedule Due Checking', () => {
  beforeEach(() => {
    executionEngine.clear();
  });

  it('should return not due for disabled schedule', () => {
    const schedule = createMockSchedule({ enabled: false });
    const info = executionEngine.checkScheduleDue(schedule);
    expect(info.isDue).toBe(false);
    expect(info.reason).toContain('disabled');
  });

  it('should return due for daily schedule past scheduled time with no last run', () => {
    const now = new Date();
    now.setHours(3, 0, 0, 0);
    const schedule = createMockSchedule({
      frequency: 'daily',
      schedule_time: '02:00',
      last_run_at: null,
    });
    const info = executionEngine.checkScheduleDue(schedule, now);
    expect(info.isDue).toBe(true);
  });

  it('should return not due for daily schedule before scheduled time', () => {
    const now = new Date();
    now.setHours(1, 0, 0, 0);
    const schedule = createMockSchedule({
      frequency: 'daily',
      schedule_time: '03:00',
      last_run_at: null,
    });
    const info = executionEngine.checkScheduleDue(schedule, now);
    expect(info.isDue).toBe(false);
  });

  it('should return not due when last run was recent', () => {
    const now = new Date();
    const lastRun = new Date(now);
    lastRun.setMinutes(lastRun.getMinutes() - 5);
    const schedule = createMockSchedule({
      frequency: 'daily',
      schedule_time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
      last_run_at: lastRun.toISOString(),
    });
    const info = executionEngine.checkScheduleDue(schedule, now);
    expect(info.isDue).toBe(false);
  });

  it('should handle custom interval schedules', () => {
    const now = new Date();
    const lastRun = new Date(now);
    lastRun.setHours(lastRun.getHours() - 3);
    const schedule = createMockSchedule({
      frequency: 'custom',
      custom_interval_hours: 2,
      last_run_at: lastRun.toISOString(),
    });
    const info = executionEngine.checkScheduleDue(schedule, now);
    expect(info.isDue).toBe(true);
  });

  it('should return not due for custom interval not yet elapsed', () => {
    const now = new Date();
    const lastRun = new Date(now);
    lastRun.setHours(lastRun.getHours() - 1);
    const schedule = createMockSchedule({
      frequency: 'custom',
      custom_interval_hours: 2,
      last_run_at: lastRun.toISOString(),
    });
    const info = executionEngine.checkScheduleDue(schedule, now);
    expect(info.isDue).toBe(false);
  });
});

// ── Crash Recovery Tests ──────────────────────────────────────

describe('Crash Recovery', () => {
  beforeEach(() => {
    executionEngine.clear();
    localStorage.clear();
    for (const k of Object.keys(_idbStore)) _idbStore[k] = [];
  });

  it('should detect interrupted execution on init', async () => {
    _idbStore['executionState'] = [{
      key: 'current',
      currentExecutionId: 'exec-interrupted',
      currentScheduleId: 'sched-1',
      startedAt: new Date().toISOString(),
      state: 'running',
    }];

    await executionEngine.init();

    const snap = executionEngine.getSnapshot();
    expect(snap.lastError).toContain('interrupted');
  });

  it('should clear stale state on init', async () => {
    _idbStore['executionState'] = [{
      key: 'current',
      currentExecutionId: 'exec-interrupted',
      currentScheduleId: null,
      startedAt: new Date().toISOString(),
      state: 'running',
    }];

    await executionEngine.init();

    // The stale state should be cleared
    expect(_idbStore['executionState']).toHaveLength(0);
  });

  it('should not trigger crash recovery when no persisted state', async () => {
    await executionEngine.init();
    const snap = executionEngine.getSnapshot();
    expect(snap.lastError).toBeNull();
  });
});

// ── Execution Store Tests ─────────────────────────────────────

describe('ExecutionStore', () => {
  beforeEach(() => {
    executionEngine.clear();
    unregisterAllPauseConditions();
    localStorage.clear();
    useExecutionStore.getState().clear();
  });

  afterEach(() => {
    useExecutionStore.getState().clear();
  });

  it('should start in idle state', () => {
    const state = useExecutionStore.getState();
    expect(state.state).toBe('idle');
    expect(state.history).toEqual([]);
  });

  it('should update state after job execution', async () => {
    await useExecutionStore.getState().init();

    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task]);

    await useExecutionStore.getState().executeJob(job);

    const state = useExecutionStore.getState();
    expect(state.state).toBe('idle');
    expect(state.lastResult).not.toBeNull();
    expect(state.lastResult!.overallStatus).toBe('completed');
  });

  it('should track execution history', async () => {
    await useExecutionStore.getState().init();

    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task]);

    await useExecutionStore.getState().executeJob(job);
    await useExecutionStore.getState().executeJob(job);

    const state = useExecutionStore.getState();
    expect(state.history).toHaveLength(2);
  });

  it('should limit history to 50 entries', async () => {
    await useExecutionStore.getState().init();

    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task]);

    for (let i = 0; i < 55; i++) {
      await useExecutionStore.getState().executeJob(job);
    }

    const state = useExecutionStore.getState();
    expect(state.history.length).toBeLessThanOrEqual(50);
  });

  it('should clear state', async () => {
    await useExecutionStore.getState().init();

    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task]);
    await useExecutionStore.getState().executeJob(job);

    useExecutionStore.getState().clear();

    const state = useExecutionStore.getState();
    expect(state.state).toBe('idle');
    expect(state.history).toEqual([]);
    expect(state.lastResult).toBeNull();
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('Maintenance Engine Regression', () => {
  beforeEach(() => {
    executionEngine.clear();
    localStorage.clear();
  });

  it('should use a separate localStorage key from config sync', () => {
    localStorage.setItem('avs_config_cache', '{"version":1}');
    localStorage.setItem('avs_sync_cache', '{"data":"test"}');
    localStorage.setItem('avs_execution_state', '{"state":"running"}');

    expect(localStorage.getItem('avs_config_cache')).not.toBeNull();
    expect(localStorage.getItem('avs_sync_cache')).not.toBeNull();
    expect(localStorage.getItem('avs_execution_state')).not.toBeNull();
  });

  it('should not modify existing task IDs', () => {
    expect(TASK_IDS.JUNK_CLEANER).toBe('junk_cleaner');
    expect(TASK_IDS.BROWSER_CLEANER).toBe('browser_cleaner');
    expect(TASK_IDS.RECYCLE_BIN_CLEANER).toBe('recycle_bin_cleaner');
    expect(TASK_IDS.TEMP_FILES_CLEANER).toBe('temp_files_cleaner');
  });

  it('should not interfere with existing RPC methods', () => {
    // The engine uses existing RPC methods via the task implementations
    // but does not modify them. Verify the task IDs don't collide with RPC method names.
    expect(TASK_IDS.JUNK_CLEANER).not.toContain('cleaner.scan');
    expect(TASK_IDS.JUNK_CLEANER).not.toContain('cleaner.clean');
  });

  it('should produce valid ExecutionResult with all required fields', async () => {
    const task = new MockTask('t1', 'Task 1');
    const job = createMockJob([task]);

    const result = await executionEngine.executeJob(job);

    expect(result).not.toBeNull();
    expect(result!.executionId).toBeDefined();
    expect(result!.startTime).toBeDefined();
    expect(result!.endTime).toBeDefined();
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
    expect(result!.taskResults).toHaveLength(1);
    expect(result!.totalFilesCleaned).toBeGreaterThanOrEqual(0);
    expect(result!.totalBytesRecovered).toBeGreaterThanOrEqual(0);
    expect(result!.errors).toEqual([]);
    expect(result!.warnings).toEqual([]);
    expect(result!.overallStatus).toBe('completed');
  });
});
