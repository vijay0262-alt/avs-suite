/**
 * AI Workspace Personalization Platform — Barrel Exports
 *
 * EPIC 5 PHASE A PART 7
 *
 * Central entry point for all personalization platform exports.
 */

// ── Types ──────────────────────────────────────────────────────
export type {
  WorkspaceProfileType,
  WorkspaceLayout,
  WidgetPlacement,
  NotificationPreferences,
  AIInteractionStyle,
  UserPreferences,
  LearnedPreference,
  PreferenceEvidence,
  PreferenceSource,
  BehaviorEvent,
  BehaviorEventType,
  BehaviorAnalysisResult,
  ToolUsageStats,
  NavigationPattern,
  ActiveHoursStats,
  GoalUsageStats,
  QuickActionSuggestion,
  QuickActionSource,
  WorkspaceTemplate,
  WorkspaceTemplatePlugin,
  PersonalizationSuggestion,
  SuggestionType,
  WorkspaceEvent,
  WorkspaceEventType,
  WorkspaceEventListener,
  WorkspaceAnalyticsData,
  WorkspaceValidationResult,
  WorkspaceValidationError,
  WorkspaceValidationWarning,
  WorkspaceConfiguration,
  PreferenceRules,
  TemplateDefinition,
  WorkspaceFeatureFlags,
  EnterprisePolicies,
  PrivacySettings,
  WorkspacePerformanceTargets,
  PreferenceExportData,
  PreferenceImportResult,
  PersonalizationPlugin,
  WorkspaceProfile,
  RecentActivity,
} from './types';

export {
  generateProfileId,
  generateTemplateId,
  generateSuggestionId,
  generateBehaviorEventId,
  generateActivityId,
  createDefaultUserPreferences,
  createDefaultWorkspaceConfiguration,
  createDefaultPreferenceRules,
  createDefaultTemplateDefinitions,
  createDefaultWorkspaceFeatureFlags,
  createDefaultEnterprisePolicies,
  createDefaultPrivacySettings,
  createDefaultWorkspacePerformanceTargets,
  createDefaultWorkspaceLayout,
  createDefaultNotificationPreferences,
  createBuiltinProfiles,
} from './types';

// ── Configuration ──────────────────────────────────────────────
export {
  DEFAULT_WORKSPACE_CONFIGURATION,
  createWorkspaceConfiguration,
  validateWorkspaceConfiguration,
} from './workspaceConfiguration';
export type { DeepPartial } from './workspaceConfiguration';

// ── Events ─────────────────────────────────────────────────────
export { WorkspaceEvents, workspaceEvents } from './workspaceEvents';

// ── Validator ──────────────────────────────────────────────────
export { WorkspaceValidator } from './workspaceValidator';

// ── Behavior Analyzer ──────────────────────────────────────────
export { BehaviorAnalyzer } from './behaviorAnalyzer';

// ── Preference Engine ──────────────────────────────────────────
export { PreferenceEngine } from './preferenceEngine';

// ── Profile Manager ────────────────────────────────────────────
export { WorkspaceProfileManager } from './workspaceProfileManager';

// ── Layout Personalizer ────────────────────────────────────────
export { LayoutPersonalizer } from './layoutPersonalizer';

// ── Quick Action Personalizer ──────────────────────────────────
export { QuickActionPersonalizer } from './quickActionPersonalizer';

// ── Recommendation Personalizer ────────────────────────────────
export { RecommendationPersonalizer } from './recommendationPersonalizer';
export type { RecommendationFilter } from './recommendationPersonalizer';

// ── Interaction Preference Engine ──────────────────────────────
export { InteractionPreferenceEngine } from './interactionPreferenceEngine';

// ── Template Registry ──────────────────────────────────────────
export { WorkspaceTemplateRegistry } from './workspaceTemplateRegistry';

// ── Importer / Exporter ────────────────────────────────────────
export { PreferenceImporter } from './preferenceImporter';
export { PreferenceExporter } from './preferenceExporter';

// ── Analytics ──────────────────────────────────────────────────
export { WorkspaceAnalytics } from './workspaceAnalytics';

// ── Manager ────────────────────────────────────────────────────
export { WorkspacePersonalizationManager } from './workspacePersonalizationManager';
export type { LoadWorkspaceOptions, SaveWorkspaceResult } from './workspacePersonalizationManager';
