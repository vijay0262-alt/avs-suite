/**
 * Optimization Planner — the main orchestrator that converts
 * AI Health Engine analysis into structured optimization plans.
 *
 * The planner:
 *   1. Consumes health reports, capabilities, and execution history
 *   2. Filters and prioritizes optimizations based on plan type
 *   3. Estimates benefits, duration, and space recovery
 *   4. Produces a complete OptimizationPlan with execution order
 *   5. Generates a human-readable PlanPreview
 *
 * The planner NEVER executes anything. It only creates plans.
 */
import type {
  OptimizationPlan,
  OptimizationPlannerInput,
  PlanType,
  PlanPreview,
} from './types';
import type { HealthCategoryId } from '../ai-health-engine/types';
import { DEFAULT_USER_PREFERENCES } from './types';
import { optimizationEvents } from './optimizationEvents';
import { planBuilder } from './optimizationPlanBuilder';
import { previewBuilder } from './optimizationPreviewBuilder';

export interface PlannerOptions {
  /** Plan type to generate. */
  planType?: PlanType;
  /** Override user preferences. */
  preferences?: Partial<typeof DEFAULT_USER_PREFERENCES>;
  /** Custom categories for custom plan type. */
  customCategories?: HealthCategoryId[];
}

export class OptimizationPlanner {
  /**
   * Generate an optimization plan from a health report.
   *
   * @param input - Health report, capabilities, and execution history
   * @param options - Plan type and user preferences
   * @returns A complete optimization plan
   */
  generatePlan(
    input: OptimizationPlannerInput,
    options: PlannerOptions = {},
  ): OptimizationPlan {
    const planType = options.planType ?? 'balanced';
    const preferences = {
      ...DEFAULT_USER_PREFERENCES,
      ...options.preferences,
    };

    optimizationEvents.emit('optimization_plan_started', {
      planType,
      timestamp: new Date().toISOString(),
    });

    try {
      const plan = planBuilder.build(
        input.healthReport,
        planType,
        input.capabilities,
        input.executionHistory,
        preferences,
        options.customCategories ?? input.customCategories,
      );

      optimizationEvents.emit('optimization_plan_generated', { plan });
      return plan;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      optimizationEvents.emit('optimization_plan_failed', {
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }

  /**
   * Generate a plan preview for UI display.
   *
   * @param plan - The optimization plan
   * @param input - The original input (for execution history)
   * @returns A human-readable plan preview
   */
  generatePreview(
    plan: OptimizationPlan,
    input: OptimizationPlannerInput,
  ): PlanPreview {
    return previewBuilder.build(plan, input.executionHistory);
  }

  /**
   * Generate a plan and its preview in one call.
   *
   * @param input - Health report, capabilities, and execution history
   * @param options - Plan type and user preferences
   * @returns Plan and preview
   */
  generatePlanWithPreview(
    input: OptimizationPlannerInput,
    options: PlannerOptions = {},
  ): { plan: OptimizationPlan; preview: PlanPreview } {
    const plan = this.generatePlan(input, options);
    const preview = this.generatePreview(plan, input);
    return { plan, preview };
  }

  /**
   * Generate multiple plan types for comparison.
   *
   * @param input - Health report, capabilities, and execution history
   * @param planTypes - Plan types to generate (default: all except custom)
   * @returns Array of plans
   */
  generateMultiplePlans(
    input: OptimizationPlannerInput,
    planTypes: PlanType[] = ['quick', 'balanced', 'deep', 'privacy', 'storage'],
  ): OptimizationPlan[] {
    return planTypes.map((type) =>
      this.generatePlan(input, { planType: type }),
    );
  }
}

/**
 * Default singleton instance.
 */
export const optimizationPlanner = new OptimizationPlanner();
