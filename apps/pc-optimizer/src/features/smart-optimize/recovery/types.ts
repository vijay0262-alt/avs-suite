/**
 * Optimization Recovery & Rollback Center — Type Definitions
 *
 * EPIC 4 PHASE B PART 3 — Optimization Recovery & Rollback Center.
 *
 * Centralized recovery orchestration that leverages existing snapshot
 * and rollback capabilities. Does NOT implement new rollback mechanisms.
 * Does NOT modify optimizer modules or the execution pipeline.
 *
 * Architecture:
 *   Optimization History → Snapshot Catalog → Recovery Planner →
 *   Recovery Validator → Recovery Center → Execution Pipeline
 *
 * Core architectural principle:
 *   "Every recovery recommendation must be explainable, evidence-based,
 *    and validated before execution. Recovery uses existing snapshot
 *    infrastructure — no new rollback mechanisms are created."
 */
import type { RiskLevel, RecommendationPriority } from '../planner/types';
import type { OptimizationHistoryEntry } from '../planner/types';
import type { SystemSnapshot, ExecutionStepResult } from '../../execution-pipeline/types';
import type { Evidence } from '../intelligence/types';

// Re-export for convenience
export type { RiskLevel, RecommendationPriority } from '../planner/types';
export type { OptimizationHistoryEntry } from '../planner/types';
export type { SystemSnapshot, ExecutionStepResult } from '../../execution-pipeline/types';
export type { Evidence } from '../intelligence/types';

// ── Recovery Types ───────────────────────────────────────────

export type RecoveryType =
  | 'full_rollback'
  | 'partial_rollback'
  | 'recommendation_rollback'
  | 'settings_rollback'
  | 'profile_rollback'
  | 'registry_rollback'
  | 'startup_rollback'
  | 'privacy_rollback'
  | 'future_recovery';

export type RecoveryStatus =
  | 'created'
  | 'validated'
  | 'started'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'verified'
  | 'expired';

export type RecoveryEligibilityState =
  | 'recoverable'
  | 'partially_recoverable'
  | 'expired'
  | 'corrupted'
  | 'unavailable'
  | 'blocked'
  | 'future_state';

export type SnapshotIntegrityStatus =
  | 'intact'
  | 'verified'
  | 'degraded'
  | 'corrupted'
  | 'missing'
  | 'unknown';

export type RetentionPolicyAction =
  | 'keep'
  | 'archive'
  | 'delete'
  | 'flag';

// ── Recovery Model ───────────────────────────────────────────

export interface RecoveryRecord {
  id: string;
  operationId: string;
  snapshotId: string;
  createdAt: string;
  recoveryType: RecoveryType;
  affectedModules: string[];
  estimatedDuration: number;
  estimatedRisk: RiskLevel;
  estimatedSuccess: number;
  rollbackDepth: number;
  healthBefore: number;
  healthAfter: number;
  storageImpact: number;
  performanceImpact: number;
  confidence: number;
  supportingEvidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Recovery Plan ────────────────────────────────────────────

export interface RecoveryPlan {
  id: string;
  recoveryId: string;
  steps: RecoveryStep[];
  estimatedDuration: number;
  estimatedRisk: RiskLevel;
  estimatedSuccess: number;
  rollbackDepth: number;
  affectedModules: string[];
  dependencies: string[];
  confidence: number;
  assumptions: RecoveryAssumption[];
  supportingEvidence: Evidence[];
  explainability: RecoveryExplainability;
  createdAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface RecoveryStep {
  id: string;
  title: string;
  description: string;
  recoveryType: RecoveryType;
  module: string;
  action: string;
  estimatedDuration: number;
  estimatedRisk: RiskLevel;
  rollbackAvailable: boolean;
  dependencies: string[];
  futureMetadata: Record<string, unknown>;
}

export interface RecoveryAssumption {
  id: string;
  description: string;
  impact: number;
  confidence: number;
  category: string;
  futureMetadata: Record<string, unknown>;
}

export interface RecoveryExplainability {
  reason: string;
  evidenceUsed: string[];
  affectedComponents: string[];
  estimatedOutcome: string;
  confidence: number;
  potentialRisks: string[];
  alternativeRecovery: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Snapshot Catalog Entry ───────────────────────────────────

export interface SnapshotCatalogEntry {
  id: string;
  snapshotId: string;
  executionId: string;
  createdAt: string;
  optimizationSource: string;
  profileUsed: string;
  recoveryAvailable: boolean;
  retentionPolicy: RetentionPolicy;
  integrityStatus: SnapshotIntegrityStatus;
  dependencies: string[];
  providers: string[];
  metadata: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface RetentionPolicy {
  maxAgeDays: number;
  maxCount: number;
  action: RetentionPolicyAction;
  priority: RecommendationPriority;
}

// ── Recovery Comparison ──────────────────────────────────────

export interface RecoveryComparison {
  id: string;
  snapshotIdA: string;
  snapshotIdB: string;
  generatedAt: string;
  healthComparison: HealthComparison;
  performanceComparison: PerformanceComparison;
  storageComparison: StorageComparison;
  configurationDifferences: ConfigurationDifference[];
  summary: string;
  recommendation: string;
  futureMetadata: Record<string, unknown>;
}

export interface HealthComparison {
  before: number;
  after: number;
  delta: number;
  unit: string;
}

export interface PerformanceComparison {
  before: number;
  after: number;
  delta: number;
  unit: string;
}

export interface StorageComparison {
  before: number;
  after: number;
  delta: number;
  unit: string;
}

export interface ConfigurationDifference {
  module: string;
  setting: string;
  beforeValue: string;
  afterValue: string;
  impact: string;
  futureMetadata: Record<string, unknown>;
}

// ── Recovery Validation ──────────────────────────────────────

export interface RecoveryValidationResult {
  valid: boolean;
  errors: RecoveryValidationError[];
  warnings: RecoveryValidationWarning[];
  checks: RecoveryValidationCheck[];
}

export interface RecoveryValidationError {
  code: string;
  message: string;
  field: string;
}

export interface RecoveryValidationWarning {
  code: string;
  message: string;
  field: string;
}

export interface RecoveryValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  category: ValidationCategory;
}

export type ValidationCategory =
  | 'snapshot_integrity'
  | 'dependencies'
  | 'permissions'
  | 'capabilities'
  | 'subscription'
  | 'quota'
  | 'recovery_safety'
  | 'recovery_readiness';

// ── Recovery Eligibility ─────────────────────────────────────

export interface RecoveryEligibilityResult {
  state: RecoveryEligibilityState;
  recoverable: boolean;
  reasons: string[];
  recommendations: string[];
  estimatedRecoveryTime: number;
  blockingIssues: string[];
  futureMetadata: Record<string, unknown>;
}

// ── Recovery History ─────────────────────────────────────────

export interface RecoveryHistoryEntry {
  id: string;
  recoveryId: string;
  operationId: string;
  status: RecoveryStatus;
  timestamp: string;
  metadata: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

// ── Recovery Analytics ───────────────────────────────────────

export interface RecoveryAnalytics {
  totalRecoveries: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  successRate: number;
  averageDuration: number;
  averageConfidence: number;
  totalSnapshots: number;
  availableSnapshots: number;
  corruptedSnapshots: number;
  expiredSnapshots: number;
  retentionCompliance: number;
  futureMetadata: Record<string, unknown>;
}

// ── Recovery Events ──────────────────────────────────────────

export type RecoveryEventType =
  | 'recovery_created'
  | 'recovery_validated'
  | 'recovery_started'
  | 'recovery_completed'
  | 'recovery_failed'
  | 'snapshot_compared'
  | 'recovery_exported';

export interface RecoveryEvent {
  type: RecoveryEventType;
  recoveryId: string;
  timestamp: string;
  data: unknown;
}

export type RecoveryEventListener = (event: RecoveryEvent) => void;

// ── Export ───────────────────────────────────────────────────

export type ExportFormat = 'json' | 'markdown' | 'pdf_ready' | 'future_format';

export interface RecoveryExport {
  format: ExportFormat;
  content: string;
  metadata: RecoveryExportMetadata;
  futureMetadata: Record<string, unknown>;
}

export interface RecoveryExportMetadata {
  exportedAt: string;
  recoveryId: string;
  formatVersion: string;
  byteSize: number;
  futureMetadata: Record<string, unknown>;
}

// ── Configuration ────────────────────────────────────────────

export interface RetentionRules {
  maxSnapshotAgeDays: number;
  maxSnapshotCount: number;
  autoArchive: boolean;
  autoDelete: boolean;
  priorityThreshold: RecommendationPriority;
}

export interface RecoveryPolicyRules {
  requireValidation: boolean;
  requireConfirmation: boolean;
  allowPartialRecovery: boolean;
  maxRollbackDepth: number;
  blockOnIntegrityFailure: boolean;
  blockOnDependencyFailure: boolean;
}

export interface RecoveryValidationRules {
  checkSnapshotIntegrity: boolean;
  checkDependencies: boolean;
  checkPermissions: boolean;
  checkCapabilities: boolean;
  checkSubscription: boolean;
  checkQuota: boolean;
  checkRecoverySafety: boolean;
  checkRecoveryReadiness: boolean;
}

export interface RecoveryComparisonRules {
  compareHealth: boolean;
  comparePerformance: boolean;
  compareStorage: boolean;
  compareConfiguration: boolean;
  maxDifferences: number;
}

export interface RecoveryFeatureFlags {
  enableRecovery: boolean;
  enableComparison: boolean;
  enableValidation: boolean;
  enableHistory: boolean;
  enableAnalytics: boolean;
  enableExport: boolean;
  enableExplainability: boolean;
  enableSnapshotCatalog: boolean;
  enableEligibility: boolean;
  enableCaching: boolean;
  futureFlags: Record<string, boolean>;
}

export interface RecoveryConfiguration {
  configVersion: string;
  retentionRules: RetentionRules;
  recoveryPolicyRules: RecoveryPolicyRules;
  validationRules: RecoveryValidationRules;
  comparisonRules: RecoveryComparisonRules;
  featureFlags: RecoveryFeatureFlags;
  enableEvents: boolean;
  maxHistoryEntries: number;
  recoveryExpiryMs: number;
  maxRecoveriesPerSession: number;
  performanceTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Plugin Interfaces ────────────────────────────────────────

export interface RecoveryProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getRecoveryType(): RecoveryType;
  planRecovery(input: RecoveryPlanningInput): RecoveryPlan | null;
}

export interface RecoveryComparisonPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getComparisonType(): string;
  compare(snapshotA: SnapshotCatalogEntry, snapshotB: SnapshotCatalogEntry): RecoveryComparison | null;
}

export interface ExportPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getFormat(): ExportFormat;
  export(recovery: RecoveryRecord, plan: RecoveryPlan | null): RecoveryExport;
}

// ── Planning Input ───────────────────────────────────────────

export interface RecoveryPlanningInput {
  operationId: string;
  snapshotId: string;
  snapshot: SnapshotCatalogEntry;
  systemSnapshot: SystemSnapshot | null;
  optimizationHistory: OptimizationHistoryEntry[];
  stepResults: ExecutionStepResult[];
  recoveryType: RecoveryType;
  healthBefore: number;
  healthAfter: number;
  futureMetadata: Record<string, unknown>;
}

// ── Execution Result ─────────────────────────────────────────

export interface RecoveryExecutionResult {
  recoveryId: string;
  success: boolean;
  message: string;
  rolledBackSteps: number;
  durationMs: number;
  verified: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateRecoveryId(): string {
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateRecoveryPlanId(): string {
  return `recplan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateRecoveryStepId(): string {
  return `recstep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateRecoveryHistoryId(): string {
  return `rechist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateComparisonId(): string {
  return `reccmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateCatalogEntryId(): string {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateAssumptionId(): string {
  return `assump_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateExportId(): string {
  return `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function riskToScore(risk: RiskLevel): number {
  const scores: Record<RiskLevel, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return scores[risk] ?? 0;
}

export function scoreToRisk(score: number): RiskLevel {
  if (score <= 0) return 'none';
  if (score <= 1) return 'low';
  if (score <= 2) return 'medium';
  if (score <= 3) return 'high';
  return 'critical';
}

export function priorityToScore(priority: RecommendationPriority): number {
  const scores: Record<RecommendationPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    informational: 0,
  };
  return scores[priority] ?? 0;
}

export function getRecoveryTypeLabel(type: RecoveryType): string {
  const labels: Record<RecoveryType, string> = {
    full_rollback: 'Full Rollback',
    partial_rollback: 'Partial Rollback',
    recommendation_rollback: 'Recommendation Rollback',
    settings_rollback: 'Settings Rollback',
    profile_rollback: 'Profile Rollback',
    registry_rollback: 'Registry Rollback',
    startup_rollback: 'Startup Rollback',
    privacy_rollback: 'Privacy Rollback',
    future_recovery: 'Future Recovery',
  };
  return labels[type] ?? 'Unknown Recovery';
}

export function getRecoveryTypeDescription(type: RecoveryType): string {
  const descriptions: Record<RecoveryType, string> = {
    full_rollback: 'Restores all system state to the snapshot captured before optimization.',
    partial_rollback: 'Restores only the affected modules from the snapshot.',
    recommendation_rollback: 'Rolls back changes made by a specific recommendation.',
    settings_rollback: 'Restores system settings to their pre-optimization state.',
    profile_rollback: 'Restores the optimization profile to its previous configuration.',
    registry_rollback: 'Restores registry entries modified during optimization.',
    startup_rollback: 'Restores startup entries to their pre-optimization state.',
    privacy_rollback: 'Restores privacy settings changed during optimization.',
    future_recovery: 'A future recovery type provided by a plugin.',
  };
  return descriptions[type] ?? 'Unknown recovery type.';
}

export function getRecoveryStatusLabel(status: RecoveryStatus): string {
  const labels: Record<RecoveryStatus, string> = {
    created: 'Created',
    validated: 'Validated',
    started: 'Started',
    completed: 'Completed',
    cancelled: 'Cancelled',
    failed: 'Failed',
    verified: 'Verified',
    expired: 'Expired',
  };
  return labels[status] ?? 'Unknown';
}

export function getEligibilityStateLabel(state: RecoveryEligibilityState): string {
  const labels: Record<RecoveryEligibilityState, string> = {
    recoverable: 'Recoverable',
    partially_recoverable: 'Partially Recoverable',
    expired: 'Expired',
    corrupted: 'Corrupted',
    unavailable: 'Unavailable',
    blocked: 'Blocked',
    future_state: 'Future State',
  };
  return labels[state] ?? 'Unknown';
}

export function getIntegrityStatusLabel(status: SnapshotIntegrityStatus): string {
  const labels: Record<SnapshotIntegrityStatus, string> = {
    intact: 'Intact',
    verified: 'Verified',
    degraded: 'Degraded',
    corrupted: 'Corrupted',
    missing: 'Missing',
    unknown: 'Unknown',
  };
  return labels[status] ?? 'Unknown';
}

export function createDefaultRetentionPolicy(): RetentionPolicy {
  return {
    maxAgeDays: 30,
    maxCount: 50,
    action: 'keep',
    priority: 'medium',
  };
}
