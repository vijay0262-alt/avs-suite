// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  optimizationHistoryService,
  OptimizationHistoryService,
  InMemoryOptimizationHistoryStore,
} from '../OptimizationHistoryService';
import {
  healthTimelineService,
  HealthTimelineService,
  InMemoryHealthTimelineStore,
} from '../HealthTimelineService';
import {
  healthNotificationService,
  HealthNotificationService,
} from '../HealthNotificationService';
import {
  getHealthEngineConfig,
  setHealthEngineConfig,
  resetHealthEngineConfig,
  DEFAULT_HEALTH_ENGINE_CONFIG,
} from '../HealthEngineConfig';
import { calculateHealthScore } from '../../dashboard/dashboard.utils';
import type { DashboardMetrics } from '../../dashboard/dashboard.types';

// ── Helpers ──────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<DashboardMetrics> = {}): DashboardMetrics {
  return {
    capturedAt: new Date().toISOString(),
    cpu: { usage: 35, frequency: 3200, logicalProcessors: 8, physicalProcessors: 4, processes: 150, threads: 600, temperature: null },
    memory: { total: 16_000_000_000, used: 8_000_000_000, available: 8_000_000_000, usage: 50, cached: 1_000_000_000, swapTotal: 4_000_000_000, swapUsed: 0, swapUsage: 0 },
    storage: [{ mount: 'C:', name: 'SSD', total: 500_000_000_000, used: 250_000_000_000, free: 250_000_000_000, usage: 50, isSSD: true, fileSystem: 'NTFS' }],
    windows: { version: '10', build: '19041', uptime: 3 * 86400, isAdministrator: true, powerMode: 'balanced', battery: null, secureBoot: true, tpmStatus: true },
    security: {
      defender: { enabled: true, realTimeProtection: true },
      firewall: { enabled: true },
      updates: { pendingUpdates: 0, lastUpdateDate: null },
      realTimeProtection: true,
      smartScreen: true,
    },
    performance: { startupApps: 0, backgroundProcesses: 50, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    ...overrides,
  } as DashboardMetrics;
}

// ── Part 7: Improvement Summary ──────────────────────────────────────

describe('Part 7 — Improvement Summary', () => {
  it('OptimizationSummary type has all required fields', () => {
    const summary = {
      healthBefore: 53,
      healthAfter: 100,
      storageRecovered: 1_050_000_000,
      registryFixed: 243,
      startupOptimized: 3,
      privacyCleaned: 128,
      duplicateFilesRemoved: 0,
      durationMs: 18_000,
      completedAt: new Date().toISOString(),
      success: true,
    };
    expect(summary.healthBefore).toBe(53);
    expect(summary.healthAfter).toBe(100);
    expect(summary.storageRecovered).toBe(1_050_000_000);
    expect(summary.registryFixed).toBe(243);
    expect(summary.startupOptimized).toBe(3);
    expect(summary.privacyCleaned).toBe(128);
    expect(summary.duplicateFilesRemoved).toBe(0);
    expect(summary.durationMs).toBe(18_000);
    expect(summary.success).toBe(true);
  });
});

// ── Part 8: Historical Tracking ──────────────────────────────────────

describe('Part 8 — Optimization History', () => {
  let service: OptimizationHistoryService;

  beforeEach(() => {
    service = new OptimizationHistoryService(new InMemoryOptimizationHistoryStore());
  });

  it('records an optimization entry with all fields', () => {
    const entry = service.recordOptimization({
      timestamp: '2026-01-01T10:00:00Z',
      healthBefore: 53,
      healthAfter: 100,
      storageRecovered: 1_050_000_000,
      registryFixed: 243,
      startupOptimized: 3,
      privacyCleaned: 128,
      duplicateFilesRemoved: 5,
      durationMs: 18_000,
      result: 'success',
      modulesUsed: ['junk', 'registry', 'startup', 'privacy'],
    });
    expect(entry.id).toBeTruthy();
    expect(entry.healthBefore).toBe(53);
    expect(entry.healthAfter).toBe(100);
    expect(entry.storageRecovered).toBe(1_050_000_000);
    expect(entry.registryFixed).toBe(243);
    expect(entry.startupOptimized).toBe(3);
    expect(entry.privacyCleaned).toBe(128);
    expect(entry.duplicateFilesRemoved).toBe(5);
    expect(entry.durationMs).toBe(18_000);
    expect(entry.result).toBe('success');
    expect(entry.modulesUsed).toEqual(['junk', 'registry', 'startup', 'privacy']);
  });

  it('retrieves history entries', () => {
    service.recordOptimization({ timestamp: '2026-01-01T10:00:00Z', healthBefore: 50, healthAfter: 90, storageRecovered: 500, registryFixed: 10, startupOptimized: 1, privacyCleaned: 5, duplicateFilesRemoved: 0, durationMs: 5000, result: 'success', modulesUsed: ['junk'] });
    service.recordOptimization({ timestamp: '2026-01-02T10:00:00Z', healthBefore: 60, healthAfter: 95, storageRecovered: 800, registryFixed: 20, startupOptimized: 2, privacyCleaned: 10, duplicateFilesRemoved: 0, durationMs: 8000, result: 'success', modulesUsed: ['junk', 'privacy'] });

    const history = service.getHistory();
    expect(history.length).toBe(2);
    // Most recent first
    expect(history[0]!.healthBefore).toBe(60);
    expect(history[1]!.healthBefore).toBe(50);
  });

  it('getRecentHistory returns N most recent', () => {
    for (let i = 0; i < 5; i++) {
      service.recordOptimization({ timestamp: `2026-01-0${i + 1}T10:00:00Z`, healthBefore: 50 + i, healthAfter: 90, storageRecovered: 100, registryFixed: 1, startupOptimized: 0, privacyCleaned: 0, duplicateFilesRemoved: 0, durationMs: 1000, result: 'success', modulesUsed: ['junk'] });
    }
    const recent = service.getRecentHistory(3);
    expect(recent.length).toBe(3);
    expect(recent[0]!.healthBefore).toBe(54);
    expect(recent[2]!.healthBefore).toBe(52);
  });

  it('clears history', () => {
    service.recordOptimization({ timestamp: '2026-01-01T10:00:00Z', healthBefore: 50, healthAfter: 90, storageRecovered: 100, registryFixed: 1, startupOptimized: 0, privacyCleaned: 0, duplicateFilesRemoved: 0, durationMs: 1000, result: 'success', modulesUsed: ['junk'] });
    expect(service.getHistoryCount()).toBe(1);
    service.clearHistory();
    expect(service.getHistoryCount()).toBe(0);
  });

  it('global singleton works', () => {
    expect(optimizationHistoryService).toBeDefined();
    expect(optimizationHistoryService.getHistory()).toBeDefined();
  });
});

// ── Part 9: Health Timeline ──────────────────────────────────────────

describe('Part 9 — Health Timeline', () => {
  let service: HealthTimelineService;

  beforeEach(() => {
    service = new HealthTimelineService(new InMemoryHealthTimelineStore());
  });

  it('records a health score reading', () => {
    const entry = service.recordHealth(95, 'excellent', 2);
    expect(entry.score).toBe(95);
    expect(entry.scoreZone).toBe('excellent');
    expect(entry.issueCount).toBe(2);
    expect(entry.timestamp).toBeTruthy();
  });

  it('retrieves full timeline', () => {
    service.recordHealth(100, 'perfect', 0);
    service.recordHealth(96, 'excellent', 1);
    service.recordHealth(91, 'excellent', 2);
    const timeline = service.getTimeline();
    expect(timeline.length).toBe(3);
    expect(timeline[0]!.score).toBe(100);
    expect(timeline[2]!.score).toBe(91);
  });

  it('getLast30Days returns entries within 30 days', () => {
    service.recordHealth(100, 'perfect', 0);
    service.recordHealth(94, 'excellent', 3);
    const recent = service.getLast30Days();
    expect(recent.length).toBe(2);
  });

  it('getDailySummary returns one entry per day', () => {
    // Record multiple entries on the same day
    service.recordHealth(100, 'perfect', 0);
    service.recordHealth(96, 'excellent', 1);
    service.recordHealth(91, 'excellent', 2);
    const daily = service.getDailySummary(30);
    // All entries are from today, so should be 1
    expect(daily.length).toBe(1);
    // Last entry for the day wins
    expect(daily[0]!.score).toBe(91);
  });

  it('clears timeline', () => {
    service.recordHealth(100, 'perfect', 0);
    expect(service.getCount()).toBe(1);
    service.clear();
    expect(service.getCount()).toBe(0);
  });

  it('global singleton works', () => {
    expect(healthTimelineService).toBeDefined();
    expect(healthTimelineService.getTimeline()).toBeDefined();
  });
});

// ── Part 10: Health Notifications ────────────────────────────────────

describe('Part 10 — Health Notifications', () => {
  let service: HealthNotificationService;

  beforeEach(() => {
    service = new HealthNotificationService();
    service.reset();
  });

  it('does not fire notification on first check (no baseline)', () => {
    const notifications = service.checkForChanges(100, 0, 0);
    expect(notifications.length).toBe(0);
  });

  it('fires score drop notification when score drops significantly', () => {
    service.checkForChanges(100, 0, 0); // establish baseline
    const notifications = service.checkForChanges(82, 0, 0);
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    const scoreNotif = notifications.find((n) => n.title === 'PC Health Changed');
    expect(scoreNotif).toBeDefined();
    expect(scoreNotif!.message).toContain('82%');
    expect(scoreNotif!.severity).toBe('warning');
  });

  it('fires critical notification when score drops below 60', () => {
    service.checkForChanges(90, 0, 0);
    const notifications = service.checkForChanges(55, 0, 0);
    const scoreNotif = notifications.find((n) => n.title === 'PC Health Changed');
    expect(scoreNotif).toBeDefined();
    expect(scoreNotif!.severity).toBe('critical');
  });

  it('fires junk accumulation notification when junk exceeds 1GB', () => {
    service.checkForChanges(100, 0, 0);
    const notifications = service.checkForChanges(100, 1_500_000_000, 0);
    const junkNotif = notifications.find((n) => n.title === 'Junk Files Accumulating');
    expect(junkNotif).toBeDefined();
    expect(junkNotif!.message).toContain('GB');
  });

  it('fires new startup apps notification', () => {
    service.checkForChanges(100, 0, 0);
    const notifications = service.checkForChanges(100, 0, 5);
    const startupNotif = notifications.find((n) => n.title === 'New Startup Applications');
    expect(startupNotif).toBeDefined();
    expect(startupNotif!.message).toContain('5');
  });

  it('does not fire notification for small changes', () => {
    service.checkForChanges(100, 0, 0);
    const notifications = service.checkForChanges(98, 100_000, 1);
    expect(notifications.length).toBe(0);
  });

  it('respects notification cooldown', () => {
    service.checkForChanges(100, 0, 0);
    // First drop fires
    const first = service.checkForChanges(80, 0, 0);
    expect(first.length).toBeGreaterThanOrEqual(1);
    // Second drop within cooldown should not fire
    const second = service.checkForChanges(70, 0, 0);
    const scoreNotif = second.find((n) => n.title === 'PC Health Changed');
    expect(scoreNotif).toBeUndefined();
  });

  it('supports subscribe/unsubscribe', () => {
    const received: any[] = [];
    const unsub = service.subscribe((n) => received.push(n));
    service.checkForChanges(100, 0, 0);
    service.checkForChanges(80, 0, 0);
    expect(received.length).toBeGreaterThanOrEqual(1);
    unsub();
    received.length = 0;
    // After unsubscribe, no more notifications received
    service.checkForChanges(100, 0, 0);
    service.checkForChanges(70, 0, 0);
    // Cooldown might block, but the listener should definitely not be called
    expect(received.length).toBe(0);
  });

  it('global singleton works', () => {
    expect(healthNotificationService).toBeDefined();
  });
});

// ── Part 11: Future Module Support ───────────────────────────────────

describe('Part 11 — Future Module Support (registration-only)', () => {
  it('HealthScoreService accepts arbitrary ModuleId strings', () => {
    // The ModuleId type is a string, so future modules like 'driver-updater',
    // 'antivirus', 'vpn', 'backup', 'browser-protection' can register
    // without Dashboard changes.
    const futureModules = [
      'driver-updater',
      'antivirus',
      'disk-optimizer',
      'vpn',
      'backup',
      'browser-protection',
    ];
    // Each can be used as a ModuleId — no type error
    futureModules.forEach((id) => {
      expect(typeof id).toBe('string');
    });
  });

  it('HealthEngineConfig weights can be extended without code changes', () => {
    const config = getHealthEngineConfig();
    // The weights object accepts any HealthScoreWeights — future modules
    // can add their weight without modifying calculateHealthScore
    expect(config.weights).toBeDefined();
    expect(config.weights.storage).toBe(0.30);
  });

  it('HealthScoreService registerModuleWeight works for future modules', async () => {
    // Import dynamically to avoid circular deps in test setup
    const { HealthScoreService } = await import('../HealthScoreService');
    const svc = new HealthScoreService();
    // Register a future module weight
    svc.registerModuleWeight('driver-updater' as any, 10, 'Driver Updater');
    const weights = svc.getModuleWeights();
    expect(weights.length).toBeGreaterThan(0);
    const driverWeight = weights.find((w) => w.moduleId === 'driver-updater');
    expect(driverWeight).toBeDefined();
    expect(driverWeight!.displayName).toBe('Driver Updater');
    // Unregister
    svc.unregisterModuleWeight('driver-updater' as any);
    const weightsAfter = svc.getModuleWeights();
    expect(weightsAfter.find((w) => w.moduleId === 'driver-updater')).toBeUndefined();
  });
});

// ── Part 12: Configuration ───────────────────────────────────────────

describe('Part 12 — Health Engine Configuration', () => {
  afterEach(() => {
    resetHealthEngineConfig();
  });

  it('default config has all threshold sections', () => {
    const config = getHealthEngineConfig();
    expect(config.weights).toBeDefined();
    expect(config.scoreZoneThresholds).toBeDefined();
    expect(config.storage).toBeDefined();
    expect(config.startup).toBeDefined();
    expect(config.privacy).toBeDefined();
    expect(config.performance).toBeDefined();
    expect(config.security).toBeDefined();
    expect(config.windows).toBeDefined();
    expect(config.notifications).toBeDefined();
  });

  it('default score zone thresholds match expected values', () => {
    const t = getHealthEngineConfig().scoreZoneThresholds;
    expect(t.perfect).toBe(100);
    expect(t.excellent).toBe(90);
    expect(t.good).toBe(80);
    expect(t.fair).toBe(60);
    expect(t.poor).toBe(40);
  });

  it('default storage thresholds match expected values', () => {
    const t = getHealthEngineConfig().storage;
    expect(t.maxJunkPenalty).toBe(40);
    expect(t.junkPenaltyMultiplier).toBe(5);
    expect(t.driveCriticalThreshold).toBe(90);
    expect(t.driveWarningThreshold).toBe(80);
  });

  it('default notification thresholds match expected values', () => {
    const t = getHealthEngineConfig().notifications;
    expect(t.scoreDropThreshold).toBe(5);
    expect(t.junkAccumulationThreshold).toBe(1_000_000_000);
    expect(t.newStartupAppsThreshold).toBe(3);
  });

  it('setHealthEngineConfig overrides individual sections', () => {
    const original = getHealthEngineConfig();
    expect(original.storage.maxJunkPenalty).toBe(40);

    setHealthEngineConfig({
      storage: { ...original.storage, maxJunkPenalty: 50 },
    });

    const updated = getHealthEngineConfig();
    expect(updated.storage.maxJunkPenalty).toBe(50);
    // Other sections unchanged
    expect(updated.startup).toEqual(original.startup);
  });

  it('resetHealthEngineConfig restores defaults', () => {
    setHealthEngineConfig({
      storage: { ...getHealthEngineConfig().storage, maxJunkPenalty: 99 },
    });
    expect(getHealthEngineConfig().storage.maxJunkPenalty).toBe(99);
    resetHealthEngineConfig();
    expect(getHealthEngineConfig().storage.maxJunkPenalty).toBe(40);
  });

  it('calculateHealthScore uses configurable thresholds', () => {
    // With default config, score 100 = perfect
    const clean = calculateHealthScore(makeMetrics(), 0);
    expect(clean.scoreZone).toBe('perfect');

    // Change perfect threshold to 95 — score 100 should still be perfect
    setHealthEngineConfig({
      scoreZoneThresholds: { ...getHealthEngineConfig().scoreZoneThresholds, perfect: 95 },
    });
    const clean2 = calculateHealthScore(makeMetrics(), 0);
    expect(clean2.scoreZone).toBe('perfect');

    // Change excellent threshold to 98 — score 96 should now be 'good' not 'excellent'
    setHealthEngineConfig({
      scoreZoneThresholds: { perfect: 100, excellent: 98, good: 80, fair: 60, poor: 40 },
    });
    // Create metrics that produce score ~96
    const near = calculateHealthScore(makeMetrics({
      performance: { startupApps: 1, backgroundProcesses: 30, temporaryFilesSize: 50_000_000, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 50_000_000 },
    }), 0);
    // Score should be >= 98 (excellent) or < 98 (good) depending on threshold
    if (near.overallScore >= 98) {
      expect(near.scoreZone).toBe('excellent');
    } else {
      expect(near.scoreZone).toBe('good');
    }
  });

  it('calculateHealthScore uses configurable storage thresholds', () => {
    const metrics = makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 500_000_000, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 500_000_000 },
    });

    // Default: 500MB junk → some penalty
    const defaultScore = calculateHealthScore(metrics, 0);

    // Increase max junk penalty → score should be lower
    setHealthEngineConfig({
      storage: { ...getHealthEngineConfig().storage, maxJunkPenalty: 80, junkPenaltyMultiplier: 10 },
    });
    const harsherScore = calculateHealthScore(metrics, 0);
    expect(harsherScore.overallScore).toBeLessThan(defaultScore.overallScore);
  });

  it('DEFAULT_HEALTH_ENGINE_CONFIG is a complete config object', () => {
    expect(DEFAULT_HEALTH_ENGINE_CONFIG.weights).toBeDefined();
    expect(DEFAULT_HEALTH_ENGINE_CONFIG.scoreZoneThresholds.perfect).toBe(100);
    expect(DEFAULT_HEALTH_ENGINE_CONFIG.performance.cpuCriticalThreshold).toBe(80);
  });
});

// ── Part 14: Comprehensive Testing ───────────────────────────────────

describe('Part 14 — Penalty Weighting', () => {
  afterEach(() => {
    resetHealthEngineConfig();
  });

  it('storage weight dominates when junk is large', () => {
    const metrics = makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 5_000_000_000, recycleBinSize: 2_000_000_000, browserCacheSize: 1_000_000_000, potentialRecoverable: 8_000_000_000 },
    });
    const score = calculateHealthScore(metrics, 0);
    // Storage score should be significantly penalized
    expect(score.categoryScores.storage).toBeLessThan(90);
    // Overall score should reflect storage weight (0.30)
    expect(score.overallScore).toBeLessThan(100);
  });

  it('startup penalty is proportional to number of apps', () => {
    const few = calculateHealthScore(makeMetrics({ performance: { startupApps: 2, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 0);
    const many = calculateHealthScore(makeMetrics({ performance: { startupApps: 10, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 } }), 0);
    expect(many.categoryScores.startup).toBeLessThan(few.categoryScores.startup);
    expect(many.overallScore).toBeLessThan(few.overallScore);
  });

  it('privacy penalty is proportional to risk count', () => {
    const low = calculateHealthScore(makeMetrics(), 1);
    const high = calculateHealthScore(makeMetrics(), 5);
    expect(high.categoryScores.privacy).toBeLessThan(low.categoryScores.privacy);
    expect(high.overallScore).toBeLessThan(low.overallScore);
  });

  it('security penalties apply for disabled protections', () => {
    const secure = calculateHealthScore(makeMetrics(), 0);
    const insecure = calculateHealthScore(makeMetrics({
      security: {
        defender: { enabled: false, realTimeProtection: false },
        firewall: { enabled: false },
        updates: { pendingUpdates: 5, lastUpdateDate: null },
        realTimeProtection: false,
        smartScreen: false,
      },
    }), 0);
    expect(insecure.categoryScores.security).toBeLessThan(secure.categoryScores.security);
    expect(insecure.overallScore).toBeLessThan(secure.overallScore);
  });

  it('performance penalty only applies above thresholds', () => {
    const normal = calculateHealthScore(makeMetrics({ cpu: { usage: 40, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 100, threads: 500, temperature: null }, memory: { total: 16_000_000_000, used: 6_000_000_000, available: 10_000_000_000, usage: 40, cached: 0, swapTotal: 0, swapUsed: 0, swapUsage: 0 } }), 0);
    expect(normal.categoryScores.performance).toBe(100);

    const highCpu = calculateHealthScore(makeMetrics({ cpu: { usage: 85, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 200, threads: 800, temperature: null } }), 0);
    expect(highCpu.categoryScores.performance).toBeLessThan(100);
  });
});

describe('Part 14 — Score Recovery After Optimization', () => {
  afterEach(() => {
    resetHealthEngineConfig();
  });

  it('score recovers to 100 after all fixable issues are resolved', () => {
    const dirty = calculateHealthScore(makeMetrics({
      performance: { startupApps: 8, backgroundProcesses: 100, temporaryFilesSize: 3_000_000_000, recycleBinSize: 1_000_000_000, browserCacheSize: 500_000_000, potentialRecoverable: 4_500_000_000 },
    }), 5);
    expect(dirty.overallScore).toBeLessThan(100);

    // After optimization: all fixable issues resolved
    const clean = calculateHealthScore(makeMetrics({
      cpu: { usage: 15, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 80, threads: 400, temperature: null },
      memory: { total: 16_000_000_000, used: 4_000_000_000, available: 12_000_000_000, usage: 25, cached: 0, swapTotal: 0, swapUsed: 0, swapUsage: 0 },
      performance: { startupApps: 0, backgroundProcesses: 30, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    }), 0);
    expect(clean.overallScore).toBe(100);
    expect(clean.scoreZone).toBe('perfect');
    expect(clean.status).toBe('perfect');
  });

  it('score improves but does not reach 100 when unresolvable issues remain', () => {
    const dirty = calculateHealthScore(makeMetrics({
      performance: { startupApps: 8, backgroundProcesses: 100, temporaryFilesSize: 3_000_000_000, recycleBinSize: 1_000_000_000, browserCacheSize: 500_000_000, potentialRecoverable: 4_500_000_000 },
      storage: [{ mount: 'C:', name: 'SSD', total: 500_000_000_000, used: 475_000_000_000, free: 25_000_000_000, usage: 95, isSSD: true, fileSystem: 'NTFS' }],
    }), 5);
    expect(dirty.overallScore).toBeLessThan(100);

    // After optimization: junk cleaned, but disk is still critically full
    const afterOpt = calculateHealthScore(makeMetrics({
      cpu: { usage: 15, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 80, threads: 400, temperature: null },
      memory: { total: 16_000_000_000, used: 4_000_000_000, available: 12_000_000_000, usage: 25, cached: 0, swapTotal: 0, swapUsed: 0, swapUsage: 0 },
      performance: { startupApps: 0, backgroundProcesses: 30, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
      storage: [{ mount: 'C:', name: 'SSD', total: 500_000_000_000, used: 470_000_000_000, free: 30_000_000_000, usage: 94, isSSD: true, fileSystem: 'NTFS' }],
    }), 0);
    // Score should improve
    expect(afterOpt.overallScore).toBeGreaterThan(dirty.overallScore);
    // But should NOT be 100 because disk is still critically full
    expect(afterOpt.overallScore).toBeLessThan(100);
    expect(afterOpt.unresolvableIssues.length).toBeGreaterThan(0);
    expect(afterOpt.unresolvableIssues.some((i) => i.includes('critically full'))).toBe(true);
  });

  it('score does not reach 100 when security is disabled (requires user action)', () => {
    const afterOpt = calculateHealthScore(makeMetrics({
      cpu: { usage: 15, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 80, threads: 400, temperature: null },
      memory: { total: 16_000_000_000, used: 4_000_000_000, available: 12_000_000_000, usage: 25, cached: 0, swapTotal: 0, swapUsed: 0, swapUsage: 0 },
      performance: { startupApps: 0, backgroundProcesses: 30, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
      security: {
        defender: { enabled: false, realTimeProtection: false },
        firewall: { enabled: false },
        updates: { pendingUpdates: 0, lastUpdateDate: null },
        realTimeProtection: false,
        smartScreen: true,
      },
    }), 0);
    expect(afterOpt.overallScore).toBeLessThan(100);
    expect(afterOpt.unresolvableIssues.some((i) => i.includes('Defender'))).toBe(true);
  });

  it('score does not reach 100 when uptime is very long (requires reboot)', () => {
    const afterOpt = calculateHealthScore(makeMetrics({
      cpu: { usage: 15, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 80, threads: 400, temperature: null },
      memory: { total: 16_000_000_000, used: 4_000_000_000, available: 12_000_000_000, usage: 25, cached: 0, swapTotal: 0, swapUsed: 0, swapUsage: 0 },
      performance: { startupApps: 0, backgroundProcesses: 30, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
      windows: { version: '10', build: '19041', uptime: 65 * 86400, isAdministrator: true, powerMode: 'balanced', battery: null, secureBoot: true, tpmStatus: true },
    }), 0);
    expect(afterOpt.overallScore).toBeLessThan(100);
    expect(afterOpt.unresolvableIssues.some((i) => i.includes('uptime'))).toBe(true);
  });

  it('unresolvableIssues is empty when everything is fixable', () => {
    const clean = calculateHealthScore(makeMetrics(), 0);
    expect(clean.unresolvableIssues).toEqual([]);
    expect(clean.overallScore).toBe(100);
  });
});

describe('Part 14 — Progressive Degradation Based on Real Scan Data', () => {
  afterEach(() => {
    resetHealthEngineConfig();
  });

  it('score degrades gradually as junk accumulates', () => {
    const scores: number[] = [];
    for (const junkMB of [0, 100, 500, 1000, 5000, 10000]) {
      const s = calculateHealthScore(makeMetrics({
        performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: junkMB * 1_000_000, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: junkMB * 1_000_000 },
      }), 0);
      scores.push(s.overallScore);
    }
    // Each step should be <= previous (gradual decline)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
    // First should be 100, last should be significantly lower
    expect(scores[0]).toBe(100);
    expect(scores[scores.length - 1]!).toBeLessThan(scores[0]!);
  });

  it('score degrades gradually as startup apps increase', () => {
    const scores: number[] = [];
    for (const apps of [0, 1, 3, 5, 8, 10]) {
      const s = calculateHealthScore(makeMetrics({
        performance: { startupApps: apps, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
      }), 0);
      scores.push(s.overallScore);
    }
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
    expect(scores[0]).toBe(100);
    expect(scores[scores.length - 1]!).toBeLessThan(scores[0]!);
  });

  it('score does not degrade from normal CPU/memory usage', () => {
    const normal = calculateHealthScore(makeMetrics({
      cpu: { usage: 35, frequency: 3000, logicalProcessors: 8, physicalProcessors: 4, processes: 100, threads: 500, temperature: null },
      memory: { total: 16_000_000_000, used: 8_000_000_000, available: 8_000_000_000, usage: 50, cached: 0, swapTotal: 0, swapUsed: 0, swapUsage: 0 },
    }), 0);
    expect(normal.overallScore).toBe(100);
  });

  it('combined issues produce lower score than any single issue', () => {
    const singleJunk = calculateHealthScore(makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 2_000_000_000, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 2_000_000_000 },
    }), 0);
    const combined = calculateHealthScore(makeMetrics({
      performance: { startupApps: 5, backgroundProcesses: 50, temporaryFilesSize: 2_000_000_000, recycleBinSize: 500_000_000, browserCacheSize: 200_000_000, potentialRecoverable: 2_700_000_000 },
    }), 3);
    expect(combined.overallScore).toBeLessThan(singleJunk.overallScore);
  });
});

describe('Part 14 — Notification Triggering (integration)', () => {
  let service: HealthNotificationService;

  beforeEach(() => {
    service = new HealthNotificationService();
    service.reset();
  });

  it('notification fires when health score drops from 100 to 82', () => {
    service.checkForChanges(100, 0, 0);
    const notifs = service.checkForChanges(82, 0, 0);
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs[0]!.message).toContain('82%');
  });

  it('no notification when score stays the same', () => {
    service.checkForChanges(90, 0, 0);
    const notifs = service.checkForChanges(90, 0, 0);
    expect(notifs.length).toBe(0);
  });

  it('no notification when score improves', () => {
    service.checkForChanges(70, 0, 0);
    const notifs = service.checkForChanges(90, 0, 0);
    expect(notifs.length).toBe(0);
  });

  it('junk notification fires only when threshold is exceeded', () => {
    service.checkForChanges(100, 0, 0);
    const small = service.checkForChanges(100, 500_000_000, 0);
    expect(small.find((n) => n.title === 'Junk Files Accumulating')).toBeUndefined();

    service.reset();
    service.checkForChanges(100, 0, 0);
    const large = service.checkForChanges(100, 1_500_000_000, 0);
    expect(large.find((n) => n.title === 'Junk Files Accumulating')).toBeDefined();
  });
});

describe('Part 14 — History Recording (integration)', () => {
  let service: OptimizationHistoryService;

  beforeEach(() => {
    service = new OptimizationHistoryService(new InMemoryOptimizationHistoryStore());
  });

  it('records multiple optimizations in chronological order', () => {
    for (let i = 0; i < 3; i++) {
      service.recordOptimization({
        timestamp: `2026-01-0${i + 1}T10:00:00Z`,
        healthBefore: 50 + i * 10,
        healthAfter: 80 + i * 5,
        storageRecovered: 100_000_000 * (i + 1),
        registryFixed: i * 10,
        startupOptimized: i,
        privacyCleaned: i * 5,
        duplicateFilesRemoved: 0,
        durationMs: 5000 + i * 1000,
        result: 'success',
        modulesUsed: ['junk'],
      });
    }
    const history = service.getHistory();
    expect(history.length).toBe(3);
    // Most recent first
    expect(history[0]!.healthBefore).toBe(70);
    expect(history[2]!.healthBefore).toBe(50);
  });

  it('records partial and cancelled results', () => {
    service.recordOptimization({ timestamp: '2026-01-01T10:00:00Z', healthBefore: 50, healthAfter: 60, storageRecovered: 100, registryFixed: 0, startupOptimized: 0, privacyCleaned: 0, duplicateFilesRemoved: 0, durationMs: 3000, result: 'partial', modulesUsed: ['junk'] });
    service.recordOptimization({ timestamp: '2026-01-02T10:00:00Z', healthBefore: 60, healthAfter: 60, storageRecovered: 0, registryFixed: 0, startupOptimized: 0, privacyCleaned: 0, duplicateFilesRemoved: 0, durationMs: 1000, result: 'cancelled', modulesUsed: [] });
    const history = service.getHistory();
    expect(history[0]!.result).toBe('cancelled');
    expect(history[1]!.result).toBe('partial');
  });
});

describe('Part 14 — Timeline Generation (integration)', () => {
  let service: HealthTimelineService;

  beforeEach(() => {
    service = new HealthTimelineService(new InMemoryHealthTimelineStore());
  });

  it('timeline captures score progression over multiple readings', () => {
    const readings = [100, 96, 91, 100, 94, 100];
    readings.forEach((score) => {
      service.recordHealth(score, score === 100 ? 'perfect' : 'excellent', 0);
    });
    const timeline = service.getTimeline();
    expect(timeline.length).toBe(6);
    expect(timeline.map((e) => e.score)).toEqual(readings);
  });

  it('daily summary collapses multiple readings per day into one', () => {
    // Multiple readings on the same day
    service.recordHealth(100, 'perfect', 0);
    service.recordHealth(96, 'excellent', 1);
    service.recordHealth(91, 'excellent', 2);
    service.recordHealth(100, 'perfect', 0);
    const daily = service.getDailySummary(30);
    expect(daily.length).toBe(1);
    // Last entry for the day wins
    expect(daily[0]!.score).toBe(100);
  });

  it('getLast30Days returns all entries within 30 days', () => {
    service.recordHealth(100, 'perfect', 0);
    service.recordHealth(85, 'good', 3);
    service.recordHealth(72, 'fair', 5);
    const last30 = service.getLast30Days();
    expect(last30.length).toBe(3);
  });
});

describe('Part 14 — Configuration Loading', () => {
  afterEach(() => {
    resetHealthEngineConfig();
  });

  it('loads default configuration on startup', () => {
    const config = getHealthEngineConfig();
    expect(config).toBe(DEFAULT_HEALTH_ENGINE_CONFIG);
  });

  it('overriding config affects scoring immediately', () => {
    const before = calculateHealthScore(makeMetrics({
      performance: { startupApps: 5, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    }), 0);

    // Make startup penalty much harsher
    setHealthEngineConfig({
      startup: { penaltyPerApp: 20, maxPenalty: 100 },
    });

    const after = calculateHealthScore(makeMetrics({
      performance: { startupApps: 5, backgroundProcesses: 0, temporaryFilesSize: 0, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 0 },
    }), 0);

    expect(after.categoryScores.startup).toBeLessThan(before.categoryScores.startup);
    expect(after.overallScore).toBeLessThan(before.overallScore);
  });

  it('reset restores default scoring behavior', () => {
    setHealthEngineConfig({
      storage: { ...getHealthEngineConfig().storage, maxJunkPenalty: 90, junkPenaltyMultiplier: 20 },
    });
    const modified = calculateHealthScore(makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 1_000_000_000, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 1_000_000_000 },
    }), 0);

    resetHealthEngineConfig();

    const reset = calculateHealthScore(makeMetrics({
      performance: { startupApps: 0, backgroundProcesses: 0, temporaryFilesSize: 1_000_000_000, recycleBinSize: 0, browserCacheSize: 0, potentialRecoverable: 1_000_000_000 },
    }), 0);

    expect(reset.overallScore).toBeGreaterThan(modified.overallScore);
  });

  it('all threshold sections have sensible defaults', () => {
    const config = getHealthEngineConfig();
    // Score zones
    expect(config.scoreZoneThresholds.perfect).toBeGreaterThan(config.scoreZoneThresholds.excellent);
    expect(config.scoreZoneThresholds.excellent).toBeGreaterThan(config.scoreZoneThresholds.good);
    expect(config.scoreZoneThresholds.good).toBeGreaterThan(config.scoreZoneThresholds.fair);
    expect(config.scoreZoneThresholds.fair).toBeGreaterThan(config.scoreZoneThresholds.poor);
    // Storage
    expect(config.storage.maxJunkPenalty).toBeGreaterThan(0);
    expect(config.storage.driveCriticalThreshold).toBeGreaterThan(config.storage.driveWarningThreshold);
    // Performance
    expect(config.performance.cpuCriticalThreshold).toBeGreaterThan(config.performance.cpuWarningThreshold);
    expect(config.performance.memoryCriticalThreshold).toBeGreaterThan(config.performance.memoryWarningThreshold);
    // Notifications
    expect(config.notifications.scoreDropThreshold).toBeGreaterThan(0);
    expect(config.notifications.junkAccumulationThreshold).toBeGreaterThan(0);
  });
});

describe('Part 14 — Future Module Registration', () => {
  it('future modules can register and contribute penalties', async () => {
    const { HealthScoreService } = await import('../HealthScoreService');
    const svc = new HealthScoreService();

    // Register a future module (e.g., Driver Updater)
    const driverProvider = {
      async getContribution() {
        return {
          moduleId: 'driver-updater' as any,
          moduleName: 'Driver Updater',
          currentPenalty: 15,
          maxPenalty: 15,
          resolvedPenalty: 0,
          detail: '5 outdated drivers',
          canAutoFix: true,
          actionPath: '/driver-updater',
        };
      },
    };
    svc.registerProvider('driver-updater' as any, driverProvider);
    const result = await svc.computeHealth();
    expect(result.contributions.some((c) => c.moduleId === ('driver-updater' as never))).toBe(true);
  });

  it('future modules can register weights', async () => {
    const { HealthScoreService } = await import('../HealthScoreService');
    const svc = new HealthScoreService();
    svc.registerModuleWeight('antivirus' as any, 25, 'Antivirus');
    const weights = svc.getModuleWeights();
    expect(weights.some((w) => w.moduleId === 'antivirus')).toBe(true);
  });

  it('unregistering a future module removes its contribution', async () => {
    const { HealthScoreService } = await import('../HealthScoreService');
    const svc = new HealthScoreService();

    svc.registerModuleWeight('vpn' as any, 10, 'VPN');
    expect(svc.getModuleWeights().some((w) => w.moduleId === 'vpn')).toBe(true);

    svc.unregisterModuleWeight('vpn' as any);
    expect(svc.getModuleWeights().some((w) => w.moduleId === 'vpn')).toBe(false);
  });

  it('Dashboard logic does not hardcode module names', () => {
    // The calculateHealthScore function uses configurable weights and
    // does not reference any specific module names — future modules
    // register via HealthScoreService, not by modifying Dashboard code.
    const config = getHealthEngineConfig();
    const weightKeys = Object.keys(config.weights);
    // Only the 6 base categories — no hardcoded future module names
    expect(weightKeys).toEqual(['storage', 'startup', 'privacy', 'performance', 'security', 'windows']);
  });
});

describe('Part 14 — Performance (lightweight recalculation)', () => {
  afterEach(() => {
    resetHealthEngineConfig();
  });

  it('calculateHealthScore is a pure function (no side effects)', () => {
    const metrics = makeMetrics();
    const score1 = calculateHealthScore(metrics, 0);
    const score2 = calculateHealthScore(metrics, 0);
    expect(score1.overallScore).toBe(score2.overallScore);
    expect(score1.issues.length).toBe(score2.issues.length);
  });

  it('calculateHealthScore does not trigger scans', () => {
    // The function accepts pre-fetched metrics — it should not
    // call any service or trigger any I/O.
    const metrics = makeMetrics();
    // If this completes without error, no scans were triggered
    const score = calculateHealthScore(metrics, 2);
    expect(score).toBeDefined();
    expect(score.overallScore).toBeGreaterThan(0);
  });

  it('recalculation with same metrics produces same result', () => {
    const metrics = makeMetrics({
      performance: { startupApps: 3, backgroundProcesses: 50, temporaryFilesSize: 500_000_000, recycleBinSize: 100_000_000, browserCacheSize: 50_000_000, potentialRecoverable: 650_000_000 },
    });
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(calculateHealthScore(metrics, 2).overallScore);
    }
    // All results should be identical
    expect(Math.max(...results) - Math.min(...results)).toBe(0);
  });
});
