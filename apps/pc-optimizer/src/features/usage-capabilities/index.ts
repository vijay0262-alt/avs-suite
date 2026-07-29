/**
 * Usage Capability Framework — Barrel Export.
 *
 * Version 2.0 infrastructure for data-driven capability resolution.
 *
 * Components:
 *   - CapabilityRegistry    — central store for definitions
 *   - CapabilityResolver     — resolves plan → capabilities/features
 *   - CapabilityValidator    — validates definitions and configs
 *   - CapabilityEvents       — typed event emitter
 *   - Default Definitions    — built-in capabilities, features, subscriptions
 *
 * This module does NOT modify any existing architecture.
 * It only creates the foundation that future prompts will use.
 */

// Types
export type {
  SubscriptionPlan,
  CapabilityDefinition,
  FeatureDefinition,
  SubscriptionDefinition,
  ResolvedFeature,
  ResolvedCapability,
  CapabilityConfig,
  CapabilityEventType,
  CapabilityLoadedEvent,
  CapabilityChangedEvent,
  PlanChangedEvent,
  CapabilityEventListener,
  ValidationIssue,
  ValidationResult,
} from './types';
export {
  PLAN_TIER_ORDER,
  PLAN_LABELS,
  getPlanTierIndex,
  isKnownPlan,
  normalizePlan,
  planIncludes,
} from './types';

// Events
export { CapabilityEventEmitter, capabilityEvents } from './capabilityEvents';

// Default Definitions
export {
  DEFAULT_CAPABILITIES,
  DEFAULT_FEATURES,
  DEFAULT_SUBSCRIPTIONS,
  DEFAULT_CONFIG,
} from './defaultDefinitions';

// Registry
export { CapabilityRegistry, capabilityRegistry } from './capabilityRegistry';

// Resolver
export { CapabilityResolver } from './capabilityResolver';

// Validator
export { CapabilityValidator, capabilityValidator } from './capabilityValidator';
