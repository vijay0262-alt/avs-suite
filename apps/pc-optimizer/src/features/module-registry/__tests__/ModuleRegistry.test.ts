// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { moduleRegistry, clearModuleRegistry, registerAllModules } from '../index';
import { ALL_MODULE_DEFINITIONS } from '../moduleDefinitions';
import { MODULE_LIFECYCLE_CONFIG } from '../moduleRegistry.types';
import type { OptimizerModule, ModuleMetadata, ModuleLifecycleState, ModuleStatistics } from '../moduleRegistry.types';
import type { HealthContribution } from '../../health/HealthContribution';
import type { Recommendation } from '../../dashboard/dashboard.types';

// ── Test helpers ────────────────────────────────────────────────────

class TestModule implements OptimizerModule {
  private _status: ModuleLifecycleState = 'ready';
  private _stats: ModuleStatistics = {
    lastScanAt: null, lastCleanAt: null, totalScans: 0,
    totalCleans: 0, totalSpaceRecovered: 0, totalIssuesFixed: 0,
  };

  constructor(readonly metadata: ModuleMetadata) {}

  async initialize(): Promise<void> { this._status = 'ready'; }
  dispose(): void { this._status = 'ready'; }
  async scan(): Promise<unknown> { this._status = 'scanning'; return null; }
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

// ── Tests ───────────────────────────────────────────────────────────

describe('Module Registry (Part 1)', () => {
  beforeEach(() => {
    clearModuleRegistry();
  });

  afterEach(() => {
    clearModuleRegistry();
  });

  it('registers and retrieves a module', () => {
    const meta = makeTestMetadata('junk');
    const module = new TestModule(meta);
    moduleRegistry.register(module);
    expect(moduleRegistry.getModule('junk')).toBe(module);
  });

  it('getAllModules returns all registered modules', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    moduleRegistry.register(new TestModule(makeTestMetadata('registry')));
    expect(moduleRegistry.getAllModules()).toHaveLength(2);
  });

  it('getAllMetadata returns metadata for all modules', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    moduleRegistry.register(new TestModule(makeTestMetadata('registry')));
    const metas = moduleRegistry.getAllMetadata();
    expect(metas).toHaveLength(2);
    expect(metas[0]!.moduleId).toBe('junk');
  });

  it('unregister removes a module', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    expect(moduleRegistry.getModule('junk')).toBeDefined();
    moduleRegistry.unregister('junk');
    expect(moduleRegistry.getModule('junk')).toBeUndefined();
  });

  it('overwriting a module logs a warning but does not throw', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    expect(consoleSpy).toHaveBeenCalled();
    expect(moduleRegistry.getAllModules()).toHaveLength(1);
    consoleSpy.mockRestore();
  });

  it('getRegistryEntries returns entries with status and availability', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    const entries = moduleRegistry.getRegistryEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.metadata.moduleId).toBe('junk');
    expect(entries[0]!.status).toBe('ready');
    expect(entries[0]!.available).toBe(true);
    expect(entries[0]!.locked).toBe(false);
  });
});

describe('Module Lifecycle States (Part 2)', () => {
  it('MODULE_LIFECYCLE_CONFIG has all 11 states with labels', () => {
    const states: ModuleLifecycleState[] = [
      'not_installed', 'ready', 'scanning', 'cleaning', 'optimizing',
      'completed', 'warning', 'error', 'disabled', 'locked', 'updating',
    ];
    for (const state of states) {
      expect(MODULE_LIFECYCLE_CONFIG[state]).toBeDefined();
      expect(MODULE_LIFECYCLE_CONFIG[state].label).toBeTruthy();
      expect(MODULE_LIFECYCLE_CONFIG[state].colorClass).toBeTruthy();
    }
    expect(states).toHaveLength(11);
  });

  it('setStatus updates the module status', () => {
    clearModuleRegistry();
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    moduleRegistry.setStatus('junk', 'scanning');
    expect(moduleRegistry.getStatus('junk')).toBe('scanning');
    clearModuleRegistry();
  });

  it('getStatus returns ready for unknown module', () => {
    clearModuleRegistry();
    expect(moduleRegistry.getStatus('nonexistent' as any)).toBe('ready');
  });
});

describe('Standard Module Interface (Part 3)', () => {
  beforeEach(() => {
    clearModuleRegistry();
  });

  afterEach(() => {
    clearModuleRegistry();
  });

  it('OptimizerModule implements all required methods', () => {
    const module = new TestModule(makeTestMetadata('junk'));
    expect(typeof module.initialize).toBe('function');
    expect(typeof module.dispose).toBe('function');
    expect(typeof module.scan).toBe('function');
    expect(typeof module.clean).toBe('function');
    expect(typeof module.optimize).toBe('function');
    expect(typeof module.cancel).toBe('function');
    expect(typeof module.refresh).toBe('function');
    expect(typeof module.getStatus).toBe('function');
    expect(typeof module.getHealthContribution).toBe('function');
    expect(typeof module.getRecommendations).toBe('function');
    expect(typeof module.getStatistics).toBe('function');
  });

  it('scan returns a promise', async () => {
    const module = new TestModule(makeTestMetadata('junk'));
    const result = module.scan();
    expect(result instanceof Promise).toBe(true);
    await result;
  });

  it('getHealthContribution returns a HealthContribution', async () => {
    const module = new TestModule(makeTestMetadata('junk'));
    const contribution = await module.getHealthContribution();
    expect(contribution.moduleId).toBe('junk');
    expect(contribution.moduleName).toBe('junk');
    expect(contribution.maxPenalty).toBe(10);
  });

  it('getStatistics returns a ModuleStatistics object', () => {
    const module = new TestModule(makeTestMetadata('junk'));
    const stats = module.getStatistics();
    expect(stats.totalScans).toBe(0);
    expect(stats.lastScanAt).toBeNull();
  });
});

describe('Dashboard Integration (Part 4)', () => {
  beforeEach(() => {
    clearModuleRegistry();
  });

  afterEach(() => {
    clearModuleRegistry();
  });

  it('getRegistryEntries provides data for dynamic card rendering', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    moduleRegistry.register(new TestModule(makeTestMetadata('registry')));
    const entries = moduleRegistry.getRegistryEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.metadata.displayName).toBe('junk');
    expect(entries[0]!.metadata.routePath).toBe('/test-junk');
  });

  it('subscribe notifies on status change', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    let notifiedEntries: any[] = [];
    moduleRegistry.subscribe((entries) => { notifiedEntries = entries; });
    moduleRegistry.setStatus('junk', 'scanning');
    expect(notifiedEntries).toHaveLength(1);
    expect(notifiedEntries[0].status).toBe('scanning');
  });

  it('unsubscribe stops notifications', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    let notified = false;
    const unsub = moduleRegistry.subscribe(() => { notified = true; });
    unsub();
    moduleRegistry.setStatus('junk', 'scanning');
    expect(notified).toBe(false);
  });

  it('getAvailableModules filters out locked modules', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk', {
      featurePermissions: { scan: 'junk.scan' as any },
    })));
    // Without FeatureGate init, edition defaults to 'free' which has junk.scan
    const available = moduleRegistry.getAvailableModules();
    expect(available).toHaveLength(1);
  });
});

describe('Health Engine Integration (Part 5)', () => {
  it('ALL_MODULE_DEFINITIONS includes all 14 modules', () => {
    expect(ALL_MODULE_DEFINITIONS).toHaveLength(14);
  });

  it('each module definition has maxHealthPenalty > 0', () => {
    for (const def of ALL_MODULE_DEFINITIONS) {
      expect(def.maxHealthPenalty).toBeGreaterThan(0);
      expect(def.maxHealthPenalty).toBeLessThanOrEqual(30);
    }
  });

  it('each module definition has a valid routePath', () => {
    for (const def of ALL_MODULE_DEFINITIONS) {
      expect(def.routePath).toBeTruthy();
      expect(def.routePath.startsWith('/')).toBe(true);
    }
  });

  it('each module definition has capabilities', () => {
    for (const def of ALL_MODULE_DEFINITIONS) {
      expect(def.capabilities).toBeDefined();
      expect(typeof def.capabilities.canScan).toBe('boolean');
      expect(typeof def.capabilities.canClean).toBe('boolean');
      expect(typeof def.capabilities.canOptimize).toBe('boolean');
      expect(typeof def.capabilities.canRunInBackground).toBe('boolean');
    }
  });

  it('registerAllModules registers all modules', () => {
    clearModuleRegistry();
    registerAllModules();
    const entries = moduleRegistry.getRegistryEntries();
    expect(entries.length).toBeGreaterThanOrEqual(14);
    clearModuleRegistry();
  });
});

describe('FeatureGate Integration (Part 6)', () => {
  beforeEach(() => {
    clearModuleRegistry();
  });

  afterEach(() => {
    clearModuleRegistry();
  });

  it('canScan returns true when no scan permission is required', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk', {
      featurePermissions: {},
    })));
    expect(moduleRegistry.canScan('junk')).toBe(true);
  });

  it('canScan returns true when scan permission is available', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk', {
      featurePermissions: { scan: 'junk.scan' as any },
    })));
    // FeatureGate defaults to 'free' edition which has junk.scan
    expect(moduleRegistry.canScan('junk')).toBe(true);
  });

  it('canClean returns true when no clean permission is required', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk', {
      featurePermissions: {},
    })));
    expect(moduleRegistry.canClean('junk')).toBe(true);
  });

  it('canOptimize returns true when no optimize permission is required', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk', {
      featurePermissions: {},
    })));
    expect(moduleRegistry.canOptimize('junk')).toBe(true);
  });

  it('canRunInBackground returns true when no background permission is required', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk', {
      featurePermissions: {},
    })));
    expect(moduleRegistry.canRunInBackground('junk')).toBe(true);
  });

  it('canScan returns false for unknown module', () => {
    expect(moduleRegistry.canScan('nonexistent' as any)).toBe(false);
  });

  it('locked modules show locked status in registry entries', () => {
    // Register a module with a feature permission that free edition doesn't have
    moduleRegistry.register(new TestModule(makeTestMetadata('test-premium', {
      featurePermissions: { scan: 'junk.clean_unlimited' as any },
    })));
    const entries = moduleRegistry.getRegistryEntries();
    const entry = entries.find((e: any) => e.metadata.moduleId === 'test-premium');
    expect(entry).toBeDefined();
    // junk.clean_unlimited is not available in free edition
    expect(entry!.locked).toBe(true);
    expect(entry!.status).toBe('locked');
  });
});

describe('Module Statistics', () => {
  beforeEach(() => {
    clearModuleRegistry();
  });

  afterEach(() => {
    clearModuleRegistry();
  });

  it('updateStatistics updates module statistics', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    moduleRegistry.updateStatistics('junk', { totalScans: 5, totalCleans: 3 });
    const stats = moduleRegistry.getStatistics('junk');
    expect(stats.totalScans).toBe(5);
    expect(stats.totalCleans).toBe(3);
  });

  it('getStatistics returns default for unknown module', () => {
    const stats = moduleRegistry.getStatistics('nonexistent' as any);
    expect(stats.totalScans).toBe(0);
    expect(stats.lastScanAt).toBeNull();
  });
});

describe('Module Registry Lifecycle', () => {
  beforeEach(() => {
    clearModuleRegistry();
  });

  afterEach(() => {
    clearModuleRegistry();
  });

  it('initializeAll initializes all available modules', async () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    moduleRegistry.register(new TestModule(makeTestMetadata('registry')));
    await moduleRegistry.initializeAll();
    expect(moduleRegistry.getStatus('junk')).toBe('ready');
    expect(moduleRegistry.getStatus('registry')).toBe('ready');
  });

  it('disposeAll disposes all modules', () => {
    moduleRegistry.register(new TestModule(makeTestMetadata('junk')));
    moduleRegistry.disposeAll();
    // Should not throw
    expect(moduleRegistry.getModule('junk')).toBeDefined();
  });
});

describe('Future Module Definitions', () => {
  it('includes Driver Updater module', () => {
    const driverUpdater = ALL_MODULE_DEFINITIONS.find((m) => m.moduleId === 'driver-updater');
    expect(driverUpdater).toBeDefined();
    expect(driverUpdater!.displayName).toBe('Driver Updater');
    expect(driverUpdater!.category).toBe('future');
  });

  it('includes Antivirus module', () => {
    const antivirus = ALL_MODULE_DEFINITIONS.find((m) => m.moduleId === 'antivirus');
    expect(antivirus).toBeDefined();
    expect(antivirus!.displayName).toBe('Antivirus');
  });

  it('includes VPN module', () => {
    const vpn = ALL_MODULE_DEFINITIONS.find((m) => m.moduleId === 'vpn');
    expect(vpn).toBeDefined();
    expect(vpn!.displayName).toBe('VPN');
  });

  it('includes Backup module', () => {
    const backup = ALL_MODULE_DEFINITIONS.find((m) => m.moduleId === 'backup');
    expect(backup).toBeDefined();
    expect(backup!.displayName).toBe('Backup');
  });

  it('includes File Recovery module', () => {
    const fileRecovery = ALL_MODULE_DEFINITIONS.find((m) => m.moduleId === 'file-recovery');
    expect(fileRecovery).toBeDefined();
    expect(fileRecovery!.displayName).toBe('File Recovery');
  });

  it('future modules have version 0.0.0', () => {
    const futureModules = ALL_MODULE_DEFINITIONS.filter((m) => m.category === 'future');
    for (const mod of futureModules) {
      expect(mod.version).toBe('0.0.0');
    }
  });
});
