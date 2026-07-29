/**
 * Optimization Profile Registry — registers and manages profiles.
 *
 * Built-in profiles are registered at construction.
 * Custom profiles and provider plugins register through the registry.
 * No switch statements — provider architecture only.
 */
import type {
  OptimizationProfile,
  ProfileProviderPlugin,
  ProfileCategory,
  ProfileConfiguration,
} from './types';
import {
  createDefaultPriorityWeights,
  createDefaultPolicies,
  createDefaultConstraints,
} from './types';

export class OptimizationProfileRegistry {
  private _profiles: Map<string, OptimizationProfile> = new Map();
  private _plugins: ProfileProviderPlugin[] = [];
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
    this._registerBuiltIns();
  }

  private _registerBuiltIns(): void {
    this._registerBuiltIn('balanced', 'Balanced', 'Balanced optimization across all areas', 'scale', 'balanced', 'balanced', {
      performance: 0.5, storage: 0.5, privacy: 0.5, startup: 0.5, memory: 0.5, battery: 0.5, health: 0.5, stability: 0.5, maintenance: 0.5, security: 0.5,
    });

    this._registerBuiltIn('performance', 'Performance', 'Maximize system performance', 'zap', 'performance', 'maximum_performance', {
      performance: 0.9, storage: 0.3, privacy: 0.3, startup: 0.8, memory: 0.8, battery: 0.2, health: 0.5, stability: 0.6, maintenance: 0.4, security: 0.5,
    });

    this._registerBuiltIn('gaming', 'Gaming', 'Optimize for gaming performance', 'gamepad', 'gaming', 'gaming_preparation', {
      performance: 0.95, storage: 0.3, privacy: 0.2, startup: 0.7, memory: 0.85, battery: 0.1, health: 0.4, stability: 0.7, maintenance: 0.3, security: 0.4,
    });

    this._registerBuiltIn('creator', 'Creator', 'Optimize for creative workflows', 'palette', 'creator', 'creator_workflow', {
      performance: 0.8, storage: 0.7, privacy: 0.3, startup: 0.6, memory: 0.85, battery: 0.3, health: 0.5, stability: 0.7, maintenance: 0.5, security: 0.5,
    });

    this._registerBuiltIn('developer', 'Developer', 'Optimize for development workstations', 'code', 'developer', 'maximum_performance', {
      performance: 0.75, storage: 0.5, privacy: 0.4, startup: 0.6, memory: 0.8, battery: 0.3, health: 0.5, stability: 0.8, maintenance: 0.5, security: 0.6,
    });

    this._registerBuiltIn('trading', 'Trading', 'Optimize for trading workstations', 'trending-up', 'trading', 'maximum_performance', {
      performance: 0.9, storage: 0.3, privacy: 0.5, startup: 0.85, memory: 0.85, battery: 0.2, health: 0.5, stability: 0.95, maintenance: 0.4, security: 0.7,
    });

    this._registerBuiltIn('business', 'Business', 'Optimize for business productivity', 'briefcase', 'business', 'business_productivity', {
      performance: 0.6, storage: 0.4, privacy: 0.7, startup: 0.6, memory: 0.6, battery: 0.5, health: 0.6, stability: 0.7, maintenance: 0.7, security: 0.8,
    });

    this._registerBuiltIn('privacy', 'Privacy', 'Maximize privacy protection', 'shield', 'privacy', 'privacy_protection', {
      performance: 0.3, storage: 0.3, privacy: 0.95, startup: 0.4, memory: 0.4, battery: 0.4, health: 0.5, stability: 0.6, maintenance: 0.5, security: 0.9,
    });

    this._registerBuiltIn('storage', 'Storage Recovery', 'Maximize storage recovery', 'hard-drive', 'storage', 'storage_recovery', {
      performance: 0.3, storage: 0.95, privacy: 0.4, startup: 0.4, memory: 0.4, battery: 0.3, health: 0.6, stability: 0.5, maintenance: 0.7, security: 0.4,
    });

    this._registerBuiltIn('battery', 'Battery Saver', 'Optimize for battery life', 'battery', 'battery', 'battery_optimization', {
      performance: 0.3, storage: 0.3, privacy: 0.4, startup: 0.5, memory: 0.6, battery: 0.95, health: 0.5, stability: 0.6, maintenance: 0.5, security: 0.5,
    });

    this._registerBuiltIn('maintenance', 'Maintenance', 'Routine system maintenance', 'wrench', 'maintenance', 'routine_maintenance', {
      performance: 0.4, storage: 0.5, privacy: 0.4, startup: 0.5, memory: 0.5, battery: 0.4, health: 0.8, stability: 0.7, maintenance: 0.9, security: 0.6,
    });

    this._registerBuiltIn('safe_mode', 'Safe Mode', 'Only safe, zero-risk optimizations', 'lock', 'safe_mode', 'routine_maintenance', {
      performance: 0.3, storage: 0.3, privacy: 0.3, startup: 0.3, memory: 0.3, battery: 0.3, health: 0.6, stability: 0.9, maintenance: 0.6, security: 0.7,
    }, { maxRiskLevel: 'low', requireRollback: true, allowUnsafeActions: false });
  }

  private _registerBuiltIn(
    id: string,
    name: string,
    description: string,
    icon: string,
    category: ProfileCategory,
    goal: OptimizationProfile['optimizationGoal'],
    weights: Partial<OptimizationProfile['priorityWeights']>,
    safetyOverride?: { maxRiskLevel?: OptimizationProfile['policies']['safety']['maxRiskLevel']; requireRollback?: boolean; allowUnsafeActions?: boolean },
  ): void {
    const now = new Date().toISOString();
    const policies = createDefaultPolicies();
    if (safetyOverride) {
      if (safetyOverride.maxRiskLevel) policies.safety.maxRiskLevel = safetyOverride.maxRiskLevel;
      if (safetyOverride.requireRollback !== undefined) policies.safety.requireRollback = safetyOverride.requireRollback;
      if (safetyOverride.allowUnsafeActions !== undefined) policies.safety.allowUnsafeActions = safetyOverride.allowUnsafeActions;
    }

    const profile: OptimizationProfile = {
      id,
      name,
      description,
      icon,
      category,
      priority: 'medium',
      optimizationGoal: goal,
      preferredStrategy: this._goalToStrategy(goal),
      preferredModules: [],
      excludedModules: [],
      riskTolerance: safetyOverride?.maxRiskLevel === 'low' ? 'low' : 'medium',
      estimatedDuration: category === 'safe_mode' ? 120 : category === 'gaming' ? 180 : 300,
      backgroundAllowed: true,
      priorityWeights: { ...createDefaultPriorityWeights(), ...weights },
      policies,
      constraints: createDefaultConstraints(),
      isBuiltIn: true,
      isCustom: false,
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    };

    this._profiles.set(id, profile);
  }

  private _goalToStrategy(goal: OptimizationProfile['optimizationGoal']): OptimizationProfile['preferredStrategy'] {
    const map: Record<string, OptimizationProfile['preferredStrategy']> = {
      quick_boost: 'performance_first',
      maximum_performance: 'aggressive',
      storage_recovery: 'storage_first',
      privacy_protection: 'privacy_first',
      startup_optimization: 'performance_first',
      battery_optimization: 'conservative',
      routine_maintenance: 'balanced',
      gaming_preparation: 'performance_first',
      creator_workflow: 'balanced',
      business_productivity: 'balanced',
      balanced: 'balanced',
      custom: 'custom',
      future_goal: 'balanced',
    };
    return map[goal] ?? 'balanced';
  }

  register(profile: OptimizationProfile): boolean {
    if (this._profiles.has(profile.id)) return false;
    this._profiles.set(profile.id, profile);
    return true;
  }

  unregister(profileId: string): boolean {
    const profile = this._profiles.get(profileId);
    if (!profile || profile.isBuiltIn) return false;
    return this._profiles.delete(profileId);
  }

  get(profileId: string): OptimizationProfile | undefined {
    return this._profiles.get(profileId);
  }

  getAll(): OptimizationProfile[] {
    return Array.from(this._profiles.values());
  }

  getBuiltIn(): OptimizationProfile[] {
    return this.getAll().filter((p) => p.isBuiltIn);
  }

  getCustom(): OptimizationProfile[] {
    return this.getAll().filter((p) => p.isCustom);
  }

  getByCategory(category: ProfileCategory): OptimizationProfile[] {
    return this.getAll().filter((p) => p.category === category);
  }

  update(profileId: string, updates: Partial<OptimizationProfile>): boolean {
    const profile = this._profiles.get(profileId);
    if (!profile || profile.isBuiltIn) return false;
    this._profiles.set(profileId, {
      ...profile,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  registerPlugin(plugin: ProfileProviderPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => b.getPriority() - a.getPriority());
  }

  loadPlugins(): void {
    for (const plugin of this._plugins) {
      if (plugin.isAvailable()) {
        const profile = plugin.getProfile();
        if (!this._profiles.has(profile.id)) {
          this._profiles.set(profile.id, profile);
        }
      }
    }
  }

  count(): number {
    return this._profiles.size;
  }

  customCount(): number {
    return this.getCustom().length;
  }

  get config(): ProfileConfiguration {
    return this._config;
  }
}
