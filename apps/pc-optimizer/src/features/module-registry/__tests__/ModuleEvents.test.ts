// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  moduleEventBus,
  ModuleEventType,
  emitModuleEvent,
  recommendationAggregator,
  aggregateModuleSummaries,
  moduleHistoryService,
  moduleRegistry,
  clearModuleRegistry,
  BaseModuleAdapter,
} from '../index';
import type { ModuleMetadata } from '../moduleRegistry.types';
import type { HealthContribution } from '../../health/HealthContribution';
import type { Recommendation } from '../../dashboard/dashboard.types';
import type { ModuleId } from '../../health/HealthContribution';

// ── Test helpers ────────────────────────────────────────────────────

function makeTestMetadata(id: string, overrides: Partial<ModuleMetadata> = {}): ModuleMetadata {
  return {
    moduleId: id as any,
    displayName: id,
    description: 'Test module',
    category: 'cleanup',
    icon: 'TestIcon',
    version: '1.0.0',
    routePath: `/test-${id}`,
    capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: false },
    featurePermissions: {},
    maxHealthPenalty: 10,
    supportedOS: [],
    ...overrides,
  };
}

class TestAdapter extends BaseModuleAdapter {
  async getHealthContribution(): Promise<HealthContribution> {
    return {
      moduleId: this.metadata.moduleId,
      moduleName: this.metadata.displayName,
      currentPenalty: 0,
      maxPenalty: this.metadata.maxHealthPenalty,
      resolvedPenalty: 0,
      detail: 'OK',
      canAutoFix: true,
      actionPath: this.metadata.routePath,
    };
  }

  private _recommendations: Recommendation[] = [];
  setRecommendations(recs: Recommendation[]) { this._recommendations = recs; }
  override getRecommendations(): Recommendation[] { return this._recommendations; }
}

function makeRecommendation(id: string, severity: string, category: string = 'cleanup'): Recommendation {
  return {
    id,
    title: `Test ${id}`,
    description: `Test recommendation ${id}`,
    actionLabel: 'Fix',
    actionPath: '/test',
    severity: severity as any,
    category: category as any,
  };
}

// ── Part 7: Module Event System ─────────────────────────────────────

describe('Module Event System (Part 7)', () => {
  beforeEach(() => {
    moduleEventBus.clear();
    clearModuleRegistry();
  });

  afterEach(() => {
    moduleEventBus.clear();
    clearModuleRegistry();
  });

  it('ModuleEventType defines all 9 standard event types', () => {
    expect(ModuleEventType.ScanStarted).toBe('scan_started');
    expect(ModuleEventType.ScanCompleted).toBe('scan_completed');
    expect(ModuleEventType.CleaningStarted).toBe('cleaning_started');
    expect(ModuleEventType.CleaningCompleted).toBe('cleaning_completed');
    expect(ModuleEventType.OptimizationStarted).toBe('optimization_started');
    expect(ModuleEventType.OptimizationCompleted).toBe('optimization_completed');
    expect(ModuleEventType.StatusChanged).toBe('status_changed');
    expect(ModuleEventType.ErrorOccurred).toBe('error_occurred');
    expect(ModuleEventType.RecommendationUpdated).toBe('recommendation_updated');
  });

  it('emitModuleEvent publishes events to subscribers', () => {
    const received: any[] = [];
    moduleEventBus.subscribe((e) => received.push(e));

    emitModuleEvent(ModuleEventType.ScanStarted, 'junk' as ModuleId, 'Junk Cleaner');
    emitModuleEvent(ModuleEventType.ScanCompleted, 'junk' as ModuleId, 'Junk Cleaner', { durationMs: 500 });

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('scan_started');
    expect(received[0].moduleId).toBe('junk');
    expect(received[1].type).toBe('scan_completed');
    expect(received[1].data.durationMs).toBe(500);
  });

  it('subscribe returns unsubscribe function', () => {
    let received = false;
    const unsub = moduleEventBus.subscribe(() => { received = true; });
    unsub();
    emitModuleEvent(ModuleEventType.ScanStarted, 'junk' as ModuleId, 'Junk Cleaner');
    expect(received).toBe(false);
  });

  it('BaseModuleAdapter emits ScanStarted and ScanCompleted on scan', async () => {
    const events: any[] = [];
    moduleEventBus.subscribe((e) => events.push(e));

    const adapter = new TestAdapter(makeTestMetadata('junk'));
    moduleRegistry.register(adapter);
    await adapter.scan();

    const types = events.map((e) => e.type);
    expect(types).toContain('scan_started');
    expect(types).toContain('scan_completed');
    expect(types).toContain('status_changed');
  });

  it('BaseModuleAdapter emits CleaningStarted and CleaningCompleted on clean', async () => {
    const events: any[] = [];
    moduleEventBus.subscribe((e) => events.push(e));

    const adapter = new TestAdapter(makeTestMetadata('junk'));
    moduleRegistry.register(adapter);
    await adapter.clean();

    const types = events.map((e) => e.type);
    expect(types).toContain('cleaning_started');
    expect(types).toContain('cleaning_completed');
  });

  it('BaseModuleAdapter emits OptimizationStarted and OptimizationCompleted on optimize', async () => {
    const events: any[] = [];
    moduleEventBus.subscribe((e) => events.push(e));

    const adapter = new TestAdapter(makeTestMetadata('performance'));
    moduleRegistry.register(adapter);
    await adapter.optimize();

    const types = events.map((e) => e.type);
    expect(types).toContain('optimization_started');
    expect(types).toContain('optimization_completed');
  });

  it('BaseModuleAdapter emits ErrorOccurred on scan failure', async () => {
    const events: any[] = [];
    moduleEventBus.subscribe((e) => events.push(e));

    class FailingAdapter extends TestAdapter {
      protected override async doScan(): Promise<unknown> {
        throw new Error('Scan failed');
      }
    }

    const adapter = new FailingAdapter(makeTestMetadata('junk'));
    moduleRegistry.register(adapter);

    await expect(adapter.scan()).rejects.toThrow('Scan failed');
    const errorEvent = events.find((e) => e.type === 'error_occurred');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.data.error).toBe('Scan failed');
  });

  it('BaseModuleAdapter emits StatusChanged on every status transition', async () => {
    const events: any[] = [];
    moduleEventBus.subscribe((e) => events.push(e));

    const adapter = new TestAdapter(makeTestMetadata('junk'));
    moduleRegistry.register(adapter);
    await adapter.scan();

    const statusEvents = events.filter((e) => e.type === 'status_changed');
    expect(statusEvents.length).toBeGreaterThanOrEqual(2);
    expect(statusEvents[0].data.newStatus).toBe('scanning');
  });
});

// ── Part 8: Recommendation Engine Integration ───────────────────────

describe('Recommendation Aggregator (Part 8)', () => {
  beforeEach(() => {
    clearModuleRegistry();
    recommendationAggregator.clear();
  });

  afterEach(() => {
    clearModuleRegistry();
    recommendationAggregator.clear();
  });

  it('getAggregatedRecommendations collects from all modules', () => {
    const adapter1 = new TestAdapter(makeTestMetadata('junk'));
    adapter1.setRecommendations([makeRecommendation('rec1', 'warning')]);
    const adapter2 = new TestAdapter(makeTestMetadata('registry'));
    adapter2.setRecommendations([makeRecommendation('rec2', 'critical')]);

    moduleRegistry.register(adapter1);
    moduleRegistry.register(adapter2);

    const recs = recommendationAggregator.getAggregatedRecommendations();
    expect(recs).toHaveLength(2);
  });

  it('prioritizes critical over warning recommendations', () => {
    const adapter1 = new TestAdapter(makeTestMetadata('junk'));
    adapter1.setRecommendations([
      makeRecommendation('rec1', 'info'),
      makeRecommendation('rec2', 'critical'),
      makeRecommendation('rec3', 'warning'),
    ]);
    moduleRegistry.register(adapter1);

    const recs = recommendationAggregator.getAggregatedRecommendations();
    expect(recs[0]!.id).toBe('rec2');
    expect(recs[0]!.severity).toBe('critical');
    expect(recs[1]!.severity).toBe('warning');
    expect(recs[2]!.severity).toBe('info');
  });

  it('returns empty array when no modules registered', () => {
    const recs = recommendationAggregator.getAggregatedRecommendations();
    expect(recs).toHaveLength(0);
  });

  it('subscribe notifies on refresh', () => {
    let notifiedRecs: Recommendation[] = [];
    recommendationAggregator.subscribe((recs) => { notifiedRecs = recs; });

    const adapter = new TestAdapter(makeTestMetadata('junk'));
    adapter.setRecommendations([makeRecommendation('rec1', 'warning')]);
    moduleRegistry.register(adapter);

    recommendationAggregator.refresh();
    expect(notifiedRecs).toHaveLength(1);
  });

  it('handles modules that throw in getRecommendations gracefully', () => {
    class ThrowingAdapter extends TestAdapter {
      override getRecommendations(): Recommendation[] {
        throw new Error('Failed');
      }
    }
    moduleRegistry.register(new ThrowingAdapter(makeTestMetadata('junk')));
    moduleRegistry.register(new TestAdapter(makeTestMetadata('registry')));

    const recs = recommendationAggregator.getAggregatedRecommendations();
    expect(recs).toHaveLength(0);
  });
});

// ── Part 9: Optimization Summary Integration ────────────────────────

describe('Module Optimization Summary (Part 9)', () => {
  it('aggregateModuleSummaries combines multiple module summaries', () => {
    const summaries = [
      {
        moduleId: 'junk' as ModuleId,
        moduleName: 'Junk Cleaner',
        itemsRemoved: 150,
        bytesRecovered: 500_000_000,
        registryFixed: 0,
        startupOptimized: 0,
        privacyCleaned: 0,
        duplicateFilesRemoved: 0,
        durationMs: 3000,
        success: true,
      },
      {
        moduleId: 'registry' as ModuleId,
        moduleName: 'Registry Cleaner',
        itemsRemoved: 25,
        bytesRecovered: 0,
        registryFixed: 25,
        startupOptimized: 0,
        privacyCleaned: 0,
        duplicateFilesRemoved: 0,
        durationMs: 2000,
        success: true,
      },
    ];

    const result = aggregateModuleSummaries(summaries);
    expect(result.modules).toHaveLength(2);
    expect(result.totalItemsRemoved).toBe(175);
    expect(result.totalBytesRecovered).toBe(500_000_000);
    expect(result.totalRegistryFixed).toBe(25);
    expect(result.totalDurationMs).toBe(5000);
    expect(result.allSucceeded).toBe(true);
    expect(result.completedAt).toBeTruthy();
  });

  it('aggregateModuleSummaries detects partial failure', () => {
    const summaries = [
      {
        moduleId: 'junk' as ModuleId,
        moduleName: 'Junk Cleaner',
        itemsRemoved: 100,
        bytesRecovered: 0,
        registryFixed: 0,
        startupOptimized: 0,
        privacyCleaned: 0,
        duplicateFilesRemoved: 0,
        durationMs: 1000,
        success: true,
      },
      {
        moduleId: 'registry' as ModuleId,
        moduleName: 'Registry Cleaner',
        itemsRemoved: 0,
        bytesRecovered: 0,
        registryFixed: 0,
        startupOptimized: 0,
        privacyCleaned: 0,
        duplicateFilesRemoved: 0,
        durationMs: 500,
        success: false,
      },
    ];

    const result = aggregateModuleSummaries(summaries);
    expect(result.allSucceeded).toBe(false);
  });

  it('aggregateModuleSummaries handles empty array', () => {
    const result = aggregateModuleSummaries([]);
    expect(result.modules).toHaveLength(0);
    expect(result.totalItemsRemoved).toBe(0);
    expect(result.allSucceeded).toBe(true);
  });

  it('aggregateModuleSummaries sums all fields correctly', () => {
    const summaries = [
      {
        moduleId: 'junk' as ModuleId,
        moduleName: 'Junk Cleaner',
        itemsRemoved: 10,
        bytesRecovered: 1000,
        registryFixed: 5,
        startupOptimized: 3,
        privacyCleaned: 7,
        duplicateFilesRemoved: 2,
        durationMs: 100,
        success: true,
      },
      {
        moduleId: 'startup' as ModuleId,
        moduleName: 'Startup Manager',
        itemsRemoved: 20,
        bytesRecovered: 2000,
        registryFixed: 10,
        startupOptimized: 6,
        privacyCleaned: 14,
        duplicateFilesRemoved: 4,
        durationMs: 200,
        success: true,
      },
    ];

    const result = aggregateModuleSummaries(summaries);
    expect(result.totalItemsRemoved).toBe(30);
    expect(result.totalBytesRecovered).toBe(3000);
    expect(result.totalRegistryFixed).toBe(15);
    expect(result.totalStartupOptimized).toBe(9);
    expect(result.totalPrivacyCleaned).toBe(21);
    expect(result.totalDuplicateFilesRemoved).toBe(6);
    expect(result.totalDurationMs).toBe(300);
  });
});

// ── Part 10: Health History Integration ─────────────────────────────

describe('Module Health History (Part 10)', () => {
  beforeEach(() => {
    moduleHistoryService.clear();
    clearModuleRegistry();
  });

  afterEach(() => {
    moduleHistoryService.clear();
    clearModuleRegistry();
  });

  it('record stores a history entry', () => {
    moduleHistoryService.record({
      moduleId: 'junk' as ModuleId,
      moduleName: 'Junk Cleaner',
      timestamp: new Date().toISOString(),
      itemsFound: 50,
      itemsResolved: 45,
      durationMs: 3000,
      bytesRecovered: 500_000_000,
      healthImpact: 15,
      operation: 'clean',
    });

    expect(moduleHistoryService.getCount()).toBe(1);
  });

  it('getAllHistory returns all entries', () => {
    moduleHistoryService.record({
      moduleId: 'junk' as ModuleId,
      moduleName: 'Junk Cleaner',
      timestamp: new Date().toISOString(),
      itemsFound: 10,
      itemsResolved: 10,
      durationMs: 1000,
      bytesRecovered: 0,
      healthImpact: 5,
      operation: 'scan',
    });
    moduleHistoryService.record({
      moduleId: 'registry' as ModuleId,
      moduleName: 'Registry Cleaner',
      timestamp: new Date().toISOString(),
      itemsFound: 20,
      itemsResolved: 15,
      durationMs: 2000,
      bytesRecovered: 0,
      healthImpact: 10,
      operation: 'clean',
    });

    expect(moduleHistoryService.getAllHistory()).toHaveLength(2);
  });

  it('getModuleHistory filters by module', () => {
    moduleHistoryService.record({
      moduleId: 'junk' as ModuleId,
      moduleName: 'Junk Cleaner',
      timestamp: new Date().toISOString(),
      itemsFound: 10,
      itemsResolved: 10,
      durationMs: 1000,
      bytesRecovered: 0,
      healthImpact: 5,
      operation: 'scan',
    });
    moduleHistoryService.record({
      moduleId: 'registry' as ModuleId,
      moduleName: 'Registry Cleaner',
      timestamp: new Date().toISOString(),
      itemsFound: 20,
      itemsResolved: 15,
      durationMs: 2000,
      bytesRecovered: 0,
      healthImpact: 10,
      operation: 'clean',
    });

    const junkHistory = moduleHistoryService.getModuleHistory('junk' as ModuleId);
    expect(junkHistory).toHaveLength(1);
    expect(junkHistory[0]!.moduleId).toBe('junk');
  });

  it('getRecent returns most recent entries', () => {
    for (let i = 0; i < 5; i++) {
      moduleHistoryService.record({
        moduleId: 'junk' as ModuleId,
        moduleName: 'Junk Cleaner',
        timestamp: new Date().toISOString(),
        itemsFound: i,
        itemsResolved: i,
        durationMs: 1000,
        bytesRecovered: 0,
        healthImpact: 0,
        operation: 'scan',
      });
    }

    const recent = moduleHistoryService.getRecent(3);
    expect(recent).toHaveLength(3);
  });

  it('getRecentForModule filters and limits', () => {
    for (let i = 0; i < 5; i++) {
      moduleHistoryService.record({
        moduleId: 'junk' as ModuleId,
        moduleName: 'Junk Cleaner',
        timestamp: new Date().toISOString(),
        itemsFound: i,
        itemsResolved: i,
        durationMs: 1000,
        bytesRecovered: 0,
        healthImpact: 0,
        operation: 'scan',
      });
    }
    moduleHistoryService.record({
      moduleId: 'registry' as ModuleId,
      moduleName: 'Registry Cleaner',
      timestamp: new Date().toISOString(),
      itemsFound: 1,
      itemsResolved: 1,
      durationMs: 500,
      bytesRecovered: 0,
      healthImpact: 0,
      operation: 'scan',
    });

    const junkRecent = moduleHistoryService.getRecentForModule('junk' as ModuleId, 2);
    expect(junkRecent).toHaveLength(2);
    expect(junkRecent.every((e) => e.moduleId === 'junk')).toBe(true);
  });

  it('subscribe notifies on new entries', () => {
    let notifiedEntries: any[] = [];
    moduleHistoryService.subscribe((entries) => { notifiedEntries = entries; });

    moduleHistoryService.record({
      moduleId: 'junk' as ModuleId,
      moduleName: 'Junk Cleaner',
      timestamp: new Date().toISOString(),
      itemsFound: 10,
      itemsResolved: 10,
      durationMs: 1000,
      bytesRecovered: 0,
      healthImpact: 5,
      operation: 'scan',
    });

    expect(notifiedEntries).toHaveLength(1);
  });

  it('BaseModuleAdapter records history on scan', async () => {
    moduleHistoryService.clear();
    const adapter = new TestAdapter(makeTestMetadata('junk'));
    moduleRegistry.register(adapter);
    await adapter.scan();

    const history = moduleHistoryService.getModuleHistory('junk' as ModuleId);
    expect(history).toHaveLength(1);
    expect(history[0]!.operation).toBe('scan');
  });

  it('BaseModuleAdapter records history on clean', async () => {
    moduleHistoryService.clear();
    const adapter = new TestAdapter(makeTestMetadata('junk'));
    moduleRegistry.register(adapter);
    await adapter.clean();

    const history = moduleHistoryService.getModuleHistory('junk' as ModuleId);
    expect(history).toHaveLength(1);
    expect(history[0]!.operation).toBe('clean');
  });

  it('BaseModuleAdapter records history on optimize', async () => {
    moduleHistoryService.clear();
    const adapter = new TestAdapter(makeTestMetadata('performance'));
    moduleRegistry.register(adapter);
    await adapter.optimize();

    const history = moduleHistoryService.getModuleHistory('performance' as ModuleId);
    expect(history).toHaveLength(1);
    expect(history[0]!.operation).toBe('optimize');
  });

  it('getModuleCount returns count for specific module', () => {
    moduleHistoryService.record({
      moduleId: 'junk' as ModuleId,
      moduleName: 'Junk Cleaner',
      timestamp: new Date().toISOString(),
      itemsFound: 10,
      itemsResolved: 10,
      durationMs: 1000,
      bytesRecovered: 0,
      healthImpact: 5,
      operation: 'scan',
    });
    moduleHistoryService.record({
      moduleId: 'junk' as ModuleId,
      moduleName: 'Junk Cleaner',
      timestamp: new Date().toISOString(),
      itemsFound: 5,
      itemsResolved: 5,
      durationMs: 500,
      bytesRecovered: 0,
      healthImpact: 3,
      operation: 'clean',
    });

    expect(moduleHistoryService.getModuleCount('junk' as ModuleId)).toBe(2);
    expect(moduleHistoryService.getModuleCount('registry' as ModuleId)).toBe(0);
  });
});
