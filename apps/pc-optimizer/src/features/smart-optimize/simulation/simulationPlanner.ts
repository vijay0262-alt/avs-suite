/**
 * Simulation Planner — prepares simulation steps from an optimization plan.
 *
 * Maps optimization goals to simulation types, validates inputs,
 * and coordinates the simulation pipeline.
 */
import type {
  SmartPlan,
  SimulationInput,
  SimulationType,
  SimulationConfiguration,
  SimulationValidationResult,
  SystemState,
  OptimizationHistoryEntry,
} from './types';
import { SimulationScenarioBuilder } from './simulationScenarioBuilder';
import { SimulationValidator } from './simulationValidator';

export class SimulationPlanner {
  private _config: SimulationConfiguration;
  private _scenarioBuilder: SimulationScenarioBuilder;
  private _validator: SimulationValidator;

  constructor(config: SimulationConfiguration) {
    this._config = config;
    this._scenarioBuilder = new SimulationScenarioBuilder(config);
    this._validator = new SimulationValidator(config);
  }

  prepare(
    plan: SmartPlan,
    systemState: SystemState,
    healthScore: number,
    deviceProfileType: string,
    optimizationHistory: OptimizationHistoryEntry[] = [],
  ): { input: SimulationInput; type: SimulationType; validation: SimulationValidationResult } {
    const input = this._scenarioBuilder.buildInput(
      plan,
      systemState,
      healthScore,
      deviceProfileType,
      optimizationHistory,
    );
    const type = this._scenarioBuilder.determineSimulationType(plan);
    const validation = this._validator.validateInput(input);

    return { input, type, validation };
  }

  prepareMultiple(
    plans: SmartPlan[],
    systemState: SystemState,
    healthScore: number,
    deviceProfileType: string,
    optimizationHistory: OptimizationHistoryEntry[] = [],
  ): { input: SimulationInput; type: SimulationType; validation: SimulationValidationResult }[] {
    return plans.map((plan) => {
      const input = this._scenarioBuilder.buildInput(plan, systemState, healthScore, deviceProfileType, optimizationHistory);
      const type = this._scenarioBuilder.determineSimulationType(plan);
      const validation = this._validator.validateInput(input);
      return { input, type, validation };
    });
  }

  get scenarioBuilder(): SimulationScenarioBuilder { return this._scenarioBuilder; }
  get validator(): SimulationValidator { return this._validator; }
  get config(): SimulationConfiguration { return this._config; }
}
