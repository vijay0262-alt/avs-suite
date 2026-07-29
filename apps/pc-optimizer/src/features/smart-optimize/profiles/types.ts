/**
 * Smart Optimize 2.0 — Optimization Profile Engine Type Definitions
 *
 * EPIC 4 PHASE A PART 2 — Optimization Profile Engine.
 *
 * Creates configurable optimization profiles that the Smart Planner consumes.
 * Profiles describe optimization intent, constraints, priorities, and execution policies.
 * Profiles are configurable and extensible — no hardcoded profile logic.
 *
 * Architecture:
 *   Device Profile → Optimization Goal → Optimization Profile →
 *   Planner → Optimization Plan → Execution Pipeline
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every profile, policy, and constraint
 *    must be traceable and configurable, with no hardcoded behavior."
 */
import type { OptimizationGoal, OptimizationStrategy, RiskLevel, RecommendationCategory, DeviceProfileType, PerformanceTier, WorkloadType } from '../planner/types';

// Re-export for convenience
export type { OptimizationGoal, OptimizationStrategy, RiskLevel, RecommendationCategory, DeviceProfileType, PerformanceTier, WorkloadType } from '../planner/types';

// ── Profile Category ─────────────────────────────────────────

export type ProfileCategory =
  | 'balanced'
  | 'performance'
  | 'gaming'
  | 'creator'
  | 'developer'
  | 'trading'
  | 'business'
  | 'privacy'
  | 'storage'
  | 'battery'
  | 'maintenance'
  | 'safe_mode'
  | 'custom'
  | 'future_profile';

// ── Profile Priority ─────────────────────────────────────────

export type ProfilePriority = 'low' | 'medium' | 'high' | 'critical';

// ── Risk Tolerance ───────────────────────────────────────────

export type RiskTolerance = 'none' | 'low' | 'medium' | 'high' | 'extreme';

// ── Confirmation Policy ──────────────────────────────────────

export type ConfirmationPolicyType =
  | 'never'
  | 'low_risk_only'
  | 'medium_risk_and_above'
  | 'high_risk_only'
  | 'always'
  | 'custom';

// ── Rollback Policy ──────────────────────────────────────────

export type RollbackPolicyType =
  | 'never'
  | 'on_failure'
  | 'on_error'
  | 'always'
  | 'custom';

// ── Scheduling Policy ────────────────────────────────────────

export type SchedulingPolicyType =
  | 'immediate'
  | 'scheduled'
  | 'idle'
  | 'background'
  | 'manual'
  | 'custom';

// ── Notification Policy ──────────────────────────────────────

export type NotificationPolicyType =
  | 'none'
  | 'minimal'
  | 'standard'
  | 'verbose'
  | 'custom';

// ── Background Allowed ───────────────────────────────────────

export type BackgroundMode = 'never' | 'allowed' | 'preferred' | 'required';

// ── Optimization Priority Weights ────────────────────────────

export interface OptimizationPriorityWeights {
  performance: number;
  storage: number;
  privacy: number;
  startup: number;
  memory: number;
  battery: number;
  health: number;
  stability: number;
  maintenance: number;
  security: number;
}

// ── Policies ─────────────────────────────────────────────────

export interface ExecutionPolicy {
  maxParallelActions: number;
  timeoutSeconds: number;
  retryCount: number;
  retryDelaySeconds: number;
  stopOnError: boolean;
  continueOnWarning: boolean;
}

export interface SafetyPolicy {
  maxRiskLevel: RiskLevel;
  requireRollback: boolean;
  protectedCategories: RecommendationCategory[];
  allowUnsafeActions: boolean;
  skipHighRiskActions: boolean;
}

export interface ConfirmationPolicy {
  type: ConfirmationPolicyType;
  riskThreshold: RiskLevel;
  requireForAllActions: boolean;
  requireForFirstRun: boolean;
}

export interface SchedulingPolicy {
  type: SchedulingPolicyType;
  preferredTime: string | null;
  maxDelayMinutes: number;
  allowBackground: boolean;
  backgroundMode: BackgroundMode;
}

export interface RiskPolicy {
  tolerance: RiskTolerance;
  maxOverallRisk: RiskLevel;
  autoExcludeCritical: boolean;
  warnOnHighRisk: boolean;
}

export interface RollbackPolicy {
  type: RollbackPolicyType;
  autoRollbackOnFailure: boolean;
  requireRollbackCapability: boolean;
  maxRollbackTimeSeconds: number;
}

export interface NotificationPolicy {
  type: NotificationPolicyType;
  notifyOnStart: boolean;
  notifyOnComplete: boolean;
  notifyOnError: boolean;
  notifyOnRollback: boolean;
}

export interface EnterprisePolicy {
  enforceProfiles: boolean;
  allowedProfiles: string[];
  blockedProfiles: string[];
  requireApproval: boolean;
  maxDurationMinutes: number;
  customRules: Record<string, unknown>;
}

export interface ProfilePolicies {
  execution: ExecutionPolicy;
  safety: SafetyPolicy;
  confirmation: ConfirmationPolicy;
  scheduling: SchedulingPolicy;
  risk: RiskPolicy;
  rollback: RollbackPolicy;
  notification: NotificationPolicy;
  enterprise: EnterprisePolicy;
}

// ── Constraints ──────────────────────────────────────────────

export interface ProfileConstraints {
  maxDurationMinutes: number;
  maxRiskLevel: RiskLevel;
  requireRollback: boolean;
  requireConfirmation: boolean;
  allowedCategories: RecommendationCategory[];
  blockedCategories: RecommendationCategory[];
  subscriptionRequirements: string[];
  capabilityRequirements: string[];
}

// ── Optimization Profile ─────────────────────────────────────

export interface OptimizationProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ProfileCategory;
  priority: ProfilePriority;
  optimizationGoal: OptimizationGoal;
  preferredStrategy: OptimizationStrategy;
  preferredModules: string[];
  excludedModules: string[];
  riskTolerance: RiskTolerance;
  estimatedDuration: number;
  backgroundAllowed: boolean;
  priorityWeights: OptimizationPriorityWeights;
  policies: ProfilePolicies;
  constraints: ProfileConstraints;
  isBuiltIn: boolean;
  isCustom: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Profile Resolution ───────────────────────────────────────

export interface ProfileResolutionContext {
  goal: OptimizationGoal;
  deviceProfileType: DeviceProfileType;
  performanceTier: PerformanceTier;
  primaryWorkload: WorkloadType;
  recommendationCategories: RecommendationCategory[];
  optimizationHistory: ProfileHistoryEntry[];
  userPreferences: ProfileUserPreferences | null;
  enterprisePolicies: EnterprisePolicy | null;
}

export interface ProfileUserPreferences {
  preferredCategory: ProfileCategory | null;
  riskTolerance: RiskTolerance;
  preferredCategories: RecommendationCategory[];
  excludedCategories: RecommendationCategory[];
  schedulingPreference: SchedulingPolicyType;
}

export interface ProfileResolutionResult {
  profile: OptimizationProfile;
  score: number;
  reason: string;
  alternatives: ProfileScoreEntry[];
}

export interface ProfileScoreEntry {
  profileId: string;
  profileName: string;
  score: number;
  reason: string;
}

// ── Profile Comparison ───────────────────────────────────────

export interface ProfileComparison {
  id: string;
  profileAId: string;
  profileBId: string;
  generatedAt: string;
  durationDelta: number;
  riskDelta: string;
  priorityWeightDeltas: Partial<OptimizationPriorityWeights>;
  summary: string;
  winner: 'a' | 'b' | 'tie';
}

// ── Profile Statistics ───────────────────────────────────────

export interface ProfileStatistics {
  totalProfiles: number;
  builtInProfiles: number;
  customProfiles: number;
  byCategory: Record<string, number>;
  byGoal: Record<string, number>;
  mostUsedProfile: string | null;
  averageDuration: number;
  averageRiskTolerance: string;
}

// ── Profile History ──────────────────────────────────────────

export interface ProfileHistoryEntry {
  id: string;
  profileId: string;
  action: ProfileHistoryAction;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export type ProfileHistoryAction =
  | 'registered'
  | 'selected'
  | 'resolved'
  | 'updated'
  | 'deleted'
  | 'validated'
  | 'created_custom'
  | 'compared';

// ── Events ───────────────────────────────────────────────────

export type ProfileEventType =
  | 'profile_registered'
  | 'profile_selected'
  | 'profile_resolved'
  | 'profile_updated'
  | 'profile_deleted'
  | 'profile_validated';

export interface ProfileEvent {
  type: ProfileEventType;
  profileId: string;
  timestamp: string;
  data: unknown;
}

export type ProfileEventListener = (event: ProfileEvent) => void;

// ── Validation ───────────────────────────────────────────────

export interface ProfileValidationResult {
  valid: boolean;
  errors: ProfileValidationError[];
  warnings: ProfileValidationWarning[];
}

export interface ProfileValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ProfileValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Configuration ────────────────────────────────────────────

export interface ProfileConfiguration {
  configVersion: string;
  defaultPriorityWeights: OptimizationPriorityWeights;
  defaultPolicies: ProfilePolicies;
  defaultConstraints: ProfileConstraints;
  resolutionRules: ResolutionRules;
  featureFlags: ProfileFeatureFlags;
  enableEvents: boolean;
  maxHistoryEntries: number;
  maxCustomProfiles: number;
}

export interface ResolutionRules {
  goalWeight: number;
  deviceProfileWeight: number;
  workloadWeight: number;
  historyWeight: number;
  preferenceWeight: number;
  enterpriseWeight: number;
  minScore: number;
}

export interface ProfileFeatureFlags {
  enableCustomProfiles: boolean;
  enableProfileComparison: boolean;
  enableEnterprisePolicies: boolean;
  enableHistory: boolean;
  enableValidation: boolean;
  futureFlags: Record<string, boolean>;
}

// ── Provider Plugin (Extensibility) ──────────────────────────

export interface ProfileProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getProfile(): OptimizationProfile;
}

// ── Helper Functions ─────────────────────────────────────────

export function createDefaultPriorityWeights(): OptimizationPriorityWeights {
  return {
    performance: 0.5,
    storage: 0.5,
    privacy: 0.5,
    startup: 0.5,
    memory: 0.5,
    battery: 0.5,
    health: 0.5,
    stability: 0.5,
    maintenance: 0.5,
    security: 0.5,
  };
}

export function createDefaultPolicies(): ProfilePolicies {
  return {
    execution: {
      maxParallelActions: 3,
      timeoutSeconds: 300,
      retryCount: 2,
      retryDelaySeconds: 5,
      stopOnError: true,
      continueOnWarning: true,
    },
    safety: {
      maxRiskLevel: 'medium',
      requireRollback: true,
      protectedCategories: [],
      allowUnsafeActions: false,
      skipHighRiskActions: true,
    },
    confirmation: {
      type: 'medium_risk_and_above',
      riskThreshold: 'medium',
      requireForAllActions: false,
      requireForFirstRun: true,
    },
    scheduling: {
      type: 'immediate',
      preferredTime: null,
      maxDelayMinutes: 60,
      allowBackground: true,
      backgroundMode: 'allowed',
    },
    risk: {
      tolerance: 'medium',
      maxOverallRisk: 'high',
      autoExcludeCritical: true,
      warnOnHighRisk: true,
    },
    rollback: {
      type: 'on_failure',
      autoRollbackOnFailure: true,
      requireRollbackCapability: true,
      maxRollbackTimeSeconds: 120,
    },
    notification: {
      type: 'standard',
      notifyOnStart: true,
      notifyOnComplete: true,
      notifyOnError: true,
      notifyOnRollback: true,
    },
    enterprise: {
      enforceProfiles: false,
      allowedProfiles: [],
      blockedProfiles: [],
      requireApproval: false,
      maxDurationMinutes: 30,
      customRules: {},
    },
  };
}

export function createDefaultConstraints(): ProfileConstraints {
  return {
    maxDurationMinutes: 30,
    maxRiskLevel: 'high',
    requireRollback: true,
    requireConfirmation: false,
    allowedCategories: [],
    blockedCategories: [],
    subscriptionRequirements: [],
    capabilityRequirements: [],
  };
}

export function createDefaultProfileConfiguration(): ProfileConfiguration {
  return {
    configVersion: '1.0.0',
    defaultPriorityWeights: createDefaultPriorityWeights(),
    defaultPolicies: createDefaultPolicies(),
    defaultConstraints: createDefaultConstraints(),
    resolutionRules: {
      goalWeight: 0.3,
      deviceProfileWeight: 0.2,
      workloadWeight: 0.15,
      historyWeight: 0.1,
      preferenceWeight: 0.15,
      enterpriseWeight: 0.1,
      minScore: 0.3,
    },
    featureFlags: {
      enableCustomProfiles: true,
      enableProfileComparison: true,
      enableEnterprisePolicies: true,
      enableHistory: true,
      enableValidation: true,
      futureFlags: {},
    },
    enableEvents: true,
    maxHistoryEntries: 500,
    maxCustomProfiles: 20,
  };
}

export function generateProfileId(): string {
  return `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateProfileComparisonId(): string {
  return `profcmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateProfileHistoryId(): string {
  return `profhist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function riskToleranceToScore(tolerance: RiskTolerance): number {
  const scores: Record<RiskTolerance, number> = { none: 0, low: 0.25, medium: 0.5, high: 0.75, extreme: 1.0 };
  return scores[tolerance] ?? 0.5;
}

export function profilePriorityToScore(priority: ProfilePriority): number {
  const scores: Record<ProfilePriority, number> = { low: 0.3, medium: 0.5, high: 0.7, critical: 1.0 };
  return scores[priority] ?? 0.5;
}
