/**
 * Optimization Profile Builder — builds custom profiles from user input.
 *
 * Supports user-defined profiles with name, description, priority weights,
 * preferred/excluded categories, risk tolerance, scheduling, confirmation rules.
 */
import type {
  OptimizationProfile,
  ProfileConfiguration,
  ProfileCategory,
  OptimizationGoal,
  OptimizationStrategy,
  RecommendationCategory,
  RiskTolerance,
  OptimizationPriorityWeights,
  ProfilePolicies,
  ProfileConstraints,
} from './types';
import {
  generateProfileId,
  createDefaultPriorityWeights,
} from './types';

export interface CustomProfileInput {
  name: string;
  description: string;
  icon?: string;
  optimizationGoal: OptimizationGoal;
  preferredStrategy?: OptimizationStrategy;
  priorityWeights?: Partial<OptimizationPriorityWeights>;
  preferredModules?: string[];
  excludedModules?: string[];
  preferredCategories?: RecommendationCategory[];
  excludedCategories?: RecommendationCategory[];
  riskTolerance?: RiskTolerance;
  estimatedDuration?: number;
  backgroundAllowed?: boolean;
  policies?: Partial<ProfilePolicies>;
  constraints?: Partial<ProfileConstraints>;
}

export class OptimizationProfileBuilder {
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
  }

  buildCustom(input: CustomProfileInput): OptimizationProfile {
    const now = new Date().toISOString();
    const id = generateProfileId();

    const policies = input.policies
      ? this._mergePolicies(this._config.defaultPolicies, input.policies)
      : { ...this._config.defaultPolicies };

    const constraints = input.constraints
      ? { ...this._config.defaultConstraints, ...input.constraints }
      : { ...this._config.defaultConstraints };

    if (input.excludedCategories) {
      constraints.blockedCategories = [...constraints.blockedCategories, ...input.excludedCategories];
    }
    if (input.preferredCategories) {
      constraints.allowedCategories = [...constraints.allowedCategories, ...input.preferredCategories];
    }

    return {
      id,
      name: input.name,
      description: input.description,
      icon: input.icon ?? 'settings',
      category: 'custom' as ProfileCategory,
      priority: 'medium',
      optimizationGoal: input.optimizationGoal,
      preferredStrategy: input.preferredStrategy ?? 'balanced',
      preferredModules: input.preferredModules ?? [],
      excludedModules: input.excludedModules ?? [],
      riskTolerance: input.riskTolerance ?? 'medium',
      estimatedDuration: input.estimatedDuration ?? 300,
      backgroundAllowed: input.backgroundAllowed ?? true,
      priorityWeights: { ...createDefaultPriorityWeights(), ...input.priorityWeights },
      policies,
      constraints,
      isBuiltIn: false,
      isCustom: true,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    };
  }

  updateCustom(existing: OptimizationProfile, input: Partial<CustomProfileInput>): OptimizationProfile {
    return {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      icon: input.icon ?? existing.icon,
      optimizationGoal: input.optimizationGoal ?? existing.optimizationGoal,
      preferredStrategy: input.preferredStrategy ?? existing.preferredStrategy,
      preferredModules: input.preferredModules ?? existing.preferredModules,
      excludedModules: input.excludedModules ?? existing.excludedModules,
      riskTolerance: input.riskTolerance ?? existing.riskTolerance,
      estimatedDuration: input.estimatedDuration ?? existing.estimatedDuration,
      backgroundAllowed: input.backgroundAllowed ?? existing.backgroundAllowed,
      priorityWeights: input.priorityWeights
        ? { ...existing.priorityWeights, ...input.priorityWeights }
        : existing.priorityWeights,
      policies: input.policies
        ? this._mergePolicies(existing.policies, input.policies)
        : existing.policies,
      constraints: input.constraints
        ? { ...existing.constraints, ...input.constraints }
        : existing.constraints,
      updatedAt: new Date().toISOString(),
    };
  }

  private _mergePolicies(base: ProfilePolicies, overrides: Partial<ProfilePolicies>): ProfilePolicies {
    return {
      execution: { ...base.execution, ...overrides.execution },
      safety: { ...base.safety, ...overrides.safety },
      confirmation: { ...base.confirmation, ...overrides.confirmation },
      scheduling: { ...base.scheduling, ...overrides.scheduling },
      risk: { ...base.risk, ...overrides.risk },
      rollback: { ...base.rollback, ...overrides.rollback },
      notification: { ...base.notification, ...overrides.notification },
      enterprise: { ...base.enterprise, ...overrides.enterprise },
    };
  }
}
