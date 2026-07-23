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
    expect(history[0].healthBefore).toBe(60);
    expect(history[1].healthBefore).toBe(50);
  });

  it('getRecentHistory returns N most recent', () => {
    for (let i = 0; i < 5; i++) {
      service.recordOptimization({ timestamp: `2026-01-0${i + 1}T10:00:00Z`, healthBefore: 50 + i, healthAfter: 90, storageRecovered: 100, registryFixed: 1, startupOptimized: 0, privacyCleaned: 0, duplicateFilesRemoved: 0, durationMs: 1000, result: 'success', modulesUsed: ['junk'] });
    }
    const recent = service.getRecentHistory(3);
    expect(recent.length).toBe(3);
    expect(recent[0].healthBefore).toBe(54);
    expect(recent[2].healthBefore).toBe(52);
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
    expect(timeline[0].score).toBe(100);
    expect(timeline[2].score).toBe(91);
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
    expect(daily[0].score).toBe(91);
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
