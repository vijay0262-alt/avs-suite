/**
 * AI Workspace Personalization Platform — Workspace Personalization Manager
 *
 * EPIC 5 PHASE A PART 7
 *
 * Main facade orchestrating all personalization components. Provides
 * public APIs: loadWorkspace(), saveWorkspace(), generateSuggestions(),
 * applyWorkspaceProfile(), exportPreferences(), importPreferences(),
 * resetPreferences().
 *
 * Emits events: workspace_loaded, profile_changed, preferences_updated,
 * layout_personalized, suggestions_generated, workspace_reset.
 *
 * Architecture:
 *   Workspace Events → Behavior Analysis → Preference Engine →
 *   Personalization Rules → Workspace Profiles → AI Workspace
 */
import type {
  WorkspaceConfiguration,
  UserPreferences,
  WorkspaceProfile,
  WorkspaceProfileType,
  BehaviorEvent,
  PersonalizationSuggestion,
  PreferenceExportData,
  PreferenceImportResult,
  WorkspaceTemplate,
  WorkspaceEventType,
  WorkspaceEventListener,
  BehaviorAnalysisResult,
  WorkspaceLayout,
  AIInteractionStyle,
  CopilotIntentType,
  CopilotCapability,
  PersonalizationPlugin,
  QuickActionSuggestion,
  RecentActivity,
} from './types';
import {
  createDefaultUserPreferences,
  createDefaultWorkspaceConfiguration,
  generateBehaviorEventId,
  generateActivityId,
} from './types';
import { WorkspaceEvents } from './workspaceEvents';
import { WorkspaceValidator } from './workspaceValidator';
import { BehaviorAnalyzer } from './behaviorAnalyzer';
import { PreferenceEngine } from './preferenceEngine';
import { WorkspaceProfileManager } from './workspaceProfileManager';
import { LayoutPersonalizer } from './layoutPersonalizer';
import { QuickActionPersonalizer } from './quickActionPersonalizer';
import { RecommendationPersonalizer } from './recommendationPersonalizer';
import { InteractionPreferenceEngine } from './interactionPreferenceEngine';
import { WorkspaceTemplateRegistry } from './workspaceTemplateRegistry';
import { PreferenceImporter } from './preferenceImporter';
import { PreferenceExporter } from './preferenceExporter';
import { WorkspaceAnalytics } from './workspaceAnalytics';
import {
  createWorkspaceConfiguration,
  validateWorkspaceConfiguration,
  type DeepPartial,
} from './workspaceConfiguration';

export interface LoadWorkspaceOptions {
  userId: string;
  cachedPreferences?: UserPreferences;
  cachedProfile?: WorkspaceProfile | null;
}

export interface SaveWorkspaceResult {
  preferences: UserPreferences;
  profile: WorkspaceProfile | null;
  savedAt: string;
}

export class WorkspacePersonalizationManager {
  private _config: WorkspaceConfiguration;
  private _events: WorkspaceEvents;
  private _validator: WorkspaceValidator;
  private _behaviorAnalyzer: BehaviorAnalyzer;
  private _preferenceEngine: PreferenceEngine;
  private _profileManager: WorkspaceProfileManager;
  private _layoutPersonalizer: LayoutPersonalizer;
  private _quickActionPersonalizer: QuickActionPersonalizer;
  private _recommendationPersonalizer: RecommendationPersonalizer;
  private _interactionPreferenceEngine: InteractionPreferenceEngine;
  private _templateRegistry: WorkspaceTemplateRegistry;
  private _importer: PreferenceImporter;
  private _exporter: PreferenceExporter;
  private _analytics: WorkspaceAnalytics;

  private _preferences: Map<string, UserPreferences> = new Map();
  private _activeProfiles: Map<string, WorkspaceProfile | null> = new Map();
  private _plugins: Map<string, PersonalizationPlugin> = new Map();

  constructor(config?: DeepPartial<WorkspaceConfiguration>) {
    this._config = config
      ? createWorkspaceConfiguration(config)
      : createDefaultWorkspaceConfiguration();

    const configValidation = validateWorkspaceConfiguration(this._config);
    if (!configValidation.valid) {
      throw new Error(`Invalid workspace configuration: ${configValidation.errors.join(', ')}`);
    }

    this._events = new WorkspaceEvents();
    this._validator = new WorkspaceValidator(this._config);
    this._behaviorAnalyzer = new BehaviorAnalyzer(this._config);
    this._preferenceEngine = new PreferenceEngine(this._config);
    this._profileManager = new WorkspaceProfileManager(this._config);
    this._layoutPersonalizer = new LayoutPersonalizer(this._config);
    this._quickActionPersonalizer = new QuickActionPersonalizer(this._config);
    this._recommendationPersonalizer = new RecommendationPersonalizer(this._config);
    this._interactionPreferenceEngine = new InteractionPreferenceEngine(this._config);
    this._templateRegistry = new WorkspaceTemplateRegistry(this._config);
    this._importer = new PreferenceImporter(this._config);
    this._exporter = new PreferenceExporter(this._config);
    this._analytics = new WorkspaceAnalytics();
  }

  // ── Public API ──────────────────────────────────────────────

  loadWorkspace(options: LoadWorkspaceOptions): UserPreferences {
    const start = Date.now();

    let preferences: UserPreferences;
    if (options.cachedPreferences && options.cachedPreferences.userId === options.userId) {
      preferences = structuredClone(options.cachedPreferences);
    } else {
      preferences = this._preferences.get(options.userId) ?? createDefaultUserPreferences(options.userId);
    }

    let profile: WorkspaceProfile | null = null;
    if (options.cachedProfile) {
      profile = options.cachedProfile;
    } else {
      profile = this._activeProfiles.get(options.userId) ?? null;
    }

    this._preferences.set(options.userId, preferences);
    this._activeProfiles.set(options.userId, profile);
    this._analytics.recordSession();
    this._analytics.setPersonalizationEnabled(preferences.personalizationEnabled);

    const elapsed = Date.now() - start;
    if (elapsed > this._config.performanceTargets.workspaceLoadTargetMs) {
      // Performance warning — workspace load exceeded target
    }

    this._emit('workspace_loaded', { userId: options.userId, preferences, profile, loadTimeMs: elapsed });
    return preferences;
  }

  saveWorkspace(userId: string): SaveWorkspaceResult {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const profile = this._activeProfiles.get(userId) ?? null;
    const savedAt = new Date().toISOString();

    this._emit('preferences_updated', { userId, preferences, savedAt });

    return { preferences, profile, savedAt };
  }

  generateSuggestions(userId: string): PersonalizationSuggestion[] {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return [];
    }

    const analysis = this._config.featureFlags.enableBehaviorAnalysis
      ? this._behaviorAnalyzer.analyze(userId)
      : null;

    const allSuggestions: PersonalizationSuggestion[] = [];
    const maxPerSession = this._config.preferenceRules.maxSuggestionsPerSession;

    if (this._config.featureFlags.enableLayoutPersonalization) {
      allSuggestions.push(...this._layoutPersonalizer.generateLayoutSuggestions(preferences, analysis));
    }

    if (this._config.featureFlags.enableQuickActionPersonalization) {
      allSuggestions.push(...this._quickActionPersonalizer.generateSuggestions(preferences, analysis));
    }

    if (this._config.featureFlags.enableRecommendationPersonalization) {
      allSuggestions.push(...this._recommendationPersonalizer.generateSuggestions(preferences, analysis));
    }

    if (this._config.featureFlags.enableInteractionPreferences) {
      allSuggestions.push(...this._interactionPreferenceEngine.generateSuggestions(preferences, analysis));
    }

    for (const plugin of this._plugins.values()) {
      if (plugin.isAvailable() && plugin.generateSuggestions) {
        allSuggestions.push(...plugin.generateSuggestions(preferences, analysis));
      }
    }

    const filtered = allSuggestions
      .filter((s) => s.confidence >= this._config.preferenceRules.minConfidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxPerSession);

    for (const suggestion of filtered) {
      this._analytics.recordSuggestionGenerated();
    }

    this._emit('suggestions_generated', { userId, suggestions: filtered });
    return filtered;
  }

  applyWorkspaceProfile(userId: string, profileType: WorkspaceProfileType): UserPreferences {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const profile = this._profileManager.getProfileByType(profileType);
    if (!profile) {
      throw new Error(`Profile type ${profileType} not found`);
    }

    if (this._config.enterprisePolicies.enforceProfiles &&
        !this._config.enterprisePolicies.allowedProfiles.includes(profileType) &&
        profileType !== 'future_profile') {
      throw new Error(`Profile type ${profileType} is not allowed by enterprise policy`);
    }

    const updated: UserPreferences = {
      ...preferences,
      profileType: profile.type,
      layout: structuredClone(profile.layout),
      quickActions: [...profile.quickActions],
      favoriteReports: [...profile.preferredReports],
      notificationPreferences: structuredClone(profile.notificationPreferences),
      defaultGoals: [...profile.defaultGoals],
      frequentlyUsedTools: [...profile.preferredTools],
      aiInteractionStyle: profile.aiInteractionStyle,
      widgetOrdering: [...profile.widgetOrdering],
    };

    this._preferences.set(userId, updated);
    this._activeProfiles.set(userId, profile);
    this._analytics.recordProfileUsage(profileType);

    this._emit('profile_changed', { userId, profileType, profile });
    this._emit('layout_personalized', { userId, layout: updated.layout });
    this._emit('preferences_updated', { userId, preferences: updated, savedAt: new Date().toISOString() });

    return updated;
  }

  exportPreferences(userId: string): PreferenceExportData {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const profile = this._activeProfiles.get(userId) ?? null;
    const templates = this._templateRegistry.getAllTemplates();

    const data = this._exporter.export(userId, preferences, profile, templates);

    this._emit('preferences_exported', { userId, data });
    return data;
  }

  importPreferences(userId: string, data: PreferenceExportData): PreferenceImportResult {
    const result = this._importer.import(data);

    if (result.success && result.importedPreferences) {
      const imported = { ...result.importedPreferences, userId };
      this._preferences.set(userId, imported);

      if (result.importedProfile) {
        this._activeProfiles.set(userId, result.importedProfile);
      }

      this._emit('preferences_imported', { userId, result });
      this._emit('preferences_updated', { userId, preferences: imported, savedAt: new Date().toISOString() });
    }

    return result;
  }

  resetPreferences(userId: string): UserPreferences {
    const defaultPrefs = createDefaultUserPreferences(userId);
    this._preferences.set(userId, defaultPrefs);
    this._activeProfiles.set(userId, null);
    this._behaviorAnalyzer.clear(userId);

    this._emit('workspace_reset', { userId });
    this._emit('preferences_updated', { userId, preferences: defaultPrefs, savedAt: new Date().toISOString() });

    return defaultPrefs;
  }

  // ── Behavior Recording ──────────────────────────────────────

  recordBehavior(
    userId: string,
    type: BehaviorEvent['type'],
    options?: {
      targetId?: string;
      targetType?: string;
      sessionId?: string;
      page?: string;
      duration?: number;
    },
  ): BehaviorEvent {
    if (!this._config.privacySettings.collectBehaviorData) {
      throw new Error('Behavior data collection is disabled by privacy settings');
    }

    const event: BehaviorEvent = {
      id: generateBehaviorEventId(),
      type,
      userId,
      timestamp: new Date().toISOString(),
      targetId: options?.targetId ?? null,
      targetType: options?.targetType ?? null,
      context: {
        sessionId: options?.sessionId ?? null,
        profileType: this._preferences.get(userId)?.profileType ?? null,
        page: options?.page ?? null,
        duration: options?.duration ?? null,
        futureMetadata: {},
      },
      futureMetadata: {},
    };

    if (this._config.featureFlags.enableBehaviorAnalysis) {
      this._behaviorAnalyzer.recordEvent(event);
    }
    this._analytics.recordBehaviorEvent(event);

    this._emit('behavior_recorded', { event });
    return event;
  }

  // ── Preference Management ────────────────────────────────────

  getPreferences(userId: string): UserPreferences | null {
    return this._preferences.get(userId) ?? null;
  }

  setPreference(userId: string, key: string, value: unknown): UserPreferences {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const updated = this._preferenceEngine.setExplicitPreference(preferences, key, value);
    this._preferences.set(userId, updated);

    this._emit('preferences_updated', { userId, preferences: updated, savedAt: new Date().toISOString() });
    this._emit('preference_learned', { userId, key, value });

    return updated;
  }

  setPersonalizationEnabled(userId: string, enabled: boolean): UserPreferences {
    return this.setPreference(userId, 'personalizationEnabled', enabled);
  }

  setManualMode(userId: string, manual: boolean): UserPreferences {
    return this.setPreference(userId, 'manualMode', manual);
  }

  getLearnedPreferences(userId: string): import('./types').LearnedPreference[] {
    const preferences = this._preferences.get(userId);
    return preferences?.learnedPreferences ?? [];
  }

  removeLearnedPreference(userId: string, key: string): UserPreferences {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const updated = this._preferenceEngine.removeLearnedPreference(preferences, key);
    this._preferences.set(userId, updated);

    this._emit('preferences_updated', { userId, preferences: updated, savedAt: new Date().toISOString() });
    return updated;
  }

  // ── Layout ──────────────────────────────────────────────────

  personalizeLayout(userId: string): WorkspaceLayout {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const analysis = this._config.featureFlags.enableBehaviorAnalysis
      ? this._behaviorAnalyzer.analyze(userId)
      : null;

    const layout = this._layoutPersonalizer.personalize(preferences, analysis);
    const updated = { ...preferences, layout };
    this._preferences.set(userId, updated);

    this._emit('layout_personalized', { userId, layout });
    return layout;
  }

  setLayoutTheme(userId: string, theme: WorkspaceLayout['theme']): UserPreferences {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const layout = this._layoutPersonalizer.setTheme(preferences.layout, theme);
    const updated = { ...preferences, layout };
    this._preferences.set(userId, updated);

    this._emit('preferences_updated', { userId, preferences: updated, savedAt: new Date().toISOString() });
    return updated;
  }

  // ── Quick Actions ───────────────────────────────────────────

  personalizeQuickActions(userId: string): string[] {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const analysis = this._config.featureFlags.enableBehaviorAnalysis
      ? this._behaviorAnalyzer.analyze(userId)
      : null;

    const profile = this._activeProfiles.get(userId) ?? null;
    const actions = this._quickActionPersonalizer.personalize(preferences, analysis, profile);
    const updated = { ...preferences, quickActions: actions };
    this._preferences.set(userId, updated);

    this._emit('preferences_updated', { userId, preferences: updated, savedAt: new Date().toISOString() });
    return actions;
  }

  getQuickActionSuggestions(
    userId: string,
    context: { activeGoals?: string[]; currentPage?: string; profileType?: string },
  ): QuickActionSuggestion[] {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    return this._quickActionPersonalizer.getContextAwareSuggestions(preferences, context);
  }

  // ── Interaction Preferences ─────────────────────────────────

  setInteractionStyle(userId: string, style: AIInteractionStyle): UserPreferences {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const updated = this._interactionPreferenceEngine.setInteractionStyle(preferences, style);
    this._preferences.set(userId, updated);

    this._emit('preferences_updated', { userId, preferences: updated, savedAt: new Date().toISOString() });
    return updated;
  }

  // ── Profiles ────────────────────────────────────────────────

  getAvailableProfiles(): WorkspaceProfile[] {
    return this._profileManager.getAllProfiles();
  }

  getBuiltinProfiles(): WorkspaceProfile[] {
    return this._profileManager.getBuiltinProfiles();
  }

  getCustomProfiles(): WorkspaceProfile[] {
    return this._profileManager.getCustomProfiles();
  }

  createCustomProfile(
    type: WorkspaceProfileType,
    label: string,
    description: string,
    baseProfileId?: string,
  ): WorkspaceProfile {
    return this._profileManager.createCustomProfile(type, label, description, baseProfileId);
  }

  deleteCustomProfile(id: string): boolean {
    return this._profileManager.deleteCustomProfile(id);
  }

  // ── Templates ───────────────────────────────────────────────

  getTemplates(): WorkspaceTemplate[] {
    return this._templateRegistry.getAllTemplates();
  }

  registerTemplate(template: WorkspaceTemplate): boolean {
    return this._templateRegistry.registerTemplate(template);
  }

  createTemplateFromProfile(profileId: string, name: string, description: string): WorkspaceTemplate {
    const profile = this._profileManager.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }
    return this._templateRegistry.createTemplateFromProfile(profile, name, description);
  }

  // ── Analytics ───────────────────────────────────────────────

  getAnalytics(): import('./types').WorkspaceAnalyticsData {
    return this._analytics.getAnalytics();
  }

  // ── Events ──────────────────────────────────────────────────

  on(type: WorkspaceEventType, listener: WorkspaceEventListener): void {
    this._events.on(type, listener);
  }

  off(type: WorkspaceEventType, listener: WorkspaceEventListener): void {
    this._events.off(type, listener);
  }

  // ── Plugins ─────────────────────────────────────────────────

  registerPlugin(plugin: PersonalizationPlugin): boolean {
    if (!this._config.featureFlags.enablePlugins) {
      throw new Error('Plugins are disabled');
    }
    if (this._plugins.has(plugin.getPluginName())) {
      return false;
    }
    this._plugins.set(plugin.getPluginName(), plugin);
    return true;
  }

  unregisterPlugin(pluginName: string): boolean {
    return this._plugins.delete(pluginName);
  }

  getRegisteredPlugins(): string[] {
    return Array.from(this._plugins.keys());
  }

  // ── Configuration ───────────────────────────────────────────

  getConfiguration(): WorkspaceConfiguration {
    return this._config;
  }

  updateConfiguration(overrides: DeepPartial<WorkspaceConfiguration>): void {
    const newConfig = createWorkspaceConfiguration(overrides);
    const validation = validateWorkspaceConfiguration(newConfig);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    this._config = newConfig;
    this._validator.updateConfig(newConfig);
    this._behaviorAnalyzer.updateConfig(newConfig);
    this._preferenceEngine.updateConfig(newConfig);
    this._profileManager.updateConfig(newConfig);
    this._layoutPersonalizer.updateConfig(newConfig);
    this._quickActionPersonalizer.updateConfig(newConfig);
    this._recommendationPersonalizer.updateConfig(newConfig);
    this._interactionPreferenceEngine.updateConfig(newConfig);
    this._templateRegistry.updateConfig(newConfig);
    this._importer.updateConfig(newConfig);
    this._exporter.updateConfig(newConfig);
  }

  // ── Recent Activities ───────────────────────────────────────

  addRecentActivity(userId: string, type: string, label: string, targetId?: string): void {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }

    const activity: RecentActivity = {
      id: generateActivityId(),
      type,
      label,
      timestamp: new Date().toISOString(),
      targetId: targetId ?? null,
      futureMetadata: {},
    };

    const recentActivities = [activity, ...preferences.recentActivities].slice(0, 20);
    const updated = { ...preferences, recentActivities };
    this._preferences.set(userId, updated);
  }

  // ── Behavior Analysis ───────────────────────────────────────

  getBehaviorAnalysis(userId: string): BehaviorAnalysisResult {
    return this._behaviorAnalyzer.analyze(userId);
  }

  // ── Validation ──────────────────────────────────────────────

  validatePreferences(userId: string): import('./types').WorkspaceValidationResult {
    const preferences = this._preferences.get(userId);
    if (!preferences) {
      throw new Error(`No workspace loaded for user ${userId}`);
    }
    return this._validator.validatePreferences(preferences);
  }

  // ── Internal ────────────────────────────────────────────────

  private _emit(type: WorkspaceEventType, data: unknown): void {
    if (this._config.featureFlags.enableEvents) {
      this._events.emit({ type, timestamp: new Date().toISOString(), data });
    }
  }
}
