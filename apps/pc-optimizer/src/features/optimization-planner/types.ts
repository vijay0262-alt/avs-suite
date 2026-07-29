/**
 * Optimization Planner — Type Definitions
 *
 * The planner converts AI Health Engine analysis into structured,
 * explainable optimization plans. It NEVER executes changes —
 * it only creates plans describing what should be optimized, why,
 * and what the expected benefits are.
 *
 * This module is read-only with respect to all other systems.
 * It reads health reports, execution history, and capabilities
 * but never modifies any service, engine, or configuration.
 */
import type {
  HealthReport,
  HealthCategoryId,
  Severity,
  RecommendationPriority,
  RiskLevel,
} from '../ai-health-engine/types';
import type { ExecutionRecord, ExecutionStatistics } from '../maintenance-history/types';
import type { CapabilityInfo } from '../config-sync/types';

// ── Plan Types ────────────────────────────────────────────────

/**
 * Predefined optimization plan profiles.
 * Each profile filters and prioritizes categories differently.
 */
export type PlanType =
  | 'quick'
  | 'balanced'
  | 'deep'
  | 'privacy'
  | 'storage'
  | 'custom';

/**
 * Categories included in each plan type.
 */
export const PLAN_TYPE_CATEGORIES: Record<PlanType, HealthCategoryId[] | '*'> = {
  quick: ['temp_files', 'recycle_bin'],
  balanced: ['temp_files', 'recycle_bin', 'browser', 'privacy'],
  deep: '*',
  privacy: ['browser', 'privacy'],
  storage: ['temp_files', 'recycle_bin', 'storage'],
  custom: '*',
};

// ── Optimization Item ─────────────────────────────────────────

/**
 * A single optimization action within a plan.
 */
export interface OptimizationItem {
  /** Unique item ID within the plan. */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Detailed description of what this optimization does. */
  description: string;
  /** Health category this item targets. */
  category: HealthCategoryId;
  /** Priority level. */
  priority: RecommendationPriority;
  /** Estimated benefit to the health score (0–100). */
  estimatedBenefit: number;
  /** Estimated duration in seconds. */
  estimatedDurationSeconds: number;
  /** Estimated space recovery in bytes. */
  estimatedSpaceRecovery: number;
  /** Risk level of performing this optimization. */
  risk: RiskLevel;
  /** Required capability/feature key for licensing gates (null = free). */
  requiredCapability: string | null;
  /** Required maintenance task ID (from the task registry). */
  requiredTask: string | null;
  /** Whether the user can skip this item. */
  canBeSkipped: boolean;
  /** Item IDs that must execute before this one. */
  dependencies: string[];
  /** Whether this item is locked (capability unavailable). */
  isLocked: boolean;
  /** Reason for being locked, if applicable. */
  lockedReason: string | null;
  /** Whether this item was skipped by the plan filter. */
  isSkipped: boolean;
  /** Reason for being skipped, if applicable. */
  skippedReason: string | null;
}

// ── Optimization Plan ─────────────────────────────────────────

/**
 * A complete optimization plan produced by the planner.
 */
export interface OptimizationPlan {
  /** Unique plan ID. */
  planId: string;
  /** Plan type. */
  planType: PlanType;
  /** Timestamp of plan generation. */
  generatedAt: string;
  /** Current health score (from the health report). */
  currentHealthScore: number;
  /** Predicted health score after optimization. */
  predictedHealthScore: number;
  /** Total estimated duration in seconds. */
  estimatedDurationSeconds: number;
  /** Total estimated space recovery in bytes. */
  estimatedSpaceRecovery: number;
  /** Estimated performance improvement (0–100 scale). */
  estimatedPerformanceImprovement: number;
  /** Estimated privacy improvement (0–100 scale). */
  estimatedPrivacyImprovement: number;
  /** Overall risk level of the plan. */
  overallRisk: RiskLevel;
  /** Ordered list of optimization items (execution order). */
  executionOrder: string[];
  /** All optimization items (including skipped/locked). */
  items: OptimizationItem[];
  /** Source health report ID. */
  sourceReportId: string;
}

// ── Plan Preview ──────────────────────────────────────────────

/**
 * Human-readable preview of an optimization plan.
 * Used for UI display before the user approves execution.
 */
export interface PlanPreview {
  /** Plan ID this preview belongs to. */
  planId: string;
  /** Summary headline. */
  headline: string;
  /** Current health score. */
  currentHealthScore: number;
  /** Expected health score after optimization. */
  expectedHealthScore: number;
  /** Score improvement. */
  scoreImprovement: number;
  /** Estimated total duration (human-readable). */
  estimatedDuration: string;
  /** Estimated total space recovery (human-readable). */
  estimatedSpaceRecovery: string;
  /** Tasks that will run. */
  tasksWillRun: Array<{ title: string; benefit: string; duration: string }>;
  /** Tasks that are locked (capability unavailable). */
  tasksLocked: Array<{ title: string; reason: string }>;
  /** Tasks that were skipped by the plan filter. */
  tasksSkipped: Array<{ title: string; reason: string }>;
  /** Reasoning behind the prioritization. */
  reasoning: string[];
  /** Key improvements summary. */
  improvements: string[];
}

// ── Planner Input ─────────────────────────────────────────────

/**
 * Input data for the optimization planner.
 */
export interface OptimizationPlannerInput {
  /** Health report from the AI Health Engine. */
  healthReport: HealthReport;
  /** Available capabilities (from config sync). */
  capabilities: {
    available: CapabilityInfo[];
    locked: CapabilityInfo[];
  };
  /** Execution history records. */
  executionHistory: ExecutionRecord[];
  /** Execution statistics. */
  executionStatistics: ExecutionStatistics;
  /** User preferences for plan generation. */
  userPreferences?: PlannerUserPreferences;
  /** Custom categories for custom plan type. */
  customCategories?: HealthCategoryId[];
}

/**
 * User preferences that influence plan generation.
 */
export interface PlannerUserPreferences {
  /** Skip high-risk optimizations. */
  avoidHighRisk: boolean;
  /** Maximum duration in seconds (0 = no limit). */
  maxDurationSeconds: number;
  /** Prioritize privacy improvements. */
  prioritizePrivacy: boolean;
  /** Prioritize storage recovery. */
  prioritizeStorage: boolean;
}

/**
 * Default user preferences.
 */
export const DEFAULT_USER_PREFERENCES: PlannerUserPreferences = {
  avoidHighRisk: false,
  maxDurationSeconds: 0,
  prioritizePrivacy: false,
  prioritizeStorage: false,
};

// ── Events ────────────────────────────────────────────────────

export type OptimizationEventType =
  | 'optimization_plan_started'
  | 'optimization_plan_generated'
  | 'optimization_plan_failed';

export interface OptimizationEventPayloads {
  optimization_plan_started: { planType: PlanType; timestamp: string };
  optimization_plan_generated: { plan: OptimizationPlan };
  optimization_plan_failed: { error: string; timestamp: string };
}

export type OptimizationEventListener = (payload: unknown) => void;

// ── Category → Task Mapping ───────────────────────────────────

/**
 * Maps health categories to maintenance task IDs.
 * Categories without a direct task return null (manual action required).
 */
export const CATEGORY_TASK_MAP: Record<HealthCategoryId, string | null> = {
  storage: 'junk_cleaner',
  performance: null,
  memory: null,
  startup: null,
  browser: 'browser_cleaner',
  privacy: 'browser_cleaner',
  temp_files: 'temp_files_cleaner',
  recycle_bin: 'recycle_bin_cleaner',
  system_updates: null,
  drivers: null,
  security: null,
};

/**
 * Maps health categories to capability IDs.
 * Categories that don't require a paid capability return null.
 */
export const CATEGORY_CAPABILITY_MAP: Record<HealthCategoryId, string | null> = {
  storage: null,
  performance: null,
  memory: null,
  startup: 'startup-manager',
  browser: null,
  privacy: null,
  temp_files: null,
  recycle_bin: null,
  system_updates: null,
  drivers: 'driver-updater',
  security: null,
};

// ── Helper Functions ──────────────────────────────────────────

/**
 * Map a severity to a numeric weight for prioritization.
 */
export function severityToWeight(severity: Severity): number {
  switch (severity) {
    case 'critical': return 100;
    case 'high': return 75;
    case 'medium': return 50;
    case 'low': return 25;
    case 'info': return 10;
  }
}

/**
 * Map a risk level to a numeric weight (higher = riskier).
 */
export function riskToWeight(risk: RiskLevel): number {
  switch (risk) {
    case 'none': return 0;
    case 'low': return 25;
    case 'medium': return 50;
    case 'high': return 100;
  }
}

/**
 * Map a priority to a numeric weight (higher = more important).
 */
export function priorityToWeight(priority: RecommendationPriority): number {
  switch (priority) {
    case 'critical': return 100;
    case 'high': return 75;
    case 'medium': return 50;
    case 'low': return 25;
  }
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format seconds into a human-readable duration string.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `~${Math.round(seconds)} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  if (remaining === 0) return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `~${minutes} min ${remaining} sec`;
}

/**
 * Clamp a value to [0, 100].
 */
export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// ═══════════════════════════════════════════════════════════════
// EPIC 3 PHASE A PART 5 — Optimization Plan Engine
// Consumes Recommendations from AI Intelligence Platform.
// NEVER executes optimizations. Creates plans only.
// ═══════════════════════════════════════════════════════════════

import type {
  Recommendation,
  RecommendationCategory,
  RecommendationPriority as AIRecommendationPriority,
} from '../ai-intelligence/recommendations/types';

// ── Plan Engine Types ─────────────────────────────────────────

export type OptimizationPlanType =
  | 'quick_optimize'
  | 'performance_boost'
  | 'storage_recovery'
  | 'privacy_cleanup'
  | 'startup_optimization'
  | 'maintenance'
  | 'health_recovery'
  | 'deep_optimization'
  | 'custom_plan'
  | 'future_plan';

export type PlanRiskLevel =
  | 'none'
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type PlanStepStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'rolled_back';

// ── Plan Step ─────────────────────────────────────────────────

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  category: RecommendationCategory;
  estimatedDuration: number;
  estimatedBenefit: string;
  riskLevel: PlanRiskLevel;
  rollbackAvailable: boolean;
  rollbackMethod: string | null;
  rollbackConfidence: number;
  estimatedRollbackTime: number;
  relatedRecommendation: string;
  confidence: number;
  status: PlanStepStatus;
  priority: AIRecommendationPriority;
  futureMetadata: Record<string, unknown>;
}

// ── Optimization Plan (Part 5) ────────────────────────────────

export interface OptimizationPlanV2 {
  id: string;
  title: string;
  description: string;
  summary: string;
  generatedAt: string;
  expiresAt: string;
  planType: OptimizationPlanType;
  estimatedDuration: number;
  estimatedHealthGain: number;
  estimatedStorageRecovery: number;
  estimatedPerformanceGain: number;
  estimatedPrivacyGain: number;
  estimatedStartupGain: number;
  estimatedRisk: PlanRiskLevel;
  confidenceScore: number;
  rollbackAvailable: boolean;
  requiresConfirmation: boolean;
  recommendedOrder: string[];
  steps: PlanStep[];
  relatedRecommendations: string[];
  futureMetadata: Record<string, unknown>;
}

// ── Plan Comparison ───────────────────────────────────────────

export interface PlanComparisonEntry {
  planId: string;
  planType: OptimizationPlanType;
  title: string;
  estimatedDuration: number;
  estimatedHealthGain: number;
  estimatedRisk: PlanRiskLevel;
  stepCount: number;
  rollbackAvailable: boolean;
  confidenceScore: number;
}

export interface PlanComparison {
  plans: PlanComparisonEntry[];
  bestForHealth: string | null;
  bestForSpeed: string | null;
  bestForSafety: string | null;
  bestForStorage: string | null;
}

// ── Plan Validation ───────────────────────────────────────────

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Plan Statistics ───────────────────────────────────────────

export interface PlanStatistics {
  totalPlans: number;
  byType: Record<string, number>;
  byRisk: Record<string, number>;
  averageDuration: number;
  averageHealthGain: number;
  averageConfidence: number;
  totalSteps: number;
}

// ── Plan History Entry ────────────────────────────────────────

export interface PlanHistoryEntry {
  id: string;
  planId: string;
  planType: OptimizationPlanType;
  action: 'generated' | 'updated' | 'selected' | 'validated' | 'expired' | 'compared';
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Plan Events ───────────────────────────────────────────────

export type PlanEventType =
  | 'plan_generated'
  | 'plan_updated'
  | 'plan_selected'
  | 'plan_validated'
  | 'plan_expired'
  | 'plan_compared';

export interface PlanEvent {
  type: PlanEventType;
  planId: string;
  timestamp: string;
  data: unknown;
}

export type PlanEventListener = (event: PlanEvent) => void;

// ── Plan Configuration ────────────────────────────────────────

export interface BenefitRules {
  healthGainMultiplier: number;
  storageRecoveryMultiplier: number;
  performanceGainMultiplier: number;
  privacyGainMultiplier: number;
  startupGainMultiplier: number;
  maxHealthGain: number;
  maxStorageRecovery: number;
}

export interface RiskRules {
  defaultRisk: PlanRiskLevel;
  highRiskThreshold: number;
  criticalRiskThreshold: number;
  riskFromSafetyScore: boolean;
}

export interface OrderingRules {
  prioritizeBy: 'priority' | 'benefit' | 'risk' | 'duration';
  groupByCategory: boolean;
  criticalFirst: boolean;
}

export interface PlanFeatureFlags {
  enableQuickOptimize: boolean;
  enablePerformanceBoost: boolean;
  enableStorageRecovery: boolean;
  enablePrivacyCleanup: boolean;
  enableStartupOptimization: boolean;
  enableMaintenance: boolean;
  enableHealthRecovery: boolean;
  enableDeepOptimization: boolean;
  enableCustomPlan: boolean;
  enablePlanComparison: boolean;
  futureFlags: Record<string, boolean>;
}

export interface PlanConfiguration {
  configVersion: string;
  benefitRules: BenefitRules;
  riskRules: RiskRules;
  orderingRules: OrderingRules;
  featureFlags: PlanFeatureFlags;
  enableEvents: boolean;
  planExpiryMinutes: number;
  maxStepsPerPlan: number;
  minConfidenceThreshold: number;
}

// ── Plan Builder Input ────────────────────────────────────────

export interface PlanBuilderInput {
  recommendations: Recommendation[];
  planType: OptimizationPlanType;
  customRecommendationIds?: string[];
  userPreferences?: PlanUserPreferences;
}

export interface PlanUserPreferences {
  avoidHighRisk: boolean;
  maxDurationSeconds: number;
  prioritizePrivacy: boolean;
  prioritizeStorage: boolean;
  prioritizePerformance: boolean;
}

// ── Helper Functions (Part 5) ─────────────────────────────────

export function getPlanTypeLabel(type: OptimizationPlanType): string {
  const labels: Record<OptimizationPlanType, string> = {
    quick_optimize: 'Quick Optimize',
    performance_boost: 'Performance Boost',
    storage_recovery: 'Storage Recovery',
    privacy_cleanup: 'Privacy Cleanup',
    startup_optimization: 'Startup Optimization',
    maintenance: 'Maintenance',
    health_recovery: 'Health Recovery',
    deep_optimization: 'Deep Optimization',
    custom_plan: 'Custom Plan',
    future_plan: 'Future Plan',
  };
  return labels[type] ?? 'Unknown Plan';
}

export function getPlanRiskLabel(risk: PlanRiskLevel): string {
  const labels: Record<PlanRiskLevel, string> = {
    none: 'None',
    very_low: 'Very Low',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };
  return labels[risk] ?? 'Unknown';
}

export function riskToPlanRisk(risk: string): PlanRiskLevel {
  const map: Record<string, PlanRiskLevel> = {
    none: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'critical',
  };
  return map[risk] ?? 'medium';
}

export function planRiskToWeight(risk: PlanRiskLevel): number {
  const weights: Record<PlanRiskLevel, number> = {
    none: 0,
    very_low: 10,
    low: 25,
    medium: 50,
    high: 75,
    critical: 100,
  };
  return weights[risk] ?? 50;
}

export function createDefaultPlanConfiguration(): PlanConfiguration {
  return {
    configVersion: '2.0.0',
    benefitRules: {
      healthGainMultiplier: 1.0,
      storageRecoveryMultiplier: 1.0,
      performanceGainMultiplier: 0.8,
      privacyGainMultiplier: 0.7,
      startupGainMultiplier: 0.6,
      maxHealthGain: 30,
      maxStorageRecovery: 10000,
    },
    riskRules: {
      defaultRisk: 'low',
      highRiskThreshold: 0.3,
      criticalRiskThreshold: 0.1,
      riskFromSafetyScore: true,
    },
    orderingRules: {
      prioritizeBy: 'priority',
      groupByCategory: true,
      criticalFirst: true,
    },
    featureFlags: {
      enableQuickOptimize: true,
      enablePerformanceBoost: true,
      enableStorageRecovery: true,
      enablePrivacyCleanup: true,
      enableStartupOptimization: true,
      enableMaintenance: true,
      enableHealthRecovery: true,
      enableDeepOptimization: true,
      enableCustomPlan: true,
      enablePlanComparison: true,
      futureFlags: {},
    },
    enableEvents: true,
    planExpiryMinutes: 30,
    maxStepsPerPlan: 50,
    minConfidenceThreshold: 0.3,
  };
}

export function createDefaultPlanUserPreferences(): PlanUserPreferences {
  return {
    avoidHighRisk: false,
    maxDurationSeconds: 0,
    prioritizePrivacy: false,
    prioritizeStorage: false,
    prioritizePerformance: false,
  };
}

export function generatePlanId(planType: OptimizationPlanType): string {
  return `plan_${planType}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateStepId(index: number): string {
  return `step_${index}_${Math.random().toString(36).slice(2, 6)}`;
}

