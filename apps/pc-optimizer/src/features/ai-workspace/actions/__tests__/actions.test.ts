/**
 * Tests for the Natural Language Action Engine.
 *
 * Covers: intent classification, entity extraction, action planning,
 * validation, approval, events, analytics, suggestions, formatter,
 * regression, performance, edge cases.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NaturalLanguageActionManager } from '../naturalLanguageActionManager';
import { IntentClassifier } from '../intentClassifier';
import { EntityExtractor } from '../entityExtractor';
import { ActionContextResolver } from '../actionContextResolver';
import { ActionResolver } from '../actionResolver';
import { ActionPlanner } from '../actionPlanner';
import { ActionValidator } from '../actionValidator';
import { ActionApprovalEngine } from '../actionApprovalEngine';
import { ActionPlanFormatter } from '../actionPlanFormatter';
import { ActionSuggestionEngine } from '../actionSuggestionEngine';
import { ActionAnalytics } from '../actionAnalytics';
import { ActionEvents } from '../actionEvents';
import { DEFAULT_ACTION_CONFIGURATION, createActionConfiguration, validateActionConfiguration } from '../actionConfiguration';
import {
  generateIntentId,
  generateActionPlanId,
  getActionTypeLabel,
  getRiskLevelLabel,
  getApprovalPolicyLabel,
  createDefaultIntentDefinitions,
  createDefaultEntityRules,
  createDefaultApprovalPolicies,
  createDefaultSuggestionRules,
  createDefaultActionConfiguration,
} from '../types';
import type { CopilotContext, ClassifiedIntent, ExtractedEntity, ActionPlan, ApprovalPolicy, ActionRiskLevel, PermissionLevel, SuggestionRule } from '../types';
import type { ToolDefinition } from '../../tools/types';

function createMockTool(id: string, name: string, riskLevel: string = 'low', requiredPermissions: PermissionLevel = 'free'): ToolDefinition {
  return {
    id,
    name,
    description: `Test tool ${name}`,
    category: 'optimization' as never,
    supportedIntents: ['optimization'] as never[],
    requiredCapabilities: [] as never[],
    requiredPermissions,
    requiredContext: [] as never[],
    estimatedDuration: 100,
    riskLevel: riskLevel as never,
    outputType: 'json' as never,
    status: 'active' as never,
    futureMetadata: {},
  };
}

function createMockContext(): CopilotContext {
  return {
    sources: [
      { type: 'health_score', available: true, data: 55, confidence: 0.9, evidence: [], futureMetadata: {} },
      { type: 'recommendations', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'predictions', available: true, data: [], confidence: 0.75, evidence: [], futureMetadata: {} },
      { type: 'timeline', available: true, data: [], confidence: 0.8, evidence: [], futureMetadata: {} },
      { type: 'goals', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'recovery_history', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'maintenance', available: true, data: [], confidence: 0.8, evidence: [], futureMetadata: {} },
      { type: 'automation', available: true, data: {}, confidence: 1.0, evidence: [], futureMetadata: {} },
      { type: 'user_preferences', available: true, data: {}, confidence: 1.0, evidence: [], futureMetadata: {} },
    ],
    healthScore: 55,
    deviceProfile: { profileType: 'gaming', performanceTier: 'high', confidence: 0.9, futureMetadata: {} },
    activeGoals: [
      { id: 'g1', name: 'Improve Performance', status: 'in_progress', priority: 'high', progress: 0.5, futureMetadata: {} },
    ],
    recentTimelineEvents: [
      { id: 't1', title: 'Optimization completed', timestamp: new Date().toISOString(), category: 'optimization', severity: 'low', futureMetadata: {} },
    ],
    activeRecommendations: [
      { id: 'r1', title: 'Clean temp files', category: 'storage', priority: 'high', confidence: 0.85, futureMetadata: {} },
      { id: 'r2', title: 'Disable startup apps', category: 'performance', priority: 'medium', confidence: 0.75, futureMetadata: {} },
    ],
    activePredictions: [
      { id: 'p1', title: 'Disk space warning', category: 'storage', riskLevel: 'medium', confidence: 0.7, futureMetadata: {} },
    ],
    maintenanceHistory: [{ id: 'm1', type: 'routine', timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), success: true, futureMetadata: {} }],
    optimizationHistory: [{ id: 'o1', timestamp: new Date().toISOString(), goal: 'quick_boost', success: true, healthDelta: 5, futureMetadata: {} }],
    recoveryHistory: [{ id: 'rc1', timestamp: new Date().toISOString(), type: 'rollback', success: true, futureMetadata: {} }],
    userPreferences: { theme: 'dark' },
    futureMetadata: {},
  } as CopilotContext;
}

function createMockIntent(actionType: string = 'optimization'): ClassifiedIntent {
  return {
    id: generateIntentId(),
    intent: actionType as never,
    confidence: 0.85,
    entities: [],
    parameters: {},
    requiredTools: ['create_optimization_session'],
    requiredPermissions: 'pro',
    riskLevel: 'medium',
    rawRequest: 'optimize my pc',
    futureMetadata: {},
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Action Types & Helpers', () => {
  it('should generate unique intent IDs', () => {
    expect(generateIntentId()).not.toBe(generateIntentId());
  });

  it('should generate unique action plan IDs', () => {
    expect(generateActionPlanId()).not.toBe(generateActionPlanId());
  });

  it('should return action type labels', () => {
    expect(getActionTypeLabel('optimization')).toBe('Optimization');
    expect(getActionTypeLabel('maintenance')).toBe('Maintenance');
  });

  it('should return risk level labels', () => {
    expect(getRiskLevelLabel('low')).toBe('Low');
    expect(getRiskLevelLabel('critical')).toBe('Critical');
  });

  it('should return approval policy labels', () => {
    expect(getApprovalPolicyLabel('always_ask')).toBe('Always Ask');
    expect(getApprovalPolicyLabel('risk_based')).toBe('Risk Based');
  });

  it('should create default intent definitions', () => {
    const defs = createDefaultIntentDefinitions();
    expect(defs.length).toBe(11);
    expect(defs.some((d) => d.actionType === 'optimization')).toBe(true);
    expect(defs.some((d) => d.actionType === 'settings_navigation')).toBe(true);
  });

  it('should create default entity rules', () => {
    const rules = createDefaultEntityRules();
    expect(rules.length).toBe(9);
    expect(rules.some((r) => r.type === 'optimization_profile')).toBe(true);
  });

  it('should create default approval policies', () => {
    const policies = createDefaultApprovalPolicies();
    expect(policies.length).toBe(3);
    expect(policies.some((p) => p.type === 'risk_based')).toBe(true);
  });

  it('should create default suggestion rules', () => {
    const rules = createDefaultSuggestionRules();
    expect(rules.length).toBe(5);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('Action Configuration', () => {
  it('should provide default configuration', () => {
    expect(DEFAULT_ACTION_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_ACTION_CONFIGURATION.featureFlags.enableActionEngine).toBe(true);
  });

  it('should create configuration with overrides', () => {
    const config = createActionConfiguration({ configVersion: '2.0.0' });
    expect(config.configVersion).toBe('2.0.0');
  });

  it('should validate configuration', () => {
    const result = validateActionConfiguration(DEFAULT_ACTION_CONFIGURATION);
    expect(result.valid).toBe(true);
  });

  it('should detect invalid configuration', () => {
    const config = createActionConfiguration({ configVersion: '' });
    const result = validateActionConfiguration(config);
    expect(result.valid).toBe(false);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('Action Events', () => {
  let events: ActionEvents;

  beforeEach(() => {
    events = new ActionEvents();
  });

  it('should register and emit events', () => {
    let received = false;
    events.on('intent_detected', () => { received = true; });
    events.emit({ type: 'intent_detected', timestamp: new Date().toISOString(), data: null });
    expect(received).toBe(true);
  });

  it('should unregister listeners', () => {
    let count = 0;
    const listener = () => { count++; };
    events.on('action_approved', listener);
    events.emit({ type: 'action_approved', timestamp: new Date().toISOString(), data: null });
    events.off('action_approved', listener);
    events.emit({ type: 'action_approved', timestamp: new Date().toISOString(), data: null });
    expect(count).toBe(1);
  });
});

// ── Intent Classifier ────────────────────────────────────────

describe('Intent Classifier', () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    classifier = new IntentClassifier(createDefaultIntentDefinitions());
  });

  it('should classify optimization intent', () => {
    const intent = classifier.classify('optimize my pc');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('optimization');
    expect(intent!.confidence).toBeGreaterThan(0);
  });

  it('should classify maintenance intent', () => {
    const intent = classifier.classify('start maintenance');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('maintenance');
  });

  it('should classify recovery intent', () => {
    const intent = classifier.classify('recover yesterday changes');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('recovery');
  });

  it('should classify simulation intent', () => {
    const intent = classifier.classify('run simulation');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('simulation');
  });

  it('should classify goal management intent', () => {
    const intent = classifier.classify('create new goal');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('goal_management');
  });

  it('should classify health analysis intent', () => {
    const intent = classifier.classify('show health');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('health_analysis');
  });

  it('should classify report generation intent', () => {
    const intent = classifier.classify('generate weekly report');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('report_generation');
  });

  it('should classify automation management intent', () => {
    const intent = classifier.classify('pause automation');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('automation_management');
  });

  it('should return null for unrecognized request', () => {
    const intent = classifier.classify('xyzzy foobar');
    expect(intent).toBeNull();
  });

  it('should return null for empty request', () => {
    const intent = classifier.classify('');
    expect(intent).toBeNull();
  });

  it('should classify "prepare for gaming"', () => {
    const intent = classifier.classify('prepare for gaming');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('optimization');
  });

  it('should classify "compare optimization plans"', () => {
    const intent = classifier.classify('compare optimization plans');
    expect(intent).not.toBeNull();
    expect(['simulation', 'optimization']).toContain(intent!.intent);
  });
});

// ── Entity Extractor ─────────────────────────────────────────

describe('Entity Extractor', () => {
  let extractor: EntityExtractor;

  beforeEach(() => {
    extractor = new EntityExtractor(createDefaultEntityRules());
  });

  it('should extract optimization profile', () => {
    const entities = extractor.extract('prepare for gaming');
    const profile = entities.find((e) => e.type === 'optimization_profile');
    expect(profile).toBeDefined();
    expect(profile!.value).toBe('gaming');
  });

  it('should extract time range', () => {
    const entities = extractor.extract('recover yesterday changes');
    const timeRange = entities.find((e) => e.type === 'time_range');
    expect(timeRange).toBeDefined();
    expect(timeRange!.value).toBe('yesterday');
  });

  it('should extract report type', () => {
    const entities = extractor.extract('generate weekly report');
    const reportType = entities.find((e) => e.type === 'report_type');
    expect(reportType).toBeDefined();
    expect(reportType!.value).toBe('weekly');
  });

  it('should extract maintenance type', () => {
    const entities = extractor.extract('run deep maintenance');
    const maintType = entities.find((e) => e.type === 'maintenance_type');
    expect(maintType).toBeDefined();
    expect(maintType!.value).toBe('deep');
  });

  it('should extract using synonyms', () => {
    const entities = extractor.extract('prepare for game');
    const profile = entities.find((e) => e.type === 'optimization_profile');
    expect(profile).toBeDefined();
    expect(profile!.value).toBe('gaming');
  });

  it('should return empty for no matches', () => {
    const entities = extractor.extract('xyzzy foobar');
    // Some entities have default values, so check if any non-default
    const nonDefault = entities.filter((e) => e.position.start >= 0);
    expect(nonDefault.length).toBe(0);
  });
});

// ── Context Resolver ─────────────────────────────────────────

describe('Action Context Resolver', () => {
  let resolver: ActionContextResolver;

  beforeEach(() => {
    resolver = new ActionContextResolver();
    resolver.setContextProvider(() => createMockContext());
  });

  it('should resolve context', () => {
    const result = resolver.resolve(createMockIntent(), []);
    expect(result.context).toBeDefined();
    expect(result.context.healthScore).toBe(55);
  });

  it('should find missing entities', () => {
    const intent = createMockIntent('recovery');
    const result = resolver.resolve(intent, []);
    // Recovery has history so no missing entities
    expect(result.missingEntities).toBeDefined();
  });

  it('should handle missing context provider', () => {
    const freshResolver = new ActionContextResolver();
    const result = freshResolver.resolve(createMockIntent(), []);
    expect(result.context.healthScore).toBeNull();
    expect(result.missingEntities).toContain('context_provider');
  });
});

// ── Action Planner ───────────────────────────────────────────

describe('Action Planner', () => {
  let planner: ActionPlanner;

  beforeEach(() => {
    planner = new ActionPlanner();
  });

  it('should generate an action plan', () => {
    const intent = createMockIntent();
    const context = createMockContext();
    const plan = planner.plan(intent, [], context, []);
    expect(plan).toBeDefined();
    expect(plan.id).toBeDefined();
    expect(plan.intent).toBe('optimization');
    expect(plan.explanation).toBeDefined();
    expect(plan.explanation.summary).toBeDefined();
  });

  it('should include explanation with evidence', () => {
    const intent = createMockIntent();
    const context = createMockContext();
    const plan = planner.plan(intent, [], context, []);
    expect(plan.explanation.evidence.length).toBeGreaterThan(0);
    expect(plan.explanation.reasoning).toBeDefined();
    expect(plan.explanation.expectedOutcome).toBeDefined();
  });

  it('should assess risk level', () => {
    const intent = createMockIntent();
    intent.riskLevel = 'high';
    const context = createMockContext();
    const plan = planner.plan(intent, [], context, []);
    expect(plan.estimatedRisk).toBe('high');
  });

  it('should set requiresApproval for medium+ risk', () => {
    const intent = createMockIntent();
    intent.riskLevel = 'medium';
    const context = createMockContext();
    const plan = planner.plan(intent, [], context, []);
    expect(plan.requiresApproval).toBe(true);
  });

  it('should not require approval for low risk', () => {
    const intent = createMockIntent('health_analysis');
    intent.riskLevel = 'none';
    const context = createMockContext();
    const plan = planner.plan(intent, [], context, []);
    expect(plan.requiresApproval).toBe(false);
  });

  it('should check rollback availability', () => {
    const intent = createMockIntent('optimization');
    const context = createMockContext();
    const plan = planner.plan(intent, [], context, []);
    expect(plan.rollbackAvailable).toBe(true);
  });

  it('should generate alternatives when multiple tools', () => {
    const intent = createMockIntent();
    const context = createMockContext();
    const tools = [
      createMockTool('tool1', 'Tool 1'),
      createMockTool('tool2', 'Tool 2'),
    ];
    const plan = planner.plan(intent, [], context, tools);
    expect(plan.alternatives.length).toBeGreaterThan(0);
  });
});

// ── Action Validator ─────────────────────────────────────────

describe('Action Validator', () => {
  let validator: ActionValidator;
  let planner: ActionPlanner;

  beforeEach(() => {
    validator = new ActionValidator();
    planner = new ActionPlanner();
  });

  it('should validate a valid plan', () => {
    const intent = createMockIntent('health_analysis');
    intent.riskLevel = 'none';
    intent.requiredPermissions = 'free';
    const context = createMockContext();
    const plan = planner.plan(intent, [], context, []);
    const result = validator.validate(plan, context, 'free', []);
    expect(result.valid).toBe(true);
  });

  it('should detect permission denied', () => {
    const intent = createMockIntent('optimization');
    intent.requiredPermissions = 'pro';
    const context = createMockContext();
    const tool = createMockTool('tool1', 'Tool 1', 'medium', 'pro');
    const plan = planner.plan(intent, [], context, [tool]);
    const result = validator.validate(plan, context, 'free', []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'PERMISSION_DENIED')).toBe(true);
  });

  it('should warn on high risk without rollback', () => {
    const intent = createMockIntent();
    intent.riskLevel = 'high';
    const context = createMockContext();
    const plan = planner.plan(intent, [], context, []);
    plan.rollbackAvailable = false;
    const result = validator.validate(plan, context, 'pro', []);
    expect(result.warnings.some((w) => w.code === 'NO_ROLLBACK')).toBe(true);
  });
});

// ── Approval Engine ──────────────────────────────────────────

describe('Action Approval Engine', () => {
  let engine: ActionApprovalEngine;
  let planner: ActionPlanner;

  beforeEach(() => {
    engine = new ActionApprovalEngine(createDefaultApprovalPolicies());
    engine.setActivePolicy('risk_based');
    planner = new ActionPlanner();
  });

  it('should auto-approve low risk', () => {
    const intent = createMockIntent('health_analysis');
    intent.riskLevel = 'none';
    const plan = planner.plan(intent, [], createMockContext(), []);
    const result = engine.checkApproval(plan);
    expect(result.approved).toBe(true);
  });

  it('should require approval for medium risk', () => {
    const intent = createMockIntent('optimization');
    intent.riskLevel = 'medium';
    const plan = planner.plan(intent, [], createMockContext(), []);
    plan.requiresApproval = true;
    const result = engine.checkApproval(plan);
    expect(result.approved).toBe(false);
  });

  it('should approve action', () => {
    const intent = createMockIntent('optimization');
    intent.riskLevel = 'medium';
    const plan = planner.plan(intent, [], createMockContext(), []);
    const result = engine.approve(plan);
    expect(result.approved).toBe(true);
  });

  it('should reject action', () => {
    const intent = createMockIntent('optimization');
    const plan = planner.plan(intent, [], createMockContext(), []);
    const result = engine.reject(plan, 'Too risky');
    expect(result.approved).toBe(false);
    expect(result.reason).toBe('Too risky');
  });

  it('should support always_ask policy', () => {
    engine.setActivePolicy('always_ask');
    const intent = createMockIntent('health_analysis');
    intent.riskLevel = 'none';
    const plan = planner.plan(intent, [], createMockContext(), []);
    const result = engine.checkApproval(plan);
    expect(result.approved).toBe(false);
  });

  it('should support session approval', () => {
    const intent = createMockIntent('optimization');
    intent.riskLevel = 'medium';
    const plan = planner.plan(intent, [], createMockContext(), []);
    engine.approve(plan, 'session_approval');
    const result = engine.checkApproval(plan);
    expect(result.approved).toBe(true);
    expect(result.policy).toBe('session_approval');
  });
});

// ── Action Plan Formatter ────────────────────────────────────

describe('Action Plan Formatter', () => {
  let formatter: ActionPlanFormatter;
  let planner: ActionPlanner;

  beforeEach(() => {
    formatter = new ActionPlanFormatter();
    planner = new ActionPlanner();
  });

  it('should format a plan', () => {
    const intent = createMockIntent();
    const plan = planner.plan(intent, [], createMockContext(), []);
    const formatted = formatter.format(plan);
    expect(formatted.title).toBeDefined();
    expect(formatted.summary).toBeDefined();
    expect(formatted.details).toBeDefined();
  });

  it('should format compact', () => {
    const intent = createMockIntent();
    const plan = planner.plan(intent, [], createMockContext(), []);
    const compact = formatter.formatCompact(plan);
    expect(compact).toContain('Optimization');
  });

  it('should format explanation', () => {
    const intent = createMockIntent();
    const plan = planner.plan(intent, [], createMockContext(), []);
    const exp = formatter.formatExplanation(plan.explanation);
    expect(exp).toContain('Summary');
    expect(exp).toContain('Reasoning');
  });
});

// ── Suggestion Engine ────────────────────────────────────────

describe('Action Suggestion Engine', () => {
  let engine: ActionSuggestionEngine;

  beforeEach(() => {
    engine = new ActionSuggestionEngine(createDefaultSuggestionRules());
  });

  it('should suggest optimization for low health', () => {
    const ctx = createMockContext();
    ctx.healthScore = 50;
    const suggestions = engine.getSuggestions(ctx);
    expect(suggestions.some((s) => s.actionType === 'optimization')).toBe(true);
  });

  it('should suggest maintenance when overdue', () => {
    const ctx = createMockContext();
    ctx.maintenanceHistory = [{ id: 'm1', type: 'routine', timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), success: true, futureMetadata: {} }];
    const suggestions = engine.getSuggestions(ctx);
    expect(suggestions.some((s) => s.actionType === 'maintenance')).toBe(true);
  });

  it('should suggest simulation with multiple recommendations', () => {
    const ctx = createMockContext();
    ctx.activeRecommendations = [
      { id: 'r1', title: 'Rec 1', category: 'storage', priority: 'high', confidence: 0.8, futureMetadata: {} },
      { id: 'r2', title: 'Rec 2', category: 'performance', priority: 'medium', confidence: 0.7, futureMetadata: {} },
    ];
    const suggestions = engine.getSuggestions(ctx);
    expect(suggestions.some((s) => s.actionType === 'simulation')).toBe(true);
  });

  it('should limit suggestions', () => {
    const ctx = createMockContext();
    ctx.healthScore = 40;
    const suggestions = engine.getSuggestions(ctx, 2);
    expect(suggestions.length).toBeLessThanOrEqual(2);
  });
});

// ── Analytics ────────────────────────────────────────────────

describe('Action Analytics', () => {
  let analytics: ActionAnalytics;

  beforeEach(() => {
    analytics = new ActionAnalytics();
  });

  it('should record requests', () => {
    analytics.recordRequest();
    analytics.recordRequest();
    expect(analytics.getAnalytics().totalRequests).toBe(2);
  });

  it('should record plan generation', () => {
    analytics.recordPlanGenerated('optimization', 0.85, 150);
    analytics.recordPlanGenerated('maintenance', 0.7, 100);
    const data = analytics.getAnalytics();
    expect(data.totalPlansGenerated).toBe(2);
    expect(data.byActionType['optimization']).toBe(1);
    expect(data.averageConfidence).toBeCloseTo(0.775, 2);
  });

  it('should record approvals', () => {
    analytics.recordApproval(true);
    analytics.recordApproval(false);
    const data = analytics.getAnalytics();
    expect(data.totalApproved).toBe(1);
    expect(data.totalRejected).toBe(1);
  });

  it('should reset', () => {
    analytics.recordRequest();
    analytics.reset();
    expect(analytics.getAnalytics().totalRequests).toBe(0);
  });
});

// ── NaturalLanguageActionManager (Integration) ───────────────

describe('NaturalLanguageActionManager', () => {
  let manager: NaturalLanguageActionManager;

  beforeEach(() => {
    manager = new NaturalLanguageActionManager();
    manager.setContextProvider(() => createMockContext());
    manager.setUserContext('pro', ['answer_questions', 'suggest_optimizations', 'generate_optimization_session']);
  });

  it('should parse a request', () => {
    const result = manager.parseRequest('optimize my pc');
    expect(result.rawRequest).toBe('optimize my pc');
    expect(result.intent).not.toBeNull();
    expect(result.intent!.intent).toBe('optimization');
    expect(result.entities.length).toBeGreaterThan(0);
  });

  it('should classify intent', () => {
    const intent = manager.classifyIntent('show health');
    expect(intent).not.toBeNull();
    expect(intent!.intent).toBe('health_analysis');
  });

  it('should extract entities', () => {
    const entities = manager.extractEntities('prepare for gaming');
    expect(entities.length).toBeGreaterThan(0);
    expect(entities.some((e) => e.type === 'optimization_profile')).toBe(true);
  });

  it('should generate action plan', () => {
    const intent = manager.classifyIntent('optimize my pc');
    expect(intent).not.toBeNull();
    const plan = manager.generateActionPlan(intent!);
    expect(plan).not.toBeNull();
    expect(plan!.intent).toBe('optimization');
    expect(plan!.explanation).toBeDefined();
  });

  it('should handle unrecognized request', () => {
    const result = manager.parseRequest('xyzzy foobar baz');
    expect(result.intent).toBeNull();
    expect(result.actionPlan).toBeNull();
  });

  it('should get suggested actions', () => {
    const suggestions = manager.getSuggestedActions();
    expect(suggestions).toBeDefined();
    // Health score is 55 which is < 60, so optimization should be suggested
    expect(suggestions.some((s) => s.actionType === 'optimization')).toBe(true);
  });

  it('should format plan', () => {
    const intent = manager.classifyIntent('optimize my pc');
    const plan = manager.generateActionPlan(intent!);
    const formatted = manager.formatPlan(plan!);
    expect(formatted.title).toBeDefined();
  });

  it('should get analytics', () => {
    manager.parseRequest('optimize my pc');
    const analytics = manager.getAnalytics();
    expect(analytics.totalRequests).toBe(1);
  });

  it('should throw when disabled', () => {
    manager.updateConfig({ featureFlags: { ...DEFAULT_ACTION_CONFIGURATION.featureFlags, enableActionEngine: false } });
    expect(() => manager.parseRequest('optimize my pc')).toThrow();
  });

  it('should clear all', () => {
    manager.parseRequest('optimize my pc');
    manager.clearAll();
    expect(manager.getAnalytics().totalRequests).toBe(0);
  });

  it('should emit events', () => {
    let eventReceived = false;
    manager.getEvents().on('intent_detected', () => { eventReceived = true; });
    manager.parseRequest('optimize my pc');
    expect(eventReceived).toBe(true);
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Action Engine Performance', () => {
  let manager: NaturalLanguageActionManager;

  beforeEach(() => {
    manager = new NaturalLanguageActionManager();
    manager.setContextProvider(() => createMockContext());
    manager.setUserContext('pro', ['answer_questions', 'suggest_optimizations', 'generate_optimization_session']);
  });

  it('should classify intent under 100ms', () => {
    const start = Date.now();
    manager.classifyIntent('optimize my pc for gaming');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('should parse request under 350ms', () => {
    const start = Date.now();
    manager.parseRequest('optimize my pc for gaming');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(350);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Action Engine Edge Cases', () => {
  it('should handle empty request', () => {
    const manager = new NaturalLanguageActionManager();
    manager.setContextProvider(() => createMockContext());
    const result = manager.parseRequest('');
    expect(result.intent).toBeNull();
  });

  it('should handle very long request', () => {
    const manager = new NaturalLanguageActionManager();
    manager.setContextProvider(() => createMockContext());
    const longRequest = 'optimize my pc ' + 'please '.repeat(100);
    const result = manager.parseRequest(longRequest);
    expect(result).toBeDefined();
  });

  it('should handle special characters', () => {
    const manager = new NaturalLanguageActionManager();
    manager.setContextProvider(() => createMockContext());
    const result = manager.parseRequest('optimize! @#$% my pc');
    expect(result).toBeDefined();
  });

  it('should handle request without context provider', () => {
    const manager = new NaturalLanguageActionManager();
    const result = manager.parseRequest('optimize my pc');
    expect(result.intent).not.toBeNull();
  });

  it('should handle approve for non-existent plan', () => {
    const manager = new NaturalLanguageActionManager();
    expect(manager.approveAction('nonexistent')).toBeNull();
  });

  it('should handle reject for non-existent plan', () => {
    const manager = new NaturalLanguageActionManager();
    expect(manager.rejectAction('nonexistent')).toBeNull();
  });
});
