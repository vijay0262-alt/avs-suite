/**
 * SmartOptimizationEngine — top-level orchestrator for the AI Smart
 * Optimization Engine.
 *
 * EPIC 4 — AI Smart Optimization
 *
 * Consumes findings from existing modules (Hardware AI, Process AI,
 * Browser Health, Storage Intelligence, etc.) and produces:
 *   - Evidence-based, prioritized optimization plans
 *   - Human-readable insights with full evidence chains
 *   - Risk assessment and rollback planning
 *   - Simulation and preview before execution
 *   - Post-optimization reports with before/after comparison
 *   - Local learning from user preferences
 *
 * Core principles:
 *   - Every recommendation is evidence-based and explainable.
 *   - No aggressive registry cleaning. No unsafe tweaks.
 *   - No irreversible operations without explicit user confirmation.
 *   - Rollback always available where technically possible.
 *   - Uses existing optimization infrastructure — never duplicates.
 *   - The AI never invents information.
 */
import type {
  SourceFinding,
  OptimizationPlan,
  OptimizationPreview,
  OptimizationSimulation,
  OptimizationReport,
  OptimizationDashboardData,
  OptimizationInsight,
  OptimizationConfiguration,
  SystemStateProjection,
  OptimizationAction,
} from './types';
import { OptimizationConfigurationManager } from './OptimizationConfiguration';
import { OptimizationPlanner } from './OptimizationPlanner';
import { OptimizationPreviewBuilder } from './OptimizationPreview';
import { OptimizationSimulationEngine } from './OptimizationSimulation';
import { OptimizationInsights } from './OptimizationInsights';
import { OptimizationDashboardProvider } from './OptimizationDashboardProvider';
import { OptimizationHistory } from './OptimizationHistory';
import { OptimizationLearning } from './OptimizationLearning';
import { OptimizationExecutionCoordinator } from './OptimizationExecutionCoordinator';
import type { ExecutionHandler } from './OptimizationExecutionCoordinator';

export class SmartOptimizationEngine {
  private configManager: OptimizationConfigurationManager;
  private planner: OptimizationPlanner;
  private previewBuilder: OptimizationPreviewBuilder;
  private simulationEngine: OptimizationSimulationEngine;
  private insightsEngine: OptimizationInsights;
  private dashboardProvider: OptimizationDashboardProvider;
  private history: OptimizationHistory;
  private learning: OptimizationLearning;
  private executionCoordinator: OptimizationExecutionCoordinator;
  private lastPlan: OptimizationPlan | null = null;

  constructor(config?: Partial<OptimizationConfiguration>) {
    this.configManager = new OptimizationConfigurationManager(config);
    this.history = new OptimizationHistory();
    this.learning = new OptimizationLearning();
    this.planner = new OptimizationPlanner(this.configManager.get(), this.learning.getLearningData());
    this.previewBuilder = new OptimizationPreviewBuilder();
    this.simulationEngine = new OptimizationSimulationEngine();
    this.insightsEngine = new OptimizationInsights();
    this.dashboardProvider = new OptimizationDashboardProvider();
    this.executionCoordinator = new OptimizationExecutionCoordinator(
      this.configManager.get(),
      this.history,
    );
  }

  /**
   * Generate an optimization plan from source findings.
   */
  generatePlan(findings: SourceFinding[], currentHealthScore: number): OptimizationPlan {
    this.planner = new OptimizationPlanner(this.configManager.get(), this.learning.getLearningData());
    const plan = this.planner.plan(findings, currentHealthScore);
    this.lastPlan = plan;
    return plan;
  }

  /**
   * Build a human-readable preview of the current or given plan.
   */
  preview(plan?: OptimizationPlan): OptimizationPreview {
    const target = plan ?? this.lastPlan;
    if (!target) throw new Error('No plan available to preview');
    return this.previewBuilder.build(target);
  }

  /**
   * Simulate the effects of a plan without executing it.
   */
  simulate(plan: OptimizationPlan, currentState: SystemStateProjection): OptimizationSimulation {
    return this.simulationEngine.simulate(plan, currentState);
  }

  /**
   * Generate explainable insights for each action in a plan.
   */
  generateInsights(plan?: OptimizationPlan): OptimizationInsight[] {
    const target = plan ?? this.lastPlan;
    if (!target) return [];
    return this.insightsEngine.generateInsights(target);
  }

  /**
   * Build dashboard data from the current plan and execution history.
   */
  buildDashboard(): OptimizationDashboardData {
    return this.dashboardProvider.build(this.lastPlan, this.history);
  }

  /**
   * Execute a plan. Requires an execution handler to be set.
   */
  async executePlan(plan?: OptimizationPlan): Promise<OptimizationReport> {
    const target = plan ?? this.lastPlan;
    if (!target) throw new Error('No plan available to execute');
    const report = await this.executionCoordinator.executePlan(target);

    if (this.configManager.get().enableLearning) {
      for (const result of report.results) {
        const action = target.actions.find((a) => a.id === result.actionId);
        if (!action) continue;
        if (result.status === 'completed') {
          this.learning.recordAcceptance(action);
        } else if (result.status === 'skipped') {
          this.learning.recordRejection(action, 'Skipped during execution');
        }
      }
      this.learning.setAverageHealthScoreGain(report.summary.healthScoreChange);
    }

    return report;
  }

  /**
   * Rollback a specific action.
   */
  async rollbackAction(action: OptimizationAction, planId: string): Promise<boolean> {
    return this.executionCoordinator.rollbackAction(action, planId);
  }

  /**
   * Set the execution handler for running optimizations.
   */
  setExecutionHandler(handler: ExecutionHandler): void {
    this.executionCoordinator.setHandler(handler);
  }

  /**
   * Get the approval manager for the current execution.
   */
  getApprovalManager() {
    return this.executionCoordinator.getApprovalManager();
  }

  getConfiguration(): OptimizationConfiguration {
    return this.configManager.get();
  }

  updateConfiguration(updates: Partial<OptimizationConfiguration>): void {
    this.configManager.update(updates);
  }

  getHistory(): OptimizationHistory {
    return this.history;
  }

  getLearning(): OptimizationLearning {
    return this.learning;
  }

  getLastPlan(): OptimizationPlan | null {
    return this.lastPlan;
  }

  dispose(): void {
    this.lastPlan = null;
    this.history.clear();
    this.learning.clear();
    this.getApprovalManager().clear();
  }
}
