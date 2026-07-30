/**
 * Goal Orchestration Engine — Resource Allocator
 *
 * Allocates CPU, Memory, Disk, Network budgets, Maintenance Windows,
 * and Execution Slots across active goals based on priority and need.
 */
import type {
  Goal,
  ResourceAllocation,
  ResourceType,
  OrchestrationConfiguration,
  OrchestrationProviderPlugin,
  OrchestrationInput,
} from './types';
import { generateResourceAllocationId } from './types';
import { priorityToScore } from '../types';

export class GoalResourceAllocator {
  private _config: OrchestrationConfiguration;
  private _providers: OrchestrationProviderPlugin[] = [];

  constructor(config: OrchestrationConfiguration) {
    this._config = config;
  }

  registerProvider(plugin: OrchestrationProviderPlugin): boolean {
    if (this._providers.some((p) => p.getPluginName() === plugin.getPluginName())) return false;
    this._providers.push(plugin);
    this._providers.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  allocate(goals: Goal[], input: OrchestrationInput): ResourceAllocation[] {
    // Check provider plugins first
    for (const provider of this._providers) {
      if (!provider.isAvailable()) continue;
      const allocations = provider.allocateResources(goals, input);
      if (allocations && allocations.length > 0) return allocations;
    }

    // Built-in allocation
    const activeGoals = goals.filter(
      (g) => g.status === 'started' || g.status === 'in_progress',
    );

    const allocations: ResourceAllocation[] = [];
    const policies = this._config.resourcePolicies;
    const maxActive = Math.min(activeGoals.length, this._config.priorityRules.maxActiveGoals);

    // Sort by priority
    const sorted = [...activeGoals].sort((a, b) => priorityToScore(b.priority) - priorityToScore(a.priority));

    for (let i = 0; i < maxActive; i++) {
      const goal = sorted[i]!;
      const weight = 1 - (i / maxActive) * 0.5; // Higher priority gets more resources

      allocations.push(this._allocateResource(goal, 'cpu_budget', Math.round(policies.maxCpuBudget * weight * 0.4), policies.maxCpuBudget, '%'));
      allocations.push(this._allocateResource(goal, 'memory_budget', Math.round(policies.maxMemoryBudget * weight * 0.4), policies.maxMemoryBudget, '%'));
      allocations.push(this._allocateResource(goal, 'disk_budget', Math.round(policies.maxDiskBudget * weight * 0.3), policies.maxDiskBudget, '%'));
      allocations.push(this._allocateResource(goal, 'network_budget', Math.round(policies.maxNetworkBudget * weight * 0.2), policies.maxNetworkBudget, '%'));

      if (i < policies.maxMaintenanceWindows) {
        allocations.push(this._allocateResource(goal, 'maintenance_window', 1, policies.maxMaintenanceWindows, 'window'));
      }

      if (i < policies.maxExecutionSlots) {
        allocations.push(this._allocateResource(goal, 'execution_slot', 1, policies.maxExecutionSlots, 'slot'));
      }
    }

    return allocations;
  }

  private _allocateResource(
    goal: Goal,
    type: ResourceType,
    amount: number,
    max: number,
    unit: string,
  ): ResourceAllocation {
    return {
      id: generateResourceAllocationId(),
      goalId: goal.id,
      resourceType: type,
      allocatedAmount: amount,
      maxAmount: max,
      unit,
      reason: `Allocated ${amount}${unit} ${type} for goal "${goal.name}" (priority: ${goal.priority})`,
      futureMetadata: {},
    };
  }

  getTotalAllocated(allocations: ResourceAllocation[]): Record<ResourceType, number> {
    const totals: Record<ResourceType, number> = {
      cpu_budget: 0,
      memory_budget: 0,
      disk_budget: 0,
      network_budget: 0,
      maintenance_window: 0,
      execution_slot: 0,
      future_resource: 0,
    };

    for (const a of allocations) {
      totals[a.resourceType] += a.allocatedAmount;
    }

    return totals;
  }

  isWithinBudget(allocations: ResourceAllocation[]): boolean {
    const totals = this.getTotalAllocated(allocations);
    const policies = this._config.resourcePolicies;

    return (
      totals.cpu_budget <= policies.maxCpuBudget &&
      totals.memory_budget <= policies.maxMemoryBudget &&
      totals.disk_budget <= policies.maxDiskBudget &&
      totals.network_budget <= policies.maxNetworkBudget &&
      totals.maintenance_window <= policies.maxMaintenanceWindows &&
      totals.execution_slot <= policies.maxExecutionSlots
    );
  }

  getUtilizationRate(allocations: ResourceAllocation[]): Record<ResourceType, number> {
    const totals = this.getTotalAllocated(allocations);
    const policies = this._config.resourcePolicies;

    return {
      cpu_budget: policies.maxCpuBudget > 0 ? totals.cpu_budget / policies.maxCpuBudget : 0,
      memory_budget: policies.maxMemoryBudget > 0 ? totals.memory_budget / policies.maxMemoryBudget : 0,
      disk_budget: policies.maxDiskBudget > 0 ? totals.disk_budget / policies.maxDiskBudget : 0,
      network_budget: policies.maxNetworkBudget > 0 ? totals.network_budget / policies.maxNetworkBudget : 0,
      maintenance_window: policies.maxMaintenanceWindows > 0 ? totals.maintenance_window / policies.maxMaintenanceWindows : 0,
      execution_slot: policies.maxExecutionSlots > 0 ? totals.execution_slot / policies.maxExecutionSlots : 0,
      future_resource: 0,
    };
  }
}
