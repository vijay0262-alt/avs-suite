// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  moduleRegistry,
  clearModuleRegistry,
  registerAllModules,
  ALL_MODULE_DEFINITIONS,
  BROWSER_CLEANER_MODULE,
  DISK_DEFRAGMENTER_MODULE,
  NETWORK_OPTIMIZER_MODULE,
  MEMORY_OPTIMIZER_MODULE,
  BATTERY_OPTIMIZER_MODULE,
  CATEGORY_CONFIG,
  DEFAULT_HEALTH_WEIGHTS,
  DEFAULT_MODULE_SETTINGS,
  MODULE_DISPLAY_ORDER,
  getModuleDisplayOrder,
  sortByDisplayOrder,
} from '../index';
import type { OptimizerModule, ModuleMetadata, ModuleLifecycleState, ModuleStatistics } from '../moduleRegistry.types';
import type { HealthContribution } from '../../health/HealthContribution';
import type { Recommendation } from '../../dashboard/dashboard.types';
import type { ModuleId } from '../../health/HealthContribution';
import { isFutureModule, getFutureModuleConfig, FUTURE_MODULE_CONFIGS } from '../../health/FutureModules';

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

class TestModule implements OptimizerModule {
  private _status: ModuleLifecycleState = 'ready';
  private _stats: ModuleStatistics = {
    lastScanAt: null, lastCleanAt: null, totalScans: 0,
    totalCleans: 0, totalSpaceRecovered: 0, totalIssuesFixed: 0,
  };
  private _shouldFail = false;

  constructor(readonly metadata: ModuleMetadata) {}
  setShouldFail(fail: boolean) { this._shouldFail = fail; }

  async initialize(): Promise<void> {
    if (this._shouldFail) throw new Error('Init failed');
    this._status = 'ready';
  }
  dispose(): void { this._status = 'ready'; }
  async scan(): Promise<unknown> {
    if (this._shouldFail) throw new Error('Scan failed');
    this._status = 'scanning';
    return null;
  }
  async clean(): Promise<unknown> { this._status = 'cleaning'; return null; }
  async optimize(): Promise<unknown> { this._status = 'optimizing'; return null; }
  cancel(): void { this._status = 'ready'; }
  async refresh(): Promise<void> {}
  getStatus(): ModuleLifecycleState { return this._status; }
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
  getRecommendations(): Recommendation[] { return []; }
  getStatistics(): ModuleStatistics { return this._stats; }
}

// ── Part 11: Future Module Support ──────────────────────────────────

describe('Future Module Support (Part 11)', () => {
  it('ALL_MODULE_DEFINITIONS includes all 19 modules (9 existing + 10 future)', () => {
    expect(ALL_MODULE_DEFINITIONS).toHaveLength(19);
  });

  it('includes Browser Cleaner module', () => {
    expect(BROWSER_CLEANER_MODULE).toBeDefined();
    expect(BROWSER_CLEANER_MODULE.moduleId).toBe('browser-cleaner');
    expect(BROWSER_CLEANER_MODULE.displayName).toBe('Browser Cleaner');
    expect(BROWSER_CLEANER_MODULE.category).toBe('privacy');
    expect(BROWSER_CLEANER_MODULE.capabilities.canClean).toBe(true);
  });

  it('includes Disk Defragmenter module', () => {
    expect(DISK_DEFRAGMENTER_MODULE).toBeDefined();
    expect(DISK_DEFRAGMENTER_MODULE.moduleId).toBe('disk-defragmenter');
    expect(DISK_DEFRAGMENTER_MODULE.displayName).toBe('Disk Defragmenter');
    expect(DISK_DEFRAGMENTER_MODULE.category).toBe('optimization');
    expect(DISK_DEFRAGMENTER_MODULE.supportedOS).toEqual(['win32']);
  });

  it('includes Network Optimizer module', () => {
    expect(NETWORK_OPTIMIZER_MODULE).toBeDefined();
    expect(NETWORK_OPTIMIZER_MODULE.moduleId).toBe('network-optimizer');
    expect(NETWORK_OPTIMIZER_MODULE.displayName).toBe('Network Optimizer');
    expect(NETWORK_OPTIMIZER_MODULE.capabilities.canOptimize).toBe(true);
  });

  it('includes Memory Optimizer module', () => {
    expect(MEMORY_OPTIMIZER_MODULE).toBeDefined();
    expect(MEMORY_OPTIMIZER_MODULE.moduleId).toBe('memory-optimizer');
    expect(MEMORY_OPTIMIZER_MODULE.displayName).toBe('Memory Optimizer');
    expect(MEMORY_OPTIMIZER_MODULE.capabilities.canRunInBackground).toBe(true);
  });

  it('includes Battery Optimizer module', () => {
    expect(BATTERY_OPTIMIZER_MODULE).toBeDefined();
    expect(BATTERY_OPTIMIZER_MODULE.moduleId).toBe('battery-optimizer');
    expect(BATTERY_OPTIMIZER_MODULE.displayName).toBe('Battery Optimizer');
    expect(BATTERY_OPTIMIZER_MODULE.capabilities.canOptimize).toBe(true);
  });

  it('all 5 new future modules have version 0.0.0', () => {
    const newModules = [BROWSER_CLEANER_MODULE, DISK_DEFRAGMENTER_MODULE, NETWORK_OPTIMIZER_MODULE, MEMORY_OPTIMIZER_MODULE, BATTERY_OPTIMIZER_MODULE];
    for (const mod of newModules) {
      expect(mod.version).toBe('0.0.0');
    }
  });

  it('all 5 new future modules have valid routePaths', () => {
    const newModules = [BROWSER_CLEANER_MODULE, DISK_DEFRAGMENTER_MODULE, NETWORK_OPTIMIZER_MODULE, MEMORY_OPTIMIZER_MODULE, BATTERY_OPTIMIZER_MODULE];
    for (const mod of newModules) {
      expect(mod.routePath.startsWith('/')).toBe(true);
    }
  });

  it('all 5 new future modules have maxHealthPenalty > 0', () => {
    const newModules = [BROWSER_CLEANER_MODULE, DISK_DEFRAGMENTER_MODULE, NETWORK_OPTIMIZER_MODULE, MEMORY_OPTIMIZER_MODULE, BATTERY_OPTIMIZER_MODULE];
    for (const mod of newModules) {
      expect(mod.maxHealthPenalty).toBeGreaterThan(0);
      expect(mod.maxHealthPenalty).toBeLessThanOrEqual(30);
    }
  });

  it('FUTURE_MODULE_CONFIGS includes all 10 future modules', () => {
    expect(FUTURE_MODULE_CONFIGS).toHaveLength(10);
  });

  it('isFutureModule identifies new future modules', () => {
    expect(isFutureModule('browser-cleaner')).toBe(true);
    expect(isFutureModule('disk-defragmenter')).toBe(true);
    expect(isFutureModule('network-optimizer')).toBe(true);
    expect(isFutureModule('memory-optimizer')).toBe(true);
    expect(isFutureModule('battery-optimizer')).toBe(true);
  });

  it('getFutureModuleConfig returns config for new future modules', () => {
    const config = getFutureModuleConfig('browser-cleaner');
    expect(config).toBeDefined();
    expect(config!.displayName).toBe('Browser Cleaner');
    expect(config!.maxPenalty).toBe(8);
  });

  it('ModuleId type includes new future module IDs', () => {
    // Verify the type compiles by using the IDs
    const ids: ModuleId[] = [
      'browser-cleaner',
      'disk-defragmenter',
      'network-optimizer',
      'memory-optimizer',
      'battery-optimizer',
    ];
    expect(ids).toHaveLength(5);
  });

  it('registerAllModules registers all 19 modules', () => {
    clearModuleRegistry();
    registerAllModules();
    // Eagerly registered modules (9 existing) + lazy factories (10 future)
    // getAllModules only returns instantiated modules
    const eagerCount = moduleRegistry.getAllModules().length;
    const lazyCount = moduleRegistry.getLazyModuleIds().length;
    expect(eagerCount + lazyCount).toBe(19);
    clearModuleRegistry();
  });
});

// ── Part 12: Dependency Isolation ───────────────────────────────────

describe('Dependency Isolation (Part 12)', () => {
  beforeEach(() => { clearModuleRegistry(); });
  afterEach(() => { clearModuleRegistry(); });

  it('one module failure does not affect other modules', async () => {
    const failingModule = new TestModule(makeTestMetadata('junk'));
    failingModule.setShouldFail(true);
    const healthyModule = new TestModule(makeTestMetadata('registry'));

    moduleRegistry.register(failingModule);
    moduleRegistry.register(healthyModule);

    await moduleRegistry.initializeAll();

    // Failing module should be in error state
    expect(moduleRegistry.getStatus('junk')).toBe('error');
    expect(moduleRegistry.getModuleError('junk')).toBe('Init failed');

    // Healthy module should remain operational
    expect(moduleRegistry.getStatus('registry')).toBe('ready');
    expect(moduleRegistry.getModuleError('registry')).toBeUndefined();
  });

  it('getModulesInError returns only failed modules', async () => {
    const failingModule = new TestModule(makeTestMetadata('junk'));
    failingModule.setShouldFail(true);
    const healthyModule = new TestModule(makeTestMetadata('registry'));

    moduleRegistry.register(failingModule);
    moduleRegistry.register(healthyModule);

    await moduleRegistry.initializeAll();

    const errorModules = moduleRegistry.getModulesInError();
    expect(errorModules).toHaveLength(1);
    expect(errorModules).toContain('junk');
  });

  it('clearModuleError resets error state', async () => {
    const failingModule = new TestModule(makeTestMetadata('junk'));
    failingModule.setShouldFail(true);

    moduleRegistry.register(failingModule);
    await moduleRegistry.initializeAll();

    expect(moduleRegistry.getStatus('junk')).toBe('error');
    moduleRegistry.clearModuleError('junk');
    expect(moduleRegistry.getStatus('junk')).toBe('ready');
    expect(moduleRegistry.getModuleError('junk')).toBeUndefined();
  });

  it('safeExecute catches errors and marks module as error', async () => {
    const module = new TestModule(makeTestMetadata('junk'));
    moduleRegistry.register(module);

    const result = await moduleRegistry.safeExecute('junk', async (_m) => {
      throw new Error('Operation failed');
    });

    expect(result).toBeUndefined();
    expect(moduleRegistry.getStatus('junk')).toBe('error');
    expect(moduleRegistry.getModuleError('junk')).toBe('Operation failed');
  });

  it('safeExecute returns result on success', async () => {
    const module = new TestModule(makeTestMetadata('junk'));
    moduleRegistry.register(module);

    const result = await moduleRegistry.safeExecute('junk', async (_m) => {
      return 'success';
    });

    expect(result).toBe('success');
    expect(moduleRegistry.getStatus('junk')).toBe('ready');
  });

  it('safeExecute returns undefined for unknown module', async () => {
    const result = await moduleRegistry.safeExecute('nonexistent' as any, async (_m) => 'test');
    expect(result).toBeUndefined();
  });

  it('disposeAll continues even if one module throws', () => {
    class FailingDispose extends TestModule {
      override dispose(): void {
        throw new Error('Dispose failed');
      }
    }
    const failingModule = new FailingDispose(makeTestMetadata('junk'));
    const healthyModule = new TestModule(makeTestMetadata('registry'));

    moduleRegistry.register(failingModule);
    moduleRegistry.register(healthyModule);

    // Should not throw
    expect(() => moduleRegistry.disposeAll()).not.toThrow();
  });
});

// ── Part 13: Configuration ──────────────────────────────────────────

describe('Centralized Configuration (Part 13)', () => {
  it('CATEGORY_CONFIG defines all 6 categories with labels and order', () => {
    expect(CATEGORY_CONFIG.cleanup.label).toBe('Cleanup');
    expect(CATEGORY_CONFIG.optimization.label).toBe('Optimization');
    expect(CATEGORY_CONFIG.privacy.label).toBe('Privacy');
    expect(CATEGORY_CONFIG.security.label).toBe('Security');
    expect(CATEGORY_CONFIG.system.label).toBe('System');
    expect(CATEGORY_CONFIG.future.label).toBe('Coming Soon');
  });

  it('CATEGORY_CONFIG has correct sort order', () => {
    expect(CATEGORY_CONFIG.cleanup.order).toBeLessThan(CATEGORY_CONFIG.optimization.order);
    expect(CATEGORY_CONFIG.optimization.order).toBeLessThan(CATEGORY_CONFIG.privacy.order);
    expect(CATEGORY_CONFIG.privacy.order).toBeLessThan(CATEGORY_CONFIG.security.order);
    expect(CATEGORY_CONFIG.security.order).toBeLessThan(CATEGORY_CONFIG.system.order);
    expect(CATEGORY_CONFIG.system.order).toBeLessThan(CATEGORY_CONFIG.future.order);
  });

  it('DEFAULT_HEALTH_WEIGHTS includes all 19 modules', () => {
    const weightKeys = Object.keys(DEFAULT_HEALTH_WEIGHTS);
    expect(weightKeys).toHaveLength(19);
  });

  it('DEFAULT_HEALTH_WEIGHTS has reasonable values', () => {
    for (const [, weight] of Object.entries(DEFAULT_HEALTH_WEIGHTS)) {
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThanOrEqual(30);
    }
  });

  it('DEFAULT_MODULE_SETTINGS has expected defaults', () => {
    expect(DEFAULT_MODULE_SETTINGS.showFutureModules).toBe(true);
    expect(DEFAULT_MODULE_SETTINGS.lazyInitialization).toBe(true);
    expect(DEFAULT_MODULE_SETTINGS.maxConcurrentOperations).toBe(3);
    expect(DEFAULT_MODULE_SETTINGS.autoRetryOnError).toBe(true);
  });

  it('MODULE_DISPLAY_ORDER includes all 19 modules', () => {
    expect(MODULE_DISPLAY_ORDER).toHaveLength(19);
  });

  it('getModuleDisplayOrder returns correct index', () => {
    expect(getModuleDisplayOrder('junk')).toBe(0);
    expect(getModuleDisplayOrder('battery-optimizer')).toBe(18);
  });

  it('getModuleDisplayOrder returns 999 for unknown module', () => {
    expect(getModuleDisplayOrder('nonexistent')).toBe(999);
  });

  it('sortByDisplayOrder sorts entries by configured order', () => {
    const entries = [
      { metadata: { moduleId: 'registry' } },
      { metadata: { moduleId: 'junk' } },
      { metadata: { moduleId: 'performance' } },
    ];
    const sorted = sortByDisplayOrder(entries as any);
    expect(sorted[0]!.metadata.moduleId).toBe('junk');
    expect(sorted[1]!.metadata.moduleId).toBe('registry');
    expect(sorted[2]!.metadata.moduleId).toBe('performance');
  });
});

// ── Part 14: Performance — Lazy Initialization ──────────────────────

describe('Lazy Initialization (Part 14)', () => {
  beforeEach(() => { clearModuleRegistry(); });
  afterEach(() => { clearModuleRegistry(); });

  it('registerLazy registers without instantiating the module', () => {
    let factoryCalled = false;
    moduleRegistry.registerLazy('junk' as ModuleId, () => {
      factoryCalled = true;
      return new TestModule(makeTestMetadata('junk'));
    });

    // Factory should not be called yet
    expect(factoryCalled).toBe(false);

    // But the module ID should be tracked
    expect(moduleRegistry.getLazyModuleIds()).toContain('junk');
  });

  it('initializeModule instantiates and initializes a lazy module', async () => {
    let factoryCalled = false;
    moduleRegistry.registerLazy('junk' as ModuleId, () => {
      factoryCalled = true;
      return new TestModule(makeTestMetadata('junk'));
    });

    const module = await moduleRegistry.initializeModule('junk' as ModuleId);

    expect(factoryCalled).toBe(true);
    expect(module).toBeDefined();
    expect(moduleRegistry.getModule('junk' as ModuleId)).toBeDefined();
    expect(moduleRegistry.getLazyModuleIds()).not.toContain('junk');
  });

  it('initializeModule on already-instantiated module does not re-create', async () => {
    let factoryCallCount = 0;
    moduleRegistry.registerLazy('junk' as ModuleId, () => {
      factoryCallCount++;
      return new TestModule(makeTestMetadata('junk'));
    });

    await moduleRegistry.initializeModule('junk' as ModuleId);
    await moduleRegistry.initializeModule('junk' as ModuleId);

    expect(factoryCallCount).toBe(1);
  });

  it('initializeModule returns undefined for unknown module', async () => {
    const result = await moduleRegistry.initializeModule('nonexistent' as ModuleId);
    expect(result).toBeUndefined();
  });

  it('initializeModule handles factory errors gracefully', async () => {
    moduleRegistry.registerLazy('junk' as ModuleId, () => {
      throw new Error('Factory failed');
    });

    const result = await moduleRegistry.initializeModule('junk' as ModuleId);

    expect(result).toBeUndefined();
    expect(moduleRegistry.getStatus('junk' as ModuleId)).toBe('error');
    expect(moduleRegistry.getModuleError('junk' as ModuleId)).toBe('Factory failed');
  });

  it('registerAllModules lazily registers future modules', () => {
    clearModuleRegistry();
    registerAllModules();

    // Future modules should be lazy
    const lazyIds = moduleRegistry.getLazyModuleIds();
    expect(lazyIds).toContain('driver-updater');
    expect(lazyIds).toContain('antivirus');
    expect(lazyIds).toContain('browser-cleaner');
    expect(lazyIds).toContain('battery-optimizer');

    // Existing modules should be eagerly loaded
    expect(moduleRegistry.getModule('junk' as ModuleId)).toBeDefined();
    expect(moduleRegistry.getModule('registry' as ModuleId)).toBeDefined();

    clearModuleRegistry();
  });

  it('getLazyModuleIds returns only uninstantiated lazy modules', async () => {
    moduleRegistry.registerLazy('junk' as ModuleId, () => new TestModule(makeTestMetadata('junk')));
    moduleRegistry.registerLazy('registry' as ModuleId, () => new TestModule(makeTestMetadata('registry')));

    // Both should be lazy initially
    expect(moduleRegistry.getLazyModuleIds()).toHaveLength(2);

    // Initialize one
    await moduleRegistry.initializeModule('junk' as ModuleId);

    // Only one should remain lazy
    expect(moduleRegistry.getLazyModuleIds()).toHaveLength(1);
    expect(moduleRegistry.getLazyModuleIds()).toContain('registry');
  });
});
