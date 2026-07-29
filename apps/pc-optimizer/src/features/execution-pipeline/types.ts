/**
 * Execution Pipeline — Type Definitions
 *
 * EPIC 3 PHASE A PART 6 — Optimization Execution Pipeline.
 *
 * This module sits between Optimization Plans and the existing
 * Execution Engine. It validates, prepares, coordinates, monitors,
 * and verifies optimization execution.
 *
 * It does NOT replace the Execution Engine.
 * It does NOT duplicate optimization logic.
 * Existing optimization modules continue performing the actual work.
 */
import type { OptimizationPlanV2, PlanStep } from '../optimization-planner/types';

// ── Pipeline Stages ──────────────────────────────────────────

export type PipelineStage =
  | 'plan_validation'
  | 'dependency_validation'
  | 'permission_validation'
  | 'capability_validation'
  | 'quota_validation'
  | 'system_snapshot'
  | 'user_confirmation'
  | 'execution_coordination'
  | 'progress_monitoring'
  | 'verification'
  | 'health_refresh'
  | 'completion'
  | 'recovery';

export type ExecutionState =
  | 'pending'
  | 'preparing'
  | 'waiting_for_confirmation'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'rolling_back'
  | 'recovered';

export type VerificationStatus =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'skipped';

export type StepExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'rolled_back';

// ── Execution Model ──────────────────────────────────────────

export interface ExecutionStepResult {
  stepId: string;
  stepTitle: string;
  status: StepExecutionStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number;
  error: string | null;
  warnings: string[];
  rollbackAvailable: boolean;
  rollbackExecuted: boolean;
  output: Record<string, unknown>;
}

export interface PipelineExecution {
  id: string;
  planId: string;
  status: ExecutionState;
  startedAt: string | null;
  completedAt: string | null;
  currentStage: PipelineStage | null;
  completedStages: PipelineStage[];
  failedStages: PipelineStage[];
  progress: number;
  estimatedRemainingTime: number;
  rollbackAvailable: boolean;
  verificationStatus: VerificationStatus;
  healthBefore: number | null;
  healthAfter: number | null;
  stepResults: ExecutionStepResult[];
  errors: string[];
  warnings: string[];
  executionMetadata: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

// ── Validation ───────────────────────────────────────────────

export interface PipelineValidationResult {
  valid: boolean;
  errors: PipelineValidationError[];
  warnings: PipelineValidationWarning[];
}

export interface PipelineValidationError {
  code: string;
  message: string;
  stage: PipelineStage;
  stepId?: string;
}

export interface PipelineValidationWarning {
  code: string;
  message: string;
  stage: PipelineStage;
  stepId?: string;
}

// ── System Snapshot ──────────────────────────────────────────

export interface SystemSnapshot {
  id: string;
  executionId: string;
  createdAt: string;
  restorePointCreated: boolean;
  registryBackupCreated: boolean;
  startupBackupCreated: boolean;
  configBackupCreated: boolean;
  moduleStateBackup: Record<string, unknown>;
  snapshotProviders: string[];
  futureMetadata: Record<string, unknown>;
}

export interface SnapshotProvider {
  name: string;
  capture(executionId: string): Promise<Record<string, unknown>>;
  restore(snapshot: SystemSnapshot): Promise<boolean>;
}

// ── Progress ─────────────────────────────────────────────────

export interface ExecutionProgress {
  executionId: string;
  overallProgress: number;
  currentStepId: string | null;
  currentStepTitle: string | null;
  completedSteps: number;
  totalSteps: number;
  failedSteps: number;
  skippedSteps: number;
  estimatedRemainingTime: number;
  errors: string[];
  warnings: string[];
  rollbackAvailable: boolean;
  updatedAt: string;
}

// ── Verification ─────────────────────────────────────────────

export interface VerificationResult {
  verified: boolean;
  checks: VerificationCheck[];
  healthRecalculated: boolean;
  recommendationStatusUpdated: boolean;
  predictionRefreshRequested: boolean;
  insightRefreshRequested: boolean;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
  stepId?: string;
}

// ── Recovery ─────────────────────────────────────────────────

export type RecoveryAction =
  | 'retry'
  | 'rollback'
  | 'skip'
  | 'abort'
  | 'resume';

export interface RecoveryResult {
  action: RecoveryAction;
  success: boolean;
  recoveredSteps: number;
  rolledBackSteps: number;
  message: string;
}

// ── Execution Report ─────────────────────────────────────────

export interface ExecutionReport {
  executionId: string;
  planId: string;
  summary: string;
  completedSteps: ExecutionStepResult[];
  skippedSteps: ExecutionStepResult[];
  failedSteps: ExecutionStepResult[];
  totalDurationMs: number;
  healthBefore: number | null;
  healthAfter: number | null;
  healthDelta: number | null;
  storageRecovered: number;
  performanceImprovement: number;
  warnings: string[];
  errors: string[];
  rollbackAvailable: boolean;
  evidence: ExecutionEvidence[];
  generatedAt: string;
}

export interface ExecutionEvidence {
  source: string;
  metric: string;
  value: string | number | boolean;
  timestamp: string;
}

// ── Execution Statistics ─────────────────────────────────────

export interface ExecutionStatistics {
  totalExecutions: number;
  byStatus: Record<string, number>;
  byStage: Record<string, number>;
  averageDurationMs: number;
  averageProgress: number;
  totalCompletedSteps: number;
  totalFailedSteps: number;
  totalRollbacks: number;
  successRate: number;
}

// ── Execution History ────────────────────────────────────────

export interface ExecutionHistoryEntry {
  id: string;
  executionId: string;
  action: string;
  timestamp: string;
  stage: PipelineStage | null;
  metadata: Record<string, unknown>;
}

// ── Events ───────────────────────────────────────────────────

export type ExecutionEventType =
  | 'execution_started'
  | 'validation_completed'
  | 'snapshot_created'
  | 'confirmation_requested'
  | 'execution_progress'
  | 'step_completed'
  | 'verification_completed'
  | 'execution_completed'
  | 'execution_failed'
  | 'rollback_started'
  | 'rollback_completed';

export interface ExecutionEvent {
  type: ExecutionEventType;
  executionId: string;
  timestamp: string;
  data: unknown;
}

export type ExecutionEventListener = (event: ExecutionEvent) => void;

// ── Configuration ────────────────────────────────────────────

export interface ValidationRules {
  requireFreshRecommendations: boolean;
  maxRecommendationAgeMinutes: number;
  requireAllCapabilities: boolean;
  requireQuotaAvailable: boolean;
  requireSystemReady: boolean;
  abortOnError: boolean;
}

export interface TimeoutRules {
  defaultTimeoutMs: number;
  perStepTimeoutMs: number;
  snapshotTimeoutMs: number;
  verificationTimeoutMs: number;
}

export interface RetryRules {
  maxRetries: number;
  retryDelayMs: number;
  retryableStages: PipelineStage[];
}

export interface VerificationRules {
  verifyChangesCompleted: boolean;
  verifyExpectedOutputs: boolean;
  verifyHealthRecalculated: boolean;
  verifyRecommendationStatus: boolean;
  requestPredictionRefresh: boolean;
  requestInsightRefresh: boolean;
}

export interface RecoveryRules {
  autoRecover: boolean;
  maxRecoveryAttempts: number;
  rollbackOnFailure: boolean;
  allowPartialCompletion: boolean;
}

export interface PipelineFeatureFlags {
  enableParallelExecution: boolean;
  enableSnapshots: boolean;
  enableVerification: boolean;
  enableRecovery: boolean;
  enableRollback: boolean;
  enableProgressTracking: boolean;
  enableHealthRefresh: boolean;
  futureFlags: Record<string, boolean>;
}

export interface ExecutionConfiguration {
  configVersion: string;
  enabledStages: PipelineStage[];
  validationRules: ValidationRules;
  timeoutRules: TimeoutRules;
  retryRules: RetryRules;
  verificationRules: VerificationRules;
  recoveryRules: RecoveryRules;
  featureFlags: PipelineFeatureFlags;
  enableEvents: boolean;
  maxConcurrentSteps: number;
}

// ── Stage Handler Interface ──────────────────────────────────

export interface StageHandler {
  stage: PipelineStage;
  execute(context: StageContext): Promise<StageResult>;
}

export interface StageContext {
  execution: PipelineExecution;
  plan: OptimizationPlanV2;
  config: ExecutionConfiguration;
  snapshot: SystemSnapshot | null;
}

export interface StageResult {
  success: boolean;
  stage: PipelineStage;
  data: Record<string, unknown>;
  error?: string;
  warnings?: string[];
}

// ── Step Handler Interface ───────────────────────────────────

export interface StepHandler {
  stepId: string;
  execute(step: PlanStep, context: StepContext): Promise<StepHandlerResult>;
}

export interface StepContext {
  executionId: string;
  config: ExecutionConfiguration;
  snapshot: SystemSnapshot | null;
}

export interface StepHandlerResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
  warnings?: string[];
}

// ── Helper Functions ─────────────────────────────────────────

export function getStageLabel(stage: PipelineStage): string {
  const labels: Record<PipelineStage, string> = {
    plan_validation: 'Plan Validation',
    dependency_validation: 'Dependency Validation',
    permission_validation: 'Permission Validation',
    capability_validation: 'Capability Validation',
    quota_validation: 'Quota Validation',
    system_snapshot: 'System Snapshot',
    user_confirmation: 'User Confirmation',
    execution_coordination: 'Execution Coordination',
    progress_monitoring: 'Progress Monitoring',
    verification: 'Verification',
    health_refresh: 'Health Refresh',
    completion: 'Completion',
    recovery: 'Recovery',
  };
  return labels[stage] ?? 'Unknown Stage';
}

export function getExecutionStateLabel(state: ExecutionState): string {
  const labels: Record<ExecutionState, string> = {
    pending: 'Pending',
    preparing: 'Preparing',
    waiting_for_confirmation: 'Waiting For Confirmation',
    running: 'Running',
    paused: 'Paused',
    completed: 'Completed',
    cancelled: 'Cancelled',
    failed: 'Failed',
    rolling_back: 'Rolling Back',
    recovered: 'Recovered',
  };
  return labels[state] ?? 'Unknown';
}

export function createDefaultExecutionConfiguration(): ExecutionConfiguration {
  return {
    configVersion: '1.0.0',
    enabledStages: [
      'plan_validation',
      'dependency_validation',
      'permission_validation',
      'capability_validation',
      'quota_validation',
      'system_snapshot',
      'user_confirmation',
      'execution_coordination',
      'progress_monitoring',
      'verification',
      'health_refresh',
      'completion',
    ],
    validationRules: {
      requireFreshRecommendations: true,
      maxRecommendationAgeMinutes: 30,
      requireAllCapabilities: true,
      requireQuotaAvailable: true,
      requireSystemReady: true,
      abortOnError: true,
    },
    timeoutRules: {
      defaultTimeoutMs: 300000,
      perStepTimeoutMs: 60000,
      snapshotTimeoutMs: 30000,
      verificationTimeoutMs: 30000,
    },
    retryRules: {
      maxRetries: 2,
      retryDelayMs: 1000,
      retryableStages: ['execution_coordination', 'verification'],
    },
    verificationRules: {
      verifyChangesCompleted: true,
      verifyExpectedOutputs: true,
      verifyHealthRecalculated: true,
      verifyRecommendationStatus: true,
      requestPredictionRefresh: true,
      requestInsightRefresh: true,
    },
    recoveryRules: {
      autoRecover: false,
      maxRecoveryAttempts: 1,
      rollbackOnFailure: false,
      allowPartialCompletion: true,
    },
    featureFlags: {
      enableParallelExecution: false,
      enableSnapshots: true,
      enableVerification: true,
      enableRecovery: true,
      enableRollback: true,
      enableProgressTracking: true,
      enableHealthRefresh: true,
      futureFlags: {},
    },
    enableEvents: true,
    maxConcurrentSteps: 1,
  };
}

export function generateExecutionId(): string {
  return `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateSnapshotId(): string {
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateHistoryId(): string {
  return `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
