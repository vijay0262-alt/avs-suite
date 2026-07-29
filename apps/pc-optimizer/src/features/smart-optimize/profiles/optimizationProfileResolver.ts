/**
 * Optimization Profile Resolver — resolves the best profile for a given context.
 *
 * Uses: Selected Goal, Device Profile, Recommendation Engine,
 * Prediction Engine, Optimization History, User Preferences, Enterprise Policies.
 */
import type {
  OptimizationProfile,
  ProfileResolutionContext,
  ProfileResolutionResult,
  ProfileScoreEntry,
  ProfileConfiguration,
} from './types';
import type { OptimizationProfileRegistry } from './optimizationProfileRegistry';
import { OptimizationPreferenceResolver } from './optimizationPreferenceResolver';

export class OptimizationProfileResolver {
  private _registry: OptimizationProfileRegistry;
  private _preferenceResolver: OptimizationPreferenceResolver;
  private _config: ProfileConfiguration;

  constructor(registry: OptimizationProfileRegistry, config: ProfileConfiguration) {
    this._registry = registry;
    this._preferenceResolver = new OptimizationPreferenceResolver();
    this._config = config;
  }

  resolve(context: ProfileResolutionContext): ProfileResolutionResult | null {
    let allProfiles = this._registry.getAll();
    if (allProfiles.length === 0) return null;

    // Filter out enterprise-blocked profiles
    if (context.enterprisePolicies?.enforceProfiles) {
      allProfiles = allProfiles.filter((p) => {
        if (context.enterprisePolicies!.blockedProfiles.includes(p.id)) return false;
        if (context.enterprisePolicies!.allowedProfiles.length > 0 && !context.enterprisePolicies!.allowedProfiles.includes(p.id)) return false;
        return true;
      });
    }
    if (allProfiles.length === 0) return null;

    const scored = allProfiles.map((profile) => {
      const score = this._scoreProfile(profile, context);
      const reason = this._explainScore(profile, context, score);
      return { profile, score, reason };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0]!;
    const alternatives: ProfileScoreEntry[] = scored.slice(1, 4).map((s) => ({
      profileId: s.profile.id,
      profileName: s.profile.name,
      score: s.score,
      reason: s.reason,
    }));

    return {
      profile: best.profile,
      score: best.score,
      reason: best.reason,
      alternatives,
    };
  }

  private _scoreProfile(profile: OptimizationProfile, context: ProfileResolutionContext): number {
    const rules = this._config.resolutionRules;
    let score = 0;

    const goalScore = this._scoreGoal(profile, context.goal);
    score += goalScore * rules.goalWeight;

    const deviceScore = this._scoreDevice(profile, context.deviceProfileType, context.performanceTier);
    score += deviceScore * rules.deviceProfileWeight;

    const workloadScore = this._scoreWorkload(profile, context.primaryWorkload);
    score += workloadScore * rules.workloadWeight;

    const historyScore = this._scoreHistory(profile, context.optimizationHistory);
    score += historyScore * rules.historyWeight;

    const prefScore = this._preferenceResolver.getPreferenceScore(profile, context.userPreferences);
    score += prefScore * rules.preferenceWeight;

    const enterpriseScore = this._scoreEnterprise(profile, context.enterprisePolicies);
    score += enterpriseScore * rules.enterpriseWeight;

    return Math.round(score * 100) / 100;
  }

  private _scoreGoal(profile: OptimizationProfile, goal: ProfileResolutionContext['goal']): number {
    return profile.optimizationGoal === goal ? 1.0 : 0.3;
  }

  private _scoreDevice(
    profile: OptimizationProfile,
    deviceType: ProfileResolutionContext['deviceProfileType'],
    _tier: ProfileResolutionContext['performanceTier'],
  ): number {
    const profileToDevice: Record<string, string[]> = {
      gaming: ['gaming_pc'],
      creator: ['creative_workstation'],
      developer: ['developer_workstation'],
      trading: ['trading_workstation'],
      business: ['business_laptop', 'office_workstation'],
      battery: ['student_laptop', 'home_pc'],
      performance: ['power_user', 'gaming_pc', 'developer_workstation'],
    };

    const matchingTypes = profileToDevice[profile.category] ?? [];
    return matchingTypes.includes(deviceType) ? 1.0 : 0.4;
  }

  private _scoreWorkload(profile: OptimizationProfile, workload: ProfileResolutionContext['primaryWorkload']): number {
    const profileToWorkload: Record<string, string[]> = {
      gaming: ['gaming'],
      creator: ['media_editing'],
      developer: ['development'],
      trading: ['trading'],
      business: ['office'],
      battery: ['browsing', 'general_use'],
    };

    const matchingWorkloads = profileToWorkload[profile.category] ?? [];
    return matchingWorkloads.includes(workload) ? 1.0 : 0.4;
  }

  private _scoreHistory(
    profile: OptimizationProfile,
    history: ProfileResolutionContext['optimizationHistory'],
  ): number {
    if (history.length === 0) return 0.5;
    const profileUses = history.filter((h) => h.profileId === profile.id);
    if (profileUses.length === 0) return 0.3;
    const recentUse = profileUses.slice(-1)[0];
    const ageMs = Date.now() - new Date(recentUse!.timestamp).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 7) return 0.9;
    if (ageDays < 30) return 0.7;
    return 0.5;
  }

  private _scoreEnterprise(
    profile: OptimizationProfile,
    policies: ProfileResolutionContext['enterprisePolicies'],
  ): number {
    if (!policies || !policies.enforceProfiles) return 0.5;
    if (policies.blockedProfiles.includes(profile.id)) return 0.0;
    if (policies.allowedProfiles.length > 0 && !policies.allowedProfiles.includes(profile.id)) return 0.0;
    return 1.0;
  }

  private _explainScore(profile: OptimizationProfile, context: ProfileResolutionContext, score: number): string {
    const reasons: string[] = [];
    if (profile.optimizationGoal === context.goal) reasons.push('goal matches');
    if (context.userPreferences?.preferredCategory === profile.category) reasons.push('matches user preference');
    if (reasons.length === 0) reasons.push('best overall score');
    return `${profile.name} scored ${score.toFixed(2)} (${reasons.join(', ')})`;
  }
}
