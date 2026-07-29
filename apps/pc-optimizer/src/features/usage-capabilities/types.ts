/**
 * Usage Capability Framework — Type Definitions.
 *
 * Version 2.0 infrastructure for data-driven capability resolution.
 * This module does NOT modify any existing architecture.
 * It only creates the foundation that future prompts will use.
 */

// ── Subscription Plans ────────────────────────────────────────

/**
 * Subscription plans recognized by the framework.
 * Future plans can be added via configuration without code changes.
 */
export type SubscriptionPlan =
  | 'FREE'
  | 'PRO'
  | 'ULTIMATE'
  | 'LIFETIME'
  | 'BETA'
  | 'ENTERPRISE'
  | 'FAMILY';

/**
 * Plan tier ordering — lower index = fewer capabilities.
 * Plans are cumulative: each tier includes all capabilities from
 * the tiers below it, plus additional capabilities.
 */
export const PLAN_TIER_ORDER: readonly SubscriptionPlan[] = [
  'FREE',
  'BETA',
  'PRO',
  'FAMILY',
  'ULTIMATE',
  'LIFETIME',
  'ENTERPRISE',
];

/**
 * Human-readable labels for subscription plans.
 */
export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  ULTIMATE: 'Ultimate',
  LIFETIME: 'Lifetime',
  BETA: 'Beta',
  ENTERPRISE: 'Enterprise',
  FAMILY: 'Family',
};

// ── Capability Definitions ───────────────────────────────────

/**
 * A capability is a granular permission that gates access to a feature.
 * Capabilities are data-driven — no hardcoded switch statements.
 *
 * Examples: ai_assistant, smart_optimize, startup_cleanup, etc.
 */
export interface CapabilityDefinition {
  /** Unique capability identifier, e.g. "ai_assistant". */
  id: string;
  /** Human-readable name for UI display. */
  displayName: string;
  /** Description of what this capability unlocks. */
  description: string;
  /** Category for grouping in UI. */
  category: string;
  /** Minimum subscription plan required to unlock this capability. */
  minimumPlan: SubscriptionPlan;
  /** Whether this capability is visible in the UI (some are internal). */
  isVisible: boolean;
  /** Whether this capability can be limited (e.g. usage caps). */
  canBeLimited: boolean;
  /** Optional limit description when capability is limited. */
  limitDescription?: string;
  /** Future flags for extensibility. */
  futureFlags?: Record<string, unknown>;
}

// ── Feature Definitions ──────────────────────────────────────

/**
 * A feature is a user-facing module or function that may require
 * one or more capabilities to be fully usable.
 */
export interface FeatureDefinition {
  /** Unique feature identifier. */
  id: string;
  /** Human-readable name for UI display. */
  displayName: string;
  /** Description of the feature. */
  description: string;
  /** Category for grouping in UI. */
  category: string;
  /** Whether the feature is visible in the UI. */
  isVisible: boolean;
  /** Whether the feature is enabled (can be used). */
  isEnabled: boolean;
  /** Whether the feature can be in a limited state. */
  isLimited: boolean;
  /** Whether the feature requires a subscription to use. */
  requiresSubscription: boolean;
  /** Minimum subscription plan required to fully unlock this feature. */
  minimumPlan: SubscriptionPlan;
  /** Capabilities required to use this feature. */
  requiredCapabilities: string[];
  /** Future flags for extensibility. */
  futureFlags?: Record<string, unknown>;
}

// ── Subscription Definitions ─────────────────────────────────

/**
 * A subscription plan definition describes the plan's metadata
 * and which capabilities it unlocks.
 */
export interface SubscriptionDefinition {
  /** The plan identifier. */
  plan: SubscriptionPlan;
  /** Human-readable label. */
  label: string;
  /** Description of the plan. */
  description: string;
  /** Whether this is a paid plan. */
  isPaid: boolean;
  /** Capabilities included in this plan (non-cumulative). */
  capabilities: string[];
  /** Features that are fully unlocked in this plan. */
  features: string[];
  /** Plan tier index for ordering (lower = fewer capabilities). */
  tierIndex: number;
  /** Future flags for extensibility. */
  futureFlags?: Record<string, unknown>;
}

// ── Resolved State ───────────────────────────────────────────

/**
 * The resolved state of a feature for a given plan.
 */
export interface ResolvedFeature {
  /** Feature identifier. */
  featureId: string;
  /** Display name. */
  displayName: string;
  /** Whether the feature is visible in the UI. */
  isVisible: boolean;
  /** Whether the feature is enabled (can be used). */
  isEnabled: boolean;
  /** Whether the feature is in a limited state. */
  isLimited: boolean;
  /** Whether the feature requires a subscription. */
  requiresSubscription: boolean;
  /** Whether the feature is locked for this plan. */
  isLocked: boolean;
  /** Minimum plan required to unlock. */
  minimumPlan: SubscriptionPlan;
  /** Missing capabilities that prevent full access. */
  missingCapabilities: string[];
  /** Available capabilities for this feature. */
  availableCapabilities: string[];
}

/**
 * The resolved state of a capability for a given plan.
 */
export interface ResolvedCapability {
  /** Capability identifier. */
  capabilityId: string;
  /** Display name. */
  displayName: string;
  /** Whether the capability is unlocked for this plan. */
  isUnlocked: boolean;
  /** Whether the capability is limited. */
  isLimited: boolean;
  /** Minimum plan required to unlock. */
  minimumPlan: SubscriptionPlan;
  /** Whether the capability is visible. */
  isVisible: boolean;
}

// ── Configuration ────────────────────────────────────────────

/**
 * Configuration object that can be loaded to define all
 * capabilities, features, and subscriptions.
 *
 * Future plans should require configuration changes only.
 */
export interface CapabilityConfig {
  capabilities: CapabilityDefinition[];
  features: FeatureDefinition[];
  subscriptions: SubscriptionDefinition[];
}

// ── Events ───────────────────────────────────────────────────

export type CapabilityEventType =
  | 'capability_loaded'
  | 'capability_changed'
  | 'plan_changed';

export interface CapabilityLoadedEvent {
  timestamp: string;
  capabilityCount: number;
  featureCount: number;
  subscriptionCount: number;
}

export interface CapabilityChangedEvent {
  timestamp: string;
  capabilityId: string;
  change: 'unlocked' | 'locked' | 'limited';
}

export interface PlanChangedEvent {
  timestamp: string;
  previousPlan: SubscriptionPlan | null;
  newPlan: SubscriptionPlan;
}

export type CapabilityEventListener = (payload: unknown) => void;

// ── Validation ───────────────────────────────────────────────

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  context?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Get the tier index of a plan. Returns -1 for unknown plans.
 */
export function getPlanTierIndex(plan: string): number {
  const upper = plan.toUpperCase() as SubscriptionPlan;
  return PLAN_TIER_ORDER.indexOf(upper);
}

/**
 * Check if a plan string is a recognized subscription plan.
 */
export function isKnownPlan(plan: string): boolean {
  return getPlanTierIndex(plan) >= 0;
}

/**
 * Normalize a plan string to a SubscriptionPlan.
 * Unknown plans default to 'FREE'.
 */
export function normalizePlan(plan: string | null | undefined): SubscriptionPlan {
  if (!plan) return 'FREE';
  const upper = plan.toUpperCase();
  if (isKnownPlan(upper)) return upper as SubscriptionPlan;
  return 'FREE';
}

/**
 * Check if plan A includes plan B (A >= B in tier ordering).
 */
export function planIncludes(planA: SubscriptionPlan, planB: SubscriptionPlan): boolean {
  return getPlanTierIndex(planA) >= getPlanTierIndex(planB);
}
