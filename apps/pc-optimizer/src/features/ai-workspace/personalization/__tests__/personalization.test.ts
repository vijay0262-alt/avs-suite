/**
 * AI Workspace Personalization Platform — Comprehensive Test Suite
 *
 * EPIC 5 PHASE A PART 7
 *
 * Tests cover:
 * - Workspace profiles
 * - Preference learning
 * - Layout personalization
 * - Quick actions
 * - Import/Export
 * - Transparency controls
 * - Events
 * - Regression
 * - Performance
 * - Edge cases
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WorkspacePersonalizationManager,
  WorkspaceProfileManager,
  PreferenceEngine,
  BehaviorAnalyzer,
  LayoutPersonalizer,
  QuickActionPersonalizer,
  RecommendationPersonalizer,
  InteractionPreferenceEngine,
  WorkspaceTemplateRegistry,
  PreferenceImporter,
  PreferenceExporter,
  WorkspaceAnalytics,
  WorkspaceValidator,
  WorkspaceEvents,
  createWorkspaceConfiguration,
  createDefaultUserPreferences,
  createDefaultWorkspaceConfiguration,
  createDefaultWorkspaceLayout,
  createDefaultNotificationPreferences,
  createBuiltinProfiles,
  generateBehaviorEventId,
  generateSuggestionId,
  generateProfileId,
  generateTemplateId,
  generateActivityId,
} from '../index';
import type {
  WorkspaceConfiguration,
  UserPreferences,
  BehaviorEvent,
  WorkspaceProfileType,
  WorkspaceTemplate,
  PersonalizationSuggestion,
  PreferenceExportData,
  PersonalizationPlugin,
  WorkspaceTemplatePlugin,
  BehaviorAnalysisResult,
} from '../index';

// ── Test Helpers ───────────────────────────────────────────────

function createMockBehaviorEvents(userId: string, count: number): BehaviorEvent[] {
  const events: BehaviorEvent[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    events.push({
      id: generateBehaviorEventId(),
      type: i % 3 === 0 ? 'tool_used' : i % 3 === 1 ? 'recommendation_accepted' : 'report_viewed',
      userId,
      timestamp: new Date(now - i * 3600000).toISOString(),
      targetId: i % 3 === 0 ? 'create_optimization_session' : i % 3 === 1 ? 'rec_001' : 'performance_report',
      targetType: i % 3 === 0 ? 'tool' : i % 3 === 1 ? 'recommendation' : 'report',
      context: {
        sessionId: `session_${Math.floor(i / 5)}`,
        profileType: 'default',
        page: i % 2 === 0 ? 'dashboard' : 'reports',
        duration: null,
        futureMetadata: {},
      },
      futureMetadata: {},
    });
  }

  return events;
}

function createMockPlugin(name: string = 'test_plugin'): PersonalizationPlugin {
  return {
    getPluginName: () => name,
    getVersion: () => '1.0.0',
    getPriority: () => 10,
    isAvailable: () => true,
    generateSuggestions: (_prefs: UserPreferences, _analysis: BehaviorAnalysisResult | null): PersonalizationSuggestion[] => {
      return [{
        id: generateSuggestionId(),
        type: 'goal_suggestion',
        title: 'Plugin suggestion',
        description: 'A suggestion from the test plugin',
        currentValue: null,
        suggestedValue: 'test_goal',
        confidence: 0.8,
        evidence: [],
        actionable: true,
        dismissed: false,
        createdAt: new Date().toISOString(),
        futureMetadata: {},
      }];
    },
  };
}

function createMockTemplatePlugin(name: string = 'tmpl_plugin'): WorkspaceTemplatePlugin {
  const now = new Date().toISOString();
  return {
    getPluginName: () => name,
    getVersion: () => '1.0.0',
    getPriority: () => 5,
    isAvailable: () => true,
    getTemplates: (): WorkspaceTemplate[] => [{
      id: 'plugin_tmpl_001',
      name: 'Plugin Template',
      description: 'Template from plugin',
      profileType: 'developer',
      layout: createDefaultWorkspaceLayout(),
      quickActions: ['optimize'],
      preferredReports: [],
      notificationPreferences: createDefaultNotificationPreferences(),
      defaultGoals: [],
      preferredTools: [],
      aiInteractionStyle: 'technical',
      widgetOrdering: [],
      isEnterprise: false,
      tags: ['plugin'],
      createdBy: 'plugin',
      createdAt: now,
      futureMetadata: {},
    }],
  };
}

// ── Types & Helpers Tests ──────────────────────────────────────

describe('Types & Helper Functions', () => {
  it('should generate unique IDs', () => {
    const id1 = generateBehaviorEventId();
    const id2 = generateBehaviorEventId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^behav_/);
  });

  it('should generate suggestion IDs', () => {
    const id = generateSuggestionId();
    expect(id).toMatch(/^sugg_/);
  });

  it('should generate profile IDs', () => {
    const id = generateProfileId();
    expect(id).toMatch(/^profile_/);
  });

  it('should generate template IDs', () => {
    const id = generateTemplateId();
    expect(id).toMatch(/^tmpl_/);
  });

  it('should generate activity IDs', () => {
    const id = generateActivityId();
    expect(id).toMatch(/^activity_/);
  });

  it('should create default user preferences', () => {
    const prefs = createDefaultUserPreferences('user_001');
    expect(prefs.userId).toBe('user_001');
    expect(prefs.profileType).toBe('default');
    expect(prefs.personalizationEnabled).toBe(true);
    expect(prefs.manualMode).toBe(false);
    expect(prefs.learnedPreferences).toEqual([]);
    expect(prefs.layout.widgets.length).toBeGreaterThan(0);
  });

  it('should create default workspace layout', () => {
    const layout = createDefaultWorkspaceLayout();
    expect(layout.columns).toBe(3);
    expect(layout.compactMode).toBe(false);
    expect(layout.theme).toBe('auto');
    expect(layout.widgets.length).toBe(5);
  });

  it('should create default notification preferences', () => {
    const prefs = createDefaultNotificationPreferences();
    expect(prefs.enableNotifications).toBe(true);
    expect(prefs.priorityThreshold).toBe('medium');
    expect(prefs.quietHoursStart).toBeNull();
  });

  it('should create builtin profiles', () => {
    const profiles = createBuiltinProfiles();
    expect(profiles.length).toBe(9);
    const types = profiles.map((p) => p.type);
    expect(types).toContain('default');
    expect(types).toContain('performance');
    expect(types).toContain('gaming');
    expect(types).toContain('trading');
    expect(types).toContain('developer');
    expect(types).toContain('creative');
    expect(types).toContain('business');
    expect(types).toContain('student');
    expect(types).toContain('privacy');
    expect(profiles.every((p) => p.isBuiltIn)).toBe(true);
  });
});

// ── Configuration Tests ────────────────────────────────────────

describe('WorkspaceConfiguration', () => {
  it('should create default configuration', () => {
    const config = createDefaultWorkspaceConfiguration();
    expect(config.configVersion).toBe('1.0.0');
    expect(config.featureFlags.enablePersonalization).toBe(true);
    expect(config.privacySettings.collectBehaviorData).toBe(true);
  });

  it('should create configuration with overrides', () => {
    const config = createWorkspaceConfiguration({
      featureFlags: { enablePersonalization: false },
      privacySettings: { collectBehaviorData: false },
    });
    expect(config.featureFlags.enablePersonalization).toBe(false);
    expect(config.privacySettings.collectBehaviorData).toBe(false);
    expect(config.featureFlags.enableBehaviorAnalysis).toBe(true);
  });

  it('should merge deep nested objects', () => {
    const config = createWorkspaceConfiguration({
      preferenceRules: { minConfidenceThreshold: 0.8 },
    });
    expect(config.preferenceRules.minConfidenceThreshold).toBe(0.8);
    expect(config.preferenceRules.maxLearnedPreferences).toBe(100);
  });
});

// ── Events Tests ───────────────────────────────────────────────

describe('WorkspaceEvents', () => {
  let events: WorkspaceEvents;

  beforeEach(() => {
    events = new WorkspaceEvents();
  });

  it('should emit events to registered listeners', () => {
    const listener = vi.fn();
    events.on('workspace_loaded', listener);
    events.emit({ type: 'workspace_loaded', timestamp: new Date().toISOString(), data: { userId: 'test' } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should not emit to unregistered listeners', () => {
    const listener = vi.fn();
    events.on('workspace_loaded', listener);
    events.off('workspace_loaded', listener);
    events.emit({ type: 'workspace_loaded', timestamp: new Date().toISOString(), data: {} });
    expect(listener).not.toHaveBeenCalled();
  });

  it('should handle listener errors gracefully', () => {
    const goodListener = vi.fn();
    const badListener = vi.fn(() => { throw new Error('listener error'); });
    events.on('workspace_loaded', badListener);
    events.on('workspace_loaded', goodListener);
    events.emit({ type: 'workspace_loaded', timestamp: new Date().toISOString(), data: {} });
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('should count listeners', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    events.on('workspace_loaded', l1);
    events.on('workspace_loaded', l2);
    events.on('profile_changed', l1);
    expect(events.listenerCount('workspace_loaded')).toBe(2);
    expect(events.listenerCount()).toBe(3);
  });

  it('should remove all listeners', () => {
    const l1 = vi.fn();
    events.on('workspace_loaded', l1);
    events.on('profile_changed', l1);
    events.removeAllListeners();
    expect(events.listenerCount()).toBe(0);
  });

  it('should remove listeners for specific type', () => {
    const l1 = vi.fn();
    events.on('workspace_loaded', l1);
    events.on('profile_changed', l1);
    events.removeListenersForType('workspace_loaded');
    expect(events.listenerCount('workspace_loaded')).toBe(0);
    expect(events.listenerCount('profile_changed')).toBe(1);
  });
});

// ── Validator Tests ─────────────────────────────────────────────

describe('WorkspaceValidator', () => {
  let config: WorkspaceConfiguration;
  let validator: WorkspaceValidator;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    validator = new WorkspaceValidator(config);
  });

  it('should validate valid preferences', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const result = validator.validatePreferences(prefs);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should detect missing user ID', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), userId: '' };
    const result = validator.validatePreferences(prefs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_USER_ID')).toBe(true);
  });

  it('should detect missing profile type', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), profileType: '' as WorkspaceProfileType };
    const result = validator.validatePreferences(prefs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_PROFILE_TYPE')).toBe(true);
  });

  it('should enforce enterprise policies on profiles', () => {
    config.enterprisePolicies.enforceProfiles = true;
    config.enterprisePolicies.allowedProfiles = ['default', 'performance'];
    validator.updateConfig(config);

    const prefs = { ...createDefaultUserPreferences('user_001'), profileType: 'gaming' as WorkspaceProfileType };
    const result = validator.validatePreferences(prefs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'PROFILE_NOT_ALLOWED')).toBe(true);
  });

  it('should block custom profiles when policy is set', () => {
    config.enterprisePolicies.blockCustomProfiles = true;
    validator.updateConfig(config);

    const prefs = { ...createDefaultUserPreferences('user_001'), profileType: 'custom' as WorkspaceProfileType };
    const result = validator.validatePreferences(prefs);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'CUSTOM_PROFILE_BLOCKED')).toBe(true);
  });

  it('should validate profiles', () => {
    const profiles = createBuiltinProfiles();
    for (const profile of profiles) {
      const result = validator.validateProfile(profile);
      expect(result.valid).toBe(true);
    }
  });

  it('should validate templates', () => {
    const template: WorkspaceTemplate = {
      id: 'tmpl_test',
      name: 'Test Template',
      description: 'Test',
      profileType: 'default',
      layout: createDefaultWorkspaceLayout(),
      quickActions: [],
      preferredReports: [],
      notificationPreferences: createDefaultNotificationPreferences(),
      defaultGoals: [],
      preferredTools: [],
      aiInteractionStyle: 'detailed',
      widgetOrdering: [],
      isEnterprise: false,
      tags: [],
      createdBy: 'test',
      createdAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const result = validator.validateTemplate(template);
    expect(result.valid).toBe(true);
  });

  it('should validate behavior events', () => {
    const event: BehaviorEvent = {
      id: 'evt_001',
      type: 'tool_used',
      userId: 'user_001',
      timestamp: new Date().toISOString(),
      targetId: 'tool_001',
      targetType: 'tool',
      context: { sessionId: 'sess_001', profileType: 'default', page: 'dashboard', duration: null, futureMetadata: {} },
      futureMetadata: {},
    };
    const result = validator.validateBehaviorEvent(event);
    expect(result.valid).toBe(true);
  });

  it('should detect invalid confidence values', () => {
    const suggestion: PersonalizationSuggestion = {
      id: 'sugg_001',
      type: 'layout_change',
      title: 'Test',
      description: 'Test',
      currentValue: null,
      suggestedValue: 'test',
      confidence: 1.5,
      evidence: [],
      actionable: true,
      dismissed: false,
      createdAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const result = validator.validateSuggestion(suggestion);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_CONFIDENCE')).toBe(true);
  });

  it('should validate export data', () => {
    const data: PreferenceExportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      userId: 'user_001',
      preferences: createDefaultUserPreferences('user_001'),
      profile: null,
      templates: [],
      futureMetadata: {},
    };
    const result = validator.validateExportData(data);
    expect(result.valid).toBe(true);
  });
});

// ── Behavior Analyzer Tests ────────────────────────────────────

describe('BehaviorAnalyzer', () => {
  let config: WorkspaceConfiguration;
  let analyzer: BehaviorAnalyzer;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    analyzer = new BehaviorAnalyzer(config);
  });

  it('should record and retrieve events', () => {
    const events = createMockBehaviorEvents('user_001', 5);
    analyzer.recordEvents(events);
    const retrieved = analyzer.getEvents('user_001');
    expect(retrieved.length).toBe(5);
  });

  it('should analyze tool usage', () => {
    const events = createMockBehaviorEvents('user_001', 10);
    analyzer.recordEvents(events);
    const result = analyzer.analyze('user_001');
    expect(result.toolUsage.length).toBeGreaterThan(0);
    expect(result.toolUsage[0]!.toolId).toBe('create_optimization_session');
  });

  it('should analyze recommendation acceptance rate', () => {
    const events = createMockBehaviorEvents('user_001', 10);
    analyzer.recordEvents(events);
    const result = analyzer.analyze('user_001');
    expect(result.recommendationAcceptanceRate).toBeGreaterThan(0);
  });

  it('should analyze preferred reports', () => {
    const events = createMockBehaviorEvents('user_001', 10);
    analyzer.recordEvents(events);
    const result = analyzer.analyze('user_001');
    expect(result.preferredReports).toContain('performance_report');
  });

  it('should analyze active hours', () => {
    const events = createMockBehaviorEvents('user_001', 10);
    analyzer.recordEvents(events);
    const result = analyzer.analyze('user_001');
    expect(result.activeHours.length).toBeGreaterThan(0);
  });

  it('should return empty analysis for unknown user', () => {
    const result = analyzer.analyze('unknown_user');
    expect(result.totalEvents).toBe(0);
    expect(result.toolUsage).toEqual([]);
  });

  it('should clear events for a user', () => {
    analyzer.recordEvents(createMockBehaviorEvents('user_001', 5));
    analyzer.clear('user_001');
    expect(analyzer.getEvents('user_001')).toEqual([]);
  });

  it('should clear all events', () => {
    analyzer.recordEvents(createMockBehaviorEvents('user_001', 5));
    analyzer.recordEvents(createMockBehaviorEvents('user_002', 3));
    analyzer.clearAll();
    expect(analyzer.getEvents('user_001')).toEqual([]);
    expect(analyzer.getEvents('user_002')).toEqual([]);
  });

  it('should filter events outside analysis window', () => {
    config.preferenceRules.behaviorAnalysisWindowDays = 1;
    analyzer.updateConfig(config);

    const oldEvent: BehaviorEvent = {
      id: generateBehaviorEventId(),
      type: 'tool_used',
      userId: 'user_001',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      targetId: 'old_tool',
      targetType: 'tool',
      context: { sessionId: null, profileType: null, page: null, duration: null, futureMetadata: {} },
      futureMetadata: {},
    };
    analyzer.recordEvent(oldEvent);
    const result = analyzer.analyze('user_001');
    expect(result.totalEvents).toBe(0);
  });
});

// ── Preference Engine Tests ────────────────────────────────────

describe('PreferenceEngine', () => {
  let config: WorkspaceConfiguration;
  let engine: PreferenceEngine;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    engine = new PreferenceEngine(config);
  });

  it('should learn from behavior analysis', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 20,
      toolUsage: [{ toolId: 'create_optimization_session', usageCount: 15, lastUsedAt: new Date().toISOString(), averageFrequency: 0.5, futureMetadata: {} }],
      navigationPatterns: [{ fromPage: 'dashboard', toPage: 'reports', frequency: 5, futureMetadata: {} }],
      recommendationAcceptanceRate: 0.8,
      preferredReports: ['performance_report'],
      activeHours: [{ hour: 14, activityCount: 10, futureMetadata: {} }],
      sessionFrequency: 0.5,
      averageSessionDuration: 120000,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };

    const updated = engine.learnFromBehavior(prefs, analysis);
    expect(updated.learnedPreferences.length).toBeGreaterThan(0);
    const toolsPref = updated.learnedPreferences.find((p) => p.key === 'frequently_used_tools');
    expect(toolsPref).toBeDefined();
    expect(toolsPref!.confidence).toBeGreaterThan(0);
  });

  it('should not learn when personalization is disabled', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), personalizationEnabled: false };
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 10,
      toolUsage: [],
      navigationPatterns: [],
      recommendationAcceptanceRate: 0,
      preferredReports: [],
      activeHours: [],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const updated = engine.learnFromBehavior(prefs, analysis);
    expect(updated.learnedPreferences.length).toBe(0);
  });

  it('should not learn in manual mode', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), manualMode: true };
    const updated = engine.learnFromBehavior(prefs, {
      userId: 'user_001', totalEvents: 10, toolUsage: [], navigationPatterns: [],
      recommendationAcceptanceRate: 0, preferredReports: [], activeHours: [],
      sessionFrequency: 0, averageSessionDuration: 0, goalUsage: [],
      generatedAt: new Date().toISOString(), futureMetadata: {},
    });
    expect(updated.learnedPreferences.length).toBe(0);
  });

  it('should set explicit preferences with confidence 1.0', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const updated = engine.setExplicitPreference(prefs, 'aiInteractionStyle', 'technical');
    const learned = updated.learnedPreferences.find((p) => p.key === 'aiInteractionStyle');
    expect(learned).toBeDefined();
    expect(learned!.confidence).toBe(1.0);
    expect(learned!.source).toBe('explicit_user_choice');
    expect(updated.aiInteractionStyle).toBe('technical');
  });

  it('should remove learned preferences', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const withPref = engine.setExplicitPreference(prefs, 'test_key', 'test_value');
    const removed = engine.removeLearnedPreference(withPref, 'test_key');
    expect(removed.learnedPreferences.find((p) => p.key === 'test_key')).toBeUndefined();
  });

  it('should clear all learned preferences', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const withPref1 = engine.setExplicitPreference(prefs, 'key1', 'val1');
    const withPref2 = engine.setExplicitPreference(withPref1, 'key2', 'val2');
    const cleared = engine.clearAllLearned(withPref2);
    expect(cleared.learnedPreferences.length).toBe(0);
  });

  it('should trim learned preferences to max', () => {
    config.preferenceRules.maxLearnedPreferences = 3;
    engine.updateConfig(config);

    let prefs = createDefaultUserPreferences('user_001');
    for (let i = 0; i < 5; i++) {
      prefs = engine.setExplicitPreference(prefs, `key_${i}`, `val_${i}`);
    }
    expect(prefs.learnedPreferences.length).toBe(3);
  });
});

// ── Profile Manager Tests ──────────────────────────────────────

describe('WorkspaceProfileManager', () => {
  let config: WorkspaceConfiguration;
  let manager: WorkspaceProfileManager;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    manager = new WorkspaceProfileManager(config);
  });

  it('should load builtin profiles', () => {
    const profiles = manager.getBuiltinProfiles();
    expect(profiles.length).toBe(9);
  });

  it('should get profile by type', () => {
    const profile = manager.getProfileByType('gaming');
    expect(profile).not.toBeNull();
    expect(profile!.type).toBe('gaming');
  });

  it('should get all profiles', () => {
    const all = manager.getAllProfiles();
    expect(all.length).toBe(9);
  });

  it('should create custom profile', () => {
    const custom = manager.createCustomProfile('custom', 'My Custom', 'Custom description');
    expect(custom.isBuiltIn).toBe(false);
    expect(custom.label).toBe('My Custom');
    expect(manager.getCustomProfiles().length).toBe(1);
  });

  it('should throw when creating custom profile with blocked policy', () => {
    config.enterprisePolicies.blockCustomProfiles = true;
    manager.updateConfig(config);
    expect(() => manager.createCustomProfile('custom', 'Test', 'Test')).toThrow();
  });

  it('should update custom profile', () => {
    const custom = manager.createCustomProfile('custom', 'Test', 'Test');
    const updated = manager.updateCustomProfile(custom.id, { label: 'Updated' });
    expect(updated.label).toBe('Updated');
  });

  it('should not update builtin profile', () => {
    expect(() => manager.updateCustomProfile('builtin_default', { label: 'Hacked' })).toThrow();
  });

  it('should delete custom profile', () => {
    const custom = manager.createCustomProfile('custom', 'Test', 'Test');
    expect(manager.deleteCustomProfile(custom.id)).toBe(true);
    expect(manager.getCustomProfiles().length).toBe(0);
  });

  it('should duplicate a profile', () => {
    const original = manager.getProfileByType('gaming')!;
    const duplicate = manager.duplicateProfile(original.id, 'Gaming Copy');
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.label).toBe('Gaming Copy');
    expect(duplicate.isBuiltIn).toBe(false);
  });

  it('should clear custom profiles', () => {
    manager.createCustomProfile('custom', 'A', 'A');
    manager.createCustomProfile('custom', 'B', 'B');
    manager.clearCustomProfiles();
    expect(manager.getCustomProfiles().length).toBe(0);
  });
});

// ── Layout Personalizer Tests ──────────────────────────────────

describe('LayoutPersonalizer', () => {
  let config: WorkspaceConfiguration;
  let personalizer: LayoutPersonalizer;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    personalizer = new LayoutPersonalizer(config);
  });

  it('should return current layout when personalization disabled', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), personalizationEnabled: false };
    const layout = personalizer.personalize(prefs, null);
    expect(layout).toEqual(prefs.layout);
  });

  it('should return current layout in manual mode', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), manualMode: true };
    const layout = personalizer.personalize(prefs, null);
    expect(layout).toEqual(prefs.layout);
  });

  it('should reorder widgets based on usage', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 20,
      toolUsage: [{ toolId: 'create_optimization_session', usageCount: 10, lastUsedAt: new Date().toISOString(), averageFrequency: 0.3, futureMetadata: {} }],
      navigationPatterns: [],
      recommendationAcceptanceRate: 0,
      preferredReports: [],
      activeHours: [],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const layout = personalizer.personalize(prefs, analysis);
    expect(layout.widgets[0]!.widgetId).toBe('health_score');
  });

  it('should apply widget ordering', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const layout = personalizer.reorderWidgets(prefs.layout, ['goals', 'timeline', 'health_score']);
    expect(layout.widgets[0]!.widgetId).toBe('goals');
    expect(layout.widgets[1]!.widgetId).toBe('timeline');
    expect(layout.widgets[2]!.widgetId).toBe('health_score');
  });

  it('should set widget visibility', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const layout = personalizer.setWidgetVisibility(prefs.layout, 'health_score', false);
    const widget = layout.widgets.find((w) => w.widgetId === 'health_score');
    expect(widget!.visible).toBe(false);
  });

  it('should set theme', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const layout = personalizer.setTheme(prefs.layout, 'dark');
    expect(layout.theme).toBe('dark');
  });

  it('should set compact mode', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const layout = personalizer.setCompactMode(prefs.layout, true);
    expect(layout.compactMode).toBe(true);
  });

  it('should generate layout suggestions', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 20,
      toolUsage: [{ toolId: 'create_optimization_session', usageCount: 10, lastUsedAt: new Date().toISOString(), averageFrequency: 0.3, futureMetadata: {} }],
      navigationPatterns: [],
      recommendationAcceptanceRate: 0,
      preferredReports: [],
      activeHours: [{ hour: 23, activityCount: 15, futureMetadata: {} }],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const suggestions = personalizer.generateLayoutSuggestions(prefs, analysis);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should not generate suggestions when personalization disabled', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), personalizationEnabled: false };
    const suggestions = personalizer.generateLayoutSuggestions(prefs, null);
    expect(suggestions.length).toBe(0);
  });
});

// ── Quick Action Personalizer Tests ────────────────────────────

describe('QuickActionPersonalizer', () => {
  let config: WorkspaceConfiguration;
  let personalizer: QuickActionPersonalizer;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    personalizer = new QuickActionPersonalizer(config);
  });

  it('should return current actions when personalization disabled', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), personalizationEnabled: false };
    const actions = personalizer.personalize(prefs, null, null);
    expect(actions).toEqual(prefs.quickActions);
  });

  it('should prioritize most used actions', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 20,
      toolUsage: [
        { toolId: 'generate_report', usageCount: 10, lastUsedAt: new Date().toISOString(), averageFrequency: 0.3, futureMetadata: {} },
        { toolId: 'create_goal', usageCount: 5, lastUsedAt: new Date().toISOString(), averageFrequency: 0.15, futureMetadata: {} },
      ],
      navigationPatterns: [],
      recommendationAcceptanceRate: 0,
      preferredReports: [],
      activeHours: [],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const actions = personalizer.personalize(prefs, analysis, null);
    expect(actions[0]).toBe('generate_report');
  });

  it('should add action', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const updated = personalizer.addAction(prefs, 'new_action');
    expect(updated.quickActions).toContain('new_action');
  });

  it('should not add duplicate action', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const updated = personalizer.addAction(prefs, 'optimize');
    expect(updated.quickActions.filter((a) => a === 'optimize').length).toBe(1);
  });

  it('should remove action', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const updated = personalizer.removeAction(prefs, 'optimize');
    expect(updated.quickActions).not.toContain('optimize');
  });

  it('should reorder actions', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const updated = personalizer.reorderActions(prefs, ['report', 'optimize']);
    expect(updated.quickActions[0]).toBe('report');
    expect(updated.quickActions[1]).toBe('optimize');
  });

  it('should generate context-aware suggestions', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const suggestions = personalizer.getContextAwareSuggestions(prefs, {
      activeGoals: ['goal_1'],
      currentPage: 'reports',
      profileType: 'gaming',
    });
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should generate suggestions for most used tools', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 20,
      toolUsage: [{ toolId: 'generate_report', usageCount: 10, lastUsedAt: new Date().toISOString(), averageFrequency: 0.3, futureMetadata: {} }],
      navigationPatterns: [],
      recommendationAcceptanceRate: 0,
      preferredReports: [],
      activeHours: [],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const suggestions = personalizer.generateSuggestions(prefs, analysis);
    expect(suggestions.length).toBeGreaterThan(0);
  });
});

// ── Recommendation Personalizer Tests ──────────────────────────

describe('RecommendationPersonalizer', () => {
  let config: WorkspaceConfiguration;
  let personalizer: RecommendationPersonalizer;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    personalizer = new RecommendationPersonalizer(config);
  });

  it('should create filter with defaults when disabled', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), personalizationEnabled: false };
    const filter = personalizer.createFilter(prefs, null);
    expect(filter.categories).toEqual([]);
    expect(filter.maxItems).toBe(20);
  });

  it('should create filter based on behavior', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 20,
      toolUsage: [],
      navigationPatterns: [],
      recommendationAcceptanceRate: 0.8,
      preferredReports: ['perf_report'],
      activeHours: [],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const filter = personalizer.createFilter(prefs, analysis);
    expect(filter.categories).toContain('high_confidence');
  });

  it('should generate suggestions for low acceptance rate', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 20,
      toolUsage: [],
      navigationPatterns: [],
      recommendationAcceptanceRate: 0.2,
      preferredReports: [],
      activeHours: [],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const suggestions = personalizer.generateSuggestions(prefs, analysis);
    expect(suggestions.some((s) => s.type === 'notification_adjustment')).toBe(true);
  });

  it('should filter recommendations by priority', () => {
    const items = [
      { category: 'general', priority: 'low', confidence: 0.5, createdAt: new Date().toISOString() },
      { category: 'general', priority: 'high', confidence: 0.8, createdAt: new Date().toISOString() },
      { category: 'general', priority: 'medium', confidence: 0.6, createdAt: new Date().toISOString() },
    ];
    const filter = { categories: [], minPriority: 'high', sortBy: 'priority' as const, maxItems: 10, futureMetadata: {} };
    const filtered = personalizer.filterRecommendations(items, filter);
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.priority).toBe('high');
  });
});

// ── Interaction Preference Engine Tests ────────────────────────

describe('InteractionPreferenceEngine', () => {
  let config: WorkspaceConfiguration;
  let engine: InteractionPreferenceEngine;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    engine = new InteractionPreferenceEngine(config);
  });

  it('should return current style when disabled', () => {
    const prefs = { ...createDefaultUserPreferences('user_001'), personalizationEnabled: false };
    const style = engine.determineInteractionStyle(prefs, null);
    expect(style).toBe(prefs.aiInteractionStyle);
  });

  it('should detect technical style for power users', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 50,
      toolUsage: Array.from({ length: 12 }, (_, i) => ({ toolId: `tool_${i}`, usageCount: 5, lastUsedAt: new Date().toISOString(), averageFrequency: 0.1, futureMetadata: {} })),
      navigationPatterns: [],
      recommendationAcceptanceRate: 0.7,
      preferredReports: [],
      activeHours: [],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const style = engine.determineInteractionStyle(prefs, analysis);
    expect(style).toBe('technical');
  });

  it('should detect beginner style for new users', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 5,
      toolUsage: [],
      navigationPatterns: [],
      recommendationAcceptanceRate: 0,
      preferredReports: [],
      activeHours: [],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const style = engine.determineInteractionStyle(prefs, analysis);
    expect(style).toBe('beginner');
  });

  it('should set interaction style', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const updated = engine.setInteractionStyle(prefs, 'concise');
    expect(updated.aiInteractionStyle).toBe('concise');
  });

  it('should determine preferred intents from behavior', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const analysis: BehaviorAnalysisResult = {
      userId: 'user_001',
      totalEvents: 20,
      toolUsage: [
        { toolId: 'create_optimization_session', usageCount: 5, lastUsedAt: new Date().toISOString(), averageFrequency: 0.1, futureMetadata: {} },
        { toolId: 'generate_report', usageCount: 3, lastUsedAt: new Date().toISOString(), averageFrequency: 0.05, futureMetadata: {} },
      ],
      navigationPatterns: [],
      recommendationAcceptanceRate: 0,
      preferredReports: [],
      activeHours: [],
      sessionFrequency: 0,
      averageSessionDuration: 0,
      goalUsage: [],
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
    const intents = engine.determinePreferredIntents(prefs, analysis);
    expect(intents).toContain('optimization');
    expect(intents).toContain('reporting');
  });
});

// ── Template Registry Tests ────────────────────────────────────

describe('WorkspaceTemplateRegistry', () => {
  let config: WorkspaceConfiguration;
  let registry: WorkspaceTemplateRegistry;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    registry = new WorkspaceTemplateRegistry(config);
  });

  it('should load default templates', () => {
    const templates = registry.getAllTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  it('should get enterprise templates', () => {
    const enterprise = registry.getEnterpriseTemplates();
    expect(enterprise.length).toBeGreaterThan(0);
    expect(enterprise.every((t) => t.isEnterprise)).toBe(true);
  });

  it('should register a custom template', () => {
    const now = new Date().toISOString();
    const template: WorkspaceTemplate = {
      id: 'custom_tmpl_001',
      name: 'Custom',
      description: 'Custom template',
      profileType: 'default',
      layout: createDefaultWorkspaceLayout(),
      quickActions: [],
      preferredReports: [],
      notificationPreferences: createDefaultNotificationPreferences(),
      defaultGoals: [],
      preferredTools: [],
      aiInteractionStyle: 'detailed',
      widgetOrdering: [],
      isEnterprise: false,
      tags: ['custom'],
      createdBy: 'user',
      createdAt: now,
      futureMetadata: {},
    };
    expect(registry.registerTemplate(template)).toBe(true);
    expect(registry.getTemplate('custom_tmpl_001')).not.toBeNull();
  });

  it('should not register duplicate template', () => {
    const templates = registry.getAllTemplates();
    expect(registry.registerTemplate(templates[0]!)).toBe(false);
  });

  it('should unregister a template', () => {
    const templates = registry.getAllTemplates();
    const id = templates[0]!.id;
    expect(registry.unregisterTemplate(id)).toBe(true);
    expect(registry.getTemplate(id)).toBeNull();
  });

  it('should create template from profile', () => {
    const profiles = createBuiltinProfiles();
    const template = registry.createTemplateFromProfile(profiles[0]!, 'From Profile', 'Test');
    expect(template.name).toBe('From Profile');
    expect(template.profileType).toBe(profiles[0]!.type);
  });

  it('should duplicate a template', () => {
    const templates = registry.getAllTemplates();
    const duplicate = registry.duplicateTemplate(templates[0]!.id, 'Duplicated');
    expect(duplicate.id).not.toBe(templates[0]!.id);
    expect(duplicate.name).toBe('Duplicated');
  });

  it('should register template plugin', () => {
    const plugin = createMockTemplatePlugin();
    registry.registerPlugin(plugin);
    const templates = registry.getAllTemplates();
    expect(templates.some((t) => t.id === 'plugin_tmpl_001')).toBe(true);
  });

  it('should throw when registering plugin with plugins disabled', () => {
    config.featureFlags.enablePlugins = false;
    registry.updateConfig(config);
    expect(() => registry.registerPlugin(createMockTemplatePlugin())).toThrow();
  });

  it('should get templates by tag', () => {
    const templates = registry.getTemplatesByTag('default');
    expect(templates.length).toBeGreaterThan(0);
  });
});

// ── Importer / Exporter Tests ──────────────────────────────────

describe('PreferenceExporter', () => {
  let config: WorkspaceConfiguration;
  let exporter: PreferenceExporter;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    exporter = new PreferenceExporter(config);
  });

  it('should export preferences', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const data = exporter.export('user_001', prefs, null, []);
    expect(data.userId).toBe('user_001');
    expect(data.preferences).toEqual(prefs);
    expect(data.version).toBe(config.configVersion);
  });

  it('should export to JSON', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const data = exporter.export('user_001', prefs, null, []);
    const json = exporter.exportToJson(data);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('should export to file', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const data = exporter.export('user_001', prefs, null, []);
    const file = exporter.exportToFile(data);
    expect(file.filename).toContain('workspace-preferences');
    expect(file.mimeType).toBe('application/json');
  });

  it('should throw when export is blocked', () => {
    config.enterprisePolicies.blockImportExport = true;
    exporter.updateConfig(config);
    expect(() => exporter.export('user_001', createDefaultUserPreferences('user_001'), null, [])).toThrow();
  });

  it('should throw when data export is disabled', () => {
    config.privacySettings.allowDataExport = false;
    exporter.updateConfig(config);
    expect(() => exporter.export('user_001', createDefaultUserPreferences('user_001'), null, [])).toThrow();
  });

  it('should generate export summary', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const data = exporter.export('user_001', prefs, null, []);
    const summary = exporter.exportSummary(data);
    expect(summary.preferenceCount).toBe(0);
    expect(summary.hasProfile).toBe(false);
  });
});

describe('PreferenceImporter', () => {
  let config: WorkspaceConfiguration;
  let importer: PreferenceImporter;
  let exporter: PreferenceExporter;

  beforeEach(() => {
    config = createDefaultWorkspaceConfiguration();
    importer = new PreferenceImporter(config);
    exporter = new PreferenceExporter(config);
  });

  it('should import valid data', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const data = exporter.export('user_001', prefs, null, []);
    const result = importer.import(data);
    expect(result.success).toBe(true);
    expect(result.importedPreferences).not.toBeNull();
    expect(result.importedPreferences!.userId).toBe('user_001');
  });

  it('should import from JSON string', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const data = exporter.export('user_001', prefs, null, []);
    const json = exporter.exportToJson(data);
    const result = importer.importFromJson(json);
    expect(result.success).toBe(true);
  });

  it('should fail on invalid JSON', () => {
    const result = importer.importFromJson('not valid json');
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Invalid JSON format');
  });

  it('should fail when import is blocked', () => {
    const prefs = createDefaultUserPreferences('user_001');
    const data = exporter.export('user_001', prefs, null, []);
    config.enterprisePolicies.blockImportExport = true;
    importer.updateConfig(config);
    const result = importer.import(data);
    expect(result.success).toBe(false);
  });

  it('should strip learned preferences when behavior collection disabled', () => {
    config.privacySettings.collectBehaviorData = false;
    importer.updateConfig(config);

    const prefs = createDefaultUserPreferences('user_001');
    prefs.learnedPreferences = [{
      key: 'test',
      value: 'val',
      confidence: 0.8,
      evidence: [],
      learnedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'behavior_analysis',
      futureMetadata: {},
    }];

    const data: PreferenceExportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      userId: 'user_001',
      preferences: prefs,
      profile: null,
      templates: [],
      futureMetadata: {},
    };

    const result = importer.import(data);
    expect(result.success).toBe(true);
    expect(result.importedPreferences!.learnedPreferences.length).toBe(0);
  });
});

// ── Analytics Tests ────────────────────────────────────────────

describe('WorkspaceAnalytics', () => {
  let analytics: WorkspaceAnalytics;

  beforeEach(() => {
    analytics = new WorkspaceAnalytics();
  });

  it('should record sessions', () => {
    analytics.recordSession(60000);
    analytics.recordSession(120000);
    const data = analytics.getAnalytics();
    expect(data.totalSessions).toBe(2);
    expect(data.averageSessionDuration).toBe(90000);
  });

  it('should record behavior events', () => {
    analytics.recordBehaviorEvent({
      id: 'evt_001',
      type: 'tool_used',
      userId: 'user_001',
      timestamp: new Date().toISOString(),
      targetId: 'tool_001',
      targetType: 'tool',
      context: { sessionId: null, profileType: null, page: null, duration: null, futureMetadata: {} },
      futureMetadata: {},
    });
    const data = analytics.getAnalytics();
    expect(data.totalBehaviorEvents).toBe(1);
    expect(data.topTools[0]!.toolId).toBe('tool_001');
  });

  it('should record suggestion interactions', () => {
    analytics.recordSuggestionGenerated();
    analytics.recordSuggestionAccepted();
    analytics.recordSuggestionDismissed();
    const data = analytics.getAnalytics();
    expect(data.totalSuggestionsGenerated).toBe(1);
    expect(data.totalSuggestionsAccepted).toBe(1);
    expect(data.totalSuggestionsDismissed).toBe(1);
    expect(data.averageAcceptanceRate).toBe(0.5);
  });

  it('should record profile usage', () => {
    analytics.recordProfileUsage('gaming');
    analytics.recordProfileUsage('gaming');
    analytics.recordProfileUsage('default');
    const data = analytics.getAnalytics();
    expect(data.profileDistribution['gaming']).toBe(2);
    expect(data.profileDistribution['default']).toBe(1);
  });

  it('should reset', () => {
    analytics.recordSession();
    analytics.recordSuggestionGenerated();
    analytics.reset();
    const data = analytics.getAnalytics();
    expect(data.totalSessions).toBe(0);
    expect(data.totalSuggestionsGenerated).toBe(0);
  });
});

// ── Manager (Facade) Tests ─────────────────────────────────────

describe('WorkspacePersonalizationManager', () => {
  let manager: WorkspacePersonalizationManager;

  beforeEach(() => {
    manager = new WorkspacePersonalizationManager();
  });

  describe('loadWorkspace', () => {
    it('should load workspace with default preferences', () => {
      const prefs = manager.loadWorkspace({ userId: 'user_001' });
      expect(prefs.userId).toBe('user_001');
      expect(prefs.profileType).toBe('default');
    });

    it('should load workspace with cached preferences', () => {
      const cached = createDefaultUserPreferences('user_001');
      cached.profileType = 'gaming';
      const prefs = manager.loadWorkspace({ userId: 'user_001', cachedPreferences: cached });
      expect(prefs.profileType).toBe('gaming');
    });

    it('should emit workspace_loaded event', () => {
      const listener = vi.fn();
      manager.on('workspace_loaded', listener);
      manager.loadWorkspace({ userId: 'user_001' });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveWorkspace', () => {
    it('should save workspace and return result', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      const result = manager.saveWorkspace('user_001');
      expect(result.preferences.userId).toBe('user_001');
      expect(result.savedAt).toBeDefined();
    });

    it('should throw for unloaded workspace', () => {
      expect(() => manager.saveWorkspace('unknown')).toThrow();
    });
  });

  describe('generateSuggestions', () => {
    it('should generate suggestions after behavior recording', () => {
      manager.loadWorkspace({ userId: 'user_001' });

      for (let i = 0; i < 10; i++) {
        manager.recordBehavior('user_001', 'tool_used', { targetId: 'generate_report' });
      }

      const suggestions = manager.generateSuggestions('user_001');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return empty when personalization disabled', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      manager.setPersonalizationEnabled('user_001', false);
      const suggestions = manager.generateSuggestions('user_001');
      expect(suggestions.length).toBe(0);
    });

    it('should emit suggestions_generated event', () => {
      const listener = vi.fn();
      manager.on('suggestions_generated', listener);
      manager.loadWorkspace({ userId: 'user_001' });
      manager.generateSuggestions('user_001');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('applyWorkspaceProfile', () => {
    it('should apply a profile', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      const prefs = manager.applyWorkspaceProfile('user_001', 'gaming');
      expect(prefs.profileType).toBe('gaming');
      expect(prefs.aiInteractionStyle).toBe('concise');
    });

    it('should emit profile_changed event', () => {
      const listener = vi.fn();
      manager.on('profile_changed', listener);
      manager.loadWorkspace({ userId: 'user_001' });
      manager.applyWorkspaceProfile('user_001', 'performance');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should throw for invalid profile type', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      expect(() => manager.applyWorkspaceProfile('user_001', 'future_profile' as WorkspaceProfileType)).toThrow();
    });
  });

  describe('exportPreferences / importPreferences', () => {
    it('should export and import preferences', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      manager.applyWorkspaceProfile('user_001', 'gaming');

      const data = manager.exportPreferences('user_001');
      expect(data.preferences.profileType).toBe('gaming');

      manager.loadWorkspace({ userId: 'user_002' });
      const result = manager.importPreferences('user_002', data);
      expect(result.success).toBe(true);
      expect(manager.getPreferences('user_002')!.profileType).toBe('gaming');
    });

    it('should emit preferences_exported and preferences_imported events', () => {
      const exportListener = vi.fn();
      const importListener = vi.fn();
      manager.on('preferences_exported', exportListener);
      manager.on('preferences_imported', importListener);

      manager.loadWorkspace({ userId: 'user_001' });
      const data = manager.exportPreferences('user_001');
      manager.loadWorkspace({ userId: 'user_002' });
      manager.importPreferences('user_002', data);

      expect(exportListener).toHaveBeenCalledTimes(1);
      expect(importListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetPreferences', () => {
    it('should reset preferences to defaults', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      manager.applyWorkspaceProfile('user_001', 'gaming');
      manager.setPreference('user_001', 'test_key', 'test_value');

      const reset = manager.resetPreferences('user_001');
      expect(reset.profileType).toBe('default');
      expect(reset.learnedPreferences.length).toBe(0);
    });

    it('should emit workspace_reset event', () => {
      const listener = vi.fn();
      manager.on('workspace_reset', listener);
      manager.loadWorkspace({ userId: 'user_001' });
      manager.resetPreferences('user_001');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordBehavior', () => {
    it('should record behavior events', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      const event = manager.recordBehavior('user_001', 'tool_used', { targetId: 'tool_001' });
      expect(event.type).toBe('tool_used');
      expect(event.userId).toBe('user_001');
    });

    it('should emit behavior_recorded event', () => {
      const listener = vi.fn();
      manager.on('behavior_recorded', listener);
      manager.loadWorkspace({ userId: 'user_001' });
      manager.recordBehavior('user_001', 'tool_used');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should throw when behavior collection is disabled', () => {
      manager.updateConfiguration({ privacySettings: { collectBehaviorData: false } });
      manager.loadWorkspace({ userId: 'user_001' });
      expect(() => manager.recordBehavior('user_001', 'tool_used')).toThrow();
    });
  });

  describe('Transparency Controls', () => {
    it('should view learned preferences', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      manager.setPreference('user_001', 'test_key', 'test_value');
      const learned = manager.getLearnedPreferences('user_001');
      expect(learned.length).toBeGreaterThan(0);
    });

    it('should disable personalization', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      const updated = manager.setPersonalizationEnabled('user_001', false);
      expect(updated.personalizationEnabled).toBe(false);
    });

    it('should enable manual mode', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      const updated = manager.setManualMode('user_001', true);
      expect(updated.manualMode).toBe(true);
    });

    it('should remove individual learned preference', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      manager.setPreference('user_001', 'test_key', 'test_value');
      const updated = manager.removeLearnedPreference('user_001', 'test_key');
      expect(updated.learnedPreferences.find((p) => p.key === 'test_key')).toBeUndefined();
    });

    it('should reset all preferences', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      manager.setPreference('user_001', 'key1', 'val1');
      manager.setPreference('user_001', 'key2', 'val2');
      const reset = manager.resetPreferences('user_001');
      expect(reset.learnedPreferences.length).toBe(0);
    });
  });

  describe('Plugins', () => {
    it('should register and unregister plugins', () => {
      const plugin = createMockPlugin('test_plugin_001');
      manager.registerPlugin(plugin);
      expect(manager.getRegisteredPlugins()).toContain('test_plugin_001');

      manager.unregisterPlugin('test_plugin_001');
      expect(manager.getRegisteredPlugins()).not.toContain('test_plugin_001');
    });

    it('should not register duplicate plugin', () => {
      const plugin = createMockPlugin('dup_plugin');
      manager.registerPlugin(plugin);
      expect(manager.registerPlugin(plugin)).toBe(false);
    });

    it('should throw when plugins disabled', () => {
      manager.updateConfiguration({ featureFlags: { enablePlugins: false } });
      expect(() => manager.registerPlugin(createMockPlugin('test'))).toThrow();
    });

    it('should include plugin suggestions in generateSuggestions', () => {
      manager.registerPlugin(createMockPlugin('suggestion_plugin'));
      manager.loadWorkspace({ userId: 'user_001' });
      const suggestions = manager.generateSuggestions('user_001');
      expect(suggestions.some((s) => s.title === 'Plugin suggestion')).toBe(true);
    });
  });

  describe('Layout Personalization', () => {
    it('should personalize layout', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      const layout = manager.personalizeLayout('user_001');
      expect(layout.widgets.length).toBeGreaterThan(0);
    });

    it('should set layout theme', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      const updated = manager.setLayoutTheme('user_001', 'dark');
      expect(updated.layout.theme).toBe('dark');
    });
  });

  describe('Quick Actions', () => {
    it('should personalize quick actions', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      for (let i = 0; i < 5; i++) {
        manager.recordBehavior('user_001', 'tool_used', { targetId: 'generate_report' });
      }
      const actions = manager.personalizeQuickActions('user_001');
      expect(actions).toContain('generate_report');
    });

    it('should get context-aware suggestions', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      const suggestions = manager.getQuickActionSuggestions('user_001', {
        activeGoals: ['goal_1'],
        currentPage: 'reports',
      });
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Profiles', () => {
    it('should list available profiles', () => {
      const profiles = manager.getAvailableProfiles();
      expect(profiles.length).toBe(9);
    });

    it('should list builtin profiles', () => {
      const builtins = manager.getBuiltinProfiles();
      expect(builtins.length).toBe(9);
    });

    it('should create custom profile', () => {
      const custom = manager.createCustomProfile('custom', 'My Profile', 'Test');
      expect(custom.isBuiltIn).toBe(false);
    });

    it('should delete custom profile', () => {
      const custom = manager.createCustomProfile('custom', 'Test', 'Test');
      expect(manager.deleteCustomProfile(custom.id)).toBe(true);
    });
  });

  describe('Templates', () => {
    it('should list templates', () => {
      const templates = manager.getTemplates();
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should register template', () => {
      const now = new Date().toISOString();
      const template: WorkspaceTemplate = {
        id: 'mgr_tmpl_001',
        name: 'Manager Template',
        description: 'Test',
        profileType: 'default',
        layout: createDefaultWorkspaceLayout(),
        quickActions: [],
        preferredReports: [],
        notificationPreferences: createDefaultNotificationPreferences(),
        defaultGoals: [],
        preferredTools: [],
        aiInteractionStyle: 'detailed',
        widgetOrdering: [],
        isEnterprise: false,
        tags: [],
        createdBy: 'test',
        createdAt: now,
        futureMetadata: {},
      };
      expect(manager.registerTemplate(template)).toBe(true);
    });
  });

  describe('Recent Activities', () => {
    it('should add recent activity', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      manager.addRecentActivity('user_001', 'tool', 'Used Tool', 'tool_001');
      const prefs = manager.getPreferences('user_001');
      expect(prefs!.recentActivities.length).toBe(1);
      expect(prefs!.recentActivities[0]!.label).toBe('Used Tool');
    });
  });

  describe('Analytics', () => {
    it('should get analytics data', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      manager.recordBehavior('user_001', 'tool_used', { targetId: 'tool_001' });
      const data = manager.getAnalytics();
      expect(data.totalSessions).toBeGreaterThan(0);
      expect(data.totalBehaviorEvents).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should get configuration', () => {
      const config = manager.getConfiguration();
      expect(config.configVersion).toBe('1.0.0');
    });

    it('should update configuration', () => {
      manager.updateConfiguration({ featureFlags: { enableEvents: false } });
      const config = manager.getConfiguration();
      expect(config.featureFlags.enableEvents).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should validate preferences', () => {
      manager.loadWorkspace({ userId: 'user_001' });
      const result = manager.validatePreferences('user_001');
      expect(result.valid).toBe(true);
    });
  });
});

// ── Performance Tests ──────────────────────────────────────────

describe('Performance', () => {
  it('should load workspace under 200ms', () => {
    const manager = new WorkspacePersonalizationManager();
    const start = performance.now();
    manager.loadWorkspace({ userId: 'perf_user' });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it('should evaluate preferences under 100ms', () => {
    const manager = new WorkspacePersonalizationManager();
    manager.loadWorkspace({ userId: 'perf_user' });
    const start = performance.now();
    manager.setPreference('perf_user', 'test_key', 'test_value');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('should generate suggestions under 150ms with moderate data', () => {
    const manager = new WorkspacePersonalizationManager();
    manager.loadWorkspace({ userId: 'perf_user' });

    for (let i = 0; i < 50; i++) {
      manager.recordBehavior('perf_user', 'tool_used', { targetId: `tool_${i % 5}` });
    }

    const start = performance.now();
    manager.generateSuggestions('perf_user');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(150);
  });
});

// ── Edge Cases ─────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle empty behavior events', () => {
    const analyzer = new BehaviorAnalyzer(createDefaultWorkspaceConfiguration());
    const result = analyzer.analyze('empty_user');
    expect(result.totalEvents).toBe(0);
    expect(result.toolUsage).toEqual([]);
    expect(result.recommendationAcceptanceRate).toBe(0);
  });

  it('should handle concurrent user sessions', () => {
    const manager = new WorkspacePersonalizationManager();
    manager.loadWorkspace({ userId: 'user_a' });
    manager.loadWorkspace({ userId: 'user_b' });

    expect(manager.getPreferences('user_a')!.userId).toBe('user_a');
    expect(manager.getPreferences('user_b')!.userId).toBe('user_b');
  });

  it('should handle rapid preference updates', () => {
    const manager = new WorkspacePersonalizationManager();
    manager.loadWorkspace({ userId: 'rapid_user' });

    for (let i = 0; i < 20; i++) {
      manager.setPreference('rapid_user', `key_${i}`, `val_${i}`);
    }

    const prefs = manager.getPreferences('rapid_user')!;
    expect(prefs.learnedPreferences.length).toBeLessThanOrEqual(100);
  });

  it('should handle import of data with invalid templates', () => {
    const config = createDefaultWorkspaceConfiguration();
    const importer = new PreferenceImporter(config);

    const data: PreferenceExportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      userId: 'user_001',
      preferences: createDefaultUserPreferences('user_001'),
      profile: null,
      templates: [{
        id: '',
        name: '',
        description: '',
        profileType: 'default',
        layout: createDefaultWorkspaceLayout(),
        quickActions: [],
        preferredReports: [],
        notificationPreferences: createDefaultNotificationPreferences(),
        defaultGoals: [],
        preferredTools: [],
        aiInteractionStyle: 'detailed',
        widgetOrdering: [],
        isEnterprise: false,
        tags: [],
        createdBy: 'test',
        createdAt: new Date().toISOString(),
        futureMetadata: {},
      }],
      futureMetadata: {},
    };

    const result = importer.import(data);
    expect(result.importedTemplateCount).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should handle all profile types', () => {
    const manager = new WorkspacePersonalizationManager();
    const profileTypes: WorkspaceProfileType[] = [
      'default', 'performance', 'gaming', 'trading', 'developer',
      'creative', 'business', 'student', 'privacy',
    ];

    for (const type of profileTypes) {
      manager.loadWorkspace({ userId: `user_${type}` });
      const prefs = manager.applyWorkspaceProfile(`user_${type}`, type);
      expect(prefs.profileType).toBe(type);
    }
  });

  it('should handle events disabled in config', () => {
    const manager = new WorkspacePersonalizationManager({ featureFlags: { enableEvents: false } });
    const listener = vi.fn();
    manager.on('workspace_loaded', listener);
    manager.loadWorkspace({ userId: 'user_001' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('should handle behavior analysis disabled in config', () => {
    const manager = new WorkspacePersonalizationManager({ featureFlags: { enableBehaviorAnalysis: false } });
    manager.loadWorkspace({ userId: 'user_001' });
    manager.recordBehavior('user_001', 'tool_used', { targetId: 'tool_001' });
    const analysis = manager.getBehaviorAnalysis('user_001');
    expect(analysis.totalEvents).toBe(0);
  });
});

// ── Regression Tests ───────────────────────────────────────────

describe('Regression', () => {
  it('should maintain preference integrity after multiple operations', () => {
    const manager = new WorkspacePersonalizationManager();
    manager.loadWorkspace({ userId: 'reg_user' });

    manager.applyWorkspaceProfile('reg_user', 'gaming');
    manager.setPreference('reg_user', 'custom_key', 'custom_value');
    manager.addRecentActivity('reg_user', 'tool', 'Test Activity');
    manager.recordBehavior('reg_user', 'tool_used', { targetId: 'tool_001' });

    const prefs = manager.getPreferences('reg_user')!;
    expect(prefs.userId).toBe('reg_user');
    expect(prefs.profileType).toBe('gaming');
    expect(prefs.learnedPreferences.find((p) => p.key === 'custom_key')).toBeDefined();
    expect(prefs.recentActivities.length).toBe(1);
  });

  it('should not lose data on configuration update', () => {
    const manager = new WorkspacePersonalizationManager();
    manager.loadWorkspace({ userId: 'reg_user' });
    manager.setPreference('reg_user', 'persist_key', 'persist_value');

    manager.updateConfiguration({ preferenceRules: { minConfidenceThreshold: 0.6 } });

    const prefs = manager.getPreferences('reg_user')!;
    expect(prefs.learnedPreferences.find((p) => p.key === 'persist_key')).toBeDefined();
  });

  it('should handle export-import roundtrip without data loss', () => {
    const manager = new WorkspacePersonalizationManager();
    manager.loadWorkspace({ userId: 'rt_user' });
    manager.applyWorkspaceProfile('rt_user', 'developer');
    manager.setPreference('rt_user', 'rt_key', 'rt_value');

    const exported = manager.exportPreferences('rt_user');

    const manager2 = new WorkspacePersonalizationManager();
    manager2.loadWorkspace({ userId: 'rt_user_2' });
    const result = manager2.importPreferences('rt_user_2', exported);

    expect(result.success).toBe(true);
    const imported = manager2.getPreferences('rt_user_2')!;
    expect(imported.profileType).toBe('developer');
    expect(imported.learnedPreferences.find((p) => p.key === 'rt_key')).toBeDefined();
  });
});
