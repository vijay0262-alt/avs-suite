/**
 * Simulation Scenario Builder — builds simulation scenarios from plans.
 *
 * Maps optimization goals to simulation types and prepares the simulation
 * input with all necessary context.
 */
import type {
  SimulationInput,
  SimulationType,
  SmartPlan,
  SystemState,
  OptimizationHistoryEntry,
  SimulationConfiguration,
} from './types';

export class SimulationScenarioBuilder {
  private _config: SimulationConfiguration;

  constructor(config: SimulationConfiguration) {
    this._config = config;
  }

  buildInput(
    plan: SmartPlan,
    systemState: SystemState,
    healthScore: number,
    deviceProfileType: string,
    optimizationHistory: OptimizationHistoryEntry[] = [],
  ): SimulationInput {
    return {
      plan,
      systemState,
      healthScore,
      deviceProfileType,
      optimizationHistory,
      futureMetadata: {},
    };
  }

  determineSimulationType(plan: SmartPlan): SimulationType {
    const goalToType: Record<string, SimulationType> = {
      quick_boost: 'quick_optimize',
      maximum_performance: 'performance_boost',
      storage_recovery: 'storage_recovery',
      privacy_protection: 'privacy_cleanup',
      startup_optimization: 'startup_optimization',
      routine_maintenance: 'maintenance_plan',
      custom: 'custom_plan',
      future_goal: 'future_simulation',
    };

    return goalToType[plan.optimizationGoal] ?? 'custom_plan';
  }

  buildMultipleInputs(
    plans: SmartPlan[],
    systemState: SystemState,
    healthScore: number,
    deviceProfileType: string,
    optimizationHistory: OptimizationHistoryEntry[] = [],
  ): SimulationInput[] {
    return plans.map((plan) => this.buildInput(plan, systemState, healthScore, deviceProfileType, optimizationHistory));
  }

  getSimulationTypeLabel(type: SimulationType): string {
    const labels: Record<SimulationType, string> = {
      quick_optimize: 'Quick Optimize',
      performance_boost: 'Performance Boost',
      storage_recovery: 'Storage Recovery',
      privacy_cleanup: 'Privacy Cleanup',
      startup_optimization: 'Startup Optimization',
      maintenance_plan: 'Maintenance Plan',
      custom_plan: 'Custom Plan',
      future_simulation: 'Future Simulation',
    };
    return labels[type] ?? 'Unknown';
  }

  getSimulationTypeDescription(type: SimulationType): string {
    const descriptions: Record<SimulationType, string> = {
      quick_optimize: 'Fast optimization with minimal disruption',
      performance_boost: 'Maximizes system performance improvements',
      storage_recovery: 'Recovers disk space through cleanup',
      privacy_cleanup: 'Removes privacy-sensitive traces',
      startup_optimization: 'Reduces startup time by managing startup items',
      maintenance_plan: 'Routine system maintenance and health improvements',
      custom_plan: 'Custom optimization plan',
      future_simulation: 'Future simulation type',
    };
    return descriptions[type] ?? '';
  }

  get config(): SimulationConfiguration { return this._config; }
}
