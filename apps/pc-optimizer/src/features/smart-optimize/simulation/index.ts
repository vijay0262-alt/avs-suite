/**
 * Smart Optimize 2.0 — Optimization Preview & Simulation Engine
 *
 * EPIC 4 PHASE B PART 2 — Barrel Export
 *
 * Simulates and predicts the expected outcome of an optimization plan
 * before execution. The simulation is evidence-based, explainable, and
 * deterministic. No actual system changes are allowed.
 */

// Types
export type {
  SimulationType,
  SimulationStatus,
  SimulationResult,
  SimulationAssumption,
  SimulationExplainability,
  SimulationActionBreakdown,
  SimulationInput,
  SimulationComparison,
  SimulationDelta,
  SimulationValidationResult,
  SimulationValidationError,
  SimulationValidationWarning,
  SimulationHistoryEntry,
  SimulationAnalytics,
  ExportFormat,
  SimulationExport,
  SimulationExportMetadata,
  EstimationRule,
  EstimationFactor,
  ConfidenceRule,
  FormattingRule,
  ComparisonRule,
  SimulationFeatureFlags,
  SimulationConfiguration,
  SimulationEventType,
  SimulationEvent,
  SimulationEventListener,
  SimulationProviderPlugin,
  EstimationPlugin,
  ComparisonPlugin,
  ExportPlugin,
} from './types';

// Re-export shared types for convenience
export type {
  RiskLevel,
  RecommendationPriority,
  SmartPlan,
  OptimizationGoal,
  OptimizationStrategy,
  SmartPlanAction,
  SmartPlanBenefits,
  SafetyAssessment,
  EligibilityResult,
  OptimizationHistoryEntry,
  DeviceProfileSnapshot,
  SystemState,
  Evidence,
} from './types';

// Helpers
export {
  generateSimulationId,
  generateComparisonId,
  generateSimulationHistoryId,
  generateAssumptionId,
  generateDeltaId,
  generateExportId,
  riskToScore,
  scoreToRisk,
  priorityToScore,
  createDefaultSimulationInput,
} from './types';

// Configuration
export {
  DEFAULT_SIMULATION_CONFIGURATION,
  createSimulationConfiguration,
} from './simulationConfiguration';
export type { DeepPartial as SimulationDeepPartial } from './simulationConfiguration';

// Events
export { SimulationEvents } from './simulationEvents';

// History
export { SimulationHistory } from './simulationHistory';

// Validator
export { SimulationValidator } from './simulationValidator';

// Estimator
export { SimulationEstimator } from './simulationEstimator';

// Scenario Builder
export { SimulationScenarioBuilder } from './simulationScenarioBuilder';

// Engine
export { SimulationEngine } from './simulationEngine';

// Comparison Engine
export { SimulationComparisonEngine } from './simulationComparisonEngine';

// Analytics
export { SimulationAnalyticsEngine } from './simulationAnalytics';

// Formatter
export { SimulationFormatter } from './simulationFormatter';

// Exporter
export { SimulationExporter } from './simulationExporter';

// Planner
export { SimulationPlanner } from './simulationPlanner';

// Manager
export { SimulationManager } from './simulationManager';
