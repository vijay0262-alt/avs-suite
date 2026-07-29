/**
 * Maintenance Engine — core engine that processes maintenance planning.
 *
 * Orchestrates: Window Detection, Opportunity Generation,
 * Eligibility, Policy, Priority, Validation, Coordination.
 *
 * Does NOT execute optimizations directly.
 * Coordinates with the existing scheduler.
 */
import type {
  SystemState,
  MaintenancePlan,
  MaintenanceOpportunity,
  MaintenanceWindow,
  MaintenanceConfiguration,
  MaintenanceHistoryEntry,
  MaintenanceStatistics,
  MaintenanceValidationResult,
  MaintenanceType,
  MaintenanceTypeProviderPlugin,
  MaintenanceWindowProviderPlugin,
  EligibilityRule,
  MaintenancePolicy,
  SubscriptionInfo,
  CapabilityInfo,
  QuotaInfo,
  PermissionInfo,
  EnterprisePolicyInfo,
  CoordinationResult,
} from './types';
import { MaintenancePlanner } from './maintenancePlanner';
import { MaintenanceCoordinator, type SchedulerAdapter } from './maintenanceCoordinator';
import { MaintenanceHistory } from './maintenanceHistory';
import { MaintenanceStatisticsCalculator } from './maintenanceStatistics';
import { MaintenanceEvents } from './maintenanceEvents';

export interface MaintenanceEngineOptions {
  types?: MaintenanceType[];
  subscription?: SubscriptionInfo | null;
  capabilities?: CapabilityInfo | null;
  quota?: QuotaInfo | null;
  permissions?: PermissionInfo | null;
  enterprisePolicy?: EnterprisePolicyInfo | null;
  historicalOutcomes?: MaintenanceHistoryEntry[];
}

export class MaintenanceEngine {
  private _config: MaintenanceConfiguration;
  private _planner: MaintenancePlanner;
  private _coordinator: MaintenanceCoordinator;
  private _history: MaintenanceHistory;
  private _statsCalculator: MaintenanceStatisticsCalculator;
  private _events: MaintenanceEvents;
  private _currentPlan: MaintenancePlan | null = null;

  constructor(config: MaintenanceConfiguration) {
    this._config = config;
    this._planner = new MaintenancePlanner(config);
    this._coordinator = new MaintenanceCoordinator(config);
    this._history = new MaintenanceHistory(config.maxHistoryEntries);
    this._statsCalculator = new MaintenanceStatisticsCalculator();
    this._events = new MaintenanceEvents();
  }

  generatePlan(state: SystemState, options?: MaintenanceEngineOptions): MaintenancePlan {
    const plan = this._planner.generatePlan(state, options);
    this._currentPlan = plan;

    if (this._config.enableEvents) {
      for (const opp of plan.opportunities) {
        this._events.emitGenerated(opp.id, { type: opp.type });
      }
      if (plan.window) {
        this._events.emitWindowFound(plan.id, { quality: plan.window.quality });
      }
    }

    for (const opp of plan.opportunities) {
      this._history.record(opp.id, opp.type, 'recommended', opp.confidence, opp.estimatedDuration, opp.expectedBenefit);
    }

    return plan;
  }

  findWindow(state: SystemState): MaintenanceWindow | null {
    return this._planner.findWindow(state);
  }

  evaluateEligibility(
    opportunity: MaintenanceOpportunity,
    state: SystemState,
    options?: MaintenanceEngineOptions,
  ) {
    return this._planner.evaluateEligibility(opportunity, state, options);
  }

  getMaintenancePlan(): MaintenancePlan | null {
    return this._currentPlan;
  }

  getMaintenanceHistory(): MaintenanceHistoryEntry[] {
    return this._history.getAll();
  }

  getMaintenanceStatistics(): MaintenanceStatistics {
    return this._statsCalculator.compute(this._history.getAll());
  }

  validatePlan(plan: MaintenancePlan): MaintenanceValidationResult {
    return this._planner.validatePlan(plan);
  }

  coordinate(
    opportunity: MaintenanceOpportunity,
    window: MaintenanceWindow | null,
  ): CoordinationResult {
    const result = this._coordinator.coordinate(opportunity, window);

    if (result.coordinated && this._config.enableEvents) {
      this._events.emitAccepted(opportunity.id, { scheduledTime: result.scheduledTime });
    }

    return result;
  }

  deferOpportunity(opportunityId: string, reason: string): void {
    const plan = this._currentPlan;
    if (!plan) return;
    const opp = plan.opportunities.find((o) => o.id === opportunityId);
    if (!opp) return;

    this._history.record(opp.id, opp.type, 'deferred', opp.confidence, 0, opp.expectedBenefit, null, { reason });

    if (this._config.enableEvents) {
      this._events.emitDeferred(opportunityId, { reason });
    }
  }

  completeOpportunity(opportunityId: string, actualBenefit: number | null = null): void {
    const plan = this._currentPlan;
    if (!plan) return;
    const opp = plan.opportunities.find((o) => o.id === opportunityId);
    if (!opp) return;

    this._history.record(opp.id, opp.type, 'completed', opp.confidence, opp.estimatedDuration, opp.expectedBenefit, actualBenefit);

    if (this._config.enableEvents) {
      this._events.emitCompleted(opportunityId, { actualBenefit });
    }
  }

  cancelOpportunity(opportunityId: string, reason: string): void {
    const plan = this._currentPlan;
    if (!plan) return;
    const opp = plan.opportunities.find((o) => o.id === opportunityId);
    if (!opp) return;

    this._history.record(opp.id, opp.type, 'cancelled', opp.confidence, 0, opp.expectedBenefit, null, { reason });

    if (this._config.enableEvents) {
      this._events.emitCancelled(opportunityId, { reason });
    }
  }

  expireOpportunity(opportunityId: string): void {
    const plan = this._currentPlan;
    if (!plan) return;
    const opp = plan.opportunities.find((o) => o.id === opportunityId);
    if (!opp) return;

    this._history.record(opp.id, opp.type, 'expired', opp.confidence, 0, opp.expectedBenefit);

    if (this._config.enableEvents) {
      this._events.emitExpired(opportunityId);
    }
  }

  setScheduler(adapter: SchedulerAdapter): void {
    this._coordinator.setScheduler(adapter);
  }

  registerTypePlugin(plugin: MaintenanceTypeProviderPlugin): void {
    this._planner.registerTypePlugin(plugin);
  }

  registerWindowPlugin(plugin: MaintenanceWindowProviderPlugin): void {
    this._planner.registerWindowPlugin(plugin);
  }

  registerEligibilityRule(rule: EligibilityRule): boolean {
    return this._planner.registerEligibilityRule(rule);
  }

  registerPolicy(policy: MaintenancePolicy): boolean {
    return this._planner.registerPolicy(policy);
  }

  getSupportedTypes(): MaintenanceType[] {
    return this._coordinator.getSupportedTypes();
  }

  on(event: Parameters<MaintenanceEvents['on']>[0], listener: Parameters<MaintenanceEvents['on']>[1]): () => void {
    return this._events.on(event, listener);
  }

  off(event: Parameters<MaintenanceEvents['off']>[0], listener: Parameters<MaintenanceEvents['off']>[1]): void {
    this._events.off(event, listener);
  }

  get config(): MaintenanceConfiguration {
    return this._config;
  }

  get history(): MaintenanceHistory {
    return this._history;
  }

  get events(): MaintenanceEvents {
    return this._events;
  }

  get coordinator(): MaintenanceCoordinator {
    return this._coordinator;
  }

  clear(): void {
    this._currentPlan = null;
    this._history.clear();
    this._events.clear();
    this._coordinator.clearNotifications();
  }
}
