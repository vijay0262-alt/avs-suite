/**
 * Optimization Preference Resolver — resolves user preferences for profiles.
 *
 * Merges user preferences with profile defaults to produce effective settings.
 */
import type {
  ProfileUserPreferences,
  OptimizationProfile,
  RecommendationCategory,
  RiskTolerance,
  SchedulingPolicyType,
  ProfileCategory,
} from './types';

export class OptimizationPreferenceResolver {
  resolve(preferences: ProfileUserPreferences | null): ResolvedPreferences {
    if (!preferences) {
      return {
        preferredCategory: null,
        riskTolerance: 'medium',
        preferredCategories: [],
        excludedCategories: [],
        schedulingPreference: 'immediate',
      };
    }

    return {
      preferredCategory: preferences.preferredCategory,
      riskTolerance: preferences.riskTolerance,
      preferredCategories: preferences.preferredCategories,
      excludedCategories: preferences.excludedCategories,
      schedulingPreference: preferences.schedulingPreference,
    };
  }

  applyToProfile(profile: OptimizationProfile, preferences: ProfileUserPreferences | null): OptimizationProfile {
    if (!preferences) return profile;

    return {
      ...profile,
      riskTolerance: preferences.riskTolerance,
      constraints: {
        ...profile.constraints,
        blockedCategories: [
          ...profile.constraints.blockedCategories,
          ...preferences.excludedCategories,
        ],
      },
      policies: {
        ...profile.policies,
        scheduling: {
          ...profile.policies.scheduling,
          type: preferences.schedulingPreference,
        },
      },
    };
  }

  matchesProfile(profile: OptimizationProfile, preferences: ProfileUserPreferences | null): boolean {
    if (!preferences) return true;
    if (preferences.preferredCategory && profile.category !== preferences.preferredCategory) return false;
    return true;
  }

  getPreferenceScore(profile: OptimizationProfile, preferences: ProfileUserPreferences | null): number {
    if (!preferences) return 0.5;
    let score = 0.5;
    if (preferences.preferredCategory === profile.category) score += 0.3;
    if (preferences.riskTolerance === profile.riskTolerance) score += 0.1;
    const hasPreferred = preferences.preferredCategories.some((c) => profile.preferredModules.includes(c));
    if (hasPreferred) score += 0.1;
    return Math.min(1, score);
  }
}

export interface ResolvedPreferences {
  preferredCategory: ProfileCategory | null;
  riskTolerance: RiskTolerance;
  preferredCategories: RecommendationCategory[];
  excludedCategories: RecommendationCategory[];
  schedulingPreference: SchedulingPolicyType;
}
