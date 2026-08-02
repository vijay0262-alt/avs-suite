/**
 * AI Smart Optimization Engine — barrel exports
 *
 * EPIC 4 — AI Smart Optimization
 *
 * Public API for the AI Smart Optimization Engine.
 * Analyzes findings from existing modules, creates evidence-based
 * optimization plans, and coordinates safe, reversible execution.
 */

// Types
export * from './types';

// Events
export { optimizationEventBus } from './OptimizationEvents';

// Configuration
export { OptimizationConfigurationManager } from './OptimizationConfiguration';

// Core engine
export { SmartOptimizationEngine } from './SmartOptimizationEngine';

// Planning
export { OptimizationPlanner } from './OptimizationPlanner';
export { OptimizationRecommendationEngine } from './OptimizationRecommendationEngine';
export { OptimizationScorer } from './OptimizationScorer';
export { OptimizationPrioritizer } from './OptimizationPrioritizer';

// Analysis
export { OptimizationImpactCalculator } from './OptimizationImpactCalculator';
export { OptimizationRiskAnalyzer } from './OptimizationRiskAnalyzer';

// Resolution
export { OptimizationDependencyResolver } from './OptimizationDependencyResolver';
export { OptimizationConflictResolver } from './OptimizationConflictResolver';

// Preview & Simulation
export { OptimizationPreviewBuilder } from './OptimizationPreview';
export { OptimizationSimulationEngine } from './OptimizationSimulation';

// Approval & Rollback
export { OptimizationApprovalManager } from './OptimizationApprovalManager';
export { OptimizationRollbackPlanner } from './OptimizationRollbackPlanner';

// Execution
export { OptimizationExecutionCoordinator } from './OptimizationExecutionCoordinator';
export type { ExecutionHandler } from './OptimizationExecutionCoordinator';

// Insights & Dashboard
export { OptimizationInsights } from './OptimizationInsights';
export { OptimizationDashboardProvider } from './OptimizationDashboardProvider';

// History & Learning
export { OptimizationHistory } from './OptimizationHistory';
export { OptimizationLearning } from './OptimizationLearning';

// Findings & Execution
export { gatherFindings } from './findingsGatherer';
export type { GatheredFindings } from './findingsGatherer';
export { createExecutionHandler } from './executionHandler';
