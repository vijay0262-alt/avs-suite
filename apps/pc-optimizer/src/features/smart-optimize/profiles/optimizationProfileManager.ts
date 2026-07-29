/**
 * Optimization Profile Manager — top-level orchestrator.
 *
 * Public APIs:
 *   registerProfile()
 *   resolveProfile()
 *   getProfile()
 *   getProfiles()
 *   compareProfiles()
 *   validateProfile()
 *   createCustomProfile()
 *   updateCustomProfile()
 *   deleteCustomProfile()
 *   getProfileStatistics()
 *   on() / off()
 */
import type {
  OptimizationProfile,
  ProfileResolutionContext,
  ProfileResolutionResult,
  ProfileComparison,
  ProfileValidationResult,
  ProfileStatistics,
  ProfileConfiguration,
  ProfileEventType,
  ProfileEventListener,
  ProfileHistoryEntry,
  ProfileProviderPlugin,
} from './types';
import { generateProfileComparisonId } from './types';
import { OptimizationProfileRegistry } from './optimizationProfileRegistry';
import { OptimizationProfileResolver } from './optimizationProfileResolver';
import { OptimizationProfileValidator } from './optimizationProfileValidator';
import { OptimizationProfileBuilder, type CustomProfileInput } from './optimizationProfileBuilder';
import { OptimizationProfileHistory } from './optimizationProfileHistory';
import { OptimizationProfileEvents } from './optimizationProfileEvents';
import { createProfileConfiguration, type DeepPartial } from './optimizationProfileConfiguration';

export class OptimizationProfileManager {
  private _config: ProfileConfiguration;
  private _registry: OptimizationProfileRegistry;
  private _resolver: OptimizationProfileResolver;
  private _validator: OptimizationProfileValidator;
  private _builder: OptimizationProfileBuilder;
  private _history: OptimizationProfileHistory;
  private _events: OptimizationProfileEvents;

  constructor(config?: ProfileConfiguration | DeepPartial<ProfileConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as ProfileConfiguration;
    } else {
      this._config = createProfileConfiguration(config as DeepPartial<ProfileConfiguration>);
    }
    this._registry = new OptimizationProfileRegistry(this._config);
    this._resolver = new OptimizationProfileResolver(this._registry, this._config);
    this._validator = new OptimizationProfileValidator();
    this._builder = new OptimizationProfileBuilder(this._config);
    this._history = new OptimizationProfileHistory(this._config.maxHistoryEntries);
    this._events = new OptimizationProfileEvents();
  }

  registerProfile(profile: OptimizationProfile): boolean {
    const registered = this._registry.register(profile);
    if (registered && this._config.enableEvents) {
      this._events.emitRegistered(profile.id, { name: profile.name });
    }
    if (registered) {
      this._history.record(profile.id, 'registered', { name: profile.name });
    }
    return registered;
  }

  resolveProfile(context: ProfileResolutionContext): ProfileResolutionResult | null {
    const result = this._resolver.resolve(context);
    if (result && this._config.enableEvents) {
      this._events.emitResolved(result.profile.id, { score: result.score });
      this._events.emitSelected(result.profile.id, { reason: result.reason });
    }
    if (result) {
      this._history.record(result.profile.id, 'resolved', { score: result.score });
      this._history.record(result.profile.id, 'selected', { reason: result.reason });
    }
    return result;
  }

  getProfile(profileId: string): OptimizationProfile | undefined {
    return this._registry.get(profileId);
  }

  getProfiles(): OptimizationProfile[] {
    return this._registry.getAll();
  }

  getBuiltInProfiles(): OptimizationProfile[] {
    return this._registry.getBuiltIn();
  }

  getCustomProfiles(): OptimizationProfile[] {
    return this._registry.getCustom();
  }

  compareProfiles(profileAId: string, profileBId: string): ProfileComparison | null {
    const profileA = this._registry.get(profileAId);
    const profileB = this._registry.get(profileBId);
    if (!profileA || !profileB) return null;

    const durationDelta = profileA.estimatedDuration - profileB.estimatedDuration;
    const riskDelta = `${profileA.riskTolerance} vs ${profileB.riskTolerance}`;

    const priorityWeightDeltas: Partial<Record<string, number>> = {};
    const weightKeys = Object.keys(profileA.priorityWeights) as Array<keyof typeof profileA.priorityWeights>;
    for (const key of weightKeys) {
      const delta = profileA.priorityWeights[key] - profileB.priorityWeights[key];
      if (delta !== 0) {
        priorityWeightDeltas[key] = Math.round(delta * 100) / 100;
      }
    }

    let scoreA = 0;
    let scoreB = 0;
    if (durationDelta < 0) scoreA++; else if (durationDelta > 0) scoreB++;
    if (profileA.priorityWeights.performance > profileB.priorityWeights.performance) scoreA++;
    else if (profileA.priorityWeights.performance < profileB.priorityWeights.performance) scoreB++;
    if (profileA.priorityWeights.security > profileB.priorityWeights.security) scoreA++;
    else if (profileA.priorityWeights.security < profileB.priorityWeights.security) scoreB++;

    const winner = scoreA > scoreB ? 'a' : scoreB > scoreA ? 'b' : 'tie';
    const summary = `Comparing "${profileA.name}" vs "${profileB.name}". Duration difference: ${Math.abs(durationDelta)}s. ${winner === 'tie' ? 'Equal scores.' : winner === 'a' ? 'Profile A is better.' : 'Profile B is better.'}`;

    const comparison: ProfileComparison = {
      id: generateProfileComparisonId(),
      profileAId,
      profileBId,
      generatedAt: new Date().toISOString(),
      durationDelta,
      riskDelta,
      priorityWeightDeltas,
      summary,
      winner,
    };

    this._history.record(profileAId, 'compared', { profileBId, comparisonId: comparison.id });
    return comparison;
  }

  validateProfile(profileId: string): ProfileValidationResult | null {
    const profile = this._registry.get(profileId);
    if (!profile) return null;
    const result = this._validator.validate(profile);
    if (this._config.enableEvents) {
      this._events.emitValidated(profileId, { valid: result.valid });
    }
    this._history.record(profileId, 'validated', { valid: result.valid });
    return result;
  }

  createCustomProfile(input: CustomProfileInput): OptimizationProfile | null {
    if (!this._config.featureFlags.enableCustomProfiles) return null;
    if (this._registry.customCount() >= this._config.maxCustomProfiles) return null;

    const profile = this._builder.buildCustom(input);
    const validation = this._validator.validate(profile);
    if (!validation.valid) return null;

    this._registry.register(profile);
    if (this._config.enableEvents) {
      this._events.emitRegistered(profile.id, { name: profile.name, custom: true });
    }
    this._history.record(profile.id, 'created_custom', { name: profile.name });
    return profile;
  }

  updateCustomProfile(profileId: string, input: Partial<CustomProfileInput>): OptimizationProfile | null {
    const existing = this._registry.get(profileId);
    if (!existing || existing.isBuiltIn) return null;

    const updated = this._builder.updateCustom(existing, input);
    const validation = this._validator.validate(updated);
    if (!validation.valid) return null;

    this._registry.update(profileId, updated);
    if (this._config.enableEvents) {
      this._events.emitUpdated(profileId, { name: updated.name });
    }
    this._history.record(profileId, 'updated', { name: updated.name });
    return updated;
  }

  deleteCustomProfile(profileId: string): boolean {
    const profile = this._registry.get(profileId);
    if (!profile || profile.isBuiltIn) return false;
    const deleted = this._registry.unregister(profileId);
    if (deleted && this._config.enableEvents) {
      this._events.emitDeleted(profileId, { name: profile.name });
    }
    if (deleted) {
      this._history.record(profileId, 'deleted', { name: profile.name });
    }
    return deleted;
  }

  getProfileStatistics(): ProfileStatistics {
    const all = this._registry.getAll();
    const byCategory: Record<string, number> = {};
    const byGoal: Record<string, number> = {};
    let totalDuration = 0;
    const riskTolerances: string[] = [];

    for (const profile of all) {
      byCategory[profile.category] = (byCategory[profile.category] ?? 0) + 1;
      byGoal[profile.optimizationGoal] = (byGoal[profile.optimizationGoal] ?? 0) + 1;
      totalDuration += profile.estimatedDuration;
      riskTolerances.push(profile.riskTolerance);
    }

    const mostUsedEntry = this._history.getByAction('selected');
    const mostUsedProfile = mostUsedEntry.length > 0
      ? mostUsedEntry[mostUsedEntry.length - 1]!.profileId
      : null;

    const avgRisk: string = riskTolerances.length > 0
      ? riskTolerances.sort((a, b) =>
        riskTolerances.filter((v) => v === a).length -
        riskTolerances.filter((v) => v === b).length
      )[0] ?? 'medium'
      : 'medium';

    return {
      totalProfiles: all.length,
      builtInProfiles: this._registry.getBuiltIn().length,
      customProfiles: this._registry.getCustom().length,
      byCategory,
      byGoal,
      mostUsedProfile,
      averageDuration: all.length > 0 ? totalDuration / all.length : 0,
      averageRiskTolerance: avgRisk,
    };
  }

  registerPlugin(plugin: ProfileProviderPlugin): void {
    this._registry.registerPlugin(plugin);
    this._registry.loadPlugins();
  }

  on(event: ProfileEventType, listener: ProfileEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: ProfileEventType, listener: ProfileEventListener): void {
    this._events.off(event, listener);
  }

  get config(): ProfileConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<ProfileConfiguration>): void {
    this._config = createProfileConfiguration(overrides);
  }

  get history(): ProfileHistoryEntry[] {
    return this._history.getAll();
  }

  clear(): void {
    this._history.clear();
    this._events.clear();
  }
}
