/**
 * AI Workspace Personalization Platform — Type Definitions
 *
 * EPIC 5 PHASE A PART 7
 *
 * Learns user preferences, workspace layouts, and interaction patterns
 * while remaining transparent, configurable, and privacy-respecting.
 * Personalization improves usability rather than automating decisions.
 *
 * Architecture:
 *   Workspace Events → Behavior Analysis → Preference Engine →
 *   Personalization Rules → Workspace Profiles → AI Workspace
 *
 * Core principles:
 *   - Personalization improves usability, never changes business logic.
 *   - Users can always view, reset, disable, or export preferences.
 *   - No personal document analysis.
 *   - Provider/plugin architecture for extensibility.
 *   - All preferences carry confidence and evidence.
 */

// ── Re-export Copilot types used by personalization ──────────

export type {
  CopilotIntentType,
  CopilotCapability,
} from '../copilot/types';

import type {
  CopilotIntentType,
  CopilotCapability,
} from '../copilot/types';

// ── Workspace Profiles ───────────────────────────────────────

export type WorkspaceProfileType =
  | 'default'
  | 'performance'
  | 'gaming'
  | 'trading'
  | 'developer'
  | 'creative'
  | 'business'
  | 'student'
  | 'privacy'
  | 'custom'
  | 'future_profile';

export function getProfileTypeLabel(type: WorkspaceProfileType): string {
  const labels: Record<WorkspaceProfileType, string> = {
    default: 'Default',
    performance: 'Performance',
    gaming: 'Gaming',
    trading: 'Trading',
    developer: 'Developer',
    creative: 'Creative',
    business: 'Business',
    student: 'Student',
    privacy: 'Privacy',
    custom: 'Custom',
    future_profile: 'Future Profile',
  };
  return labels[type] ?? 'Unknown';
}

export interface WorkspaceProfile {
  id: string;
  type: WorkspaceProfileType;
  label: string;
  description: string;
  layout: WorkspaceLayout;
  quickActions: string[];
  preferredReports: string[];
  notificationPreferences: NotificationPreferences;
  defaultGoals: string[];
  preferredTools: string[];
  aiInteractionStyle: AIInteractionStyle;
  widgetOrdering: string[];
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Workspace Layout ─────────────────────────────────────────

export interface WorkspaceLayout {
  widgets: WidgetPlacement[];
  columns: number;
  compactMode: boolean;
  sidebarCollapsed: boolean;
  theme: WorkspaceTheme;
  futureMetadata: Record<string, unknown>;
}

export interface WidgetPlacement {
  widgetId: string;
  visible: boolean;
  order: number;
  column: number;
  row: number;
  width: number;
  height: number;
  futureMetadata: Record<string, unknown>;
}

export type WorkspaceTheme =
  | 'light'
  | 'dark'
  | 'auto'
  | 'high_contrast'
  | 'future_theme';

export function getThemeLabel(theme: WorkspaceTheme): string {
  const labels: Record<WorkspaceTheme, string> = {
    light: 'Light',
    dark: 'Dark',
    auto: 'Auto',
    high_contrast: 'High Contrast',
    future_theme: 'Future Theme',
  };
  return labels[theme] ?? 'Unknown';
}

// ── Notification Preferences ─────────────────────────────────

export interface NotificationPreferences {
  enableNotifications: boolean;
  enableSound: boolean;
  enableDesktop: boolean;
  enableEmail: boolean;
  priorityThreshold: NotificationPriority;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  futureMetadata: Record<string, unknown>;
}

export type NotificationPriority =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'future_priority';

export function getPriorityLabel(priority: NotificationPriority): string {
  const labels: Record<NotificationPriority, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
    future_priority: 'Future Priority',
  };
  return labels[priority] ?? 'Unknown';
}

// ── AI Interaction Style ─────────────────────────────────────

export type AIInteractionStyle =
  | 'concise'
  | 'detailed'
  | 'technical'
  | 'beginner'
  | 'future_style';

export function getInteractionStyleLabel(style: AIInteractionStyle): string {
  const labels: Record<AIInteractionStyle, string> = {
    concise: 'Concise',
    detailed: 'Detailed',
    technical: 'Technical',
    beginner: 'Beginner',
    future_style: 'Future Style',
  };
  return labels[style] ?? 'Unknown';
}

// ── User Preferences ─────────────────────────────────────────

export interface UserPreferences {
  userId: string;
  profileType: WorkspaceProfileType;
  layout: WorkspaceLayout;
  quickActions: string[];
  favoriteReports: string[];
  frequentlyUsedTools: string[];
  recentActivities: RecentActivity[];
  notificationPreferences: NotificationPreferences;
  defaultGoals: string[];
  aiInteractionStyle: AIInteractionStyle;
  preferredIntentTypes: CopilotIntentType[];
  preferredCapabilities: CopilotCapability[];
  widgetOrdering: string[];
  personalizationEnabled: boolean;
  manualMode: boolean;
  learnedPreferences: LearnedPreference[];
  futureMetadata: Record<string, unknown>;
}

export interface LearnedPreference {
  key: string;
  value: unknown;
  confidence: number;
  evidence: PreferenceEvidence[];
  learnedAt: string;
  updatedAt: string;
  source: PreferenceSource;
  futureMetadata: Record<string, unknown>;
}

export type PreferenceSource =
  | 'behavior_analysis'
  | 'explicit_user_choice'
  | 'profile_template'
  | 'imported'
  | 'future_source';

export function getPreferenceSourceLabel(source: PreferenceSource): string {
  const labels: Record<PreferenceSource, string> = {
    behavior_analysis: 'Behavior Analysis',
    explicit_user_choice: 'Explicit User Choice',
    profile_template: 'Profile Template',
    imported: 'Imported',
    future_source: 'Future Source',
  };
  return labels[source] ?? 'Unknown';
}

export interface PreferenceEvidence {
  source: string;
  metric: string;
  value: string | number | boolean;
  timestamp: string;
  description: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

// ── Behavior Analysis ────────────────────────────────────────

export type BehaviorEventType =
  | 'recommendation_accepted'
  | 'recommendation_dismissed'
  | 'tool_used'
  | 'report_viewed'
  | 'navigation'
  | 'goal_created'
  | 'goal_completed'
  | 'workspace_used'
  | 'session_started'
  | 'session_ended'
  | 'future_behavior';

export function getBehaviorEventLabel(type: BehaviorEventType): string {
  const labels: Record<BehaviorEventType, string> = {
    recommendation_accepted: 'Recommendation Accepted',
    recommendation_dismissed: 'Recommendation Dismissed',
    tool_used: 'Tool Used',
    report_viewed: 'Report Viewed',
    navigation: 'Navigation',
    goal_created: 'Goal Created',
    goal_completed: 'Goal Completed',
    workspace_used: 'Workspace Used',
    session_started: 'Session Started',
    session_ended: 'Session Ended',
    future_behavior: 'Future Behavior',
  };
  return labels[type] ?? 'Unknown';
}

export interface BehaviorEvent {
  id: string;
  type: BehaviorEventType;
  userId: string;
  timestamp: string;
  targetId: string | null;
  targetType: string | null;
  context: BehaviorContext;
  futureMetadata: Record<string, unknown>;
}

export interface BehaviorContext {
  sessionId: string | null;
  profileType: WorkspaceProfileType | null;
  page: string | null;
  duration: number | null;
  futureMetadata: Record<string, unknown>;
}

export interface BehaviorAnalysisResult {
  userId: string;
  totalEvents: number;
  toolUsage: ToolUsageStats[];
  navigationPatterns: NavigationPattern[];
  recommendationAcceptanceRate: number;
  preferredReports: string[];
  activeHours: ActiveHoursStats[];
  sessionFrequency: number;
  averageSessionDuration: number;
  goalUsage: GoalUsageStats[];
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface ToolUsageStats {
  toolId: string;
  usageCount: number;
  lastUsedAt: string;
  averageFrequency: number;
  futureMetadata: Record<string, unknown>;
}

export interface NavigationPattern {
  fromPage: string;
  toPage: string;
  frequency: number;
  futureMetadata: Record<string, unknown>;
}

export interface ActiveHoursStats {
  hour: number;
  activityCount: number;
  futureMetadata: Record<string, unknown>;
}

export interface GoalUsageStats {
  goalType: string;
  count: number;
  completionRate: number;
  futureMetadata: Record<string, unknown>;
}

// ── Quick Actions ────────────────────────────────────────────

export interface QuickActionSuggestion {
  actionId: string;
  label: string;
  reason: string;
  confidence: number;
  source: QuickActionSource;
  futureMetadata: Record<string, unknown>;
}

export type QuickActionSource =
  | 'most_used'
  | 'context_aware'
  | 'goal_based'
  | 'profile_based'
  | 'recent'
  | 'future_source';

export function getQuickActionSourceLabel(source: QuickActionSource): string {
  const labels: Record<QuickActionSource, string> = {
    most_used: 'Most Used',
    context_aware: 'Context-Aware',
    goal_based: 'Goal-Based',
    profile_based: 'Profile-Based',
    recent: 'Recent',
    future_source: 'Future Source',
  };
  return labels[source] ?? 'Unknown';
}

// ── Workspace Templates ──────────────────────────────────────

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  profileType: WorkspaceProfileType;
  layout: WorkspaceLayout;
  quickActions: string[];
  preferredReports: string[];
  notificationPreferences: NotificationPreferences;
  defaultGoals: string[];
  preferredTools: string[];
  aiInteractionStyle: AIInteractionStyle;
  widgetOrdering: string[];
  isEnterprise: boolean;
  tags: string[];
  createdBy: string;
  createdAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface WorkspaceTemplatePlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getTemplates(): WorkspaceTemplate[];
}

// ── Personalization Suggestions ──────────────────────────────

export interface PersonalizationSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  currentValue: unknown;
  suggestedValue: unknown;
  confidence: number;
  evidence: PreferenceEvidence[];
  actionable: boolean;
  dismissed: boolean;
  createdAt: string;
  futureMetadata: Record<string, unknown>;
}

export type SuggestionType =
  | 'layout_change'
  | 'quick_action_add'
  | 'quick_action_remove'
  | 'widget_reorder'
  | 'notification_adjustment'
  | 'interaction_style'
  | 'report_favorite'
  | 'tool_favorite'
  | 'goal_suggestion'
  | 'future_suggestion';

export function getSuggestionTypeLabel(type: SuggestionType): string {
  const labels: Record<SuggestionType, string> = {
    layout_change: 'Layout Change',
    quick_action_add: 'Add Quick Action',
    quick_action_remove: 'Remove Quick Action',
    widget_reorder: 'Reorder Widgets',
    notification_adjustment: 'Notification Adjustment',
    interaction_style: 'Interaction Style',
    report_favorite: 'Favorite Report',
    tool_favorite: 'Favorite Tool',
    goal_suggestion: 'Goal Suggestion',
    future_suggestion: 'Future Suggestion',
  };
  return labels[type] ?? 'Unknown';
}

// ── Recent Activity ──────────────────────────────────────────

export interface RecentActivity {
  id: string;
  type: string;
  label: string;
  timestamp: string;
  targetId: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Events ───────────────────────────────────────────────────

export type WorkspaceEventType =
  | 'workspace_loaded'
  | 'profile_changed'
  | 'preferences_updated'
  | 'layout_personalized'
  | 'suggestions_generated'
  | 'workspace_reset'
  | 'behavior_recorded'
  | 'template_registered'
  | 'template_unregistered'
  | 'preferences_imported'
  | 'preferences_exported'
  | 'preference_learned';

export interface WorkspaceEvent {
  type: WorkspaceEventType;
  timestamp: string;
  data: unknown;
}

export type WorkspaceEventListener = (event: WorkspaceEvent) => void;

// ── Analytics ────────────────────────────────────────────────

export interface WorkspaceAnalyticsData {
  totalSessions: number;
  totalBehaviorEvents: number;
  totalSuggestionsGenerated: number;
  totalSuggestionsAccepted: number;
  totalSuggestionsDismissed: number;
  averageAcceptanceRate: number;
  profileDistribution: Record<string, number>;
  topTools: { toolId: string; count: number }[];
  topReports: { reportId: string; count: number }[];
  averageSessionDuration: number;
  personalizationEnabled: boolean;
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Validation ───────────────────────────────────────────────

export interface WorkspaceValidationResult {
  valid: boolean;
  errors: WorkspaceValidationError[];
  warnings: WorkspaceValidationWarning[];
  futureMetadata: Record<string, unknown>;
}

export interface WorkspaceValidationError {
  code: string;
  message: string;
  field: string;
}

export interface WorkspaceValidationWarning {
  code: string;
  message: string;
  field: string;
}

// ── Configuration ────────────────────────────────────────────

export interface WorkspaceConfiguration {
  configVersion: string;
  preferenceRules: PreferenceRules;
  templateDefinitions: TemplateDefinition[];
  featureFlags: WorkspaceFeatureFlags;
  enterprisePolicies: EnterprisePolicies;
  privacySettings: PrivacySettings;
  performanceTargets: WorkspacePerformanceTargets;
  futureMetadata: Record<string, unknown>;
}

export interface PreferenceRules {
  minConfidenceThreshold: number;
  maxLearnedPreferences: number;
  behaviorAnalysisWindowDays: number;
  suggestionCooldownHours: number;
  maxSuggestionsPerSession: number;
  futureMetadata: Record<string, unknown>;
}

export interface TemplateDefinition {
  profileType: WorkspaceProfileType;
  templateName: string;
  description: string;
  isEnterprise: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface WorkspaceFeatureFlags {
  enablePersonalization: boolean;
  enableBehaviorAnalysis: boolean;
  enableLayoutPersonalization: boolean;
  enableQuickActionPersonalization: boolean;
  enableRecommendationPersonalization: boolean;
  enableInteractionPreferences: boolean;
  enableTemplates: boolean;
  enableImportExport: boolean;
  enableAnalytics: boolean;
  enableEvents: boolean;
  enablePlugins: boolean;
  enableManualMode: boolean;
  futureFlags: Record<string, boolean>;
}

export interface EnterprisePolicies {
  enforceProfiles: boolean;
  allowedProfiles: WorkspaceProfileType[];
  blockCustomProfiles: boolean;
  blockImportExport: boolean;
  requireApproval: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface PrivacySettings {
  collectBehaviorData: boolean;
  sharePreferencesAcrossDevices: boolean;
  anonymizeAnalytics: boolean;
  allowDataExport: boolean;
  retentionDays: number;
  futureMetadata: Record<string, unknown>;
}

export interface WorkspacePerformanceTargets {
  workspaceLoadTargetMs: number;
  preferenceEvaluationTargetMs: number;
  suggestionGenerationTargetMs: number;
  behaviorAnalysisTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Import/Export ────────────────────────────────────────────

export interface PreferenceExportData {
  version: string;
  exportedAt: string;
  userId: string;
  preferences: UserPreferences;
  profile: WorkspaceProfile | null;
  templates: WorkspaceTemplate[];
  futureMetadata: Record<string, unknown>;
}

export interface PreferenceImportResult {
  success: boolean;
  importedPreferences: UserPreferences | null;
  importedProfile: WorkspaceProfile | null;
  importedTemplateCount: number;
  errors: string[];
  warnings: string[];
  futureMetadata: Record<string, unknown>;
}

// ── Personalization Plugin ───────────────────────────────────

export interface PersonalizationPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getProfileTemplates?(): WorkspaceProfile[];
  getWorkspaceTemplates?(): WorkspaceTemplate[];
  analyzeBehavior?(events: BehaviorEvent[]): Partial<BehaviorAnalysisResult>;
  generateSuggestions?(preferences: UserPreferences, analysis: BehaviorAnalysisResult | null): PersonalizationSuggestion[];
}

// ── ID Generators ────────────────────────────────────────────

export function generatePreferenceId(): string {
  return `pref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateBehaviorEventId(): string {
  return `behav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateSuggestionId(): string {
  return `sugg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateProfileId(): string {
  return `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateTemplateId(): string {
  return `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateActivityId(): string {
  return `activity_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Default Factories ────────────────────────────────────────

export function createDefaultNotificationPreferences(): NotificationPreferences {
  return {
    enableNotifications: true,
    enableSound: true,
    enableDesktop: true,
    enableEmail: false,
    priorityThreshold: 'medium',
    quietHoursStart: null,
    quietHoursEnd: null,
    futureMetadata: {},
  };
}

export function createDefaultWorkspaceLayout(): WorkspaceLayout {
  return {
    widgets: [
      { widgetId: 'health_score', visible: true, order: 0, column: 0, row: 0, width: 2, height: 1, futureMetadata: {} },
      { widgetId: 'recommendations', visible: true, order: 1, column: 0, row: 1, width: 2, height: 2, futureMetadata: {} },
      { widgetId: 'timeline', visible: true, order: 2, column: 2, row: 0, width: 1, height: 3, futureMetadata: {} },
      { widgetId: 'goals', visible: true, order: 3, column: 0, row: 3, width: 1, height: 1, futureMetadata: {} },
      { widgetId: 'device_profile', visible: true, order: 4, column: 1, row: 3, width: 1, height: 1, futureMetadata: {} },
    ],
    columns: 3,
    compactMode: false,
    sidebarCollapsed: false,
    theme: 'auto',
    futureMetadata: {},
  };
}

export function createDefaultUserPreferences(userId: string): UserPreferences {
  return {
    userId,
    profileType: 'default',
    layout: createDefaultWorkspaceLayout(),
    quickActions: ['optimize', 'report', 'health_check'],
    favoriteReports: [],
    frequentlyUsedTools: [],
    recentActivities: [],
    notificationPreferences: createDefaultNotificationPreferences(),
    defaultGoals: [],
    aiInteractionStyle: 'detailed',
    preferredIntentTypes: [],
    preferredCapabilities: [],
    widgetOrdering: [],
    personalizationEnabled: true,
    manualMode: false,
    learnedPreferences: [],
    futureMetadata: {},
  };
}

export function createDefaultPreferenceRules(): PreferenceRules {
  return {
    minConfidenceThreshold: 0.5,
    maxLearnedPreferences: 100,
    behaviorAnalysisWindowDays: 30,
    suggestionCooldownHours: 24,
    maxSuggestionsPerSession: 5,
    futureMetadata: {},
  };
}

export function createDefaultTemplateDefinitions(): TemplateDefinition[] {
  return [
    { profileType: 'default', templateName: 'Default Workspace', description: 'Balanced workspace for general use', isEnterprise: false, futureMetadata: {} },
    { profileType: 'performance', templateName: 'Performance Focus', description: 'Optimized for performance monitoring', isEnterprise: false, futureMetadata: {} },
    { profileType: 'gaming', templateName: 'Gaming Setup', description: 'Optimized for gaming systems', isEnterprise: false, futureMetadata: {} },
    { profileType: 'trading', templateName: 'Trading Workstation', description: 'Optimized for trading systems', isEnterprise: false, futureMetadata: {} },
    { profileType: 'developer', templateName: 'Developer Workspace', description: 'Optimized for development', isEnterprise: false, futureMetadata: {} },
    { profileType: 'creative', templateName: 'Creative Studio', description: 'Optimized for creative work', isEnterprise: false, futureMetadata: {} },
    { profileType: 'business', templateName: 'Business Dashboard', description: 'Optimized for business use', isEnterprise: false, futureMetadata: {} },
    { profileType: 'student', templateName: 'Student Workspace', description: 'Optimized for study and learning', isEnterprise: false, futureMetadata: {} },
    { profileType: 'privacy', templateName: 'Privacy First', description: 'Minimal data collection, maximum privacy', isEnterprise: false, futureMetadata: {} },
  ];
}

export function createDefaultWorkspaceFeatureFlags(): WorkspaceFeatureFlags {
  return {
    enablePersonalization: true,
    enableBehaviorAnalysis: true,
    enableLayoutPersonalization: true,
    enableQuickActionPersonalization: true,
    enableRecommendationPersonalization: true,
    enableInteractionPreferences: true,
    enableTemplates: true,
    enableImportExport: true,
    enableAnalytics: true,
    enableEvents: true,
    enablePlugins: true,
    enableManualMode: true,
    futureFlags: {},
  };
}

export function createDefaultEnterprisePolicies(): EnterprisePolicies {
  return {
    enforceProfiles: false,
    allowedProfiles: ['default', 'performance', 'gaming', 'trading', 'developer', 'creative', 'business', 'student', 'privacy', 'custom'],
    blockCustomProfiles: false,
    blockImportExport: false,
    requireApproval: false,
    futureMetadata: {},
  };
}

export function createDefaultPrivacySettings(): PrivacySettings {
  return {
    collectBehaviorData: true,
    sharePreferencesAcrossDevices: false,
    anonymizeAnalytics: true,
    allowDataExport: true,
    retentionDays: 90,
    futureMetadata: {},
  };
}

export function createDefaultWorkspacePerformanceTargets(): WorkspacePerformanceTargets {
  return {
    workspaceLoadTargetMs: 200,
    preferenceEvaluationTargetMs: 100,
    suggestionGenerationTargetMs: 150,
    behaviorAnalysisTargetMs: 200,
    futureMetadata: {},
  };
}

export function createDefaultWorkspaceConfiguration(): WorkspaceConfiguration {
  return {
    configVersion: '1.0.0',
    preferenceRules: createDefaultPreferenceRules(),
    templateDefinitions: createDefaultTemplateDefinitions(),
    featureFlags: createDefaultWorkspaceFeatureFlags(),
    enterprisePolicies: createDefaultEnterprisePolicies(),
    privacySettings: createDefaultPrivacySettings(),
    performanceTargets: createDefaultWorkspacePerformanceTargets(),
    futureMetadata: {},
  };
}

// ── Built-in Profile Factory ─────────────────────────────────

export function createBuiltinProfiles(): WorkspaceProfile[] {
  const now = new Date().toISOString();
  const profiles: WorkspaceProfile[] = [
    {
      id: 'builtin_default',
      type: 'default',
      label: 'Default',
      description: 'Balanced workspace for general use',
      layout: createDefaultWorkspaceLayout(),
      quickActions: ['optimize', 'report', 'health_check'],
      preferredReports: [],
      notificationPreferences: createDefaultNotificationPreferences(),
      defaultGoals: [],
      preferredTools: [],
      aiInteractionStyle: 'detailed',
      widgetOrdering: ['health_score', 'recommendations', 'timeline', 'goals', 'device_profile'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    },
    {
      id: 'builtin_performance',
      type: 'performance',
      label: 'Performance',
      description: 'Optimized for performance monitoring',
      layout: { ...createDefaultWorkspaceLayout(), theme: 'dark', compactMode: true },
      quickActions: ['optimize', 'benchmark', 'health_check', 'monitor'],
      preferredReports: ['performance_report'],
      notificationPreferences: { ...createDefaultNotificationPreferences(), priorityThreshold: 'high' },
      defaultGoals: ['maximize_performance'],
      preferredTools: ['create_optimization_session', 'explain_health'],
      aiInteractionStyle: 'technical',
      widgetOrdering: ['health_score', 'recommendations', 'goals', 'timeline', 'device_profile'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    },
    {
      id: 'builtin_gaming',
      type: 'gaming',
      label: 'Gaming',
      description: 'Optimized for gaming systems',
      layout: { ...createDefaultWorkspaceLayout(), theme: 'dark' },
      quickActions: ['optimize', 'game_mode', 'benchmark', 'health_check'],
      preferredReports: ['gaming_performance_report'],
      notificationPreferences: { ...createDefaultNotificationPreferences(), enableSound: false, priorityThreshold: 'high' },
      defaultGoals: ['maximize_fps', 'reduce_latency'],
      preferredTools: ['create_optimization_session', 'explain_health'],
      aiInteractionStyle: 'concise',
      widgetOrdering: ['health_score', 'goals', 'recommendations', 'timeline', 'device_profile'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    },
    {
      id: 'builtin_trading',
      type: 'trading',
      label: 'Trading',
      description: 'Optimized for trading systems',
      layout: { ...createDefaultWorkspaceLayout(), columns: 4, compactMode: true },
      quickActions: ['optimize', 'latency_check', 'health_check', 'report'],
      preferredReports: ['latency_report', 'system_stability_report'],
      notificationPreferences: { ...createDefaultNotificationPreferences(), priorityThreshold: 'critical', enableSound: true },
      defaultGoals: ['minimize_latency', 'maximize_stability'],
      preferredTools: ['create_optimization_session', 'explain_health', 'generate_report'],
      aiInteractionStyle: 'concise',
      widgetOrdering: ['health_score', 'timeline', 'recommendations', 'goals', 'device_profile'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    },
    {
      id: 'builtin_developer',
      type: 'developer',
      label: 'Developer',
      description: 'Optimized for development',
      layout: { ...createDefaultWorkspaceLayout(), theme: 'dark', sidebarCollapsed: false },
      quickActions: ['optimize', 'log_analysis', 'health_check', 'report'],
      preferredReports: ['system_log_report', 'optimization_report'],
      notificationPreferences: createDefaultNotificationPreferences(),
      defaultGoals: ['maintain_stability'],
      preferredTools: ['explain_health', 'generate_report', 'start_maintenance'],
      aiInteractionStyle: 'technical',
      widgetOrdering: ['timeline', 'recommendations', 'health_score', 'goals', 'device_profile'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    },
    {
      id: 'builtin_creative',
      type: 'creative',
      label: 'Creative',
      description: 'Optimized for creative work',
      layout: { ...createDefaultWorkspaceLayout(), theme: 'light' },
      quickActions: ['optimize', 'resource_check', 'health_check', 'report'],
      preferredReports: ['resource_usage_report'],
      notificationPreferences: createDefaultNotificationPreferences(),
      defaultGoals: ['balance_resources'],
      preferredTools: ['create_optimization_session', 'explain_health'],
      aiInteractionStyle: 'detailed',
      widgetOrdering: ['recommendations', 'health_score', 'goals', 'device_profile', 'timeline'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    },
    {
      id: 'builtin_business',
      type: 'business',
      label: 'Business',
      description: 'Optimized for business use',
      layout: { ...createDefaultWorkspaceLayout(), theme: 'light', columns: 4 },
      quickActions: ['report', 'optimize', 'health_check', 'goals'],
      preferredReports: ['executive_summary', 'performance_report'],
      notificationPreferences: { ...createDefaultNotificationPreferences(), enableEmail: true, priorityThreshold: 'high' },
      defaultGoals: ['maintain_performance'],
      preferredTools: ['generate_report', 'explain_health', 'create_goal'],
      aiInteractionStyle: 'detailed',
      widgetOrdering: ['health_score', 'goals', 'recommendations', 'timeline', 'device_profile'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    },
    {
      id: 'builtin_student',
      type: 'student',
      label: 'Student',
      description: 'Optimized for study and learning',
      layout: { ...createDefaultWorkspaceLayout(), theme: 'light' },
      quickActions: ['health_check', 'report', 'learn', 'optimize'],
      preferredReports: ['learning_report'],
      notificationPreferences: { ...createDefaultNotificationPreferences(), quietHoursStart: '22:00', quietHoursEnd: '07:00' },
      defaultGoals: ['learn_system'],
      preferredTools: ['explain_health', 'generate_report'],
      aiInteractionStyle: 'beginner',
      widgetOrdering: ['recommendations', 'health_score', 'timeline', 'goals', 'device_profile'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    },
    {
      id: 'builtin_privacy',
      type: 'privacy',
      label: 'Privacy First',
      description: 'Minimal data collection, maximum privacy',
      layout: { ...createDefaultWorkspaceLayout(), theme: 'dark', compactMode: true },
      quickActions: ['health_check', 'optimize'],
      preferredReports: [],
      notificationPreferences: { ...createDefaultNotificationPreferences(), enableDesktop: false, enableEmail: false, priorityThreshold: 'critical' },
      defaultGoals: [],
      preferredTools: ['explain_health'],
      aiInteractionStyle: 'concise',
      widgetOrdering: ['health_score', 'recommendations', 'goals', 'device_profile', 'timeline'],
      isBuiltIn: true,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    },
  ];
  return profiles;
}
