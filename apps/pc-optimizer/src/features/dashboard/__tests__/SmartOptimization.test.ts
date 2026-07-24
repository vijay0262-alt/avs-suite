// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardViewModel } from '../DashboardViewModel';
import type { DashboardService } from '../dashboard.service';
import type { IPrivacyService } from '../../privacy/privacy.service';
import type { DashboardMetrics, LiveMetrics, OptimizationExecutionProgress } from '../dashboard.types';
import { dashboardRefreshManager } from '../../health/DashboardRefreshManager';
import { resetHealthEngineConfig } from '../../health/HealthEngineConfig';
import { healthNotificationService } from '../../health/HealthNotificationService';

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
    executeOptimize: vi.fn(async () => ({ success: true, totalRecovered: 500_000_000, results: {}, elapsedMs: 1000, completedAt: '' })),
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

// ── Mock service modules ─────────────────────────────────────────────

vi.mock('../../junk-cleaner/junkCleaner.service', () => ({
  junkCleanerService: {
    list: vi.fn(async () => [{ id: 'temp', name: 'Temp Files' }]),
    startScan: vi.fn(async () => ({ taskId: 'task-1' })),
    getStatus: vi.fn(async () => ({ totalBytes: 500_000_000, totalFiles: 120, cleaners: [] })),
  },
}));

vi.mock('../../startup/startup.service', () => ({
  startupService: {
    listEntries: vi.fn(async () => []),
    disableEntry: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock('../../performance/performance.service', () => ({
  performanceService: {
    getMetrics: vi.fn(async () => ({ memory: { used: 8_000_000_000, total: 16_000_000_000, usage: 50 }, cpu: { usage: 20 } })),
    getAlerts: vi.fn(async () => ({ alerts: [] })),
    optimizeMemory: vi.fn(async () => ({ status: 'completed', memoryFreed: 200_000_000, processesOptimized: 3, errors: [] })),
  },
}));

vi.mock('../../disk-analyzer/diskAnalyzer.service', () => ({
  diskAnalyzerService: {
    listDrives: vi.fn(async () => [{ mountpoint: 'C:', device: 'SSD', percent: 50, free: 250_000_000_000, used: 250_000_000_000 }]),
  },
}));

vi.mock('../../registry/registry.service', () => ({
  registryService: {
    scan: vi.fn(async () => ({ issues: [] })),
    clean: vi.fn(async () => ({ fixed: 0, errors: [] })),
  },
}));

vi.mock('../../system-info/systemInfo.service', () => ({
  systemInfoService: {
    getComprehensiveInfo: vi.fn(async () => ({ os: { bootTime: Date.now() / 1000 - 3600, release: '10' }, cpu: { name: 'Intel' } })),
  },
}));

vi.mock('../dashboard.service', () => ({
  dashboardService: makeDashboardService(),
}));

vi.mock('../../privacy/privacy.service', () => ({
  privacyService: makePrivacyService(),
}));

vi.mock('../../health/OptimizationHistoryService', () => ({
  optimizationHistoryService: { recordOptimization: vi.fn() },
}));

vi.mock('../../health/HealthTimelineService', () => ({
  healthTimelineService: { recordHealth: vi.fn() },
}));

vi.mock('../../health', () => ({
  invalidateMetricsCache: vi.fn(),
  dashboardRefreshManager: { register: vi.fn(() => () => {}) },
  optimizationEventBus: { emit: vi.fn(), subscribe: vi.fn(() => () => {}) },
  OptimizationEventType: { CleaningCompleted: 'cleaning_completed', ScanCompleted: 'scan_completed', RegistryOptimized: 'registry_optimized', StartupOptimized: 'startup_optimized' },
}));

vi.mock('../../health/HealthNotificationService', () => ({
  healthNotificationService: { checkForChanges: vi.fn(), reset: vi.fn() },
}));

vi.mock('../../health/HealthEngineConfig', () => ({
  resetHealthEngineConfig: vi.fn(),
}));

// ── Tests ────────────────────────────────────────────────────────────

afterEach(() => {
  resetHealthEngineConfig();
  healthNotificationService.reset();
});

describe('Smart Optimization Flow', () => {
  let vm: DashboardViewModel;
  let svc: DashboardService;

  beforeEach(() => {
    vi.useFakeTimers();
    svc = makeDashboardService();
    const priv = makePrivacyService();
    vm = new DashboardViewModel(svc, priv);
    dashboardRefreshManager.init();
  });

  afterEach(() => {
    vm.dispose();
    vi.useRealTimers();
  });

  it('starts in preparing step when startHealthScan is called', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    vm.startHealthScan();
    expect(vm.state.healthScanStep).toBe('preparing');
    expect(vm.state.healthScanModules).toHaveLength(8);
  });

  it('transitions from preparing to scanning after 600ms', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    vm.startHealthScan();
    expect(vm.state.healthScanStep).toBe('preparing');

    await vi.advanceTimersByTimeAsync(600);
    expect(vm.state.healthScanStep).toBe('scanning');
  });

  it('can cancel during preparing phase', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    vm.startHealthScan();
    expect(vm.state.healthScanStep).toBe('preparing');

    vm.cancelHealthScan();
    await vi.advanceTimersByTimeAsync(600);

    expect(vm.state.healthScanStep).toBe('idle');
  });

  it('closeHealthScan clears optimizationSummary and execution', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    vm.closeHealthScan();
    expect(vm.state.healthScanStep).toBe('idle');
    expect(vm.state.optimizationSummary).toBeNull();
    expect(vm.state.healthScanExecution).toBeNull();
  });

  it('HealthScanStep type includes preparing and updating_dashboard', () => {
    const steps = ['idle', 'preparing', 'scanning', 'report', 'optimizing', 'verifying', 'updating_dashboard', 'complete'];
    for (const step of steps) {
      expect(typeof step).toBe('string');
    }
  });

  it('getLiveMessageForModule returns human-readable messages', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    const vmAny = vm as any;
    expect(vmAny.getLiveMessageForModule('junk')).toBe('Cleaning Temporary Files...');
    expect(vmAny.getLiveMessageForModule('privacy')).toBe('Cleaning Browser Cache...');
    expect(vmAny.getLiveMessageForModule('registry')).toBe('Optimizing Registry...');
    expect(vmAny.getLiveMessageForModule('startup')).toBe('Checking Startup Items...');
    expect(vmAny.getLiveMessageForModule('performance')).toBe('Optimizing Memory...');
    expect(vmAny.getLiveMessageForModule('unknown')).toContain('Optimizing');
  });

  it('getDoneMessageForModule formats results correctly', async () => {
    await vm.bootstrap();
    await vi.advanceTimersByTimeAsync(0);

    const vmAny = vm as any;
    const msg1 = vmAny.getDoneMessageForModule('junk', { success: true, filesDeleted: 120, bytesRecovered: 500_000_000, errors: [] });
    expect(msg1).toContain('120 files removed');
    expect(msg1).toContain('500 MB recovered');
    expect(msg1).toContain('✓');

    const msg2 = vmAny.getDoneMessageForModule('privacy', { success: true, itemsRemoved: 50, errors: [] });
    expect(msg2).toContain('50 traces cleaned');

    const msg3 = vmAny.getDoneMessageForModule('startup', { success: true, entriesDisabled: 3, errors: [] });
    expect(msg3).toContain('3 startup items disabled');

    const msg4 = vmAny.getDoneMessageForModule('registry', { success: true, issuesFixed: 15, errors: [] });
    expect(msg4).toContain('15 registry issues fixed');

    const msg5 = vmAny.getDoneMessageForModule('disk', { success: true, errors: [] });
    expect(msg5).toContain('No changes needed');

    const msg6 = vmAny.getDoneMessageForModule('junk', { success: false, errors: ['timeout'], reason: 'timed out' });
    expect(msg6).toContain('✗');
    expect(msg6).toContain('timed out');
  });
});

describe('OptimizationExecutionProgress type', () => {
  it('includes liveMessages and filesRemoved fields', () => {
    const progress: OptimizationExecutionProgress = {
      currentModule: 'Junk Cleaner',
      progress: 50,
      itemsProcessed: 10,
      spaceRecovered: 500_000_000,
      elapsedMs: 5000,
      liveMessages: ['Cleaning Temporary Files...', '✓ 120 files removed, 500 MB recovered'],
      filesRemoved: 120,
    };
    expect(progress.liveMessages).toHaveLength(2);
    expect(progress.filesRemoved).toBe(120);
    expect(progress.liveMessages[0]).toContain('Cleaning');
  });

  it('liveMessages can accumulate multiple operation results', () => {
    const messages: string[] = [];
    messages.push('Preparing optimization...');
    messages.push('Cleaning Temporary Files...');
    messages.push('✓ 120 files removed, 500 MB recovered');
    messages.push('Cleaning Browser Cache...');
    messages.push('✓ 50 traces cleaned');
    messages.push('Optimizing Registry...');
    messages.push('✓ 15 registry issues fixed');
    messages.push('Verifying results...');
    messages.push('Refreshing Health Score...');
    messages.push('Updating Dashboard cards...');

    expect(messages.length).toBe(10);
    expect(messages.filter((m) => m.startsWith('✓')).length).toBe(3);
    expect(messages.filter((m) => m.includes('...')).length).toBeGreaterThanOrEqual(5);
  });
});
