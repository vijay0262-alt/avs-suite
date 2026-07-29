/**
 * Maintenance Manager — top-level orchestrator for the Intelligent Maintenance Engine.
 *
 * Public APIs:
 *   generateMaintenancePlan()
 *   findMaintenanceWindow()
 *   evaluateEligibility()
 *   getMaintenancePlan()
 *   getMaintenanceHistory()
 *   getMaintenanceStatistics()
 *   on() / off()
 */
import type {
  SystemState,
  MaintenancePlan,
  MaintenanceOpportunity,
  MaintenanceWindow,
  MaintenanceStatistics,
  MaintenanceHistoryEntry,
  MaintenanceValidationResult,
  MaintenanceConfiguration,
  MaintenanceEventType,
  MaintenanceEventListener,
  MaintenanceTypeProviderPlugin,
  MaintenanceWindowProviderPlugin,
  EligibilityRule,
  MaintenancePolicy,
  CoordinationResult,
} from './types';
import { MaintenanceEngine, type MaintenanceEngineOptions } from './maintenanceEngine';
import type { SchedulerAdapter } from './maintenanceCoordinator';
import { createMaintenanceConfiguration, type DeepPartial } from './maintenanceConfiguration';

export class MaintenanceManager {
  private _config: MaintenanceConfiguration;
  private _engine: MaintenanceEngine;

  constructor(config?: MaintenanceConfiguration | DeepPartial<MaintenanceConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as MaintenanceConfiguration;
    } else {
      this._config = createMaintenanceConfiguration(config as DeepPartial<MaintenanceConfiguration>);
    }
    this._engine = new MaintenanceEngine(this._config);
  }

  generateMaintenancePlan(
    state: SystemState,
    options?: MaintenanceEngineOptions,
  ): MaintenancePlan {
    return this._engine.generatePlan(state, options);
  }

  findMaintenanceWindow(state: SystemState): MaintenanceWindow | null {
    return this._engine.findWindow(state);
  }

  evaluateEligibility(
    opportunity: MaintenanceOpportunity,
    state: SystemState,
    options?: MaintenanceEngineOptions,
  ) {
    return this._engine.evaluateEligibility(opportunity, state, options);
  }

  getMaintenancePlan(): MaintenancePlan | null {
    return this._engine.getMaintenancePlan();
  }

  getMaintenanceHistory(): MaintenanceHistoryEntry[] {
    return this._engine.getMaintenanceHistory();
  }

  getMaintenanceStatistics(): MaintenanceStatistics {
    return this._engine.getMaintenanceStatistics();
  }

  validateMaintenancePlan(plan: MaintenancePlan): MaintenanceValidationResult {
    return this._engine.validatePlan(plan);
  }

  coordinateMaintenance(
    opportunity: MaintenanceOpportunity,
    window: MaintenanceWindow | null,
  ): CoordinationResult {
    return this._engine.coordinate(opportunity, window);
  }

  deferMaintenance(opportunityId: string, reason: string): void {
    this._engine.deferOpportunity(opportunityId, reason);
  }

  completeMaintenance(opportunityId: string, actualBenefit?: number | null): void {
    this._engine.completeOpportunity(opportunityId, actualBenefit ?? null);
  }

  cancelMaintenance(opportunityId: string, reason: string): void {
    this._engine.cancelOpportunity(opportunityId, reason);
  }

  expireMaintenance(opportunityId: string): void {
    this._engine.expireOpportunity(opportunityId);
  }

  setScheduler(adapter: SchedulerAdapter): void {
    this._engine.setScheduler(adapter);
  }

  registerTypePlugin(plugin: MaintenanceTypeProviderPlugin): void {
    this._engine.registerTypePlugin(plugin);
  }

  registerWindowPlugin(plugin: MaintenanceWindowProviderPlugin): void {
    this._engine.registerWindowPlugin(plugin);
  }

  registerEligibilityRule(rule: EligibilityRule): boolean {
    return this._engine.registerEligibilityRule(rule);
  }

  registerPolicy(policy: MaintenancePolicy): boolean {
    return this._engine.registerPolicy(policy);
  }

  on(event: MaintenanceEventType, listener: MaintenanceEventListener): () => void {
    return this._engine.on(event, listener);
  }

  off(event: MaintenanceEventType, listener: MaintenanceEventListener): void {
    this._engine.off(event, listener);
  }

  get config(): MaintenanceConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<MaintenanceConfiguration>): void {
    this._config = createMaintenanceConfiguration(overrides);
  }

  clear(): void {
    this._engine.clear();
  }

  get engine(): MaintenanceEngine {
    return this._engine;
  }
}
