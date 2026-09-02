/**
 * Module Adapters — real implementations of OptimizerModule for existing v1 modules.
 *
 * Each adapter wraps the existing RPC service for its module, bridging
 * the module registry to the actual backend functionality.
 */
import type {
  OptimizerModule,
  ModuleMetadata,
  ModuleLifecycleState,
  ModuleStatistics,
} from './moduleRegistry.types';
import type { HealthContribution } from '../health/HealthContribution';
import type { Recommendation } from '../dashboard/dashboard.types';

// ── RPC helper ───────────────────────────────────────────────────

interface RpcScanResult {
  result?: { total_items?: number; space_cleaned?: number };
  issues?: number;
  entries?: unknown[];
  groups?: unknown[];
}

function rpcCall(method: string, params?: Record<string, unknown>): Promise<RpcScanResult> {
  if (typeof window === 'undefined' || !window.avs) {
    return Promise.reject(new Error('AVS RPC bridge is not available'));
  }
  return window.avs.rpc.call<RpcScanResult>(method, params);
}

// ── Base adapter ─────────────────────────────────────────────────

abstract class BaseModuleAdapter implements OptimizerModule {
  protected _status: ModuleLifecycleState = 'ready';
  protected _stats: ModuleStatistics = {
    lastScanAt: null,
    lastCleanAt: null,
    totalScans: 0,
    totalCleans: 0,
    totalSpaceRecovered: 0,
    totalIssuesFixed: 0,
  };

  constructor(readonly metadata: ModuleMetadata) {}

  async initialize(): Promise<void> {
    this._status = 'ready';
  }
  dispose(): void {
    this._status = 'disabled';
  }

  abstract scan(): Promise<unknown>;
  abstract clean(): Promise<unknown>;

  async optimize(): Promise<unknown> { return null; }
  cancel(): void {
    this._status = 'ready';
  }

  async refresh(): Promise<void> {
    this._status = 'ready';
  }

  getStatus(): ModuleLifecycleState {
    return this._status;
  }

  async getHealthContribution(): Promise<HealthContribution> {
    return {
      moduleId: this.metadata.moduleId,
      moduleName: this.metadata.displayName,
      currentPenalty: 0,
      maxPenalty: this.metadata.maxHealthPenalty,
      resolvedPenalty: 0,
      detail: 'No issues detected',
      canAutoFix: this.metadata.capabilities.canClean,
      actionPath: this.metadata.routePath,
    };
  }

  getRecommendations(): Recommendation[] {
    return [];
  }

  getStatistics(): ModuleStatistics {
    return { ...this._stats };
  }

  protected _recordScan(issuesFound: number = 0): void {
    this._stats.totalScans++;
    this._stats.lastScanAt = new Date().toISOString();
    this._stats.totalIssuesFixed += issuesFound;
  }

  protected _recordClean(spaceRecovered: number = 0): void {
    this._stats.totalCleans++;
    this._stats.lastCleanAt = new Date().toISOString();
    this._stats.totalSpaceRecovered += spaceRecovered;
  }
}

// ── Junk Cleaner adapter ─────────────────────────────────────────

export class JunkCleanerAdapter extends BaseModuleAdapter {
  async scan(): Promise<unknown> {
    this._status = 'scanning';
    try {
      const res = await rpcCall('unified_cleaner.scan', { categories: ['junk'] });
      this._status = 'completed';
      this._recordScan(res.result?.total_items ?? 0);
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }

  async clean(): Promise<unknown> {
    this._status = 'cleaning';
    try {
      const res = await rpcCall('unified_cleaner.clean', { categories: ['junk'] });
      this._status = 'completed';
      this._recordClean(res.result?.space_cleaned ?? 0);
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }
}

// ── Registry Cleaner adapter ─────────────────────────────────────

export class RegistryCleanerAdapter extends BaseModuleAdapter {
  async scan(): Promise<unknown> {
    this._status = 'scanning';
    try {
      const res = await rpcCall('registry.scan', {});
      this._status = 'completed';
      this._recordScan(res.issues ?? 0);
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }

  async clean(): Promise<unknown> {
    this._status = 'cleaning';
    try {
      const res = await rpcCall('registry.clean', {});
      this._status = 'completed';
      this._recordClean();
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }
}

// ── Startup Manager adapter ──────────────────────────────────────

export class StartupManagerAdapter extends BaseModuleAdapter {
  async scan(): Promise<unknown> {
    this._status = 'scanning';
    try {
      const res = await rpcCall('startup.list', {});
      this._status = 'completed';
      const items = res.entries ?? [];
      this._recordScan(Array.isArray(items) ? items.length : 0);
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }

  async clean(): Promise<unknown> {
    // Startup manager doesn't "clean" — it disables entries
    return null;
  }
}

// ── Privacy Cleaner adapter ──────────────────────────────────────

export class PrivacyCleanerAdapter extends BaseModuleAdapter {
  async scan(): Promise<unknown> {
    this._status = 'scanning';
    try {
      const res = await rpcCall('unified_cleaner.scan', { categories: ['privacy'] });
      this._status = 'completed';
      this._recordScan(res.result?.total_items ?? 0);
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }

  async clean(): Promise<unknown> {
    this._status = 'cleaning';
    try {
      const res = await rpcCall('unified_cleaner.clean', { categories: ['privacy'] });
      this._status = 'completed';
      this._recordClean(res.result?.space_cleaned ?? 0);
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }
}

// ── Duplicate Finder adapter ─────────────────────────────────────

export class DuplicateFinderAdapter extends BaseModuleAdapter {
  async scan(): Promise<unknown> {
    this._status = 'scanning';
    try {
      const res = await rpcCall('duplicate_finder.scan', {});
      this._status = 'completed';
      const groups = res.groups ?? [];
      this._recordScan(Array.isArray(groups) ? groups.length : 0);
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }

  async clean(): Promise<unknown> {
    this._status = 'cleaning';
    try {
      const res = await rpcCall('duplicate_finder.delete', {});
      this._status = 'completed';
      this._recordClean();
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }
}

// ── Disk Analyzer adapter ────────────────────────────────────────

export class DiskAnalyzerAdapter extends BaseModuleAdapter {
  async scan(): Promise<unknown> {
    this._status = 'scanning';
    try {
      const res = await rpcCall('disk_analyzer.analyze', {});
      this._status = 'completed';
      this._recordScan();
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }

  async clean(): Promise<unknown> {
    // Disk analyzer is read-only
    return null;
  }
}

// ── Performance adapter ──────────────────────────────────────────

export class PerformanceAdapter extends BaseModuleAdapter {
  async scan(): Promise<unknown> {
    this._status = 'scanning';
    try {
      const res = await rpcCall('dashboard.metrics', {});
      this._status = 'completed';
      this._recordScan();
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }

  async clean(): Promise<unknown> {
    return null;
  }

  override async optimize(): Promise<unknown> {
    this._status = 'optimizing';
    try {
      const res = await rpcCall('dashboard.boost_memory', {});
      this._status = 'completed';
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }
}

// ── System Information adapter ───────────────────────────────────

export class SystemInformationAdapter extends BaseModuleAdapter {
  async scan(): Promise<unknown> {
    this._status = 'scanning';
    try {
      const res = await rpcCall('system_information.summary', {});
      this._status = 'completed';
      this._recordScan();
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }

  async clean(): Promise<unknown> {
    return null;
  }
}

// ── Security adapter ─────────────────────────────────────────────

export class SecurityAdapter extends BaseModuleAdapter {
  async scan(): Promise<unknown> {
    this._status = 'scanning';
    try {
      const res = await rpcCall('security.check', {});
      this._status = 'completed';
      this._recordScan();
      return res;
    } catch {
      this._status = 'error';
      return null;
    }
  }

  async clean(): Promise<unknown> {
    return null;
  }
}

// ── Adapter factory ──────────────────────────────────────────────

const ADAPTER_MAP: Record<string, new (metadata: ModuleMetadata) => BaseModuleAdapter> = {
  junk: JunkCleanerAdapter,
  registry: RegistryCleanerAdapter,
  startup: StartupManagerAdapter,
  privacy: PrivacyCleanerAdapter,
  duplicate: DuplicateFinderAdapter,
  disk: DiskAnalyzerAdapter,
  performance: PerformanceAdapter,
  system: SystemInformationAdapter,
  security: SecurityAdapter,
};

/**
 * Create a real adapter for a module, or null if no adapter exists.
 * Returns null for future modules (version '0.0.0') that don't have
 * an implementation yet.
 */
export function createModuleAdapter(metadata: ModuleMetadata): OptimizerModule | null {
  const AdapterClass = ADAPTER_MAP[metadata.moduleId];
  if (AdapterClass) {
    return new AdapterClass(metadata);
  }
  return null;
}
