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
import { emitModuleEvent, ModuleEventType } from './ModuleEventBus';
import { moduleHistoryService } from './ModuleHistoryService';

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
    const startedAt = Date.now();
    this.setStatus('scanning');
    emitModuleEvent(ModuleEventType.ScanStarted, this.metadata.moduleId, this.metadata.displayName);
    try {
      const result = await this.doScan();
      this.setStatus('completed');
      this._statistics = {
        ...this._statistics,
        lastScanAt: new Date().toISOString(),
        totalScans: this._statistics.totalScans + 1,
      };
      moduleRegistry.updateStatistics(this.metadata.moduleId, this._statistics);
      emitModuleEvent(ModuleEventType.ScanCompleted, this.metadata.moduleId, this.metadata.displayName, {
        durationMs: Date.now() - startedAt,
      });
      moduleHistoryService.record({
        moduleId: this.metadata.moduleId,
        moduleName: this.metadata.displayName,
        timestamp: new Date().toISOString(),
        itemsFound: 0,
        itemsResolved: 0,
        durationMs: Date.now() - startedAt,
        bytesRecovered: 0,
        healthImpact: 0,
        operation: 'scan',
      });
      return result;
    } catch (err) {
      this.setStatus('error');
      emitModuleEvent(ModuleEventType.ErrorOccurred, this.metadata.moduleId, this.metadata.displayName, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async clean(): Promise<unknown> {
    const startedAt = Date.now();
    this.setStatus('cleaning');
    emitModuleEvent(ModuleEventType.CleaningStarted, this.metadata.moduleId, this.metadata.displayName);
    try {
      const result = await this.doClean();
      this.setStatus('completed');
      this._statistics = {
        ...this._statistics,
        lastCleanAt: new Date().toISOString(),
        totalCleans: this._statistics.totalCleans + 1,
      };
      moduleRegistry.updateStatistics(this.metadata.moduleId, this._statistics);
      emitModuleEvent(ModuleEventType.CleaningCompleted, this.metadata.moduleId, this.metadata.displayName, {
        durationMs: Date.now() - startedAt,
      });
      moduleHistoryService.record({
        moduleId: this.metadata.moduleId,
        moduleName: this.metadata.displayName,
        timestamp: new Date().toISOString(),
        itemsFound: 0,
        itemsResolved: 0,
        durationMs: Date.now() - startedAt,
        bytesRecovered: 0,
        healthImpact: 0,
        operation: 'clean',
      });
      return result;
    } catch (err) {
      this.setStatus('error');
      emitModuleEvent(ModuleEventType.ErrorOccurred, this.metadata.moduleId, this.metadata.displayName, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async optimize(): Promise<unknown> {
    const startedAt = Date.now();
    this.setStatus('optimizing');
    emitModuleEvent(ModuleEventType.OptimizationStarted, this.metadata.moduleId, this.metadata.displayName);
    try {
      const result = await this.doOptimize();
      this.setStatus('completed');
      emitModuleEvent(ModuleEventType.OptimizationCompleted, this.metadata.moduleId, this.metadata.displayName, {
        durationMs: Date.now() - startedAt,
      });
      moduleHistoryService.record({
        moduleId: this.metadata.moduleId,
        moduleName: this.metadata.displayName,
        timestamp: new Date().toISOString(),
        itemsFound: 0,
        itemsResolved: 0,
        durationMs: Date.now() - startedAt,
        bytesRecovered: 0,
        healthImpact: 0,
        operation: 'optimize',
      });
      return result;
    } catch (err) {
      this.setStatus('error');
      emitModuleEvent(ModuleEventType.ErrorOccurred, this.metadata.moduleId, this.metadata.displayName, {
        error: err instanceof Error ? err.message : String(err),
      });
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
    const oldStatus = this._status;
    this._status = status;
    moduleRegistry.setStatus(this.metadata.moduleId, status);
    emitModuleEvent(ModuleEventType.StatusChanged, this.metadata.moduleId, this.metadata.displayName, {
      oldStatus,
      newStatus: status,
    });
  }
}
