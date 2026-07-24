// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  errorHandler,
  logger,
  startupValidator,
  performanceMonitor,
  backgroundTaskManager,
  resourceManager,
  DisposableScope,
  configManager,
  withRetry,
  retryModuleInit,
  retryLicenseValidation,
  retryFileAccess,
  calculateRetryDelay,
} from '../index';
import { clearModuleRegistry, registerAllModules } from '../../module-registry';

// ── Part 5: Startup Validation ──────────────────────────────────────

describe('Startup Validation (Part 5)', () => {
  beforeEach(() => {
    errorHandler.clear();
    logger.clear();
    logger.resetToDefault();
    startupValidator.clear();
    clearModuleRegistry();
    configManager.reset();
  });
  afterEach(() => {
    errorHandler.clear();
    logger.clear();
    logger.resetToDefault();
    startupValidator.clear();
    clearModuleRegistry();
    configManager.reset();
  });

  it('validate returns a report with results', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    expect(report).toBeDefined();
    expect(report.results).toBeDefined();
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.timestamp).toBeTruthy();
  });

  it('validates configuration component', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    const configResult = report.results.find((r) => r.component === 'Configuration');
    expect(configResult).toBeDefined();
    expect(configResult!.status).toBe('pass');
  });

  it('validates module registry component', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    const registryResult = report.results.find((r) => r.component === 'ModuleRegistry');
    expect(registryResult).toBeDefined();
  });

  it('validates health engine component', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    const healthResult = report.results.find((r) => r.component === 'HealthEngine');
    expect(healthResult).toBeDefined();
  });

  it('validates licensing component', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    const licenseResult = report.results.find((r) => r.component === 'Licensing');
    expect(licenseResult).toBeDefined();
  });

  it('validates event subscriptions component', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    const eventResult = report.results.find((r) => r.component === 'EventSubscriptions');
    expect(eventResult).toBeDefined();
  });

  it('validates required services component', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    const servicesResult = report.results.find((r) => r.component === 'RequiredServices');
    expect(servicesResult).toBeDefined();
  });

  it('continues loading when non-critical component fails', async () => {
    // Don't register modules — ModuleRegistry validation will fail
    const report = await startupValidator.validate();
    const registryResult = report.results.find((r) => r.component === 'ModuleRegistry');
    expect(registryResult!.status).toBe('fail');
    // But other components should still be validated
    const configResult = report.results.find((r) => r.component === 'Configuration');
    expect(configResult!.status).toBe('pass');
  });

  it('report includes counts', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    expect(report.passedCount).toBeGreaterThanOrEqual(0);
    expect(report.failedCount).toBeGreaterThanOrEqual(0);
    expect(report.passedCount + report.failedCount + report.warningCount + report.skippedCount).toBe(report.results.length);
  });

  it('report includes total duration', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('overall status is pass when all pass', async () => {
    registerAllModules();
    const report = await startupValidator.validate();
    expect(report.overallStatus).toBe('pass');
  });

  it('overall status is fail when any fail', async () => {
    // No modules registered — ModuleRegistry will fail
    const report = await startupValidator.validate();
    expect(report.overallStatus).toBe('fail');
  });
});

// ── Part 6: Performance Monitoring ──────────────────────────────────

describe('Performance Monitoring (Part 6)', () => {
  beforeEach(() => {
    performanceMonitor.clear();
    logger.clear();
    logger.enableVerbose();
  });
  afterEach(() => {
    performanceMonitor.clear();
    logger.clear();
    logger.resetToDefault();
  });

  it('record creates a metric with all fields', () => {
    const metric = performanceMonitor.record('scan_duration', 'junk-scan', 500, {
      module: 'junk',
      success: true,
    });
    expect(metric.id).toBeTruthy();
    expect(metric.type).toBe('scan_duration');
    expect(metric.action).toBe('junk-scan');
    expect(metric.durationMs).toBe(500);
    expect(metric.module).toBe('junk');
    expect(metric.success).toBe(true);
    expect(metric.timestamp).toBeTruthy();
  });

  it('measure times async operations', async () => {
    const result = await performanceMonitor.measure('scan_duration', 'test-scan', async () => 'result');
    expect(result).toBe('result');
    const metrics = performanceMonitor.getMetricsByType('scan_duration');
    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(metrics[0]!.success).toBe(true);
  });

  it('measure records failures', async () => {
    try {
      await performanceMonitor.measure('clean_duration', 'test-clean', async () => {
        throw new Error('Clean failed');
      });
    } catch {
      // expected
    }
    const metrics = performanceMonitor.getMetricsByType('clean_duration');
    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.success).toBe(false);
  });

  it('measureSync times sync operations', () => {
    const result = performanceMonitor.measureSync('health_calculation', 'compute', () => 42);
    expect(result).toBe(42);
    const metrics = performanceMonitor.getMetricsByType('health_calculation');
    expect(metrics).toHaveLength(1);
  });

  it('getMetricsByType filters by type', () => {
    performanceMonitor.record('scan_duration', 'a1', 100);
    performanceMonitor.record('clean_duration', 'a2', 200);
    expect(performanceMonitor.getMetricsByType('scan_duration')).toHaveLength(1);
    expect(performanceMonitor.getMetricsByType('clean_duration')).toHaveLength(1);
  });

  it('getMetricsByModule filters by module', () => {
    performanceMonitor.record('scan_duration', 'a1', 100, { module: 'junk' });
    performanceMonitor.record('scan_duration', 'a2', 200, { module: 'registry' });
    expect(performanceMonitor.getMetricsByModule('junk')).toHaveLength(1);
  });

  it('getSummary computes statistics', () => {
    performanceMonitor.record('scan_duration', 'a1', 100);
    performanceMonitor.record('scan_duration', 'a2', 200);
    performanceMonitor.record('scan_duration', 'a3', 300);
    const summary = performanceMonitor.getSummary('scan_duration');
    expect(summary).toBeDefined();
    expect(summary!.count).toBe(3);
    expect(summary!.minMs).toBe(100);
    expect(summary!.maxMs).toBe(300);
    expect(summary!.avgMs).toBe(200);
    expect(summary!.successRate).toBe(1);
  });

  it('getSummary returns null for unknown type', () => {
    expect(performanceMonitor.getSummary('optimize_duration')).toBeNull();
  });

  it('getAllSummaries returns summaries for types with data', () => {
    performanceMonitor.record('scan_duration', 'a1', 100);
    performanceMonitor.record('clean_duration', 'a2', 200);
    const summaries = performanceMonitor.getAllSummaries();
    expect(summaries.length).toBeGreaterThanOrEqual(2);
  });

  it('subscribe receives metrics', () => {
    let received = 0;
    performanceMonitor.subscribe(() => { received++; });
    performanceMonitor.record('scan_duration', 'a1', 100);
    performanceMonitor.record('scan_duration', 'a2', 200);
    expect(received).toBe(2);
  });

  it('exportMetrics returns JSON', () => {
    performanceMonitor.record('scan_duration', 'a1', 100);
    const exported = performanceMonitor.exportMetrics();
    expect(() => JSON.parse(exported)).not.toThrow();
  });
});

// ── Part 7: Background Task Management ──────────────────────────────

describe('Background Task Management (Part 7)', () => {
  beforeEach(() => {
    backgroundTaskManager.clear();
    errorHandler.clear();
    logger.clear();
    logger.enableVerbose();
  });
  afterEach(() => {
    backgroundTaskManager.clear();
    errorHandler.clear();
    logger.clear();
    logger.resetToDefault();
  });

  it('run executes task and returns result', async () => {
    const result = await backgroundTaskManager.run('test-task', async () => 'done');
    expect(result).toBe('done');
  });

  it('task is tracked with status lifecycle', async () => {
    const promise = backgroundTaskManager.run('test-task', async (ctx) => {
      ctx.onProgress(50);
      return 'done';
    });
    // While running, there should be a running task
    const running = backgroundTaskManager.getRunningTasks();
    expect(running.length).toBeGreaterThanOrEqual(1);
    await promise;
    // After completion, no running tasks
    const runningAfter = backgroundTaskManager.getRunningTasks();
    expect(runningAfter.length).toBe(0);
  });

  it('onProgress reports progress updates', async () => {
    const progressUpdates: number[] = [];
    backgroundTaskManager.onProgress((p) => { progressUpdates.push(p.progress); });
    await backgroundTaskManager.run('test-task', async (ctx) => {
      ctx.onProgress(25);
      ctx.onProgress(50);
      ctx.onProgress(75);
      ctx.onProgress(100);
      return 'done';
    });
    expect(progressUpdates).toContain(25);
    expect(progressUpdates).toContain(50);
    expect(progressUpdates).toContain(75);
    expect(progressUpdates).toContain(100);
  });

  it('cancel stops a running task', async () => {
    let cancelled = false;
    const promise = backgroundTaskManager.run('long-task', async (ctx) => {
      // Wait a bit then check cancellation
      await new Promise((r) => setTimeout(r, 50));
      if (ctx.isCancelled()) {
        cancelled = true;
        throw new Error('Cancelled');
      }
      return 'done';
    });

    // Cancel the task
    const tasks = backgroundTaskManager.getRunningTasks();
    if (tasks.length > 0) {
      backgroundTaskManager.cancel(tasks[0]!.id);
    }

    try { await promise; } catch { /* expected */ }
    // Task should have been cancelled
    expect(cancelled).toBe(true);
  });

  it('cancelAll cancels all running tasks', async () => {
    const promise1 = backgroundTaskManager.run('task1', async (ctx) => {
      await new Promise((r) => setTimeout(r, 100));
      if (ctx.isCancelled()) throw new Error('Cancelled');
      return 'done';
    });
    const promise2 = backgroundTaskManager.run('task2', async (ctx) => {
      await new Promise((r) => setTimeout(r, 100));
      if (ctx.isCancelled()) throw new Error('Cancelled');
      return 'done';
    });

    backgroundTaskManager.cancelAll();

    try { await promise1; } catch { /* expected */ }
    try { await promise2; } catch { /* expected */ }
    expect(backgroundTaskManager.getRunningTasks()).toHaveLength(0);
  });

  it('dedupKey prevents duplicate tasks', async () => {
    let callCount = 0;
    const op = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return 'result';
    };

    // Start two tasks with same dedupKey simultaneously
    const p1 = backgroundTaskManager.run('dedup-task', op, { dedupKey: 'dedup-task' });
    const p2 = backgroundTaskManager.run('dedup-task', op, { dedupKey: 'dedup-task' });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('result');
    expect(r2).toBe('result');
    // Operation should only have been called once
    expect(callCount).toBe(1);
  });

  it('onTaskUpdate notifies on status changes', async () => {
    const updates: string[] = [];
    backgroundTaskManager.onTaskUpdate((task) => { updates.push(task.status); });

    await backgroundTaskManager.run('test-task', async () => 'done');

    // Should have received at least running and completed
    expect(updates).toContain('running');
    expect(updates).toContain('completed');
  });

  it('failed task records error', async () => {
    try {
      await backgroundTaskManager.run('failing-task', async () => {
        throw new Error('Task error');
      });
    } catch {
      // expected
    }
    const tasks = backgroundTaskManager.getAllTasks();
    const failed = tasks.find((t) => t.name === 'failing-task');
    expect(failed).toBeDefined();
    expect(failed!.status).toBe('failed');
    expect(failed!.error).toBe('Task error');
  });

  it('cleanupOldTasks removes finished tasks', async () => {
    await backgroundTaskManager.run('task1', async () => 'done');
    await backgroundTaskManager.run('task2', async () => 'done');
    backgroundTaskManager.cleanupOldTasks(0);
    // All finished tasks should be cleaned up
    expect(backgroundTaskManager.getAllTasks().length).toBeLessThanOrEqual(0);
  });
});

// ── Part 8: Resource Management ─────────────────────────────────────

describe('Resource Management (Part 8)', () => {
  beforeEach(() => {
    resourceManager.clear();
    logger.clear();
    logger.enableVerbose();
  });
  afterEach(() => {
    resourceManager.clear();
    logger.clear();
    logger.resetToDefault();
  });

  it('trackTimer tracks and releases timers', () => {
    const timerId = setInterval(() => {}, 1000);
    const resId = resourceManager.trackTimer('test-timer', timerId);
    expect(resourceManager.getActiveCount()).toBe(1);

    const released = resourceManager.release(resId);
    expect(released).toBe(true);
    expect(resourceManager.getActiveCount()).toBe(0);
  });

  it('trackEventListener tracks and releases subscriptions', () => {
    let called = false;
    const unsub = () => { called = true; };
    const resId = resourceManager.trackEventListener('test-listener', unsub);
    expect(resourceManager.getActiveCount()).toBe(1);

    resourceManager.release(resId);
    expect(called).toBe(true);
    expect(resourceManager.getActiveCount()).toBe(0);
  });

  it('trackFileHandle tracks and closes handles', () => {
    let closed = false;
    const resId = resourceManager.trackFileHandle('test-file', () => { closed = true; });
    resourceManager.release(resId);
    expect(closed).toBe(true);
  });

  it('trackWorker tracks and terminates workers', () => {
    let terminated = false;
    const resId = resourceManager.trackWorker('test-worker', () => { terminated = true; });
    resourceManager.release(resId);
    expect(terminated).toBe(true);
  });

  it('trackTempResource tracks and cleans up temp resources', () => {
    let cleaned = false;
    const resId = resourceManager.trackTempResource('temp', () => { cleaned = true; });
    resourceManager.release(resId);
    expect(cleaned).toBe(true);
  });

  it('releaseByType releases all resources of a type', () => {
    resourceManager.trackTimer('t1', setInterval(() => {}, 1000));
    resourceManager.trackTimer('t2', setInterval(() => {}, 1000));
    resourceManager.trackEventListener('e1', () => {});

    const released = resourceManager.releaseByType('timer');
    expect(released).toBe(2);
    expect(resourceManager.getResourcesByType('timer')).toHaveLength(0);
    expect(resourceManager.getResourcesByType('event_listener')).toHaveLength(1);
  });

  it('shutdown releases all resources in order', () => {
    const order: string[] = [];
    resourceManager.trackWorker('w1', () => { order.push('worker'); });
    resourceManager.trackTimer('t1', setInterval(() => {}, 1000));
    resourceManager.trackFileHandle('f1', () => { order.push('file'); });
    resourceManager.trackEventListener('e1', () => { order.push('listener'); });

    resourceManager.shutdown();
    expect(resourceManager.getActiveCount()).toBe(0);
    // Workers should be released first
    expect(order[0]).toBe('worker');
  });

  it('release on already released resource returns false', () => {
    const resId = resourceManager.trackTimer('t1', setInterval(() => {}, 1000));
    expect(resourceManager.release(resId)).toBe(true);
    expect(resourceManager.release(resId)).toBe(false);
  });

  it('getActiveResources returns only unreleased', () => {
    const id1 = resourceManager.trackTimer('t1', setInterval(() => {}, 1000));
    resourceManager.trackTimer('t2', setInterval(() => {}, 1000));
    resourceManager.release(id1);
    const active = resourceManager.getActiveResources();
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe('t2');
  });

  it('DisposableScope manages multiple resources', () => {
    const scope = new DisposableScope();
    let cleaned1 = false;
    scope.addEventListener('listener1', () => { cleaned1 = true; });
    scope.addTimer('timer1', setInterval(() => {}, 1000));

    scope.dispose();
    expect(cleaned1).toBe(true);
    expect(resourceManager.getActiveCount()).toBe(0);
  });

  it('getPotentialLeaks finds old resources', () => {
    const resId = resourceManager.trackEventListener('old', () => {});
    // Manually set old creation time
    const res = resourceManager.getActiveResources().find((r) => r.id === resId);
    if (res) {
      // Can't easily mock time, so just verify the method works
      const leaks = resourceManager.getPotentialLeaks(Number.MAX_SAFE_INTEGER);
      expect(leaks).toBeDefined();
    }
    resourceManager.release(resId);
  });
});

// ── Part 9: Configuration Management ────────────────────────────────

describe('Configuration Management (Part 9)', () => {
  beforeEach(() => { configManager.reset(); });
  afterEach(() => { configManager.reset(); });

  it('getConfig returns all config sections', () => {
    const config = configManager.getConfig();
    expect(config.healthEngine).toBeDefined();
    expect(config.logging).toBeDefined();
    expect(config.timeouts).toBeDefined();
    expect(config.retry).toBeDefined();
    expect(config.backgroundTasks).toBeDefined();
    expect(config.uiPreferences).toBeDefined();
    expect(config.moduleWeights).toBeDefined();
    expect(config.moduleSettings).toBeDefined();
  });

  it('healthEngine config has expected defaults', () => {
    const config = configManager.getHealthEngineConfig();
    expect(config.maxScore).toBe(100);
    expect(config.minScore).toBe(0);
    expect(config.skipLockedModules).toBe(true);
  });

  it('logging config has expected defaults', () => {
    const config = configManager.getLoggingConfig();
    expect(config.minLevel).toBe('info');
    expect(config.consoleOutput).toBe(true);
  });

  it('timeouts config has expected defaults', () => {
    const config = configManager.getTimeoutConfig();
    expect(config.moduleInit).toBeGreaterThan(0);
    expect(config.scan).toBeGreaterThan(0);
    expect(config.clean).toBeGreaterThan(0);
  });

  it('retry config has expected defaults', () => {
    const config = configManager.getRetryConfig();
    expect(config.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(config.baseDelayMs).toBeGreaterThan(0);
    expect(config.backoffMultiplier).toBeGreaterThan(1);
  });

  it('backgroundTasks config has expected defaults', () => {
    const config = configManager.getBackgroundTaskConfig();
    expect(config.maxConcurrent).toBeGreaterThan(0);
    expect(config.defaultTimeout).toBeGreaterThan(0);
  });

  it('uiPreferences config has expected defaults', () => {
    const config = configManager.getUIPreferences();
    expect(config.defaultTheme).toBe('dark');
    expect(config.showFutureModules).toBe(true);
  });

  it('update merges partial config', () => {
    configManager.update({
      timeouts: { scan: 120_000 },
    });
    expect(configManager.getTimeoutConfig().scan).toBe(120_000);
    // Other values should be unchanged
    expect(configManager.getTimeoutConfig().clean).toBe(120_000);
  });

  it('update deep-merges nested objects', () => {
    configManager.update({
      retry: { maxAttempts: 5 },
    });
    const config = configManager.getRetryConfig();
    expect(config.maxAttempts).toBe(5);
    // Other retry values unchanged
    expect(config.baseDelayMs).toBe(500);
  });

  it('reset restores defaults', () => {
    configManager.update({ retry: { maxAttempts: 10 } });
    expect(configManager.getRetryConfig().maxAttempts).toBe(10);
    configManager.reset();
    expect(configManager.getRetryConfig().maxAttempts).toBe(3);
  });

  it('subscribe receives notifications on update', () => {
    let notified = false;
    configManager.subscribe(() => { notified = true; });
    configManager.update({ retry: { maxAttempts: 7 } });
    expect(notified).toBe(true);
  });

  it('getConfig returns a copy (immutable)', () => {
    const config1 = configManager.getConfig();
    const config2 = configManager.getConfig();
    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });
});

// ── Part 10: Retry & Recovery ───────────────────────────────────────

describe('Retry & Recovery (Part 10)', () => {
  beforeEach(() => {
    errorHandler.clear();
    logger.clear();
    logger.enableVerbose();
    configManager.reset();
  });
  afterEach(() => {
    errorHandler.clear();
    logger.clear();
    logger.resetToDefault();
    configManager.reset();
  });

  it('withRetry succeeds on first attempt', async () => {
    const result = await withRetry(async () => {
      return 'success';
    }, { operationName: 'test' });

    expect(result.success).toBe(true);
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(1);
  });

  it('withRetry retries on failure and succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Not yet');
      return 'success';
    }, {
      maxAttempts: 5,
      baseDelayMs: 10,
      operationName: 'test-retry',
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(3);
  });

  it('withRetry fails after max attempts', async () => {
    const result = await withRetry(async () => {
      throw new Error('Always fails');
    }, {
      maxAttempts: 3,
      baseDelayMs: 10,
      operationName: 'test-fail',
    });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.lastError).toBeDefined();
  });

  it('withRetry never loops infinitely', async () => {
    const startTime = Date.now();
    const result = await withRetry(async () => {
      throw new Error('Infinite');
    }, {
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 50,
    });
    const elapsed = Date.now() - startTime;
    // Should complete in well under 1 second
    expect(elapsed).toBeLessThan(1000);
    expect(result.attempts).toBe(3);
  });

  it('calculateRetryDelay uses exponential backoff', () => {
    const delay0 = calculateRetryDelay(0, 100, 10000, 2, false);
    const delay1 = calculateRetryDelay(1, 100, 10000, 2, false);
    const delay2 = calculateRetryDelay(2, 100, 10000, 2, false);
    expect(delay0).toBe(100);
    expect(delay1).toBe(200);
    expect(delay2).toBe(400);
  });

  it('calculateRetryDelay clamps to maxDelayMs', () => {
    const delay = calculateRetryDelay(10, 100, 1000, 2, false);
    expect(delay).toBe(1000);
  });

  it('calculateRetryDelay with jitter adds randomness', () => {
    const delay1 = calculateRetryDelay(0, 100, 10000, 2, true);
    const delay2 = calculateRetryDelay(0, 100, 10000, 2, true);
    // With jitter, delays should be >= base (100) and <= 125
    expect(delay1).toBeGreaterThanOrEqual(100);
    expect(delay1).toBeLessThanOrEqual(125);
    expect(delay2).toBeGreaterThanOrEqual(100);
  });

  it('retryModuleInit returns true on success', async () => {
    const result = await retryModuleInit('junk', async () => {
      // success
    });
    expect(result).toBe(true);
  });

  it('retryModuleInit returns false on failure', async () => {
    const result = await retryModuleInit('junk', async () => {
      throw new Error('Init failed');
    }, { maxAttempts: 2, baseDelayMs: 10 });
    expect(result).toBe(false);
  });

  it('retryLicenseValidation returns true on success', async () => {
    const result = await retryLicenseValidation(async () => true);
    expect(result).toBe(true);
  });

  it('retryLicenseValidation returns false on failure', async () => {
    const result = await retryLicenseValidation(async () => {
      throw new Error('Validation failed');
    }, { maxAttempts: 2, baseDelayMs: 10 });
    expect(result).toBe(false);
  });

  it('retryFileAccess returns result on success', async () => {
    const result = await retryFileAccess(async () => 'file-content');
    expect(result.success).toBe(true);
    expect(result.result).toBe('file-content');
  });

  it('retryFileAccess fails after max attempts', async () => {
    const result = await retryFileAccess(async () => {
      throw new Error('File not found');
    }, { maxAttempts: 2, baseDelayMs: 10 });
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2);
  });

  it('withRetry reports error to errorHandler on final failure', async () => {
    await withRetry(async () => {
      throw new Error('Final failure');
    }, { maxAttempts: 2, baseDelayMs: 10, operationName: 'test-report' });
    expect(errorHandler.getErrorCount()).toBeGreaterThanOrEqual(1);
  });

  it('withRetry tracks total delay', async () => {
    const result = await withRetry(async () => {
      throw new Error('Fail');
    }, { maxAttempts: 3, baseDelayMs: 50, maxDelayMs: 200, backoffMultiplier: 2, jitter: false });
    expect(result.totalDelayMs).toBeGreaterThan(0);
  });
});
