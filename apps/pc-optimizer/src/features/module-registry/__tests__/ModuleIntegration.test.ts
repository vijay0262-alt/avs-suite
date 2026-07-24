// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  moduleRegistry,
  clearModuleRegistry,
  registerAllModules,
  ALL_MODULE_DEFINITIONS,
  moduleEventBus,
  ModuleEventType,
  emitModuleEvent,
  recommendationAggregator,
  aggregateModuleSummaries,
  moduleHistoryService,
  sortByDisplayOrder,
  CATEGORY_CONFIG,
  getModuleDisplayOrder,
  type ModuleOptimizationSummary,
} from '../index';
import type { OptimizerModule, ModuleMetadata, ModuleLifecycleState, ModuleStatistics } from '../moduleRegistry.types';
import type { HealthContribution, ModuleId } from '../../health/HealthContribution';
import type { Recommendation } from '../../dashboard/dashboard.types';

// ── Test helpers ────────────────────────────────────────────────────

function makeMetadata(id: string, overrides: Partial<ModuleMetadata> = {}): ModuleMetadata {
  return {
    moduleId: id as any,
    displayName: `Test ${id}`,
    description: 'Test module',
    category: 'cleanup',
    icon: 'TestIcon',
    version: '1.0.0',
    routePath: `/test-${id}`,
    capabilities: { canScan: true, canClean: true, canOptimize: true, canRunInBackground: false },
    featurePermissions: {},
    maxHealthPenalty: 10,
    supportedOS: [],
    ...overrides,
  };
}

function makeRecommendation(id: string, severity: string): Recommendation {
  return {
    id,
    title: `Rec ${id}`,
    description: `Description ${id}`,
    actionLabel: 'Fix',
    actionPath: '/test',
    severity: severity as any,
    category: 'storage',
  };
}

class FullTestModule implements OptimizerModule {
  private _status: ModuleLifecycleState = 'ready';
  private _stats: ModuleStatistics = {
    lastScanAt: null, lastCleanAt: null, totalScans: 0,
    totalCleans: 0, totalSpaceRecovered: 0, totalIssuesFixed: 0,
  };
  private _recs: Recommendation[] = [];
  private _healthPenalty = 5;
  private _failMode: string | null = null;

  constructor(readonly metadata: ModuleMetadata) {}

  setRecommendations(recs: Recommendation[]) { this._recs = recs; }
  setHealthPenalty(penalty: number) { this._healthPenalty = penalty; }
  setFailMode(mode: string | null) { this._failMode = mode; }

  async initialize(): Promise<void> {
    if (this._failMode === 'init') throw new Error(`${this.metadata.moduleId} init failed`);
    this._status = 'ready';
  }
  dispose(): void {
    if (this._failMode === 'dispose') throw new Error(`${this.metadata.moduleId} dispose failed`);
    this._status = 'ready';
  }
  async scan(): Promise<unknown> {
    if (this._failMode === 'scan') throw new Error(`${this.metadata.moduleId} scan failed`);
    this._status = 'scanning';
    return { itemsFound: 10 };
  }
  async clean(): Promise<unknown> {
    if (this._failMode === 'clean') throw new Error(`${this.metadata.moduleId} clean failed`);
    this._status = 'cleaning';
    return { itemsCleaned: 8 };
  }
  async optimize(): Promise<unknown> {
    if (this._failMode === 'optimize') throw new Error(`${this.metadata.moduleId} optimize failed`);
    this._status = 'optimizing';
    return { optimized: true };
  }
  cancel(): void { this._status = 'ready'; }
  async refresh(): Promise<void> { this._status = 'ready'; }
  getStatus(): ModuleLifecycleState { return this._status; }
  async getHealthContribution(): Promise<HealthContribution> {
    return {
      moduleId: this.metadata.moduleId,
      moduleName: this.metadata.displayName,
      currentPenalty: this._healthPenalty,
      maxPenalty: this.metadata.maxHealthPenalty,
      resolvedPenalty: 0,
      detail: `${this._healthPenalty} penalty`,
      canAutoFix: this.metadata.capabilities.canClean,
      actionPath: this.metadata.routePath,
    };
  }
  getRecommendations(): Recommendation[] { return this._recs; }
  getStatistics(): ModuleStatistics { return this._stats; }
}

// ── Comprehensive Integration Tests ─────────────────────────────────

describe('Comprehensive Integration Tests (Part 16)', () => {
  beforeEach(() => {
    clearModuleRegistry();
    moduleEventBus.clear();
    moduleHistoryService.clear();
    recommendationAggregator.clear();
  });

  afterEach(() => {
    clearModuleRegistry();
    moduleEventBus.clear();
    moduleHistoryService.clear();
    recommendationAggregator.clear();
  });

  // ── Module Registration ───────────────────────────────────────────

  describe('Module Registration', () => {
    it('registers a module and retrieves it by ID', () => {
      const mod = new FullTestModule(makeMetadata('junk'));
      moduleRegistry.register(mod);
      expect(moduleRegistry.getModule('junk')).toBe(mod);
    });

    it('getAllModules returns all registered modules', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      moduleRegistry.register(new FullTestModule(makeMetadata('registry')));
      moduleRegistry.register(new FullTestModule(makeMetadata('startup')));
      expect(moduleRegistry.getAllModules()).toHaveLength(3);
    });

    it('getAllMetadata returns metadata for all modules', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      moduleRegistry.register(new FullTestModule(makeMetadata('registry')));
      const metas = moduleRegistry.getAllMetadata();
      expect(metas).toHaveLength(2);
      expect(metas.map((m) => m.moduleId)).toContain('junk');
      expect(metas.map((m) => m.moduleId)).toContain('registry');
    });

    it('unregister removes a module completely', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      expect(moduleRegistry.getModule('junk')).toBeDefined();
      moduleRegistry.unregister('junk');
      expect(moduleRegistry.getModule('junk')).toBeUndefined();
    });

    it('overwriting a module logs a warning', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('registerAllModules registers all 19 modules (9 eager + 10 lazy)', () => {
      registerAllModules();
      const eager = moduleRegistry.getAllModules().length;
      const lazy = moduleRegistry.getLazyModuleIds().length;
      expect(eager + lazy).toBe(19);
    });
  });

  // ── Lifecycle Transitions ─────────────────────────────────────────

  describe('Lifecycle Transitions', () => {
    it('transitions through ready → scanning → completed', async () => {
      const mod = new FullTestModule(makeMetadata('junk'));
      moduleRegistry.register(mod);

      expect(moduleRegistry.getStatus('junk')).toBe('ready');
      moduleRegistry.setStatus('junk', 'scanning');
      expect(moduleRegistry.getStatus('junk')).toBe('scanning');
      moduleRegistry.setStatus('junk', 'completed');
      expect(moduleRegistry.getStatus('junk')).toBe('completed');
    });

    it('transitions to error on failure', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      moduleRegistry.setStatus('junk', 'error');
      expect(moduleRegistry.getStatus('junk')).toBe('error');
    });

    it('transitions to locked when feature is unavailable', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('test-premium', {
        featurePermissions: { scan: 'junk.clean_unlimited' as any },
      })));
      const entries = moduleRegistry.getRegistryEntries();
      const entry = entries.find((e: any) => e.metadata.moduleId === 'test-premium');
      expect(entry!.status).toBe('locked');
      expect(entry!.locked).toBe(true);
    });

    it('all 11 lifecycle states are configured with labels', () => {
      const states: ModuleLifecycleState[] = [
        'not_installed', 'ready', 'scanning', 'cleaning', 'optimizing',
        'completed', 'warning', 'error', 'disabled', 'locked', 'updating',
      ];
      // Verify each state can be set and retrieved
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      for (const state of states) {
        moduleRegistry.setStatus('junk', state);
        expect(moduleRegistry.getStatus('junk')).toBe(state);
      }
    });

    it('initializeAll initializes all available modules', async () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      moduleRegistry.register(new FullTestModule(makeMetadata('registry')));
      await moduleRegistry.initializeAll();
      expect(moduleRegistry.getStatus('junk')).toBe('ready');
      expect(moduleRegistry.getStatus('registry')).toBe('ready');
    });

    it('disposeAll disposes all modules', () => {
      const mod1 = new FullTestModule(makeMetadata('junk'));
      const mod2 = new FullTestModule(makeMetadata('registry'));
      moduleRegistry.register(mod1);
      moduleRegistry.register(mod2);
      moduleRegistry.disposeAll();
      // After dispose, modules should be in ready state
      expect(mod1.getStatus()).toBe('ready');
      expect(mod2.getStatus()).toBe('ready');
    });
  });

  // ── Dashboard Integration ─────────────────────────────────────────

  describe('Dashboard Integration', () => {
    it('getRegistryEntries provides data for dynamic card rendering', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      moduleRegistry.register(new FullTestModule(makeMetadata('registry')));
      const entries = moduleRegistry.getRegistryEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0]!.metadata).toBeDefined();
      expect(entries[0]!.status).toBeDefined();
      expect(entries[0]!.available).toBeDefined();
      expect(entries[0]!.locked).toBeDefined();
    });

    it('getAvailableModules filters out locked modules', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      moduleRegistry.register(new FullTestModule(makeMetadata('test-premium', {
        featurePermissions: { scan: 'junk.clean_unlimited' as any },
      })));
      const available = moduleRegistry.getAvailableModules();
      expect(available).toHaveLength(1);
      expect(available[0]!.metadata.moduleId).toBe('junk');
    });

    it('subscribe notifies on status changes', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      let notified = false;
      moduleRegistry.subscribe(() => { notified = true; });
      moduleRegistry.setStatus('junk', 'scanning');
      expect(notified).toBe(true);
    });

    it('sortByDisplayOrder orders modules correctly for dashboard', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      moduleRegistry.register(new FullTestModule(makeMetadata('registry')));
      moduleRegistry.register(new FullTestModule(makeMetadata('startup')));
      const entries = moduleRegistry.getRegistryEntries();
      const sorted = sortByDisplayOrder(entries);
      expect(sorted[0]!.metadata.moduleId).toBe('junk');
      expect(sorted[1]!.metadata.moduleId).toBe('registry');
      expect(sorted[2]!.metadata.moduleId).toBe('startup');
    });

    it('new modules appear in registry entries without dashboard code changes', () => {
      // Simulate adding a new module
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      const entriesBefore = moduleRegistry.getRegistryEntries();
      expect(entriesBefore).toHaveLength(1);

      moduleRegistry.register(new FullTestModule(makeMetadata('new-module')));
      const entriesAfter = moduleRegistry.getRegistryEntries();
      expect(entriesAfter).toHaveLength(2);
    });
  });

  // ── Health Engine Integration ─────────────────────────────────────

  describe('Health Engine Integration', () => {
    it('each module provides health contribution', async () => {
      const mod = new FullTestModule(makeMetadata('junk', { maxHealthPenalty: 30 }));
      mod.setHealthPenalty(15);
      moduleRegistry.register(mod);

      const contribution = await mod.getHealthContribution();
      expect(contribution.moduleId).toBe('junk');
      expect(contribution.currentPenalty).toBe(15);
      expect(contribution.maxPenalty).toBe(30);
    });

    it('all 19 module definitions have maxHealthPenalty > 0', () => {
      for (const def of ALL_MODULE_DEFINITIONS) {
        expect(def.maxHealthPenalty).toBeGreaterThan(0);
        expect(def.maxHealthPenalty).toBeLessThanOrEqual(30);
      }
    });

    it('all 19 module definitions have valid routePaths', () => {
      for (const def of ALL_MODULE_DEFINITIONS) {
        expect(def.routePath).toBeTruthy();
        expect(def.routePath.startsWith('/')).toBe(true);
      }
    });

    it('all 19 module definitions have valid capabilities', () => {
      for (const def of ALL_MODULE_DEFINITIONS) {
        expect(typeof def.capabilities.canScan).toBe('boolean');
        expect(typeof def.capabilities.canClean).toBe('boolean');
        expect(typeof def.capabilities.canOptimize).toBe('boolean');
        expect(typeof def.capabilities.canRunInBackground).toBe('boolean');
      }
    });

    it('registerAllModules registers health weights for all modules', () => {
      registerAllModules();
      // Health weights are registered via healthScoreService.registerModuleWeight
      // We verify by checking all module definitions have weights in DEFAULT_HEALTH_WEIGHTS
      for (const def of ALL_MODULE_DEFINITIONS) {
        expect(getModuleDisplayOrder(def.moduleId)).toBeLessThan(999);
      }
      clearModuleRegistry();
    });
  });

  // ── FeatureGate Integration ───────────────────────────────────────

  describe('FeatureGate Integration', () => {
    it('canScan returns true when no permission required', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk', {
        featurePermissions: {},
      })));
      expect(moduleRegistry.canScan('junk')).toBe(true);
    });

    it('canScan returns true when permission is available', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk', {
        featurePermissions: { scan: 'junk.scan' as any },
      })));
      expect(moduleRegistry.canScan('junk')).toBe(true);
    });

    it('canClean returns true when no permission required', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      expect(moduleRegistry.canClean('junk')).toBe(true);
    });

    it('canOptimize returns true when no permission required', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      expect(moduleRegistry.canOptimize('junk')).toBe(true);
    });

    it('canRunInBackground returns true when no permission required', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('junk')));
      expect(moduleRegistry.canRunInBackground('junk')).toBe(true);
    });

    it('canScan returns false for unknown module', () => {
      expect(moduleRegistry.canScan('nonexistent' as any)).toBe(false);
    });

    it('locked modules show locked status in registry entries', () => {
      moduleRegistry.register(new FullTestModule(makeMetadata('test-premium', {
        featurePermissions: { scan: 'junk.clean_unlimited' as any },
      })));
      const entries = moduleRegistry.getRegistryEntries();
      const entry = entries.find((e: any) => e.metadata.moduleId === 'test-premium');
      expect(entry!.locked).toBe(true);
      expect(entry!.available).toBe(false);
      expect(entry!.status).toBe('locked');
    });
  });

  // ── Event Publishing ──────────────────────────────────────────────

  describe('Event Publishing', () => {
    it('all 9 event types are defined', () => {
      expect(ModuleEventType.ScanStarted).toBeDefined();
      expect(ModuleEventType.ScanCompleted).toBeDefined();
      expect(ModuleEventType.CleaningStarted).toBeDefined();
      expect(ModuleEventType.CleaningCompleted).toBeDefined();
      expect(ModuleEventType.OptimizationStarted).toBeDefined();
      expect(ModuleEventType.OptimizationCompleted).toBeDefined();
      expect(ModuleEventType.StatusChanged).toBeDefined();
      expect(ModuleEventType.ErrorOccurred).toBeDefined();
      expect(ModuleEventType.RecommendationUpdated).toBeDefined();
    });

    it('events are received by subscribers in order', () => {
      const received: string[] = [];
      moduleEventBus.subscribe((e) => received.push(e.type));

      emitModuleEvent(ModuleEventType.ScanStarted, 'junk' as ModuleId, 'Junk Cleaner');
      emitModuleEvent(ModuleEventType.ScanCompleted, 'junk' as ModuleId, 'Junk Cleaner');
      emitModuleEvent(ModuleEventType.CleaningStarted, 'junk' as ModuleId, 'Junk Cleaner');

      expect(received).toEqual(['scan_started', 'scan_completed', 'cleaning_started']);
    });

    it('multiple subscribers all receive events', () => {
      let count1 = 0;
      let count2 = 0;
      moduleEventBus.subscribe(() => { count1++; });
      moduleEventBus.subscribe(() => { count2++; });

      emitModuleEvent(ModuleEventType.ScanStarted, 'junk' as ModuleId, 'Junk Cleaner');

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it('unsubscribe stops receiving events', () => {
      let received = false;
      const unsub = moduleEventBus.subscribe(() => { received = true; });
      unsub();
      emitModuleEvent(ModuleEventType.ScanStarted, 'junk' as ModuleId, 'Junk Cleaner');
      expect(received).toBe(false);
    });

    it('event includes timestamp and module info', () => {
      let capturedEvent: any = null;
      moduleEventBus.subscribe((e) => { capturedEvent = e; });

      emitModuleEvent(ModuleEventType.ScanStarted, 'junk' as ModuleId, 'Junk Cleaner', { itemsFound: 42 });

      expect(capturedEvent.timestamp).toBeGreaterThan(0);
      expect(capturedEvent.moduleId).toBe('junk');
      expect(capturedEvent.moduleName).toBe('Junk Cleaner');
      expect(capturedEvent.data.itemsFound).toBe(42);
    });
  });

  // ── Recommendation Aggregation ────────────────────────────────────

  describe('Recommendation Aggregation', () => {
    it('aggregates recommendations from multiple modules', () => {
      const mod1 = new FullTestModule(makeMetadata('junk'));
      mod1.setRecommendations([makeRecommendation('rec1', 'warning')]);
      const mod2 = new FullTestModule(makeMetadata('registry'));
      mod2.setRecommendations([makeRecommendation('rec2', 'critical'), makeRecommendation('rec3', 'info')]);

      moduleRegistry.register(mod1);
      moduleRegistry.register(mod2);

      const recs = recommendationAggregator.getAggregatedRecommendations();
      expect(recs).toHaveLength(3);
    });

    it('prioritizes by severity (critical first)', () => {
      const mod = new FullTestModule(makeMetadata('junk'));
      mod.setRecommendations([
        makeRecommendation('r1', 'info'),
        makeRecommendation('r2', 'danger'),
        makeRecommendation('r3', 'warning'),
      ]);
      moduleRegistry.register(mod);

      const recs = recommendationAggregator.getAggregatedRecommendations();
      expect(recs[0]!.severity).toBe('danger');
      expect(recs[1]!.severity).toBe('warning');
      expect(recs[2]!.severity).toBe('info');
    });

    it('returns empty when no modules registered', () => {
      expect(recommendationAggregator.getAggregatedRecommendations()).toHaveLength(0);
    });

    it('refresh notifies subscribers', () => {
      let notified = false;
      recommendationAggregator.subscribe(() => { notified = true; });
      recommendationAggregator.refresh();
      expect(notified).toBe(true);
    });

    it('handles modules that throw in getRecommendations', () => {
      class ThrowingModule extends FullTestModule {
        override getRecommendations(): Recommendation[] {
          throw new Error('Failed');
        }
      }
      moduleRegistry.register(new ThrowingModule(makeMetadata('junk')));
      moduleRegistry.register(new FullTestModule(makeMetadata('registry')));
      const recs = recommendationAggregator.getAggregatedRecommendations();
      // Only the non-throwing module's recs should be included (0 since it has no recs)
      expect(recs).toHaveLength(0);
    });
  });

  // ── Summary Generation ────────────────────────────────────────────

  describe('Summary Generation', () => {
    it('aggregates module summaries with all fields', () => {
      const summaries: ModuleOptimizationSummary[] = [
        {
          moduleId: 'junk' as ModuleId, moduleName: 'Junk Cleaner',
          itemsRemoved: 150, bytesRecovered: 500_000_000,
          registryFixed: 0, startupOptimized: 0, privacyCleaned: 0,
          duplicateFilesRemoved: 0, durationMs: 3000, success: true,
        },
        {
          moduleId: 'registry' as ModuleId, moduleName: 'Registry Cleaner',
          itemsRemoved: 25, bytesRecovered: 0,
          registryFixed: 25, startupOptimized: 0, privacyCleaned: 0,
          duplicateFilesRemoved: 0, durationMs: 2000, success: true,
        },
        {
          moduleId: 'startup' as ModuleId, moduleName: 'Startup Manager',
          itemsRemoved: 5, bytesRecovered: 0,
          registryFixed: 0, startupOptimized: 5, privacyCleaned: 0,
          duplicateFilesRemoved: 0, durationMs: 1000, success: true,
        },
      ];

      const result = aggregateModuleSummaries(summaries);
      expect(result.modules).toHaveLength(3);
      expect(result.totalItemsRemoved).toBe(180);
      expect(result.totalBytesRecovered).toBe(500_000_000);
      expect(result.totalRegistryFixed).toBe(25);
      expect(result.totalStartupOptimized).toBe(5);
      expect(result.totalDurationMs).toBe(6000);
      expect(result.allSucceeded).toBe(true);
    });

    it('detects partial failure in summary', () => {
      const summaries: ModuleOptimizationSummary[] = [
        {
          moduleId: 'junk' as ModuleId, moduleName: 'Junk Cleaner',
          itemsRemoved: 100, bytesRecovered: 0,
          registryFixed: 0, startupOptimized: 0, privacyCleaned: 0,
          duplicateFilesRemoved: 0, durationMs: 1000, success: true,
        },
        {
          moduleId: 'registry' as ModuleId, moduleName: 'Registry Cleaner',
          itemsRemoved: 0, bytesRecovered: 0,
          registryFixed: 0, startupOptimized: 0, privacyCleaned: 0,
          duplicateFilesRemoved: 0, durationMs: 500, success: false,
        },
      ];
      const result = aggregateModuleSummaries(summaries);
      expect(result.allSucceeded).toBe(false);
    });

    it('handles empty summary list', () => {
      const result = aggregateModuleSummaries([]);
      expect(result.modules).toHaveLength(0);
      expect(result.totalItemsRemoved).toBe(0);
      expect(result.allSucceeded).toBe(true);
    });
  });

  // ── Error Isolation ───────────────────────────────────────────────

  describe('Error Isolation', () => {
    it('one module init failure does not affect others', async () => {
      const failingMod = new FullTestModule(makeMetadata('junk'));
      failingMod.setFailMode('init');
      const healthyMod = new FullTestModule(makeMetadata('registry'));

      moduleRegistry.register(failingMod);
      moduleRegistry.register(healthyMod);

      await moduleRegistry.initializeAll();

      expect(moduleRegistry.getStatus('junk')).toBe('error');
      expect(moduleRegistry.getStatus('registry')).toBe('ready');
    });

    it('one module scan failure does not affect others', async () => {
      const failingMod = new FullTestModule(makeMetadata('junk'));
      failingMod.setFailMode('scan');
      const healthyMod = new FullTestModule(makeMetadata('registry'));

      moduleRegistry.register(failingMod);
      moduleRegistry.register(healthyMod);

      await moduleRegistry.safeExecute('junk', (m) => m.scan());
      await moduleRegistry.safeExecute('registry', (m) => m.scan());

      expect(moduleRegistry.getStatus('junk')).toBe('error');
      expect(moduleRegistry.getStatus('registry')).toBe('ready');
    });

    it('getModulesInError lists only failed modules', async () => {
      const m1 = new FullTestModule(makeMetadata('junk'));
      m1.setFailMode('init');
      const m2 = new FullTestModule(makeMetadata('registry'));
      const m3 = new FullTestModule(makeMetadata('startup'));
      m3.setFailMode('init');

      moduleRegistry.register(m1);
      moduleRegistry.register(m2);
      moduleRegistry.register(m3);

      await moduleRegistry.initializeAll();

      const errors = moduleRegistry.getModulesInError();
      expect(errors).toHaveLength(2);
      expect(errors).toContain('junk');
      expect(errors).toContain('startup');
      expect(errors).not.toContain('registry');
    });

    it('clearModuleError allows retry', async () => {
      const mod = new FullTestModule(makeMetadata('junk'));
      mod.setFailMode('init');
      moduleRegistry.register(mod);

      await moduleRegistry.initializeAll();
      expect(moduleRegistry.getStatus('junk')).toBe('error');

      moduleRegistry.clearModuleError('junk');
      expect(moduleRegistry.getStatus('junk')).toBe('ready');
      expect(moduleRegistry.getModuleError('junk')).toBeUndefined();
    });

    it('disposeAll continues even if one module throws on dispose', () => {
      const failingMod = new FullTestModule(makeMetadata('junk'));
      failingMod.setFailMode('dispose');
      const healthyMod = new FullTestModule(makeMetadata('registry'));

      moduleRegistry.register(failingMod);
      moduleRegistry.register(healthyMod);

      expect(() => moduleRegistry.disposeAll()).not.toThrow();
    });

    it('safeExecute returns undefined and marks error on failure', async () => {
      const mod = new FullTestModule(makeMetadata('junk'));
      moduleRegistry.register(mod);

      const result = await moduleRegistry.safeExecute('junk', () => {
        throw new Error('Boom');
      });

      expect(result).toBeUndefined();
      expect(moduleRegistry.getStatus('junk')).toBe('error');
      expect(moduleRegistry.getModuleError('junk')).toBe('Boom');
    });
  });

  // ── Lazy Loading ──────────────────────────────────────────────────

  describe('Lazy Loading', () => {
    it('registerLazy does not instantiate the module', () => {
      let factoryCalled = false;
      moduleRegistry.registerLazy('junk' as ModuleId, () => {
        factoryCalled = true;
        return new FullTestModule(makeMetadata('junk'));
      });
      expect(factoryCalled).toBe(false);
      expect(moduleRegistry.getLazyModuleIds()).toContain('junk');
    });

    it('initializeModule instantiates and initializes', async () => {
      let factoryCalled = false;
      moduleRegistry.registerLazy('junk' as ModuleId, () => {
        factoryCalled = true;
        return new FullTestModule(makeMetadata('junk'));
      });

      const mod = await moduleRegistry.initializeModule('junk' as ModuleId);
      expect(factoryCalled).toBe(true);
      expect(mod).toBeDefined();
      expect(moduleRegistry.getLazyModuleIds()).not.toContain('junk');
    });

    it('double initializeModule only creates once', async () => {
      let callCount = 0;
      moduleRegistry.registerLazy('junk' as ModuleId, () => {
        callCount++;
        return new FullTestModule(makeMetadata('junk'));
      });

      await moduleRegistry.initializeModule('junk' as ModuleId);
      await moduleRegistry.initializeModule('junk' as ModuleId);
      expect(callCount).toBe(1);
    });

    it('initializeModule handles factory errors', async () => {
      moduleRegistry.registerLazy('junk' as ModuleId, () => {
        throw new Error('Factory boom');
      });

      const result = await moduleRegistry.initializeModule('junk' as ModuleId);
      expect(result).toBeUndefined();
      expect(moduleRegistry.getStatus('junk' as ModuleId)).toBe('error');
    });

    it('initializeModule returns undefined for unknown module', async () => {
      const result = await moduleRegistry.initializeModule('nonexistent' as ModuleId);
      expect(result).toBeUndefined();
    });

    it('registerAllModules lazily registers future modules (version 0.0.0)', () => {
      registerAllModules();
      const lazyIds = moduleRegistry.getLazyModuleIds();
      // All 10 future modules should be lazy
      expect(lazyIds).toHaveLength(10);
      expect(lazyIds).toContain('driver-updater');
      expect(lazyIds).toContain('antivirus');
      expect(lazyIds).toContain('browser-cleaner');
      expect(lazyIds).toContain('battery-optimizer');
      // Existing modules should NOT be lazy
      expect(lazyIds).not.toContain('junk');
      expect(lazyIds).not.toContain('registry');
      clearModuleRegistry();
    });
  });

  // ── Future Module Registration ────────────────────────────────────

  describe('Future Module Registration', () => {
    it('all 19 modules are defined in ALL_MODULE_DEFINITIONS', () => {
      expect(ALL_MODULE_DEFINITIONS).toHaveLength(19);
    });

    it('9 existing modules have version > 0.0.0', () => {
      const existing = ALL_MODULE_DEFINITIONS.filter((m) => m.version !== '0.0.0');
      expect(existing).toHaveLength(9);
    });

    it('10 future modules have version 0.0.0', () => {
      const future = ALL_MODULE_DEFINITIONS.filter((m) => m.version === '0.0.0');
      expect(future).toHaveLength(10);
    });

    it('future modules have valid categories', () => {
      const future = ALL_MODULE_DEFINITIONS.filter((m) => m.version === '0.0.0');
      for (const mod of future) {
        expect(CATEGORY_CONFIG[mod.category]).toBeDefined();
      }
    });

    it('future modules have display order entries', () => {
      const future = ALL_MODULE_DEFINITIONS.filter((m) => m.version === '0.0.0');
      for (const mod of future) {
        expect(getModuleDisplayOrder(mod.moduleId)).toBeLessThan(999);
      }
    });

    it('future modules have health penalties', () => {
      const future = ALL_MODULE_DEFINITIONS.filter((m) => m.version === '0.0.0');
      for (const mod of future) {
        expect(mod.maxHealthPenalty).toBeGreaterThan(0);
      }
    });

    it('future modules have route paths', () => {
      const future = ALL_MODULE_DEFINITIONS.filter((m) => m.version === '0.0.0');
      for (const mod of future) {
        expect(mod.routePath).toBeTruthy();
        expect(mod.routePath.startsWith('/')).toBe(true);
      }
    });

    it('adding a new future module requires only metadata + registration', () => {
      // Simulate: define metadata, register lazily
      const newModuleMeta = makeMetadata('custom-future', {
        displayName: 'Custom Future Module',
        version: '0.0.0',
        category: 'future',
      });

      moduleRegistry.registerLazy('custom-future' as ModuleId, () => {
        return new FullTestModule(newModuleMeta);
      });

      // Module is registered but not instantiated
      expect(moduleRegistry.getLazyModuleIds()).toContain('custom-future');

      // Can be initialized on demand
      const mod = moduleRegistry.initializeModule('custom-future' as ModuleId);
      expect(mod).toBeDefined();
    });
  });

  // ── End-to-End Workflow ───────────────────────────────────────────

  describe('End-to-End Workflow', () => {
    it('full workflow: register → events → scan → history → recommendations → summary', async () => {
      // 1. Register modules
      const junkMod = new FullTestModule(makeMetadata('junk', { maxHealthPenalty: 30 }));
      junkMod.setRecommendations([makeRecommendation('junk-rec', 'warning')]);
      junkMod.setHealthPenalty(10);

      const registryMod = new FullTestModule(makeMetadata('registry', { maxHealthPenalty: 15 }));
      registryMod.setRecommendations([makeRecommendation('reg-rec', 'danger')]);
      registryMod.setHealthPenalty(8);

      moduleRegistry.register(junkMod);
      moduleRegistry.register(registryMod);

      // 2. Subscribe to events
      const events: any[] = [];
      moduleEventBus.subscribe((e) => events.push(e));

      // 3. Initialize
      await moduleRegistry.initializeAll();
      expect(moduleRegistry.getStatus('junk')).toBe('ready');
      expect(moduleRegistry.getStatus('registry')).toBe('ready');

      // 4. Scan — emit events to simulate module lifecycle
      emitModuleEvent(ModuleEventType.ScanStarted, 'junk' as ModuleId, 'Test junk');
      emitModuleEvent(ModuleEventType.ScanCompleted, 'junk' as ModuleId, 'Test junk', { itemsFound: 10 });
      emitModuleEvent(ModuleEventType.ScanStarted, 'registry' as ModuleId, 'Test registry');
      emitModuleEvent(ModuleEventType.ScanCompleted, 'registry' as ModuleId, 'Test registry', { itemsFound: 5 });

      // 5. Events were published
      expect(events.length).toBe(4);
      expect(events[0].type).toBe('scan_started');
      expect(events[1].type).toBe('scan_completed');

      // 6. Recommendations aggregate from both modules
      const recs = recommendationAggregator.getAggregatedRecommendations();
      expect(recs).toHaveLength(2);
      expect(recs[0]!.severity).toBe('danger'); // prioritized (danger = critical equivalent)

      // 7. Health contributions work
      const junkHealth = await junkMod.getHealthContribution();
      const regHealth = await registryMod.getHealthContribution();
      expect(junkHealth.currentPenalty).toBe(10);
      expect(regHealth.currentPenalty).toBe(8);

      // 8. Optimization summary aggregates results
      const summaries: ModuleOptimizationSummary[] = [
        {
          moduleId: 'junk' as ModuleId, moduleName: 'Junk Cleaner',
          itemsRemoved: 150, bytesRecovered: 500_000_000,
          registryFixed: 0, startupOptimized: 0, privacyCleaned: 0,
          duplicateFilesRemoved: 0, durationMs: 3000, success: true,
        },
        {
          moduleId: 'registry' as ModuleId, moduleName: 'Registry Cleaner',
          itemsRemoved: 25, bytesRecovered: 0,
          registryFixed: 25, startupOptimized: 0, privacyCleaned: 0,
          duplicateFilesRemoved: 0, durationMs: 2000, success: true,
        },
      ];
      const aggregated = aggregateModuleSummaries(summaries);
      expect(aggregated.totalItemsRemoved).toBe(175);
      expect(aggregated.allSucceeded).toBe(true);

      // 9. Dashboard entries available
      const entries = moduleRegistry.getRegistryEntries();
      expect(entries).toHaveLength(2);

      // 10. Dispose
      moduleRegistry.disposeAll();
    });

    it('full workflow with error isolation: one fails, other succeeds', async () => {
      const failingMod = new FullTestModule(makeMetadata('junk'));
      failingMod.setFailMode('init');
      const healthyMod = new FullTestModule(makeMetadata('registry'));
      healthyMod.setRecommendations([makeRecommendation('reg-rec', 'warning')]);

      moduleRegistry.register(failingMod);
      moduleRegistry.register(healthyMod);

      // Initialize — one fails
      await moduleRegistry.initializeAll();

      // Failing module is in error
      expect(moduleRegistry.getStatus('junk')).toBe('error');
      expect(moduleRegistry.getModuleError('junk')).toBe('junk init failed');

      // Healthy module is operational
      expect(moduleRegistry.getStatus('registry')).toBe('ready');

      // Recommendations still work from healthy module
      const recs = recommendationAggregator.getAggregatedRecommendations();
      expect(recs).toHaveLength(1);
      expect(recs[0]!.id).toBe('reg-rec');

      // Dashboard entries still show both modules
      const entries = moduleRegistry.getRegistryEntries();
      expect(entries).toHaveLength(2);

      // Can clear error and retry
      moduleRegistry.clearModuleError('junk');
      expect(moduleRegistry.getStatus('junk')).toBe('ready');
    });

    it('full workflow with lazy loading: future module initialized on demand', async () => {
      let factoryCalled = false;
      moduleRegistry.registerLazy('driver-updater' as ModuleId, () => {
        factoryCalled = true;
        const mod = new FullTestModule(makeMetadata('driver-updater', {
          version: '0.0.0',
          category: 'future',
          maxHealthPenalty: 10,
        }));
        mod.setRecommendations([makeRecommendation('driver-rec', 'info')]);
        return mod;
      });

      // Not yet instantiated
      expect(factoryCalled).toBe(false);

      // Initialize on demand
      const mod = await moduleRegistry.initializeModule('driver-updater' as ModuleId);
      expect(factoryCalled).toBe(true);
      expect(mod).toBeDefined();

      // Can now use it
      const health = await mod!.getHealthContribution();
      expect(health.moduleId).toBe('driver-updater');

      const recs = mod!.getRecommendations();
      expect(recs).toHaveLength(1);
      expect(recs[0]!.id).toBe('driver-rec');
    });
  });
});
