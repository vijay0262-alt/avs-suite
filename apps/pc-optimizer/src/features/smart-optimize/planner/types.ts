/**
 * Smart Optimize 2.0 — Personalized Optimization Planner Type Definitions
 *
 * EPIC 4 PHASE A PART 1 — Smart Optimize 2.0.
 *
 * Transforms AI recommendations into device-specific optimization plans.
 * Plans adapt to: Device Profile, Current System State, Predictions,
 * Optimization History, User Preferences, Safety Policies.
 *
 * The planner NEVER produces identical plans for every computer.
 * The planner NEVER executes optimizations.
 * Execution remains delegated to the Execution Pipeline.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every plan, action, and estimate
 *    must be traceable back to recommendations, device profile, and predictions,
 *    with a confidence score."
 */
import type { Recommendation, RecommendationPriority, RecommendationCategory, RiskLevel } from '../../ai-intelligence/recommendations/types';
import type { DeviceProfile, DeviceProfileType, PerformanceTier, WorkloadType } from '../../ai-intelligence/device-profile/types';
import type { PredictionList } from '../../ai-intelligence/predictions/types';

// Re-export for convenience
export type { Recommendation, RecommendationPriority, RecommendationCategory, RiskLevel } from '../../ai-intelligence/recommendations/types';
export type { DeviceProfile, DeviceProfileType, PerformanceTier, WorkloadType } from '../../ai-intelligence/device-profile/types';
export type { PredictionList } from '../../ai-intelligence/predictions/types';

// ── Optimization Goals ───────────────────────────────────────

export type OptimizationGoal =
  | 'quick_boost'
  | 'maximum_performance'
  | 'storage_recovery'
  | 'privacy_protection'
  | 'startup_optimization'
  | 'battery_optimization'
  | 'routine_maintenance'
  | 'gaming_preparation'
  | 'creator_workflow'
  | 'business_productivity'
  | 'balanced'
  | 'custom'
  | 'future_goal';

// ── Planning Strategies ──────────────────────────────────────

export type OptimizationStrategy =
  | 'aggressive'
  | 'balanced'
  | 'conservative'
  | 'safe_only'
  | 'performance_first'
  | 'storage_first'
  | 'privacy_first'
  | 'custom';

// ── Smart Plan ───────────────────────────────────────────────

export interface SmartPlan {
  id: string;
  title: string;
  summary: string;
  generatedAt: string;
  expiresAt: string;
  deviceProfile: DeviceProfileSnapshot;
  optimizationGoal: OptimizationGoal;
  strategy: OptimizationStrategy;
  estimatedDuration: number;
  estimatedBenefits: SmartPlanBenefits;
  estimatedRisk: RiskLevel;
  confidence: number;
  priority: RecommendationPriority;
  recommendedActions: SmartPlanAction[];
  deferredActions: SmartPlanAction[];
  excludedActions: ExcludedAction[];
  rollbackAvailable: boolean;
  requiresConfirmation: boolean;
  safetyAssessment: SafetyAssessment;
  eligibilityResult: EligibilityResult;
  futureMetadata: Record<string, unknown>;
}

// ── Device Profile Snapshot ──────────────────────────────────

export interface DeviceProfileSnapshot {
  profileType: DeviceProfileType;
  performanceTier: PerformanceTier;
  primaryWorkload: WorkloadType;
  deviceName: string;
  confidenceScore: number;
}

// ── Smart Plan Benefits ──────────────────────────────────────

export interface SmartPlanBenefits {
  estimatedHealthGain: number;
  estimatedStorageRecovery: number;
  estimatedPerformanceGain: number;
  estimatedPrivacyGain: number;
  estimatedStartupGain: number;
  estimatedTimeSaved: number;
}

// ── Smart Plan Action ────────────────────────────────────────

export interface SmartPlanAction {
  id: string;
  recommendationId: string;
  title: string;
  description: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  estimatedDuration: number;
  estimatedBenefit: string;
  riskLevel: RiskLevel;
  confidence: number;
  rollbackAvailable: boolean;
  priorityScore: number;
  dependencies: string[];
  predictedImpact: number;
  futureLearningWeight: number;
}

// ── Excluded Action ──────────────────────────────────────────

export interface ExcludedAction {
  id: string;
  title: string;
  reason: string;
  category: RecommendationCategory;
}

// ── Safety Assessment ────────────────────────────────────────

export interface SafetyAssessment {
  overallRisk: RiskLevel;
  confirmationRequired: boolean;
  rollbackAvailable: boolean;
  protectedAreas: string[];
  unsafeActions: string[];
  skippedActions: string[];
  riskScore: number;
}

// ── Eligibility Result ───────────────────────────────────────

export interface EligibilityResult {
  eligible: boolean;
  eligibleActions: string[];
  ineligibleActions: EligibilityIssue[];
}

export interface EligibilityIssue {
  actionId: string;
  title: string;
  reason: string;
  code: string;
}

// ── Conflict Resolution ──────────────────────────────────────

export interface ConflictResolutionResult {
  conflicts: Conflict[];
  resolvedConflicts: ResolvedConflict[];
  unresolvedConflicts: Conflict[];
}

export interface Conflict {
  type: 'duplicate' | 'conflicting' | 'dependency_violation' | 'mutually_exclusive' | 'unsupported_module';
  actionIds: string[];
  description: string;
}

export interface ResolvedConflict {
  conflict: Conflict;
  resolution: string;
  resolvedActionIds: string[];
}

// ── Plan Comparison ──────────────────────────────────────────

export interface SmartPlanComparison {
  id: string;
  planAId: string;
  planBId: string;
  generatedAt: string;
  healthDelta: number;
  storageDelta: number;
  performanceDelta: number;
  privacyDelta: number;
  durationDelta: number;
  riskDelta: string;
  confidenceDelta: number;
  summary: string;
  winner: 'a' | 'b' | 'tie';
}

// ── Planner Statistics ───────────────────────────────────────

export interface PlannerStatistics {
  totalPlans: number;
  byGoal: Record<string, number>;
  byStrategy: Record<string, number>;
  averageDuration: number;
  averageConfidence: number;
  averageRiskScore: number;
  totalActionsRecommended: number;
  totalActionsDeferred: number;
  totalActionsExcluded: number;
}

// ── Planner History ──────────────────────────────────────────

export interface PlannerHistoryEntry {
  id: string;
  planId: string;
  action: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Events ───────────────────────────────────────────────────

export type PlannerEventType =
  | 'smart_plan_generated'
  | 'strategy_selected'
  | 'plan_validated'
  | 'plan_rejected'
  | 'plan_expired'
  | 'plan_compared';

export interface PlannerEvent {
  type: PlannerEventType;
  planId: string;
  timestamp: string;
  data: unknown;
}

export type PlannerEventListener = (event: PlannerEvent) => void;

// ── Configuration ────────────────────────────────────────────

export interface StrategyRule {
  maxRiskLevel: RiskLevel;
  minConfidence: number;
  requireRollback: boolean;
  allowUnsafeActions: boolean;
  maxDuration: number;
  priorityWeight: number;
}

export interface StrategyRules {
  aggressive: StrategyRule;
  balanced: StrategyRule;
  conservative: StrategyRule;
  safe_only: StrategyRule;
  performance_first: StrategyRule;
  storage_first: StrategyRule;
  privacy_first: StrategyRule;
  custom: StrategyRule;
}

export interface PlanningRules {
  maxActions: number;
  maxDeferredActions: number;
  planExpiryHours: number;
  requireDeviceProfile: boolean;
  requirePredictions: boolean;
  minRecommendationConfidence: number;
}

export interface PriorityWeights {
  benefitWeight: number;
  riskWeight: number;
  confidenceWeight: number;
  timeWeight: number;
  dependencyWeight: number;
  predictedImpactWeight: number;
  futureLearningWeight: number;
}

export interface RiskThresholds {
  maxOverallRisk: RiskLevel;
  confirmationThreshold: RiskLevel;
  exclusionThreshold: RiskLevel;
  protectedCategories: RecommendationCategory[];
}

export interface EligibilityRules {
  checkCapabilities: boolean;
  checkSubscription: boolean;
  checkQuota: boolean;
  checkPermissions: boolean;
  checkSystemState: boolean;
  checkDependencies: boolean;
  checkSafetyPolicies: boolean;
}

export interface PlannerFeatureFlags {
  enableConflictResolution: boolean;
  enableSafetyAnalysis: boolean;
  enableEligibilityValidation: boolean;
  enableHistoryAnalysis: boolean;
  enablePredictions: boolean;
  enableDeviceProfile: boolean;
  enablePlanComparison: boolean;
  futureFlags: Record<string, boolean>;
}

export interface PlannerConfiguration {
  configVersion: string;
  strategyRules: StrategyRules;
  planningRules: PlanningRules;
  priorityWeights: PriorityWeights;
  riskThresholds: RiskThresholds;
  eligibilityRules: EligibilityRules;
  featureFlags: PlannerFeatureFlags;
  enableEvents: boolean;
  maxHistoryEntries: number;
}

// ── Planning Context ─────────────────────────────────────────

export interface PlanningContext {
  recommendations: Recommendation[];
  deviceProfile: DeviceProfile | null;
  predictions: PredictionList | null;
  currentHealth: number | null;
  optimizationHistory: OptimizationHistoryEntry[];
  systemLoad: SystemLoad | null;
  userPreferences: UserPreferences | null;
}

export interface OptimizationHistoryEntry {
  planId: string;
  executedAt: string;
  goal: OptimizationGoal;
  actionsCompleted: string[];
  actionsSkipped: string[];
  healthBefore: number | null;
  healthAfter: number | null;
  successRate: number;
}

export interface SystemLoad {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  isIdle: boolean;
}

export interface UserPreferences {
  preferredStrategy: OptimizationStrategy;
  riskTolerance: 'low' | 'medium' | 'high';
  preferredCategories: RecommendationCategory[];
  excludedCategories: RecommendationCategory[];
}

// ── Validation ───────────────────────────────────────────────

export interface PlanValidationResult {
  valid: boolean;
  errors: PlanValidationError[];
  warnings: PlanValidationWarning[];
}

export interface PlanValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface PlanValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Provider Plugin (Extensibility) ──────────────────────────

export interface OptimizationProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  generateActions(context: PlanningContext, config: PlannerConfiguration): SmartPlanAction[];
}

// ── Helper Functions ─────────────────────────────────────────

export function createDefaultPlannerConfiguration(): PlannerConfiguration {
  return {
    configVersion: '1.0.0',
    strategyRules: {
      aggressive: { maxRiskLevel: 'high', minConfidence: 0.5, requireRollback: false, allowUnsafeActions: true, maxDuration: 600, priorityWeight: 1.0 },
      balanced: { maxRiskLevel: 'medium', minConfidence: 0.6, requireRollback: true, allowUnsafeActions: false, maxDuration: 300, priorityWeight: 0.8 },
      conservative: { maxRiskLevel: 'low', minConfidence: 0.7, requireRollback: true, allowUnsafeActions: false, maxDuration: 180, priorityWeight: 0.6 },
      safe_only: { maxRiskLevel: 'none', minConfidence: 0.8, requireRollback: true, allowUnsafeActions: false, maxDuration: 120, priorityWeight: 0.5 },
      performance_first: { maxRiskLevel: 'medium', minConfidence: 0.6, requireRollback: true, allowUnsafeActions: false, maxDuration: 300, priorityWeight: 0.9 },
      storage_first: { maxRiskLevel: 'low', minConfidence: 0.7, requireRollback: true, allowUnsafeActions: false, maxDuration: 240, priorityWeight: 0.7 },
      privacy_first: { maxRiskLevel: 'low', minConfidence: 0.7, requireRollback: true, allowUnsafeActions: false, maxDuration: 240, priorityWeight: 0.7 },
      custom: { maxRiskLevel: 'medium', minConfidence: 0.6, requireRollback: true, allowUnsafeActions: false, maxDuration: 300, priorityWeight: 0.8 },
    },
    planningRules: {
      maxActions: 15,
      maxDeferredActions: 10,
      planExpiryHours: 1,
      requireDeviceProfile: true,
      requirePredictions: false,
      minRecommendationConfidence: 0.5,
    },
    priorityWeights: {
      benefitWeight: 0.3,
      riskWeight: 0.2,
      confidenceWeight: 0.2,
      timeWeight: 0.1,
      dependencyWeight: 0.05,
      predictedImpactWeight: 0.1,
      futureLearningWeight: 0.05,
    },
    riskThresholds: {
      maxOverallRisk: 'high',
      confirmationThreshold: 'medium',
      exclusionThreshold: 'critical',
      protectedCategories: [],
    },
    eligibilityRules: {
      checkCapabilities: true,
      checkSubscription: true,
      checkQuota: true,
      checkPermissions: true,
      checkSystemState: true,
      checkDependencies: true,
      checkSafetyPolicies: true,
    },
    featureFlags: {
      enableConflictResolution: true,
      enableSafetyAnalysis: true,
      enableEligibilityValidation: true,
      enableHistoryAnalysis: true,
      enablePredictions: true,
      enableDeviceProfile: true,
      enablePlanComparison: true,
      futureFlags: {},
    },
    enableEvents: true,
    maxHistoryEntries: 500,
  };
}

export function generateSmartPlanId(): string {
  return `smartplan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateComparisonId(): string {
  return `smartcmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generatePlannerHistoryId(): string {
  return `plhist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function riskToScore(risk: RiskLevel): number {
  const scores: Record<RiskLevel, number> = { none: 0, low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
  return scores[risk] ?? 0;
}

export function priorityToScore(priority: RecommendationPriority): number {
  const scores: Record<RecommendationPriority, number> = { critical: 1.0, high: 0.8, medium: 0.6, low: 0.4, informational: 0.2 };
  return scores[priority] ?? 0.5;
}
