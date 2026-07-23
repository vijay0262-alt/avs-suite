// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardViewModel } from '../DashboardViewModel';
import type { DashboardService } from '../dashboard.service';
import type { IPrivacyService } from '../../privacy/privacy.service';
import type { DashboardMetrics, LiveMetrics } from '../dashboard.types';
import { calculateHealthScore } from '../dashboard.utils';
import { optimizationEventBus, OptimizationEventType } from '../../health/OptimizationEventBus';
import { dashboardRefreshManager } from '../../health/DashboardRefreshManager';
import { HealthScoreService } from '../../health/HealthScoreService';
import type { HealthContribution, HealthContributionProvider, ModuleId } from '../../health/HealthContribution';
import { useAnimatedNumber } from '../components/useAnimatedNumber';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

// ── Mock data helpers ────────────────────────────────────────────────

function makeMetrics(overrides: Partial<DashboardMetrics> = {}): DashboardMetrics {
  return {
    cpu: { usage: 20, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 100, threads: 500, temperature: null },
    memory: { total: 16_000_000_000, used: 8_000_000_000, available: 8_000_000_000, usage: 50, cached: 1_000_000_000, swapTotal: 4_000_000_000, swapUsed: 0, swapUsage: 0 },
    storage: [{ mount: 'C:', name: 'SSD', total: 500_000_000_000, used: 250_000_000_000, free: 250_000_000_000, usage: 50, isSSD: true, fileSystem: 'NTFS' }],
    windows: { version: '10', build: '19041', uptime: 3600, isAdministrator: true, powerMode: 'balanced', battery: null, secureBoot: true, tpmStatus: true },
    security: {
      defender: { enabled: true, realTimeProtection: true },
      firewall: { enabled: true },
      updates: { pendingUpdates: 0, lastUpdateDate: null },
      realTimeProtection: true,
      smartScreen: true,
    },
    performance: { startupApps: 3, backgroundProcesses: 50, temporaryFilesSize: 100_000_000, recycleBinSize: 50_000_000, browserCacheSize: 20_000_000, potentialRecoverable: 170_000_000 },
    network: { uploadSpeed: 0, downloadSpeed: 0, totalBytesSent: 0, totalBytesReceived: 0 },
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeLiveMetrics(overrides: Partial<LiveMetrics> = {}): LiveMetrics {
  return {
    cpu: { usage: 15, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 100, threads: 500, temperature: null },
    memory: { total: 16_000_000_000, used: 6_000_000_000, available: 10_000_000_000, usage: 37, cached: 1_000_000_000, swapTotal: 4_000_000_000, swapUsed: 0, swapUsage: 0 },
    storage: [{ mount: 'C:', name: 'SSD', total: 500_000_000_000, used: 250_000_000_000, free: 250_000_000_000, usage: 50, isSSD: true, fileSystem: 'NTFS' }],
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDashboardService(overrides: Record<string, unknown> = {}): DashboardService {
  let currentMetrics = makeMetrics();
  return {
    getMetrics: vi.fn(async () => currentMetrics),
    getLiveMetrics: vi.fn(async () => makeLiveMetrics()),
    getHealthScore: vi.fn(async () => ({ score: 85, status: 'good' })),
    refreshCache: vi.fn(async () => { currentMetrics = makeMetrics(); return { refreshed: true }; }),
    getOptimizePreview: vi.fn(async () => ({ totalRecoverable: 0, actions: [], estimatedTime: 0 })),
    executeOptimize: vi.fn(async () => ({ success: true, totalRecovered: 0, results: {}, elapsedMs: 0, completedAt: '' })),
    ...overrides,
  } as unknown as DashboardService;
}

function makePrivacyService(overrides: Record<string, unknown> = {}): IPrivacyService {
  return {
    scan: vi.fn(async () => ({ items: [], totalSize: 0, categoriesFound: [], browsersDetected: [], itemCount: 0, categoryBreakdown: {}, riskLevel: 'low' })),
    clean: vi.fn(async () => ({ status: 'ok', itemsCleaned: 0, spaceFreed: 0, categoriesCleaned: [], errors: [], durationMs: 0, currentCategory: '', itemsRemaining: 0, estimatedTimeRemainingMs: 0, backupCreated: false, backupPath: '' })),
    detectBrowsers: vi.fn(async () => ({ browsers: ['chrome', 'firefox'] })),
    ...overrides,
  } as unknown as IPrivacyService;
}

function makeProvider(moduleId: ModuleId, penalty: number): HealthContributionProvider {
  return {
    async getContribution(): Promise<HealthContribution> {
      return {
        moduleId,
        moduleName: moduleId,
        currentPenalty: penalty,
        maxPenalty: 100,
        resolvedPenalty: 0,
        detail: `${moduleId} detail`,
        canAutoFix: true,
        actionPath: `/${moduleId}`,
      };
    },
  };
}

// Helper to render a hook with React.createElement (no JSX needed in .ts file)
function renderHookWithProps<T, P>(
  hookFn: (props: P) => T,
  initialProps: P,
): { rerender: (props: P) => void; unmount: () => void; getCurrent: () => T } {
  let current: T;
  const container = document.createElement('div');
  const root = createRoot(container);

  function Component(props: P) {
    current = hookFn(props);
    return null;
  }

  function render(props: P) {
    flushSync(() => {
      root.render(React.createElement(Component as unknown as React.FC, props as unknown as React.Attributes));
    });
  }

  render(initialProps);

  return {
    rerender: (props: P) => render(props),
    unmount: () => root.unmount(),
    getCurrent: () => current,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Health calculation', () => {
  it('calculates a score from metrics + privacy risks', () => {
    const metrics = makeMetrics();
    const score = calculateHealthScore(metrics, 2);
    expect(score.overallScore).toBeGreaterThan(0);
    expect(score.overallScore).toBeLessThanOrEqual(100);
    expect(score.categoryScores).toBeDefined();
    expect(score.issues).toBeDefined();
  });

  it('handles null metrics gracefully', () => {
    const score = calculateHealthScore(null, 0);
    expect(score.overallScore).toBeGreaterThanOrEqual(0);
    expect(score.overallScore).toBeLessThanOrEqual(100);
  });

  it('higher junk size produces lower score', () => {
    const clean = calculateHealthScore(makeMetrics({ performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 0);
    const dirty = calculateHealthScore(makeMetrics({ performance: { startupApps: 10, backgroundProcesses: 100, temporaryFilesSize: 5_000_000_000, recycleBinSize: 2_000_000_000, browserCacheSize: 1_000_000_000, potentialRecoverable: 8_000_000_000 } }), 5);
    expect(clean.overallScore).toBeGreaterThan(dirty.overallScore);
  });

  it('issues array reflects current state', () => {
    const dirty = calculateHealthScore(makeMetrics({ performance: { startupApps: 10, backgroundProcesses: 100, temporaryFilesSize: 5_000_000_000, recycleBinSize: 2_000_000_000, browserCacheSize: 1_000_000_000, potentialRecoverable: 8_000_000_000 } }), 5);
    expect(dirty.issues.length).toBeGreaterThan(0);
    const clean = calculateHealthScore(makeMetrics({ performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 0);
    expect(clean.issues.length).toBeLessThanOrEqual(dirty.issues.length);
  });
});

describe('Health Score Philosophy — score 100 when fully optimized', () => {
  it('returns overall score 100 when all issues are resolved', () => {
    const cleanMetrics = makeMetrics({
      cpu: { usage: 15, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 80, threads: 400, temperature: null },
      memory: { total: 16_000_000_000, used: 4_000_000_000, available: 12_000_000_000, usage: 25, cached: 1_000_000_000, swapTotal: 4_000_000_000, swapUsed: 0, swapUsage: 0 },
      storage: [{ mount: 'C:', name: 'SSD', total: 500_000_000_000, used: 200_000_000_000, free: 300_000_000_000, usage: 40, isSSD: true, fileSystem: 'NTFS' }],
      performance: { startupApps: 0, backgroundProcesses: 30, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    });
    const score = calculateHealthScore(cleanMetrics, 0);
    expect(score.overallScore).toBe(100);
    expect(score.issues.length).toBe(0);
    expect(score.status).toBe('excellent');
    expect(score.scoreZone).toBe('excellent');
  });

  it('returns all category scores 100 when fully optimized', () => {
    const cleanMetrics = makeMetrics({
      cpu: { usage: 10, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 50, threads: 200, temperature: null },
      memory: { total: 16_000_000_000, used: 4_000_000_000, available: 12_000_000_000, usage: 25, cached: 1_000_000_000, swapTotal: 4_000_000_000, swapUsed: 0, swapUsage: 0 },
      storage: [{ mount: 'C:', name: 'SSD', total: 500_000_000_000, used: 200_000_000_000, free: 300_000_000_000, usage: 40, isSSD: true, fileSystem: 'NTFS' }],
      performance: { startupApps: 0, backgroundProcesses: 30, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    });
    const score = calculateHealthScore(cleanMetrics, 0);
    expect(score.categoryScores.storage).toBe(100);
    expect(score.categoryScores.startup).toBe(100);
    expect(score.categoryScores.privacy).toBe(100);
    expect(score.categoryScores.performance).toBe(100);
    expect(score.categoryScores.security).toBe(100);
    expect(score.categoryScores.windows).toBe(100);
  });

  it('issues found = 0 when fully optimized', () => {
    const cleanMetrics = makeMetrics({
      cpu: { usage: 15, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 80, threads: 400, temperature: null },
      memory: { total: 16_000_000_000, used: 4_000_000_000, available: 12_000_000_000, usage: 25, cached: 1_000_000_000, swapTotal: 4_000_000_000, swapUsed: 0, swapUsage: 0 },
      storage: [{ mount: 'C:', name: 'SSD', total: 500_000_000_000, used: 200_000_000_000, free: 300_000_000_000, usage: 40, isSSD: true, fileSystem: 'NTFS' }],
      performance: { startupApps: 0, backgroundProcesses: 30, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    });
    const score = calculateHealthScore(cleanMetrics, 0);
    expect(score.issues).toEqual([]);
  });
});

describe('Health Score Philosophy — score zones', () => {
  it('score 90-100 maps to excellent zone', () => {
    const cleanMetrics = makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 30, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    });
    const score = calculateHealthScore(cleanMetrics, 0);
    expect(score.scoreZone).toBe('excellent');
  });

  it('score below 40 maps to critical zone', () => {
    const criticalMetrics = makeMetrics({
      cpu: { usage: 95, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 300, threads: 1000, temperature: null },
      memory: { total: 16_000_000_000, used: 15_000_000_000, available: 1_000_000_000, usage: 94, cached: 0, swapTotal: 4_000_000_000, swapUsed: 3_000_000_000, swapUsage: 75 },
      storage: [{ mount: 'C:', name: 'SSD', total: 500_000_000_000, used: 480_000_000_000, free: 20_000_000_000, usage: 96, isSSD: true, fileSystem: 'NTFS' }],
      windows: { version: '10', build: '19041', uptime: 65 * 86400, isAdministrator: true, powerMode: 'balanced', battery: null, secureBoot: false, tpmStatus: false },
      security: {
        defender: { enabled: false, realTimeProtection: false },
        firewall: { enabled: false },
        updates: { pendingUpdates: 10, lastUpdateDate: null },
        realTimeProtection: false,
        smartScreen: false,
      },
      performance: { startupApps: 10, backgroundProcesses: 200, temporaryFilesSize: 20_000_000_000, recycleBinSize: 10_000_000_000, browserCacheSize: 5_000_000_000, potentialRecoverable: 35_000_000_000 },
    });
    const score = calculateHealthScore(criticalMetrics, 5);
    expect(score.scoreZone).toBe('critical');
    expect(score.overallScore).toBeLessThan(40);
  });

  it('scoreZone is always consistent with overallScore range', () => {
    const dirty = calculateHealthScore(makeMetrics({
      performance: { startupApps: 5, backgroundProcesses: 80, temporaryFilesSize: 500_000_000, recycleBinSize: 200_000_000, browserCacheSize: 100_000_000, potentialRecoverable: 800_000_000 },
    }), 2);
    const s = dirty.overallScore;
    if (s >= 90) expect(dirty.scoreZone).toBe('excellent');
    else if (s >= 80) expect(dirty.scoreZone).toBe('good');
    else if (s >= 60) expect(dirty.scoreZone).toBe('fair');
    else if (s >= 40) expect(dirty.scoreZone).toBe('poor');
    else expect(dirty.scoreZone).toBe('critical');
  });
});

describe('Health Score Philosophy — progressive degradation', () => {
  it('more junk produces progressively lower storage score', () => {
    const noJunk = calculateHealthScore(makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    }), 0);
    const smallJunk = calculateHealthScore(makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 100_000_000, recycleBinSize: 50_000_000, browserCacheSize: 20_000_000, potentialRecoverable: 170_000_000 },
    }), 0);
    const largeJunk = calculateHealthScore(makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 5_000_000_000, recycleBinSize: 2_000_000_000, browserCacheSize: 1_000_000_000, potentialRecoverable: 8_000_000_000 },
    }), 0);
    expect(noJunk.categoryScores.storage).toBe(100);
    expect(smallJunk.categoryScores.storage).toBeLessThan(100);
    expect(largeJunk.categoryScores.storage).toBeLessThan(smallJunk.categoryScores.storage);
  });

  it('more startup apps produce progressively lower startup score', () => {
    const none = calculateHealthScore(makeMetrics({ performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 0);
    const few = calculateHealthScore(makeMetrics({ performance: { startupApps: 3, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 0);
    const many = calculateHealthScore(makeMetrics({ performance: { startupApps: 10, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 0);
    expect(none.categoryScores.startup).toBe(100);
    expect(few.categoryScores.startup).toBeLessThan(100);
    expect(many.categoryScores.startup).toBeLessThan(few.categoryScores.startup);
  });

  it('more privacy risks produce progressively lower privacy score', () => {
    const none = calculateHealthScore(makeMetrics({ performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 0);
    const some = calculateHealthScore(makeMetrics({ performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 3);
    const many = calculateHealthScore(makeMetrics({ performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 8);
    expect(none.categoryScores.privacy).toBe(100);
    expect(some.categoryScores.privacy).toBeLessThan(100);
    expect(many.categoryScores.privacy).toBeLessThan(some.categoryScores.privacy);
  });

  it('normal CPU/memory does not penalize performance score', () => {
    const normal = calculateHealthScore(makeMetrics({
      cpu: { usage: 30, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 100, threads: 500, temperature: null },
      memory: { total: 16_000_000_000, used: 6_000_000_000, available: 10_000_000_000, usage: 37, cached: 1_000_000_000, swapTotal: 4_000_000_000, swapUsed: 0, swapUsage: 0 },
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    }), 0);
    expect(normal.categoryScores.performance).toBe(100);
  });

  it('high CPU usage penalizes performance score', () => {
    const highCpu = calculateHealthScore(makeMetrics({
      cpu: { usage: 85, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 300, threads: 1000, temperature: null },
      memory: { total: 16_000_000_000, used: 6_000_000_000, available: 10_000_000_000, usage: 37, cached: 1_000_000_000, swapTotal: 4_000_000_000, swapUsed: 0, swapUsage: 0 },
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    }), 0);
    expect(highCpu.categoryScores.performance).toBeLessThan(100);
  });
});

describe('Health Score Philosophy — after optimization shows 100', () => {
  let vm: DashboardViewModel;
  let svc: DashboardService;
  let priv: IPrivacyService;

  beforeEach(() => {
    vi.useFakeTimers();
    optimizationEventBus.clear();
    dashboardRefreshManager.reset();
    dashboardRefreshManager.init();
  });

  afterEach(() => {
    vm?.dispose();
    vi.useRealTimers();
  });

  it('dashboard shows score 100 and 0 issues after all issues resolved', async () => {
    const dirtyMetrics = makeMetrics({
      performance: { startupApps: 8, backgroundProcesses: 100, temporaryFilesSize: 3_000_000_000, recycleBinSize: 1_000_000_000, browserCacheSize: 500_000_000, potentialRecoverable: 4_500_000_000 },
    });
    const cleanMetrics = makeMetrics({
      cpu: { usage: 15, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 80, threads: 400, temperature: null },
      memory: { total: 16_000_000_000, used: 4_000_000_000, available: 12_000_000_000, usage: 25, cached: 1_000_000_000, swapTotal: 4_000_000_000, swapUsed: 0, swapUsage: 0 },
      performance: { startupApps: 0, backgroundProcesses: 30, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    });

    let current = dirtyMetrics;
    svc = makeDashboardService({
      getMetrics: vi.fn(async () => current),
      refreshCache: vi.fn(async () => { current = cleanMetrics; return { refreshed: true }; }),
    });
    priv = makePrivacyService({
      detectBrowsers: vi.fn(async () => ({ browsers: [] })),
    });
    vm = new DashboardViewModel(svc, priv);

    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    // Before optimization: score < 100, issues > 0
    expect(vm.state.healthScore!.overallScore).toBeLessThan(100);
    expect(vm.state.healthScore!.issues.length).toBeGreaterThan(0);

    // Simulate optimization: emit cleaning event
    optimizationEventBus.emit({
      type: OptimizationEventType.CleaningCompleted,
      moduleId: 'junk',
      action: 'clean',
      bytesRecovered: 4_500_000_000,
      itemsProcessed: 100,
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(600);

    // After optimization: score = 100, issues = 0
    expect(vm.state.healthScore!.overallScore).toBe(100);
    expect(vm.state.healthScore!.issues.length).toBe(0);
    expect(vm.state.healthScore!.scoreZone).toBe('excellent');
  });
});

describe('Dashboard refresh on optimization events', () => {
  let vm: DashboardViewModel;
  let svc: DashboardService;
  let priv: IPrivacyService;

  beforeEach(() => {
    vi.useFakeTimers();
    optimizationEventBus.clear();
    dashboardRefreshManager.reset();
    dashboardRefreshManager.init();
    svc = makeDashboardService();
    priv = makePrivacyService();
    vm = new DashboardViewModel(svc, priv);
  });

  afterEach(() => {
    vm.dispose();
    vi.useRealTimers();
  });

  it('refreshes metrics after a CleaningCompleted event', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);
    const initialCallCount = (svc.getMetrics as ReturnType<typeof vi.fn>).mock.calls.length;

    optimizationEventBus.emit({
      type: OptimizationEventType.CleaningCompleted,
      moduleId: 'junk',
      action: 'clean',
      bytesRecovered: 500_000_000,
      itemsProcessed: 10,
      timestamp: Date.now(),
    });

    await vi.advanceTimersByTimeAsync(600);

    expect((svc.getMetrics as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('refreshes privacy risks after a PrivacyCleaned event', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);
    const initialCallCount = (priv.detectBrowsers as ReturnType<typeof vi.fn>).mock.calls.length;

    optimizationEventBus.emit({
      type: OptimizationEventType.PrivacyCleaned,
      moduleId: 'privacy',
      action: 'clean',
      timestamp: Date.now(),
    });

    await vi.advanceTimersByTimeAsync(600);

    expect((priv.detectBrowsers as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('does not reload privacy for a junk event (targeted refresh)', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);
    (priv.detectBrowsers as ReturnType<typeof vi.fn>).mockClear();

    optimizationEventBus.emit({
      type: OptimizationEventType.CleaningCompleted,
      moduleId: 'junk',
      action: 'clean',
      timestamp: Date.now(),
    });

    await vi.advanceTimersByTimeAsync(600);

    expect((priv.detectBrowsers as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('debounces multiple rapid events into a single refresh', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);
    (svc.getMetrics as ReturnType<typeof vi.fn>).mockClear();

    optimizationEventBus.emit({ type: OptimizationEventType.CleaningCompleted, moduleId: 'junk', action: 'clean', timestamp: Date.now() });
    optimizationEventBus.emit({ type: OptimizationEventType.RegistryOptimized, moduleId: 'registry', action: 'clean', timestamp: Date.now() });
    optimizationEventBus.emit({ type: OptimizationEventType.StartupOptimized, moduleId: 'startup', action: 'disable', timestamp: Date.now() });

    await vi.advanceTimersByTimeAsync(300);
    expect((svc.getMetrics as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);

    await vi.advanceTimersByTimeAsync(300);
    expect((svc.getMetrics as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('handles pending refresh when Dashboard is not mounted', async () => {
    vm.dispose();
    optimizationEventBus.clear();
    dashboardRefreshManager.reset();
    dashboardRefreshManager.init();

    optimizationEventBus.emit({
      type: OptimizationEventType.CleaningCompleted,
      moduleId: 'junk',
      action: 'clean',
      timestamp: Date.now(),
    });
    expect(dashboardRefreshManager.hasPendingRefresh()).toBe(true);

    svc = makeDashboardService();
    priv = makePrivacyService();
    vm = new DashboardViewModel(svc, priv);
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(50);

    expect(dashboardRefreshManager.hasPendingRefresh()).toBe(false);
  });
});

describe('Event publishing and subscription', () => {
  beforeEach(() => {
    optimizationEventBus.clear();
  });

  it('multiple subscribers receive published events', () => {
    const sub1 = vi.fn();
    const sub2 = vi.fn();
    optimizationEventBus.subscribe(sub1);
    optimizationEventBus.subscribe(sub2);

    optimizationEventBus.emit({
      type: OptimizationEventType.CleaningCompleted,
      moduleId: 'junk',
      action: 'clean',
      timestamp: Date.now(),
    });

    expect(sub1).toHaveBeenCalledTimes(1);
    expect(sub2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribed listeners do not receive events', () => {
    const listener = vi.fn();
    const unsub = optimizationEventBus.subscribe(listener);
    unsub();

    optimizationEventBus.emit({
      type: OptimizationEventType.CleaningCompleted,
      moduleId: 'junk',
      action: 'clean',
      timestamp: Date.now(),
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('event includes correct type, moduleId, and action', () => {
    const listener = vi.fn();
    optimizationEventBus.subscribe(listener);

    optimizationEventBus.emit({
      type: OptimizationEventType.RegistryOptimized,
      moduleId: 'registry',
      action: 'clean',
      itemsProcessed: 5,
      timestamp: 12345,
    });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: OptimizationEventType.RegistryOptimized,
      moduleId: 'registry',
      action: 'clean',
      itemsProcessed: 5,
      timestamp: 12345,
    }));
  });

  it('all typed event constants are unique strings', () => {
    const types = Object.values(OptimizationEventType);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });
});

describe('Issue count updates', () => {
  let vm: DashboardViewModel;
  let svc: DashboardService;
  let priv: IPrivacyService;

  beforeEach(() => {
    vi.useFakeTimers();
    optimizationEventBus.clear();
    dashboardRefreshManager.reset();
    dashboardRefreshManager.init();
  });

  afterEach(() => {
    vm?.dispose();
    vi.useRealTimers();
  });

  it('issue count decreases after cleaning', async () => {
    const beforeMetrics = makeMetrics({
      performance: { startupApps: 10, backgroundProcesses: 100, temporaryFilesSize: 5_000_000_000, recycleBinSize: 2_000_000_000, browserCacheSize: 1_000_000_000, potentialRecoverable: 8_000_000_000 },
    });
    const afterMetrics = makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 50, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    });

    let current = beforeMetrics;
    svc = makeDashboardService({
      getMetrics: vi.fn(async () => current),
      refreshCache: vi.fn(async () => { current = afterMetrics; return { refreshed: true }; }),
    });
    priv = makePrivacyService();
    vm = new DashboardViewModel(svc, priv);

    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    const issuesBefore = vm.state.healthScore?.issues.length ?? 0;
    expect(issuesBefore).toBeGreaterThan(0);

    optimizationEventBus.emit({
      type: OptimizationEventType.CleaningCompleted,
      moduleId: 'junk',
      action: 'clean',
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(600);

    const issuesAfter = vm.state.healthScore?.issues.length ?? 0;
    expect(issuesAfter).toBeLessThan(issuesBefore);
  });

  it('issue count reaches 0 when system is clean', async () => {
    const cleanMetrics = makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    });
    svc = makeDashboardService({
      getMetrics: vi.fn(async () => cleanMetrics),
      refreshCache: vi.fn(async () => ({ refreshed: true })),
    });
    priv = makePrivacyService({
      detectBrowsers: vi.fn(async () => ({ browsers: [] })),
    });
    vm = new DashboardViewModel(svc, priv);
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    const issues = vm.state.healthScore?.issues ?? [];
    expect(issues.length).toBe(0);
  });
});

describe('Storage updates', () => {
  let vm: DashboardViewModel;

  beforeEach(() => {
    vi.useFakeTimers();
    optimizationEventBus.clear();
    dashboardRefreshManager.reset();
    dashboardRefreshManager.init();
  });

  afterEach(() => {
    vm?.dispose();
    vi.useRealTimers();
  });

  it('temp files size updates after cleaning event', async () => {
    const beforeMetrics = makeMetrics({
      performance: { startupApps: 3, backgroundProcesses: 50, temporaryFilesSize: 1_053_000_000, recycleBinSize: 50_000_000, browserCacheSize: 20_000_000, potentialRecoverable: 1_123_000_000 },
    });
    const afterMetrics = makeMetrics({
      performance: { startupApps: 3, backgroundProcesses: 50, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    });

    let current = beforeMetrics;
    const svc = makeDashboardService({
      getMetrics: vi.fn(async () => current),
      refreshCache: vi.fn(async () => { current = afterMetrics; return { refreshed: true }; }),
    });
    const priv = makePrivacyService();
    vm = new DashboardViewModel(svc, priv);
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(vm.state.healthScore?.tempFilesSize).toBe(1_053_000_000);

    optimizationEventBus.emit({
      type: OptimizationEventType.CleaningCompleted,
      moduleId: 'junk',
      action: 'clean',
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(600);

    expect(vm.state.healthScore?.tempFilesSize).toBe(0);
  });
});

describe('Animation triggers (useAnimatedNumber)', () => {
  it('returns target immediately on first render', () => {
    const { getCurrent, unmount } = renderHookWithProps(
      (props: { value: number }) => useAnimatedNumber(props.value),
      { value: 50 },
    );
    expect(getCurrent()).toBe(50);
    unmount();
  });

  it('animates from old value to new value over time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const { rerender, getCurrent, unmount } = renderHookWithProps(
      (props: { value: number }) => useAnimatedNumber(props.value),
      { value: 50 },
    );

    expect(getCurrent()).toBe(50);

    // Change target — the hook should start animating
    rerender({ value: 100 });

    // After rerender the value should still be 50 (animation hasn't started yet)
    // because useEffect runs after render and schedules rAF
    expect(getCurrent()).toBe(50);

    // Advance time to let rAF callbacks fire
    await vi.advanceTimersByTimeAsync(1000);

    // After animation completes, value should reach target
    expect(Math.round(getCurrent())).toBe(100);

    unmount();
    vi.useRealTimers();
  });

  it('does not animate when target stays the same', () => {
    const { rerender, getCurrent, unmount } = renderHookWithProps(
      (props: { value: number }) => useAnimatedNumber(props.value),
      { value: 75 },
    );
    rerender({ value: 75 });
    expect(getCurrent()).toBe(75);
    unmount();
  });
});

describe('Partial failures', () => {
  let vm: DashboardViewModel;

  beforeEach(() => {
    vi.useFakeTimers();
    optimizationEventBus.clear();
    dashboardRefreshManager.reset();
    dashboardRefreshManager.init();
  });

  afterEach(() => {
    vm?.dispose();
    vi.useRealTimers();
  });

  it('metrics failure does not block privacy and live metrics updates', async () => {
    const svc = makeDashboardService({
      getMetrics: vi.fn(async () => { throw new Error('metrics RPC failed'); }),
      getLiveMetrics: vi.fn(async () => makeLiveMetrics()),
      refreshCache: vi.fn(async () => ({ refreshed: true })),
    });
    const priv = makePrivacyService();
    vm = new DashboardViewModel(svc, priv);
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(vm.state.bootstrap).toBe('ready');
    expect(vm.state.metricsError).toBeTruthy();
    expect(vm.state.privacyRisksLoading).toBe(false);
    expect(vm.state.liveMetricsLoading).toBe(false);
    expect(vm.state.liveMetrics).not.toBeNull();
  });

  it('one provider error does not block other providers in HealthScoreService', async () => {
    const service = new HealthScoreService();
    service.registerProvider('junk', makeProvider('junk', 15));
    service.registerProvider('registry', {
      async getContribution(): Promise<HealthContribution> {
        throw new Error('registry provider failed');
      },
    });
    service.registerProvider('privacy', makeProvider('privacy', 10));

    const result = await service.computeHealth();
    expect(result.contributions).toHaveLength(2);
    expect(result.overallScore).toBe(75);
  });

  it('event with unknown moduleId triggers full reload as fallback', async () => {
    const svc = makeDashboardService();
    const priv = makePrivacyService();
    vm = new DashboardViewModel(svc, priv);
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    (svc.getMetrics as ReturnType<typeof vi.fn>).mockClear();
    (priv.detectBrowsers as ReturnType<typeof vi.fn>).mockClear();

    optimizationEventBus.emit({
      type: OptimizationEventType.ScanCompleted,
      moduleId: 'driver_updater' as ModuleId,
      action: 'scan',
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(600);

    expect((svc.getMetrics as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    expect((priv.detectBrowsers as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });
});

describe('Future module registration', () => {
  it('registers a new provider and it contributes to health score', async () => {
    const service = new HealthScoreService();
    service.registerProvider('junk', makeProvider('junk', 20));
    service.registerProvider('driver_updater' as ModuleId, makeProvider('driver_updater' as ModuleId, 15));

    const result = await service.computeHealth();
    expect(result.contributions).toHaveLength(2);
    expect(result.overallScore).toBe(65);
  });

  it('unregistering a provider removes its contribution', async () => {
    const service = new HealthScoreService();
    service.registerProvider('junk', makeProvider('junk', 20));
    service.registerProvider('driver_updater' as ModuleId, makeProvider('driver_updater' as ModuleId, 15));

    await service.computeHealth();
    service.unregisterProvider('driver_updater' as ModuleId);

    const result = await service.computeHealth();
    expect(result.contributions).toHaveLength(1);
    expect(result.overallScore).toBe(80);
  });

  it('future module can emit events and Dashboard refreshes', async () => {
    vi.useFakeTimers();
    optimizationEventBus.clear();
    dashboardRefreshManager.reset();
    dashboardRefreshManager.init();

    const svc = makeDashboardService();
    const priv = makePrivacyService();
    const vm = new DashboardViewModel(svc, priv);
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    (svc.getMetrics as ReturnType<typeof vi.fn>).mockClear();

    optimizationEventBus.emit({
      type: OptimizationEventType.ScanCompleted,
      moduleId: 'vpn' as ModuleId,
      action: 'connect',
      timestamp: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(600);

    expect((svc.getMetrics as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);

    vm.dispose();
    vi.useRealTimers();
  });

  it('HealthScoreService does not hardcode module names', () => {
    const service = new HealthScoreService();
    const result = service.getCachedContributions();
    expect(result).toEqual([]);
  });
});
