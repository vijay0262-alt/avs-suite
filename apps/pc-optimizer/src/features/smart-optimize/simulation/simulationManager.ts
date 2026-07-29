/**
 * Simulation Manager — top-level orchestrator.
 *
 * Public APIs:
 *   simulatePlan()
 *   comparePlans()
 *   generateSimulation()
 *   validateSimulation()
 *   getSimulationHistory()
 *   exportSimulation()
 *   on() / off()
 */
import type {
  SmartPlan,
  SystemState,
  OptimizationHistoryEntry,
  SimulationInput,
  SimulationResult,
  SimulationComparison,
  SimulationValidationResult,
  SimulationHistoryEntry,
  SimulationAnalytics as SimulationAnalyticsType,
  SimulationConfiguration,
  SimulationEventType,
  SimulationEventListener,
  ExportFormat,
  SimulationExport,
  SimulationStatus,
  SimulationProviderPlugin,
  EstimationPlugin,
  ComparisonPlugin,
  ExportPlugin,
} from './types';
import { createDefaultSimulationInput } from './types';
import { SimulationEngine } from './simulationEngine';
import { SimulationPlanner } from './simulationPlanner';
import { SimulationComparisonEngine } from './simulationComparisonEngine';
import { SimulationValidator } from './simulationValidator';
import { SimulationHistory } from './simulationHistory';
import { SimulationAnalyticsEngine } from './simulationAnalytics';
import { SimulationExporter } from './simulationExporter';
import { SimulationEvents } from './simulationEvents';
import { createSimulationConfiguration, type DeepPartial } from './simulationConfiguration';

export class SimulationManager {
  private _config: SimulationConfiguration;
  private _engine: SimulationEngine;
  private _planner: SimulationPlanner;
  private _comparisonEngine: SimulationComparisonEngine;
  private _validator: SimulationValidator;
  private _history: SimulationHistory;
  private _analytics: SimulationAnalyticsEngine;
  private _exporter: SimulationExporter;
  private _events: SimulationEvents;
  private _results: Map<string, SimulationResult> = new Map();
  private _comparisons: Map<string, SimulationComparison> = new Map();

  constructor(config?: SimulationConfiguration | DeepPartial<SimulationConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as SimulationConfiguration;
    } else {
      this._config = createSimulationConfiguration(config as DeepPartial<SimulationConfiguration>);
    }
    this._engine = new SimulationEngine(this._config);
    this._planner = new SimulationPlanner(this._config);
    this._comparisonEngine = new SimulationComparisonEngine(this._config);
    this._validator = new SimulationValidator(this._config);
    this._history = new SimulationHistory(this._config.maxHistoryEntries);
    this._analytics = new SimulationAnalyticsEngine();
    this._exporter = new SimulationExporter(this._config);
    this._events = new SimulationEvents();
  }

  simulatePlan(
    plan: SmartPlan,
    systemState: SystemState,
    healthScore: number,
    deviceProfileType: string,
    optimizationHistory: OptimizationHistoryEntry[] = [],
  ): SimulationResult {
    if (this._config.enableEvents) {
      this._events.emitStarted(plan.id, { planId: plan.id });
    }

    const prepared = this._planner.prepare(plan, systemState, healthScore, deviceProfileType, optimizationHistory);
    const result = this._engine.simulate(prepared.input);

    this._results.set(result.id, result);

    if (this._config.featureFlags.enableHistory) {
      this._history.record(result.id, plan.id, 'generated', { type: result.type });
    }

    if (this._config.enableEvents) {
      this._events.emitGenerated(result.id, { planId: plan.id, type: result.type });
    }

    return result;
  }

  comparePlans(
    plans: SmartPlan[],
    systemState: SystemState,
    healthScore: number,
    deviceProfileType: string,
    optimizationHistory: OptimizationHistoryEntry[] = [],
  ): SimulationComparison {
    const simulations: SimulationResult[] = [];

    for (const plan of plans.slice(0, this._config.maxSimulationsPerComparison)) {
      const result = this.simulatePlan(plan, systemState, healthScore, deviceProfileType, optimizationHistory);
      simulations.push(result);
    }

    const comparison = this._comparisonEngine.compare(simulations);
    this._comparisons.set(comparison.id, comparison);

    if (this._config.featureFlags.enableHistory) {
      for (const sim of simulations) {
        this._history.record(sim.id, sim.planId, 'compared', { comparisonId: comparison.id });
      }
    }

    if (this._config.enableEvents) {
      this._events.emitCompared(comparison.id, { count: simulations.length });
    }

    return comparison;
  }

  generateSimulation(input?: SimulationInput): SimulationResult {
    const useInput = input ?? createDefaultSimulationInput();

    if (this._config.enableEvents) {
      this._events.emitStarted(useInput.plan.id, {});
    }

    const result = this._engine.simulate(useInput);
    this._results.set(result.id, result);

    if (this._config.featureFlags.enableHistory) {
      this._history.record(result.id, useInput.plan.id, 'generated', { type: result.type });
    }

    if (this._config.enableEvents) {
      this._events.emitGenerated(result.id, { type: result.type });
    }

    return result;
  }

  validateSimulation(input: SimulationInput, result: SimulationResult): SimulationValidationResult {
    return this._validator.validateSimulation(input, result);
  }

  getSimulationHistory(): SimulationHistoryEntry[] {
    return this._history.getAll();
  }

  exportSimulation(simulation: SimulationResult, format: ExportFormat): SimulationExport {
    const exportResult = this._exporter.export(simulation, format);

    if (this._config.featureFlags.enableHistory) {
      this._history.record(simulation.id, simulation.planId, 'viewed', { format });
    }

    if (this._config.enableEvents) {
      this._events.emitExported(simulation.id, { format });
    }

    return exportResult;
  }

  exportComparison(comparison: SimulationComparison, format: ExportFormat): SimulationExport {
    return this._exporter.exportComparison(comparison, format);
  }

  getSimulationAnalytics(): SimulationAnalyticsType {
    const history = this._history.getAll();
    const simulations = Array.from(this._results.values());
    return this._analytics.compute(history, simulations);
  }

  getSimulation(id: string): SimulationResult | undefined {
    return this._results.get(id);
  }

  getComparison(id: string): SimulationComparison | undefined {
    return this._comparisons.get(id);
  }

  updateSimulationStatus(simulationId: string, status: SimulationStatus, metadata: Record<string, unknown> = {}): void {
    const sim = this._results.get(simulationId);
    if (sim && this._config.featureFlags.enableHistory) {
      this._history.record(simulationId, sim.planId, status, metadata);
    }
  }

  expireSimulation(simulationId: string): void {
    this.updateSimulationStatus(simulationId, 'expired');
    if (this._config.enableEvents) {
      this._events.emitExpired(simulationId, {});
    }
  }

  registerProviderPlugin(plugin: SimulationProviderPlugin): void {
    this._engine.registerPlugin(plugin);
  }

  registerEstimationPlugin(plugin: EstimationPlugin): void {
    this._engine.estimator.registerPlugin(plugin);
  }

  registerComparisonPlugin(plugin: ComparisonPlugin): void {
    this._comparisonEngine.registerPlugin(plugin);
  }

  registerExportPlugin(plugin: ExportPlugin): void {
    this._exporter.registerPlugin(plugin);
  }

  on(event: SimulationEventType, listener: SimulationEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: SimulationEventType, listener: SimulationEventListener): void {
    this._events.off(event, listener);
  }

  get config(): SimulationConfiguration { return this._config; }

  updateConfig(overrides: DeepPartial<SimulationConfiguration>): void {
    this._config = createSimulationConfiguration(overrides);
    this._engine = new SimulationEngine(this._config);
    this._planner = new SimulationPlanner(this._config);
    this._comparisonEngine = new SimulationComparisonEngine(this._config);
    this._validator = new SimulationValidator(this._config);
    this._history.setMaxEntries(this._config.maxHistoryEntries);
    this._exporter = new SimulationExporter(this._config);
  }

  clear(): void {
    this._results.clear();
    this._comparisons.clear();
    this._history.clear();
    this._events.clear();
  }

  get engine(): SimulationEngine { return this._engine; }
  get planner(): SimulationPlanner { return this._planner; }
  get comparisonEngine(): SimulationComparisonEngine { return this._comparisonEngine; }
  get validator(): SimulationValidator { return this._validator; }
  get exporter(): SimulationExporter { return this._exporter; }
  get formatter() { return this._exporter.formatter; }
}
