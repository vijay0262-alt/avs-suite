/**
 * One-Click Smart Optimize — Barrel Export
 *
 * Coordinates between the Optimization Planner and the Execution Engine.
 * Never bypasses the engine, capability checks, or scheduler state.
 */
// Types
export type {
  SessionStatus,
  OptimizationSession,
  ValidationIssue,
  ValidationResult,
  OptimizationProgress,
  OptimizationResult,
  ItemResult,
  CoordinatorInput,
  OptimizationExecutionEventType,
  OptimizationExecutionEventPayloads,
  OptimizationExecutionEventListener,
} from './types';
export { formatDurationMs, formatBytes } from './types';

// Events
export { optimizationExecutionEvents, OptimizationExecutionEventEmitter } from './optimizationExecutionEvents';

// Session
export { SessionManager, sessionManager } from './optimizationSession';

// Progress Tracker
export { ProgressTracker, progressTracker } from './optimizationProgressTracker';

// Result Builder
export { resultBuilder } from './optimizationResultBuilder';

// Coordinator
export { OptimizationExecutionCoordinator, optimizationCoordinator } from './optimizationExecutionCoordinator';
