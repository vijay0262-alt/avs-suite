/**
 * AI Smart Optimization Engine — Type Definitions
 *
 * EPIC 4 — AI Smart Optimization
 *
 * The Smart Optimization Engine consumes analysis from existing modules
 * (Hardware AI, Process AI, Browser Health, Storage Intelligence, etc.)
 * and produces evidence-based, prioritized, reversible optimization plans.
 *
 * Core principles:
 *   - Every recommendation is evidence-based and explainable.
 *   - Every optimization has measurable benefit estimates.
 *   - No unsafe optimizations. No aggressive registry cleaning.
 *   - Rollback is always available where technically possible.
 *   - Uses existing optimization infrastructure — never duplicates.
 *   - The AI never invents information.
 */

// ── Source Module Types ─────────────────────────────────────────────

/**
 * Identifiers for all source modules the engine can consume.
 */
export type SourceModuleId =
  | 'hardware_ai'
  | 'process_ai'
  | 'browser_health'
  | 'storage_intelligence'
  | 'windows_health'
  | 'startup_manager'
  | 'junk_cleaner'
  | 'registry_cleaner'
  | 'duplicate_finder'
  | 'large_file_analyzer'
  | 'timeline'
  | 'history'
  | 'recovery'
  | 'reports';

/**
 * A finding from a source module — the raw input the engine works with.
 */
export interface SourceFinding {
  module: SourceModuleId;
  findingId: string;
  category: OptimizationCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  evidence: OptimizationEvidence[];
  estimatedBenefit: Partial<OptimizationBenefits>;
  sourceData: Record<string, unknown>;
  timestamp: number;
}

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

// ── Optimization Category ───────────────────────────────────────────

export type OptimizationCategory =
  | 'temp_files'
  | 'browser_cache'
  | 'browser_privacy'
  | 'recycle_bin'
  | 'startup'
  | 'registry'
  | 'duplicate_files'
  | 'large_files'
  | 'windows_update'
  | 'system_services'
  | 'disk_optimization'
  | 'memory_optimization'
  | 'privacy'
  | 'security'
  | 'driver_update'
  | 'power'
  | 'general';

// ── Evidence ─────────────────────────────────────────────────────────

export interface OptimizationEvidence {
  source: SourceModuleId;
  metric: string;
  value: string;
  unit?: string;
  timestamp: number;
  confidence: number;
}

// ── Benefits ─────────────────────────────────────────────────────────

/**
 * Quantifiable benefits for an optimization action.
 * All values are estimated based on evidence.
 */
export interface OptimizationBenefits {
  performanceImprovement: number;
  storageRecoveryMB: number;
  ramRecoveryMB: number;
  startupImprovementMs: number;
  privacyImprovement: number;
  batteryImprovement: number;
  thermalImprovement: number;
  stabilityImpact: number;
}

export type BenefitKey = keyof OptimizationBenefits;

// ── Risk ─────────────────────────────────────────────────────────────

export type RiskLevel = 'none' | 'low' | 'moderate' | 'high' | 'severe';

export interface OptimizationRisk {
  level: RiskLevel;
  score: number;
  reversible: boolean;
  requiresRestart: boolean;
  estimatedDurationSeconds: number;
  userConfirmationRequired: boolean;
  factors: string[];
  mitigations: string[];
}

// ── Optimization Action ──────────────────────────────────────────────

export type OptimizationImpactTier = 'high' | 'medium' | 'low' | 'informational';

export type OptimizationActionType =
  | 'clean_temp_files'
  | 'clean_browser_cache'
  | 'clear_browser_privacy'
  | 'empty_recycle_bin'
  | 'disable_startup_entry'
  | 'delay_startup_entry'
  | 'clean_registry'
  | 'remove_duplicates'
  | 'move_large_files'
  | 'delete_large_files'
  | 'run_windows_update'
  | 'optimize_disk'
  | 'close_background_process'
  | 'adjust_power_plan'
  | 'clear_privacy_traces'
  | 'update_driver'
  | 'custom';

export interface OptimizationAction {
  id: string;
  type: OptimizationActionType;
  category: OptimizationCategory;
  sourceModule: SourceModuleId;
  sourceFindingId: string;
  title: string;
  description: string;
  impact: OptimizationImpact;
  risk: OptimizationRisk;
  benefits: OptimizationBenefits;
  evidence: OptimizationEvidence[];
  confidence: number;
  impactTier: OptimizationImpactTier;
  rollbackAvailable: boolean;
  rollbackPlanId: string | null;
  dependencies: string[];
  conflicts: string[];
  requiresUserConfirmation: boolean;
  canAutomate: boolean;
  status: OptimizationActionStatus;
}

export type OptimizationActionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'skipped';

// ── Impact ───────────────────────────────────────────────────────────

export interface OptimizationImpact {
  score: number;
  tier: OptimizationImpactTier;
  primaryBenefit: BenefitKey;
  estimatedHealthScoreGain: number;
  description: string;
}

// ── Optimization Plan ────────────────────────────────────────────────

export interface OptimizationPlan {
  id: string;
  title: string;
  summary: string;
  generatedAt: number;
  expiresAt: number;
  actions: OptimizationAction[];
  executionOrder: string[];
  totalBenefits: OptimizationBenefits;
  totalRisk: RiskLevel;
  overallConfidence: number;
  estimatedTotalDurationSeconds: number;
  estimatedHealthScoreGain: number;
  currentHealthScore: number;
  predictedHealthScore: number;
  impactTier: OptimizationImpactTier;
  rollbackAvailable: boolean;
  requiresUserConfirmation: boolean;
  reasoning: string[];
  sourceModules: SourceModuleId[];
}

// ── Optimization Preview ─────────────────────────────────────────────

export interface OptimizationPreview {
  planId: string;
  headline: string;
  currentHealthScore: number;
  expectedHealthScore: number;
  scoreImprovement: number;
  estimatedStorageRecoveryMB: number;
  estimatedRamRecoveryMB: number;
  estimatedStartupImprovementMs: number;
  estimatedBrowserImprovement: number;
  estimatedPrivacyImprovement: number;
  estimatedCompletionTimeSeconds: number;
  estimatedThermalImprovement: number;
  estimatedBatteryImprovement: number;
  actionsPreview: OptimizationPreviewAction[];
  reasoning: string[];
  rollbackAvailable: boolean;
  warnings: string[];
}

export interface OptimizationPreviewAction {
  id: string;
  title: string;
  category: OptimizationCategory;
  impactTier: OptimizationImpactTier;
  estimatedBenefit: string;
  estimatedDurationSeconds: number;
  riskLevel: RiskLevel;
  rollbackAvailable: boolean;
}

// ── Optimization Simulation ──────────────────────────────────────────

export interface OptimizationSimulation {
  planId: string;
  simulatedHealthScore: number;
  simulatedBenefits: OptimizationBenefits;
  simulatedRisk: RiskLevel;
  projectedSystemState: SystemStateProjection;
  confidence: number;
  assumptions: string[];
  warnings: string[];
}

export interface SystemStateProjection {
  cpuUsagePercent: number;
  memoryUsageMB: number;
  diskFreeSpaceMB: number;
  startupTimeSeconds: number;
  browserResponsiveness: number;
  privacyScore: number;
  thermalScore: number;
  batteryEstimateHours: number;
  stabilityScore: number;
}

// ── Dependency & Conflict Resolution ─────────────────────────────────

export interface DependencyResolution {
  resolved: boolean;
  order: string[];
  unresolvedDependencies: UnresolvedDependency[];
}

export interface UnresolvedDependency {
  actionId: string;
  missingDependency: string;
  reason: string;
}

export interface ConflictResolution {
  resolved: boolean;
  resolvedConflicts: ResolvedOptimizationConflict[];
  unresolvedConflicts: OptimizationConflict[];
}

export interface OptimizationConflict {
  type: 'duplicate' | 'mutually_exclusive' | 'dependency_violation' | 'resource_conflict';
  actionIds: string[];
  description: string;
}

export interface ResolvedOptimizationConflict {
  conflict: OptimizationConflict;
  resolution: string;
  keptActionId: string;
  removedActionId: string;
}

// ── Approval ─────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export interface ApprovalRequest {
  id: string;
  planId: string;
  actionId: string;
  actionTitle: string;
  riskLevel: RiskLevel;
  reason: string;
  evidence: OptimizationEvidence[];
  estimatedBenefit: string;
  rollbackAvailable: boolean;
  status: ApprovalStatus;
  requestedAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
}

// ── Rollback ─────────────────────────────────────────────────────────

export interface RollbackPlan {
  id: string;
  actionId: string;
  actionTitle: string;
  steps: RollbackStep[];
  estimatedDurationSeconds: number;
  canExecute: boolean;
  prerequisites: string[];
  warnings: string[];
}

export interface RollbackStep {
  order: number;
  description: string;
  type: 'restore_file' | 'restore_registry' | 're-enable_service' | 'restore_startup' | 'custom';
  target: string;
  reversible: boolean;
}

// ── Execution ────────────────────────────────────────────────────────

export type ExecutionState =
  | 'pending'
  | 'preparing'
  | 'awaiting_approval'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'rolling_back'
  | 'rolled_back'
  | 'cancelled';

export interface ExecutionResult {
  actionId: string;
  actionTitle: string;
  status: OptimizationActionStatus;
  startedAt: number;
  completedAt: number | null;
  durationMs: number;
  error: string | null;
  warnings: string[];
  rollbackAvailable: boolean;
  rollbackExecuted: boolean;
  output: Record<string, unknown>;
}

export interface OptimizationReport {
  planId: string;
  executedAt: number;
  completedAt: number;
  totalDurationMs: number;
  results: ExecutionResult[];
  summary: OptimizationSummary;
  beforeAfter: BeforeAfterComparison;
  rollbackAvailable: boolean;
  successCount: number;
  failureCount: number;
  skippedCount: number;
}

export interface OptimizationSummary {
  headline: string;
  actionsPerformed: number;
  actionsFailed: number;
  actionsSkipped: number;
  healthScoreBefore: number;
  healthScoreAfter: number;
  healthScoreChange: number;
  storageRecoveredMB: number;
  ramRecoveredMB: number;
  startupImprovementMs: number;
  browserImprovement: number;
  privacyImprovement: number;
  rollbackAvailable: boolean;
  nextRecommendedAction: string | null;
}

export interface BeforeAfterComparison {
  before: SystemStateSnapshot;
  after: SystemStateSnapshot;
  deltas: OptimizationBenefits;
}

export interface SystemStateSnapshot {
  healthScore: number;
  cpuUsagePercent: number;
  memoryUsageMB: number;
  diskFreeSpaceMB: number;
  startupTimeSeconds: number;
  browserResponsiveness: number;
  privacyScore: number;
  thermalScore: number;
  batteryEstimateHours: number;
  stabilityScore: number;
  timestamp: number;
}

// ── Learning ─────────────────────────────────────────────────────────

export interface OptimizationLearningData {
  acceptedOptimizations: AcceptanceRecord[];
  rejectedRecommendations: RejectionRecord[];
  preferredStyle: OptimizationStyle;
  typicalUsageTime: string;
  totalOptimizations: number;
  averageHealthScoreGain: number;
  mostFrequentCategories: OptimizationCategory[];
  lastOptimizedAt: number | null;
}

export interface AcceptanceRecord {
  actionType: OptimizationActionType;
  category: OptimizationCategory;
  timestamp: number;
  benefitRealized: Partial<OptimizationBenefits>;
}

export interface RejectionRecord {
  actionType: OptimizationActionType;
  category: OptimizationCategory;
  timestamp: number;
  reason: string | null;
}

export type OptimizationStyle = 'conservative' | 'balanced' | 'aggressive' | 'minimal';

// ── Insights ─────────────────────────────────────────────────────────

export interface OptimizationInsight {
  id: string;
  title: string;
  explanation: string;
  whyNow: string;
  evidence: OptimizationEvidence[];
  expectedImprovement: string;
  whatHappensIfSkipped: string;
  confidence: number;
  impactTier: OptimizationImpactTier;
  category: OptimizationCategory;
}

// ── Dashboard ────────────────────────────────────────────────────────

export interface OptimizationDashboardData {
  summary: OptimizationDashboardSummary;
  topRecommendations: OptimizationDashboardEntry[];
  recentOptimizations: OptimizationDashboardEntry[];
  healthTrend: HealthTrendPoint[];
  insights: OptimizationInsight[];
  lastOptimizationAt: number | null;
}

export interface OptimizationDashboardSummary {
  currentHealthScore: number;
  potentialHealthScore: number;
  totalAvailableActions: number;
  highImpactActions: number;
  estimatedTotalRecoveryMB: number;
  estimatedStartupImprovementMs: number;
  estimatedDurationSeconds: number;
  rollbackAvailable: boolean;
}

export interface OptimizationDashboardEntry {
  id: string;
  title: string;
  category: OptimizationCategory;
  impactTier: OptimizationImpactTier;
  estimatedBenefit: string;
  riskLevel: RiskLevel;
  rollbackAvailable: boolean;
  status: OptimizationActionStatus;
}

export interface HealthTrendPoint {
  timestamp: number;
  healthScore: number;
  label: string;
}

// ── Configuration ────────────────────────────────────────────────────

export interface OptimizationConfiguration {
  maxActions: number;
  maxHighImpactActions: number;
  minConfidence: number;
  riskTolerance: RiskLevel;
  enableRollback: boolean;
  enableSimulation: boolean;
  enableLearning: boolean;
  enableInsights: boolean;
  enableDashboard: boolean;
  enableApprovalFlow: boolean;
  autoApproveLowRisk: boolean;
  planExpiryMinutes: number;
  preferredStyle: OptimizationStyle;
  excludedCategories: OptimizationCategory[];
  thresholds: OptimizationThresholds;
}

export interface OptimizationThresholds {
  highImpactScore: number;
  mediumImpactScore: number;
  lowImpactScore: number;
  maxRiskScore: number;
  minBenefitToInclude: number;
  maxDurationSeconds: number;
  confidenceHigh: number;
  confidenceMedium: number;
}

// ── Events ───────────────────────────────────────────────────────────

export type OptimizationEvent =
  | { type: 'plan_generated'; planId: string; actionCount: number }
  | { type: 'plan_expired'; planId: string }
  | { type: 'action_approved'; actionId: string; planId: string }
  | { type: 'action_rejected'; actionId: string; planId: string; reason?: string }
  | { type: 'execution_started'; planId: string }
  | { type: 'action_executing'; actionId: string; planId: string }
  | { type: 'action_completed'; actionId: string; planId: string; durationMs: number }
  | { type: 'action_failed'; actionId: string; planId: string; error: string }
  | { type: 'execution_completed'; planId: string; successCount: number; failureCount: number }
  | { type: 'rollback_started'; actionId: string; planId: string }
  | { type: 'rollback_completed'; actionId: string; planId: string }
  | { type: 'high_impact_detected'; actionId: string; category: OptimizationCategory }
  | { type: 'unsafe_action_blocked'; actionId: string; reason: string }
  | { type: 'learning_updated'; totalOptimizations: number };

// ── Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfiguration = {
  maxActions: 25,
  maxHighImpactActions: 10,
  minConfidence: 0.4,
  riskTolerance: 'moderate',
  enableRollback: true,
  enableSimulation: true,
  enableLearning: true,
  enableInsights: true,
  enableDashboard: true,
  enableApprovalFlow: true,
  autoApproveLowRisk: true,
  planExpiryMinutes: 30,
  preferredStyle: 'balanced',
  excludedCategories: [],
  thresholds: {
    highImpactScore: 60,
    mediumImpactScore: 30,
    lowImpactScore: 10,
    maxRiskScore: 70,
    minBenefitToInclude: 5,
    maxDurationSeconds: 600,
    confidenceHigh: 0.8,
    confidenceMedium: 0.5,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

export function confidenceToLabel(confidence: number): string {
  if (confidence >= 0.8) return 'very_high';
  if (confidence >= 0.6) return 'high';
  if (confidence >= 0.4) return 'medium';
  if (confidence >= 0.2) return 'low';
  return 'very_low';
}

export function severityToRisk(severity: FindingSeverity): RiskLevel {
  switch (severity) {
    case 'critical': return 'severe';
    case 'high': return 'high';
    case 'medium': return 'moderate';
    case 'low': return 'low';
    default: return 'none';
  }
}

export function riskToScore(risk: RiskLevel): number {
  switch (risk) {
    case 'severe': return 90;
    case 'high': return 70;
    case 'moderate': return 40;
    case 'low': return 15;
    default: return 0;
  }
}

export function emptyBenefits(): OptimizationBenefits {
  return {
    performanceImprovement: 0,
    storageRecoveryMB: 0,
    ramRecoveryMB: 0,
    startupImprovementMs: 0,
    privacyImprovement: 0,
    batteryImprovement: 0,
    thermalImprovement: 0,
    stabilityImpact: 0,
  };
}

export function mergeBenefits(a: OptimizationBenefits, b: OptimizationBenefits): OptimizationBenefits {
  return {
    performanceImprovement: a.performanceImprovement + b.performanceImprovement,
    storageRecoveryMB: a.storageRecoveryMB + b.storageRecoveryMB,
    ramRecoveryMB: a.ramRecoveryMB + b.ramRecoveryMB,
    startupImprovementMs: a.startupImprovementMs + b.startupImprovementMs,
    privacyImprovement: a.privacyImprovement + b.privacyImprovement,
    batteryImprovement: a.batteryImprovement + b.batteryImprovement,
    thermalImprovement: a.thermalImprovement + b.thermalImprovement,
    stabilityImpact: a.stabilityImpact + b.stabilityImpact,
  };
}

export function makeEvidence(
  source: SourceModuleId,
  metric: string,
  value: string,
  unit?: string,
  confidence: number = 0.8,
): OptimizationEvidence {
  return { source, metric, value, unit, timestamp: Date.now(), confidence };
}
