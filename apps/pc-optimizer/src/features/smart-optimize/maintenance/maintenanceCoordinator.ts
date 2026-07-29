/**
 * Maintenance Coordinator — coordinates with existing systems.
 *
 * Coordinates with: Existing Scheduler, Execution Pipeline,
 * Optimization Planner, Adaptive Engine, Recommendation Engine,
 * Prediction Engine.
 *
 * Does NOT execute optimizations directly.
 */
import type {
  MaintenanceOpportunity,
  MaintenanceWindow,
  CoordinationResult,
  MaintenanceConfiguration,
  MaintenanceType,
} from './types';

export interface SchedulerAdapter {
  isAvailable(): boolean;
  isRunning(): boolean;
  canSchedule(): boolean;
  scheduleMaintenance(opportunity: MaintenanceOpportunity, window: MaintenanceWindow | null): boolean;
  getNextSlot(): string | null;
}

export class MaintenanceCoordinator {
  private _config: MaintenanceConfiguration;
  private _scheduler: SchedulerAdapter | null = null;
  private _notifiedOpportunities: Set<string> = new Set();

  constructor(config: MaintenanceConfiguration) {
    this._config = config;
  }

  setScheduler(adapter: SchedulerAdapter): void {
    this._scheduler = adapter;
  }

  coordinate(
    opportunity: MaintenanceOpportunity,
    window: MaintenanceWindow | null,
  ): CoordinationResult {
    if (!this._config.featureFlags.enableCoordination) {
      return {
        coordinated: false,
        schedulerNotified: false,
        reason: 'Coordination disabled',
        scheduledTime: null,
        futureMetadata: {},
      };
    }

    if (!this._scheduler) {
      return {
        coordinated: false,
        schedulerNotified: false,
        reason: 'No scheduler adapter configured',
        scheduledTime: null,
        futureMetadata: {},
      };
    }

    if (!this._scheduler.isAvailable()) {
      return {
        coordinated: false,
        schedulerNotified: false,
        reason: 'Scheduler not available',
        scheduledTime: null,
        futureMetadata: {},
      };
    }

    if (this._scheduler.isRunning()) {
      return {
        coordinated: false,
        schedulerNotified: false,
        reason: 'Scheduler is currently running a job',
        scheduledTime: this._scheduler.getNextSlot(),
        futureMetadata: {},
      };
    }

    if (!this._scheduler.canSchedule()) {
      return {
        coordinated: false,
        schedulerNotified: false,
        reason: 'Scheduler cannot accept new jobs',
        scheduledTime: null,
        futureMetadata: {},
      };
    }

    const scheduled = this._scheduler.scheduleMaintenance(opportunity, window);
    if (scheduled) {
      this._notifiedOpportunities.add(opportunity.id);
      return {
        coordinated: true,
        schedulerNotified: true,
        reason: 'Maintenance scheduled with existing scheduler',
        scheduledTime: window?.windowStart ?? new Date().toISOString(),
        futureMetadata: {},
      };
    }

    return {
      coordinated: false,
      schedulerNotified: false,
      reason: 'Scheduler rejected the maintenance request',
      scheduledTime: this._scheduler.getNextSlot(),
      futureMetadata: {},
    };
  }

  isAlreadyNotified(opportunityId: string): boolean {
    return this._notifiedOpportunities.has(opportunityId);
  }

  clearNotifications(): void {
    this._notifiedOpportunities.clear();
  }

  getSupportedTypes(): MaintenanceType[] {
    return [
      'quick_maintenance',
      'routine_maintenance',
      'deep_maintenance',
      'privacy_maintenance',
      'performance_maintenance',
      'storage_maintenance',
      'startup_maintenance',
      'health_recovery',
      'custom_maintenance',
    ];
  }
}
