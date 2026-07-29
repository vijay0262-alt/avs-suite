/**
 * Plan Registry — register/unregister optimization plans.
 *
 * Provider architecture only. No switch statements.
 * Future optimization providers register through this registry.
 */
import type { OptimizationPlanV2, OptimizationPlanType } from './types';

export class PlanRegistry {
  private _plans: Map<string, OptimizationPlanV2> = new Map();
  private _byType: Map<OptimizationPlanType, Set<string>> = new Map();

  register(plan: OptimizationPlanV2): boolean {
    if (this._plans.has(plan.id)) return false;
    this._plans.set(plan.id, plan);

    let typeSet = this._byType.get(plan.planType);
    if (!typeSet) {
      typeSet = new Set();
      this._byType.set(plan.planType, typeSet);
    }
    typeSet.add(plan.id);

    return true;
  }

  unregister(planId: string): boolean {
    const plan = this._plans.get(planId);
    if (!plan) return false;
    this._plans.delete(planId);
    this._byType.get(plan.planType)?.delete(planId);
    return true;
  }

  get(planId: string): OptimizationPlanV2 | undefined {
    return this._plans.get(planId);
  }

  has(planId: string): boolean {
    return this._plans.has(planId);
  }

  getAll(): OptimizationPlanV2[] {
    return Array.from(this._plans.values());
  }

  getByType(planType: OptimizationPlanType): OptimizationPlanV2[] {
    const ids = this._byType.get(planType);
    if (!ids) return [];
    return Array.from(ids).map((id) => this._plans.get(id)).filter((p): p is OptimizationPlanV2 => p !== undefined);
  }

  clear(): void {
    this._plans.clear();
    this._byType.clear();
  }

  get count(): number {
    return this._plans.size;
  }
}
