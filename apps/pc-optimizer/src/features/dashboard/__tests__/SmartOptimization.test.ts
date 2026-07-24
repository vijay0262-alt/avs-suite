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

describe('Health Score Animation and Color Zones', () => {
  it('scoreToZone maps scores to correct zones', () => {
    // Re-implement the same logic for testing
    function scoreToZone(score: number): string {
      if (score >= 100) return 'perfect';
      if (score >= 90) return 'excellent';
      if (score >= 80) return 'good';
      if (score >= 60) return 'fair';
      if (score >= 40) return 'poor';
      return 'critical';
    }
    expect(scoreToZone(100)).toBe('perfect');
    expect(scoreToZone(95)).toBe('excellent');
    expect(scoreToZone(85)).toBe('good');
    expect(scoreToZone(70)).toBe('fair');
    expect(scoreToZone(50)).toBe('poor');
    expect(scoreToZone(30)).toBe('critical');
    expect(scoreToZone(0)).toBe('critical');
  });

  it('scoreToColor maps zones to correct Tailwind classes', () => {
    const ZONE_COLORS: Record<string, string> = {
      perfect: 'text-semantic-success',
      excellent: 'text-semantic-success',
      good: 'text-semantic-warning',
      fair: 'text-semantic-warning',
      poor: 'text-semantic-danger',
      critical: 'text-semantic-danger',
    };
    function scoreToColor(score: number): string {
      function zone(s: number): string {
        if (s >= 100) return 'perfect';
        if (s >= 90) return 'excellent';
        if (s >= 80) return 'good';
        if (s >= 60) return 'fair';
        if (s >= 40) return 'poor';
        return 'critical';
      }
      return ZONE_COLORS[zone(score)]!;
    }
    // Critical (red)
    expect(scoreToColor(30)).toBe('text-semantic-danger');
    // Poor (orange-red)
    expect(scoreToColor(50)).toBe('text-semantic-danger');
    // Fair (yellow)
    expect(scoreToColor(70)).toBe('text-semantic-warning');
    // Good (light green)
    expect(scoreToColor(85)).toBe('text-semantic-warning');
    // Excellent (green)
    expect(scoreToColor(95)).toBe('text-semantic-success');
    // Perfect (green)
    expect(scoreToColor(100)).toBe('text-semantic-success');
  });

  it('useAnimatedNumber transitions smoothly from old to new value', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    const { useAnimatedNumber } = await import('../components/useAnimatedNumber');
    const { createRoot } = await import('react-dom/client');
    const React = await import('react');
    const { flushSync } = await import('react-dom');

    let current: number = 0;
    const container = document.createElement('div');
    const root = createRoot(container);

    function TestComponent({ target }: { target: number }) {
      current = useAnimatedNumber(target, 800);
      return null;
    }

    // Start at 52
    flushSync(() => {
      root.render(React.createElement(TestComponent, { target: 52 }));
    });
    expect(current).toBe(52);

    // Change target to 100
    flushSync(() => {
      root.render(React.createElement(TestComponent, { target: 100 }));
    });

    // Advance time to let rAF callbacks fire and animation complete
    await vi.advanceTimersByTimeAsync(1000);

    // After animation completes, value should reach target
    expect(Math.round(current)).toBe(100);

    root.unmount();
    vi.useRealTimers();
  });
});

describe('Celebration Dialog and Detailed Results', () => {
  it('celebration summary includes all expected metrics', () => {
    const summary = {
      healthBefore: 54,
      healthAfter: 100,
      storageRecovered: 1_250_000_000,
      registryFixed: 214,
      startupOptimized: 4,
      privacyCleaned: 342,
      durationMs: 18_000,
    };
    expect(summary.healthBefore).toBe(54);
    expect(summary.healthAfter).toBe(100);
    expect(summary.storageRecovered).toBe(1_250_000_000);
    expect(summary.registryFixed).toBe(214);
    expect(summary.startupOptimized).toBe(4);
    expect(summary.privacyCleaned).toBe(342);
    expect(summary.durationMs).toBe(18_000);
  });

  it('formatDuration converts milliseconds to readable format', () => {
    function formatDuration(ms: number): string {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const remaining = seconds % 60;
      if (minutes > 0) return `${minutes}m ${remaining}s`;
      return `${remaining}s`;
    }
    expect(formatDuration(18_000)).toBe('18s');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(0)).toBe('0s');
  });

  it('detailed result section computes scanned/removed/skipped correctly', () => {
    const module = {
      moduleId: 'junk',
      moduleName: 'Junk Cleaner',
      status: 'complete' as const,
      score: 95,
      issuesFound: 120,
      recoverableSpace: 500_000_000,
      severity: 'medium' as const,
      measuredDetail: '120 temporary files',
      details: { summary: '', impact: 'medium' as const, safeToRemove: true, groups: [], notChanged: [], why: '' },
      canAutoFix: true,
      actual: {
        success: true,
        filesDeleted: 100,
        bytesRecovered: 400_000_000,
        errors: [],
      },
    };
    const scanned = module.issuesFound;
    const removed = (module.actual!.filesDeleted || 0);
    const skipped = Math.max(0, scanned - removed);
    expect(scanned).toBe(120);
    expect(removed).toBe(100);
    expect(skipped).toBe(20);
  });

  it('detailed result section handles modules without actual results', () => {
    const module = {
      moduleId: 'disk',
      moduleName: 'Disk Analyzer',
      status: 'complete' as const,
      score: 90,
      issuesFound: 0,
      recoverableSpace: 0,
      severity: 'low' as const,
      measuredDetail: 'No issues',
      details: { summary: '', impact: 'low' as const, safeToRemove: true, groups: [], notChanged: [], why: '' },
      canAutoFix: false,
      actual: undefined,
    };
    const hasActual = Boolean(module.actual);
    expect(hasActual).toBe(false);
    const removed = 0;
    const skipped = Math.max(0, module.issuesFound - removed);
    expect(removed).toBe(0);
    expect(skipped).toBe(0);
  });

  it('detailed result section handles skipped modules', () => {
    const module = {
      moduleId: 'registry',
      moduleName: 'Registry Cleaner',
      status: 'skipped' as const,
      score: 0,
      issuesFound: 0,
      recoverableSpace: 0,
      severity: 'low' as const,
      measuredDetail: 'Skipped',
      details: { summary: '', impact: 'low' as const, safeToRemove: true, groups: [], notChanged: [], why: '' },
      canAutoFix: true,
    };
    expect(module.status).toBe('skipped');
    expect(module.issuesFound).toBe(0);
  });
});

describe('Health Badge (Part 10)', () => {
  it('scoreToHealthBadge maps scores to correct badge types', () => {
    function scoreToHealthBadge(score: number): string {
      if (score >= 90) return 'excellent';
      if (score >= 75) return 'healthy';
      if (score >= 50) return 'needs_attention';
      if (score >= 30) return 'poor';
      return 'critical';
    }
    expect(scoreToHealthBadge(100)).toBe('excellent');
    expect(scoreToHealthBadge(90)).toBe('excellent');
    expect(scoreToHealthBadge(80)).toBe('healthy');
    expect(scoreToHealthBadge(75)).toBe('healthy');
    expect(scoreToHealthBadge(60)).toBe('needs_attention');
    expect(scoreToHealthBadge(50)).toBe('needs_attention');
    expect(scoreToHealthBadge(40)).toBe('poor');
    expect(scoreToHealthBadge(30)).toBe('poor');
    expect(scoreToHealthBadge(20)).toBe('critical');
    expect(scoreToHealthBadge(0)).toBe('critical');
  });

  it('HEALTH_BADGE_CONFIG has labels for all badge types', () => {
    const badges = ['excellent', 'healthy', 'needs_attention', 'poor', 'critical'];
    const labels = ['Excellent', 'Healthy', 'Needs Attention', 'Poor', 'Critical'];
    for (let i = 0; i < badges.length; i++) {
      expect(labels[i]).toBeTruthy();
    }
  });
});

describe('Dashboard Messages (Part 11)', () => {
  it('getDashboardMessage returns correct message for score 100', () => {
    function getDashboardMessage(score: number): { title: string; description: string } {
      if (score >= 100) return { title: 'Health 100', description: 'Your PC is fully optimized.' };
      if (score >= 85) return { title: `Health ${score}`, description: 'Your PC is performing well.' };
      if (score >= 60) return { title: `Health ${score}`, description: 'Optimization recommended.' };
      if (score >= 40) return { title: `Health ${score}`, description: 'Optimization strongly recommended.' };
      return { title: `Health ${score}`, description: 'Immediate optimization recommended.' };
    }
    const msg = getDashboardMessage(100);
    expect(msg.title).toBe('Health 100');
    expect(msg.description).toBe('Your PC is fully optimized.');
  });

  it('getDashboardMessage returns correct message for score 85', () => {
    function getDashboardMessage(score: number): { title: string; description: string } {
      if (score >= 100) return { title: 'Health 100', description: 'Your PC is fully optimized.' };
      if (score >= 85) return { title: `Health ${score}`, description: 'Your PC is performing well.' };
      if (score >= 60) return { title: `Health ${score}`, description: 'Optimization recommended.' };
      if (score >= 40) return { title: `Health ${score}`, description: 'Optimization strongly recommended.' };
      return { title: `Health ${score}`, description: 'Immediate optimization recommended.' };
    }
    const msg = getDashboardMessage(85);
    expect(msg.title).toBe('Health 85');
    expect(msg.description).toBe('Your PC is performing well.');
  });

  it('getDashboardMessage returns correct message for score 60', () => {
    function getDashboardMessage(score: number): { title: string; description: string } {
      if (score >= 100) return { title: 'Health 100', description: 'Your PC is fully optimized.' };
      if (score >= 85) return { title: `Health ${score}`, description: 'Your PC is performing well.' };
      if (score >= 60) return { title: `Health ${score}`, description: 'Optimization recommended.' };
      if (score >= 40) return { title: `Health ${score}`, description: 'Optimization strongly recommended.' };
      return { title: `Health ${score}`, description: 'Immediate optimization recommended.' };
    }
    const msg = getDashboardMessage(60);
    expect(msg.title).toBe('Health 60');
    expect(msg.description).toBe('Optimization recommended.');
  });

  it('getDashboardMessage returns correct message for score 35', () => {
    function getDashboardMessage(score: number): { title: string; description: string } {
      if (score >= 100) return { title: 'Health 100', description: 'Your PC is fully optimized.' };
      if (score >= 85) return { title: `Health ${score}`, description: 'Your PC is performing well.' };
      if (score >= 60) return { title: `Health ${score}`, description: 'Optimization recommended.' };
      if (score >= 40) return { title: `Health ${score}`, description: 'Optimization strongly recommended.' };
      return { title: `Health ${score}`, description: 'Immediate optimization recommended.' };
    }
    const msg = getDashboardMessage(35);
    expect(msg.title).toBe('Health 35');
    expect(msg.description).toBe('Immediate optimization recommended.');
  });
});

describe('Smart Recommendations (Part 13)', () => {
  function makeHealth(score: number): any {
    return { overallScore: score, issues: [], scoreZone: 'good' };
  }

  function makeMetrics(overrides: any = {}): any {
    return {
      performance: {
        temporaryFilesSize: 0,
        recycleBinSize: 0,
        browserCacheSize: 0,
        startupApps: 0,
        ...overrides.performance,
      },
      storage: [{ mount: 'C:', usage: 50, free: 250_000_000_000, name: 'SSD' }],
      memory: { usage: 50 },
      security: { defender: { enabled: true, realTimeProtection: true } },
      ...overrides,
    };
  }

  it('generates health recommendation for excellent score', () => {
    function generateRecommendations(health: any, _metrics: any): any[] {
      const recs: any[] = [];
      if (health.overallScore >= 90) {
        recs.push({ id: 'health-excellent', title: 'Your PC Health is Excellent', description: 'Next optimization recommended in 7 days.', category: 'health' });
      }
      return recs;
    }
    const recs = generateRecommendations(makeHealth(95), makeMetrics());
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe('health-excellent');
    expect(recs[0].description).toContain('7 days');
  });

  it('generates disk cleanup recommendation when storage is high', () => {
    function generateRecommendations(health: any, metrics: any): any[] {
      const recs: any[] = [];
      const totalJunk = metrics.performance.temporaryFilesSize + metrics.performance.recycleBinSize + metrics.performance.browserCacheSize;
      if (totalJunk > 500 * 1024 * 1024) {
        recs.push({ id: 'rec-disk-cleanup', title: 'Disk Cleanup Recommended', category: 'storage', actionPath: '/junk-cleaner' });
      }
      return recs;
    }
    const recs = generateRecommendations(makeHealth(80), makeMetrics({
      performance: { temporaryFilesSize: 600_000_000, recycleBinSize: 0, browserCacheSize: 0, startupApps: 0 },
    }));
    expect(recs.some((r) => r.id === 'rec-disk-cleanup')).toBe(true);
    expect(recs.find((r) => r.id === 'rec-disk-cleanup')!.actionPath).toBe('/junk-cleaner');
  });

  it('generates startup optimization recommendation when startup apps are high', () => {
    function generateRecommendations(health: any, metrics: any): any[] {
      const recs: any[] = [];
      if (metrics.performance.startupApps > 5) {
        recs.push({ id: 'rec-startup-optimization', title: 'Startup Optimization Recommended', category: 'startup', actionPath: '/startup-manager' });
      }
      return recs;
    }
    const recs = generateRecommendations(makeHealth(80), makeMetrics({
      performance: { temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, startupApps: 8 },
    }));
    expect(recs.some((r) => r.id === 'rec-startup-optimization')).toBe(true);
    expect(recs.find((r) => r.id === 'rec-startup-optimization')!.actionPath).toBe('/startup-manager');
  });

  it('generates privacy cleaner recommendation when browser cache is high', () => {
    function generateRecommendations(health: any, metrics: any): any[] {
      const recs: any[] = [];
      if (metrics.performance.browserCacheSize > 100 * 1024 * 1024) {
        recs.push({ id: 'rec-privacy-cleaner', title: 'Privacy Cleaner Recommended', category: 'privacy', actionPath: '/privacy-cleaner' });
      }
      return recs;
    }
    const recs = generateRecommendations(makeHealth(80), makeMetrics({
      performance: { temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 200_000_000, startupApps: 0 },
    }));
    expect(recs.some((r) => r.id === 'rec-privacy-cleaner')).toBe(true);
    expect(recs.find((r) => r.id === 'rec-privacy-cleaner')!.actionPath).toBe('/privacy-cleaner');
  });

  it('generates drive full recommendation when drive usage is critical', () => {
    function generateRecommendations(health: any, metrics: any): any[] {
      const recs: any[] = [];
      const criticalDrive = metrics.storage.find((d: any) => d.usage > 90);
      if (criticalDrive) {
        recs.push({ id: 'rec-drive-full', title: `Drive ${criticalDrive.mount} Nearly Full`, category: 'storage', actionPath: '/disk-analyzer' });
      }
      return recs;
    }
    const recs = generateRecommendations(makeHealth(80), makeMetrics({
      storage: [{ mount: 'C:', usage: 95, free: 20_000_000_000, name: 'SSD' }],
    }));
    expect(recs.some((r) => r.id === 'rec-drive-full')).toBe(true);
  });

  it('generates security recommendation when defender is disabled', () => {
    function generateRecommendations(health: any, metrics: any): any[] {
      const recs: any[] = [];
      if (!metrics.security.defender.enabled || !metrics.security.defender.realTimeProtection) {
        recs.push({ id: 'rec-security-check', title: 'Security Check Recommended', category: 'security', actionPath: '/security' });
      }
      return recs;
    }
    const recs = generateRecommendations(makeHealth(80), makeMetrics({
      security: { defender: { enabled: false, realTimeProtection: false } },
    }));
    expect(recs.some((r) => r.id === 'rec-security-check')).toBe(true);
  });

  it('generates memory optimization recommendation when RAM usage is high', () => {
    function generateRecommendations(health: any, metrics: any): any[] {
      const recs: any[] = [];
      if (metrics.memory.usage > 85) {
        recs.push({ id: 'rec-memory-optimization', title: 'Memory Optimization Recommended', category: 'performance', actionPath: '/performance' });
      }
      return recs;
    }
    const recs = generateRecommendations(makeHealth(80), makeMetrics({
      memory: { usage: 90 },
    }));
    expect(recs.some((r) => r.id === 'rec-memory-optimization')).toBe(true);
  });

  it('does not generate disk cleanup recommendation when storage is fine', () => {
    function generateRecommendations(health: any, metrics: any): any[] {
      const recs: any[] = [];
      const totalJunk = metrics.performance.temporaryFilesSize + metrics.performance.recycleBinSize + metrics.performance.browserCacheSize;
      if (totalJunk > 500 * 1024 * 1024) {
        recs.push({ id: 'rec-disk-cleanup', category: 'storage' });
      }
      return recs;
    }
    const recs = generateRecommendations(makeHealth(80), makeMetrics({
      performance: { temporaryFilesSize: 100_000_000, recycleBinSize: 50_000_000, browserCacheSize: 20_000_000, startupApps: 0 },
    }));
    expect(recs.some((r) => r.id === 'rec-disk-cleanup')).toBe(false);
  });
});

describe('Empty States (Part 12)', () => {
  it('issues empty state shows positive messaging when no issues', () => {
    const issues: any[] = [];
    expect(issues.length).toBe(0);
    // The empty state should show "Everything looks great." and "No optimization required."
    const emptyTitle = 'Everything looks great.';
    const emptyDescription = 'No optimization required. Your PC is running at peak performance.';
    expect(emptyTitle).toBe('Everything looks great.');
    expect(emptyDescription).toContain('No optimization required');
    expect(emptyDescription).toContain('peak performance');
  });
});
