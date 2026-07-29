/**
 * Execution Pipeline — Barrel Export
 *
 * EPIC 3 PHASE A PART 6 — Optimization Execution Pipeline.
 *
 * This module sits between Optimization Plans and the existing
 * Execution Engine. It validates, prepares, coordinates, monitors,
 * and verifies optimization execution.
 *
 * It does NOT replace the Execution Engine.
 * It does NOT duplicate optimization logic.
 */
// Types
export type {
  PipelineStage,
  ExecutionState,
  VerificationStatus,
  StepExecutionStatus,
  ExecutionStepResult,
  PipelineExecution,
  PipelineValidationResult,
  PipelineValidationError,
  PipelineValidationWarning,
  SystemSnapshot,
  SnapshotProvider,
  ExecutionProgress,
  VerificationResult,
  VerificationCheck,
  RecoveryAction,
  RecoveryResult,
  ExecutionReport,
  ExecutionEvidence,
  ExecutionStatistics,
  ExecutionHistoryEntry,
  ExecutionEventType,
  ExecutionEvent,
  ExecutionEventListener,
  ValidationRules,
  TimeoutRules,
  RetryRules,
  VerificationRules,
  RecoveryRules,
  PipelineFeatureFlags,
  ExecutionConfiguration,
  StageHandler,
  StageContext,
  StageResult,
  StepHandler,
  StepContext,
  StepHandlerResult,
} from './types';

// Helpers
export {
  getStageLabel,
  getExecutionStateLabel,
  createDefaultExecutionConfiguration,
  generateExecutionId,
  generateSnapshotId,
  generateHistoryId,
} from './types';

// Configuration
export {
  DEFAULT_EXECUTION_CONFIGURATION,
  createExecutionConfiguration,
  isStageEnabled,
} from './executionConfiguration';
export type { DeepPartial as ExecutionDeepPartial } from './executionConfiguration';

// Events
export { ExecutionEvents } from './executionEvents';

// Validator
export { ExecutionValidator } from './executionValidator';

// Snapshot Manager
export { ExecutionSnapshotManager } from './executionSnapshotManager';

// Stage Manager
export { ExecutionStageManager } from './executionStageManager';

// Progress Manager
export { ExecutionProgressManager } from './executionProgressManager';

// Coordinator
export { ExecutionCoordinator } from './executionCoordinator';

// Verification Manager
export { ExecutionVerificationManager } from './executionVerificationManager';

// Recovery Manager
export { ExecutionRecoveryManager, type ExecutionFailureReport } from './executionRecoveryManager';

// History
export { ExecutionHistory } from './executionHistory';

// Pipeline Builder
export { ExecutionPipelineBuilder } from './executionPipelineBuilder';

// Pipeline Manager
export { ExecutionPipelineManager } from './executionPipelineManager';
