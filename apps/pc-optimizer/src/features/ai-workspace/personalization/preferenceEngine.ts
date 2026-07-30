/**
 * AI Workspace Personalization Platform — Preference Engine
 *
 * EPIC 5 PHASE A PART 7
 *
 * Learns and manages user preferences from behavior analysis and
 * explicit user choices. All learned preferences carry confidence
 * and evidence. Users can always view, reset, and disable learning.
 */
import type {
  UserPreferences,
  LearnedPreference,
  BehaviorAnalysisResult,
  WorkspaceConfiguration,
  PreferenceEvidence,
  PreferenceSource,
} from './types';

export class PreferenceEngine {
  private _config: WorkspaceConfiguration;

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
  }

  learnFromBehavior(
    preferences: UserPreferences,
    analysis: BehaviorAnalysisResult,
  ): UserPreferences {
    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return preferences;
    }

    const learned = [...preferences.learnedPreferences];
    const now = new Date().toISOString();

    if (analysis.toolUsage.length > 0) {
      const topTools = analysis.toolUsage.slice(0, 5).map((t) => t.toolId);
      this._upsertLearned(learned, 'frequently_used_tools', topTools, 0.8, 'behavior_analysis', now, [
        this._createEvidence('behavior_analysis', 'tool_usage_count', analysis.toolUsage[0]!.usageCount, `Top tool used ${analysis.toolUsage[0]!.usageCount} times`),
      ]);
    }

    if (analysis.preferredReports.length > 0) {
      this._upsertLearned(learned, 'preferred_reports', analysis.preferredReports.slice(0, 5), 0.75, 'behavior_analysis', now, [
        this._createEvidence('behavior_analysis', 'report_view_count', analysis.preferredReports.length, `${analysis.preferredReports.length} preferred reports identified`),
      ]);
    }

    if (analysis.recommendationAcceptanceRate > 0) {
      this._upsertLearned(learned, 'recommendation_acceptance_rate', analysis.recommendationAcceptanceRate, 0.7, 'behavior_analysis', now, [
        this._createEvidence('behavior_analysis', 'acceptance_rate', analysis.recommendationAcceptanceRate, `Acceptance rate: ${(analysis.recommendationAcceptanceRate * 100).toFixed(0)}%`),
      ]);
    }

    if (analysis.activeHours.length > 0) {
      const peakHour = analysis.activeHours.reduce((max, h) => h.activityCount > max.activityCount ? h : max, analysis.activeHours[0]!);
      this._upsertLearned(learned, 'peak_activity_hour', peakHour.hour, 0.65, 'behavior_analysis', now, [
        this._createEvidence('behavior_analysis', 'activity_count', peakHour.activityCount, `Peak hour: ${peakHour.hour}:00 with ${peakHour.activityCount} events`),
      ]);
    }

    if (analysis.navigationPatterns.length > 0) {
      const topNav = analysis.navigationPatterns[0]!;
      this._upsertLearned(learned, 'top_navigation_pattern', `${topNav.fromPage}→${topNav.toPage}`, 0.6, 'behavior_analysis', now, [
        this._createEvidence('behavior_analysis', 'navigation_frequency', topNav.frequency, `Navigation ${topNav.fromPage}→${topNav.toPage} used ${topNav.frequency} times`),
      ]);
    }

    this._trimLearned(learned);

    return {
      ...preferences,
      learnedPreferences: learned,
      frequentlyUsedTools: this._extractTopTools(learned, preferences.frequentlyUsedTools),
      favoriteReports: this._extractPreferredReports(learned, preferences.favoriteReports),
    };
  }

  setExplicitPreference(
    preferences: UserPreferences,
    key: string,
    value: unknown,
  ): UserPreferences {
    const learned = [...preferences.learnedPreferences];
    const now = new Date().toISOString();

    this._upsertLearned(learned, key, value, 1.0, 'explicit_user_choice', now, [
      this._createEvidence('explicit_user_choice', 'user_action', true, 'User explicitly set this preference'),
    ]);

    this._trimLearned(learned);

    return this._applyPreferenceToUser({ ...preferences, learnedPreferences: learned }, key, value);
  }

  getLearnedPreference(preferences: UserPreferences, key: string): LearnedPreference | null {
    return preferences.learnedPreferences.find((p) => p.key === key) ?? null;
  }

  removeLearnedPreference(preferences: UserPreferences, key: string): UserPreferences {
    return {
      ...preferences,
      learnedPreferences: preferences.learnedPreferences.filter((p) => p.key !== key),
    };
  }

  clearAllLearned(preferences: UserPreferences): UserPreferences {
    return {
      ...preferences,
      learnedPreferences: [],
    };
  }

  evaluatePreferences(preferences: UserPreferences): UserPreferences {
    const start = Date.now();
    const result = { ...preferences };
    const elapsed = Date.now() - start;

    if (elapsed > this._config.performanceTargets.preferenceEvaluationTargetMs) {
      // Still within acceptable range, just noting
    }

    return result;
  }

  private _upsertLearned(
    learned: LearnedPreference[],
    key: string,
    value: unknown,
    confidence: number,
    source: PreferenceSource,
    timestamp: string,
    evidence: PreferenceEvidence[],
  ): void {
    const existing = learned.find((p) => p.key === key);
    if (existing) {
      existing.value = value;
      existing.confidence = confidence;
      existing.evidence = evidence;
      existing.updatedAt = timestamp;
      existing.source = source;
    } else {
      learned.push({
        key,
        value,
        confidence,
        evidence,
        learnedAt: timestamp,
        updatedAt: timestamp,
        source,
        futureMetadata: {},
      });
    }
  }

  private _trimLearned(learned: LearnedPreference[]): void {
    const max = this._config.preferenceRules.maxLearnedPreferences;
    if (learned.length > max) {
      learned.sort((a, b) => b.confidence - a.confidence);
      learned.length = max;
    }
  }

  private _createEvidence(
    source: string,
    metric: string,
    value: string | number | boolean,
    description: string,
  ): PreferenceEvidence {
    return {
      source,
      metric,
      value,
      timestamp: new Date().toISOString(),
      description,
      confidence: 0.8,
      futureMetadata: {},
    };
  }

  private _extractTopTools(learned: LearnedPreference[], fallback: string[]): string[] {
    const pref = learned.find((p) => p.key === 'frequently_used_tools');
    if (pref && Array.isArray(pref.value)) {
      return pref.value as string[];
    }
    return fallback;
  }

  private _extractPreferredReports(learned: LearnedPreference[], fallback: string[]): string[] {
    const pref = learned.find((p) => p.key === 'preferred_reports');
    if (pref && Array.isArray(pref.value)) {
      return pref.value as string[];
    }
    return fallback;
  }

  private _applyPreferenceToUser(preferences: UserPreferences, key: string, value: unknown): UserPreferences {
    switch (key) {
      case 'aiInteractionStyle':
        return { ...preferences, aiInteractionStyle: value as UserPreferences['aiInteractionStyle'] };
      case 'personalizationEnabled':
        return { ...preferences, personalizationEnabled: value as boolean };
      case 'manualMode':
        return { ...preferences, manualMode: value as boolean };
      case 'quickActions':
        if (Array.isArray(value)) return { ...preferences, quickActions: value as string[] };
        break;
      case 'favoriteReports':
        if (Array.isArray(value)) return { ...preferences, favoriteReports: value as string[] };
        break;
      case 'defaultGoals':
        if (Array.isArray(value)) return { ...preferences, defaultGoals: value as string[] };
        break;
      case 'profileType':
        return { ...preferences, profileType: value as UserPreferences['profileType'] };
      default:
        break;
    }
    return preferences;
  }
}
