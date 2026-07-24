/**
 * BaseModuleAdapter — base class that adapts existing services into
 * the standard OptimizerModule interface.
 *
 * Existing modules don't need to be rewritten. Instead, create a thin
 * adapter that wraps the existing service and implements OptimizerModule.
 *
 * Future modules implement OptimizerModule directly.
 */

import type {
  OptimizerModule,
  ModuleMetadata,
  ModuleLifecycleState,
  ModuleStatistics,
} from './moduleRegistry.types';
import type { HealthContribution } from '../health/HealthContribution';
import type { Recommendation } from '../dashboard/dashboard.types';
import { moduleRegistry } from './ModuleRegistry';

export abstract class BaseModuleAdapter implements OptimizerModule {
  protected _status: ModuleLifecycleState = 'ready';
  protected _statistics: ModuleStatistics = {
    lastScanAt: null,
    lastCleanAt: null,
    totalScans: 0,
    totalCleans: 0,
    totalSpaceRecovered: 0,
    totalIssuesFixed: 0,
  };

  constructor(readonly metadata: ModuleMetadata) {}

  // Lifecycle
  async initialize(): Promise<void> {
    this.setStatus('ready');
  }

  dispose(): void {
    this._status = 'ready';
  }

  // Operations — subclasses override
  async scan(): Promise<unknown> {
    this.setStatus('scanning');
    try {
      const result = await this.doScan();
      this.setStatus('completed');
      this._statistics = {
        ...this._statistics,
        lastScanAt: new Date().toISOString(),
        totalScans: this._statistics.totalScans + 1,
      };
      moduleRegistry.updateStatistics(this.metadata.moduleId, this._statistics);
      return result;
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  async clean(): Promise<unknown> {
    this.setStatus('cleaning');
    try {
      const result = await this.doClean();
      this.setStatus('completed');
      this._statistics = {
        ...this._statistics,
        lastCleanAt: new Date().toISOString(),
        totalCleans: this._statistics.totalCleans + 1,
      };
      moduleRegistry.updateStatistics(this.metadata.moduleId, this._statistics);
      return result;
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  async optimize(): Promise<unknown> {
    this.setStatus('optimizing');
    try {
      const result = await this.doOptimize();
      this.setStatus('completed');
      return result;
    } catch (err) {
      this.setStatus('error');
      throw err;
    }
  }

  cancel(): void {
    this.setStatus('ready');
  }

  async refresh(): Promise<void> {
    await this.initialize();
  }

  // Queries
  getStatus(): ModuleLifecycleState {
    return this._status;
  }

  getStatistics(): ModuleStatistics {
    return this._statistics;
  }

  getRecommendations(): Recommendation[] {
    return [];
  }

  // Subclasses implement these
  protected async doScan(): Promise<unknown> {
    return null;
  }

  protected async doClean(): Promise<unknown> {
    return null;
  }

  protected async doOptimize(): Promise<unknown> {
    return null;
  }

  abstract getHealthContribution(): Promise<HealthContribution>;

  // Helper
  protected setStatus(status: ModuleLifecycleState): void {
    this._status = status;
    moduleRegistry.setStatus(this.metadata.moduleId, status);
  }
}
