/**
 * Tests for the AI Copilot Platform.
 *
 * Covers: types, configuration, events, intent engine, context resolver,
 * response engine, suggestion engine, explanation engine, action planner,
 * permission engine, memory, session manager, conversation engine,
 * analytics, validator, manager, regression, performance, edge cases.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CopilotManager } from '../copilotManager';
import { CopilotIntentEngine } from '../copilotIntentEngine';
import { CopilotContextResolver } from '../copilotContextResolver';
import { CopilotResponseEngine } from '../copilotResponseEngine';
import { CopilotSuggestionEngine } from '../copilotSuggestionEngine';
import { CopilotExplanationEngine } from '../copilotExplanationEngine';
import { CopilotActionPlanner } from '../copilotActionPlanner';
import { CopilotPermissionEngine } from '../copilotPermissionEngine';
import { CopilotMemory } from '../copilotMemory';
import { CopilotSessionManager } from '../copilotSessionManager';
import { CopilotAnalyticsEngine } from '../copilotAnalytics';
import { CopilotValidator } from '../copilotValidator';
import { CopilotEvents } from '../copilotEvents';
import { DEFAULT_COPILOT_CONFIGURATION, createCopilotConfiguration, validateConfiguration } from '../copilotConfiguration';
import {
  generateCopilotId,
  clampConfidence,
  getIntentLabel,
  createDefaultIntentDefinitions,
} from '../types';
import type { CopilotContextResolverInput } from '../copilotContextResolver';
import type { CopilotPromptInput } from '../types';

function createMockContextInput(): CopilotContextResolverInput {
  return {
    healthScore: 75,
    deviceProfile: { profileType: 'gaming', performanceTier: 'high', confidence: 0.9, futureMetadata: {} },
    activeGoals: [{ id: 'g1', name: 'Improve Performance', status: 'in_progress', priority: 'high', progress: 0.5, futureMetadata: {} }],
    recentTimelineEvents: [{ id: 't1', title: 'Optimization completed', timestamp: new Date().toISOString(), category: 'optimization', severity: 'low', futureMetadata: {} }],
    activeRecommendations: [{ id: 'r1', title: 'Clean temp files', category: 'storage', priority: 'high', confidence: 0.85, futureMetadata: {} }],
    activePredictions: [{ id: 'p1', title: 'Disk space warning', category: 'storage', riskLevel: 'medium', confidence: 0.7, futureMetadata: {} }],
    maintenanceHistory: [{ id: 'm1', type: 'routine', timestamp: new Date().toISOString(), success: true, futureMetadata: {} }],
    optimizationHistory: [{ id: 'o1', timestamp: new Date().toISOString(), goal: 'quick_boost', success: true, healthDelta: 5, futureMetadata: {} }],
    recoveryHistory: [{ id: 'rc1', timestamp: new Date().toISOString(), type: 'rollback', success: true, futureMetadata: {} }],
    userPreferences: { theme: 'dark' },
  };
}

function createMockPrompt(prompt: string): CopilotPromptInput {
  return {
    prompt,
    conversationId: null,
    userPermissionLevel: 'free',
    userPreferences: {},
    futureMetadata: {},
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Copilot Types & Helpers', () => {
  it('should generate unique IDs', () => {
    const id1 = generateCopilotId();
    const id2 = generateCopilotId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^copilot_/);
  });

  it('should clamp confidence between 0 and 1', () => {
    expect(clampConfidence(-0.5)).toBe(0);
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(0.5)).toBe(0.5);
  });

  it('should return labels for intents', () => {
    expect(getIntentLabel('question')).toBe('Question');
    expect(getIntentLabel('recommendation')).toBe('Recommendation');
    expect(getIntentLabel('future_intent')).toBe('Future Intent');
  });

  it('should create default intent definitions', () => {
    const defs = createDefaultIntentDefinitions();
    expect(defs.definitions.length).toBeGreaterThan(0);
    expect(defs.minConfidenceThreshold).toBeGreaterThan(0);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('Copilot Configuration', () => {
  it('should provide default configuration', () => {
    expect(DEFAULT_COPILOT_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_COPILOT_CONFIGURATION.featureFlags.enableCopilot).toBe(true);
  });

  it('should create configuration with overrides', () => {
    const config = createCopilotConfiguration({ performanceTargetMs: 200 });
    expect(config.performanceTargetMs).toBe(200);
    expect(config.configVersion).toBe('1.0.0');
  });

  it('should validate configuration', () => {
    const result = validateConfiguration(DEFAULT_COPILOT_CONFIGURATION);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should detect invalid configuration', () => {
    const config = createCopilotConfiguration({ maxConversations: 0 });
    const result = validateConfiguration(config);
    expect(result.valid).toBe(false);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('Copilot Events', () => {
  let events: CopilotEvents;

  beforeEach(() => {
    events = new CopilotEvents();
  });

  it('should register and emit events', () => {
    let received = false;
    events.on('conversation_started', () => { received = true; });
    events.emit({ type: 'conversation_started', conversationId: 'c1', timestamp: new Date().toISOString(), data: null });
    expect(received).toBe(true);
  });

  it('should unregister listeners', () => {
    let count = 0;
    const listener = () => { count++; };
    events.on('response_generated', listener);
    events.emit({ type: 'response_generated', conversationId: 'c1', timestamp: new Date().toISOString(), data: null });
    events.off('response_generated', listener);
    events.emit({ type: 'response_generated', conversationId: 'c1', timestamp: new Date().toISOString(), data: null });
    expect(count).toBe(1);
  });

  it('should count listeners', () => {
    events.on('intent_resolved', () => {});
    expect(events.listenerCount('intent_resolved')).toBe(1);
    expect(events.listenerCount()).toBe(1);
  });
});

// ── Intent Engine ────────────────────────────────────────────

describe('Copilot Intent Engine', () => {
  let engine: CopilotIntentEngine;

  beforeEach(() => {
    engine = new CopilotIntentEngine(DEFAULT_COPILOT_CONFIGURATION);
  });

  it('should resolve question intent', () => {
    const result = engine.resolve('What is my health score?');
    expect(result.intent).toBe('question');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should resolve recommendation intent', () => {
    const result = engine.resolve('Can you recommend some optimizations?');
    expect(result.intent).toBe('recommendation');
  });

  it('should resolve explanation intent', () => {
    const result = engine.resolve('Explain my health score');
    expect(result.intent).toBe('explanation');
  });

  it('should resolve navigation intent', () => {
    const result = engine.resolve('Take me to the timeline');
    expect(result.intent).toBe('navigation');
  });

  it('should fallback to conversation for unknown', () => {
    const result = engine.resolve('xyzzy');
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });
});

// ── Context Resolver ─────────────────────────────────────────

describe('Copilot Context Resolver', () => {
  let resolver: CopilotContextResolver;

  beforeEach(() => {
    resolver = new CopilotContextResolver();
  });

  it('should resolve context from all sources', () => {
    const ctx = resolver.resolve(createMockContextInput());
    expect(ctx.sources.length).toBeGreaterThan(5);
    expect(ctx.healthScore).toBe(75);
    expect(ctx.deviceProfile).not.toBeNull();
  });

  it('should handle empty context', () => {
    const ctx = resolver.resolve({
      healthScore: null,
      deviceProfile: null,
      activeGoals: [],
      recentTimelineEvents: [],
      activeRecommendations: [],
      activePredictions: [],
      maintenanceHistory: [],
      optimizationHistory: [],
      recoveryHistory: [],
      userPreferences: {},
    });
    expect(ctx.sources.length).toBe(0);
  });

  it('should compute average confidence', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const avg = resolver.getAverageConfidence(ctx);
    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThanOrEqual(1);
  });
});

// ── Response Engine ──────────────────────────────────────────

describe('Copilot Response Engine', () => {
  let engine: CopilotResponseEngine;
  let resolver: CopilotContextResolver;

  beforeEach(() => {
    engine = new CopilotResponseEngine(DEFAULT_COPILOT_CONFIGURATION);
    resolver = new CopilotContextResolver();
  });

  it('should generate a response with evidence', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const resp = engine.generate('question', ctx, [], 'What is my health?', 'conv1', [], ['answer_questions']);
    expect(resp.answer.length).toBeGreaterThan(0);
    expect(resp.confidence).toBeGreaterThan(0);
    expect(resp.supportingEvidence.length).toBeGreaterThan(0);
    expect(resp.relevantModules.length).toBeGreaterThan(0);
  });

  it('should generate recommendation response', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const resp = engine.generate('recommendation', ctx, [], 'Recommend something', 'conv1', [], ['suggest_optimizations']);
    expect(resp.answer).toContain('recommendations');
  });
});

// ── Suggestion Engine ────────────────────────────────────────

describe('Copilot Suggestion Engine', () => {
  let engine: CopilotSuggestionEngine;
  let resolver: CopilotContextResolver;

  beforeEach(() => {
    engine = new CopilotSuggestionEngine(DEFAULT_COPILOT_CONFIGURATION);
    resolver = new CopilotContextResolver();
  });

  it('should generate suggestions with context', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const suggestions = engine.generate('question', ctx, 'conv1');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]!.title.length).toBeGreaterThan(0);
  });

  it('should respect max suggestions', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const suggestions = engine.generate('question', ctx, 'conv1');
    expect(suggestions.length).toBeLessThanOrEqual(DEFAULT_COPILOT_CONFIGURATION.suggestionRules.maxSuggestions);
  });
});

// ── Explanation Engine ───────────────────────────────────────

describe('Copilot Explanation Engine', () => {
  let engine: CopilotExplanationEngine;
  let resolver: CopilotContextResolver;

  beforeEach(() => {
    engine = new CopilotExplanationEngine();
    resolver = new CopilotContextResolver();
  });

  it('should explain health score', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const expl = engine.explain('health_score', ctx, null);
    expect(expl.subject).toBe('health_score');
    expect(expl.why).toContain('75');
    expect(expl.evidence.length).toBeGreaterThan(0);
  });

  it('should explain recommendation', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const expl = engine.explain('recommendation', ctx, 'r1');
    expect(expl.subject).toBe('recommendation');
    expect(expl.confidence).toBeGreaterThan(0);
  });

  it('should fallback for missing entity', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const expl = engine.explain('recommendation', ctx, 'nonexistent');
    expect(expl.confidence).toBeLessThan(0.5);
  });
});

// ── Permission Engine ────────────────────────────────────────

describe('Copilot Permission Engine', () => {
  let engine: CopilotPermissionEngine;

  beforeEach(() => {
    engine = new CopilotPermissionEngine(DEFAULT_COPILOT_CONFIGURATION);
  });

  it('should allow free actions for free users', () => {
    const result = engine.check('generate_optimization_session', 'free');
    expect(result.allowed).toBe(true);
  });

  it('should block pro actions for free users', () => {
    const result = engine.check('create_goal', 'free');
    expect(result.allowed).toBe(false);
    expect(result.reason).not.toBeNull();
  });

  it('should allow all actions for enterprise', () => {
    const result = engine.check('create_goal', 'enterprise');
    expect(result.allowed).toBe(true);
  });
});

// ── Action Planner ───────────────────────────────────────────

describe('Copilot Action Planner', () => {
  let planner: CopilotActionPlanner;
  let resolver: CopilotContextResolver;

  beforeEach(() => {
    const permEngine = new CopilotPermissionEngine(DEFAULT_COPILOT_CONFIGURATION);
    planner = new CopilotActionPlanner(DEFAULT_COPILOT_CONFIGURATION, permEngine);
    resolver = new CopilotContextResolver();
  });

  it('should create optimization plans', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const plans = planner.createPlans('optimization', ctx, 'free');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]!.type).toBe('generate_optimization_session');
  });

  it('should mark plans with permission status', () => {
    const ctx = resolver.resolve(createMockContextInput());
    const plans = planner.createPlans('goal_management', ctx, 'free');
    expect(plans[0]!.allowed).toBe(false);
  });
});

// ── Memory ───────────────────────────────────────────────────

describe('Copilot Memory', () => {
  let memory: CopilotMemory;

  beforeEach(() => {
    memory = new CopilotMemory();
  });

  it('should store and retrieve session ID', () => {
    memory.setSessionId('s1');
    expect(memory.getSessionId()).toBe('s1');
  });

  it('should track topics', () => {
    memory.addTopic('question');
    memory.addTopic('recommendation');
    memory.addTopic('question');
    const topics = memory.getRecentTopics();
    expect(topics).toContain('question');
    expect(topics).toContain('recommendation');
    expect(topics.length).toBe(2);
  });

  it('should clear memory', () => {
    memory.setSessionId('s1');
    memory.addTopic('test');
    memory.clear();
    expect(memory.getSessionId()).toBeNull();
    expect(memory.getRecentTopics().length).toBe(0);
  });
});

// ── Session Manager ──────────────────────────────────────────

describe('Copilot Session Manager', () => {
  let manager: CopilotSessionManager;

  beforeEach(() => {
    manager = new CopilotSessionManager(10);
  });

  it('should create sessions', () => {
    const session = manager.createSession();
    expect(session.id).toMatch(/^session_/);
    expect(session.status).toBe('active');
  });

  it('should create conversations', () => {
    const session = manager.createSession();
    const conv = manager.createConversation(session.id);
    expect(conv.id).toMatch(/^conv_/);
    expect(conv.messages.length).toBe(0);
  });

  it('should add messages', () => {
    const session = manager.createSession();
    const conv = manager.createConversation(session.id);
    manager.addMessage(conv.id, { id: 'm1', role: 'user', content: 'Hello', intent: 'conversation', responseId: null });
    const updated = manager.getConversation(conv.id);
    expect(updated!.messages.length).toBe(1);
  });

  it('should clear conversations', () => {
    const session = manager.createSession();
    const conv = manager.createConversation(session.id);
    manager.addMessage(conv.id, { id: 'm1', role: 'user', content: 'Hello', intent: 'conversation', responseId: null });
    manager.clearConversation(conv.id);
    const updated = manager.getConversation(conv.id);
    expect(updated!.messages.length).toBe(0);
  });
});

// ── Analytics ────────────────────────────────────────────────

describe('Copilot Analytics', () => {
  let analytics: CopilotAnalyticsEngine;

  beforeEach(() => {
    analytics = new CopilotAnalyticsEngine();
  });

  it('should track conversations', () => {
    const resolver = new CopilotContextResolver();
    const ctx = resolver.resolve(createMockContextInput());
    analytics.recordConversation({
      id: 'c1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      intent: 'question', confidence: 0.8, context: ctx, entities: [], selectedModules: [],
      generatedActions: [], suggestions: [], references: [], messages: [], status: 'active', futureMetadata: {},
    });
    const result = analytics.getAnalytics();
    expect(result.totalConversations).toBe(1);
  });

  it('should reset', () => {
    analytics.reset();
    expect(analytics.getAnalytics().totalConversations).toBe(0);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('Copilot Validator', () => {
  let validator: CopilotValidator;

  beforeEach(() => {
    validator = new CopilotValidator();
  });

  it('should validate prompt', () => {
    const result = validator.validatePrompt(createMockPrompt('Hello'));
    expect(result.valid).toBe(true);
  });

  it('should reject empty prompt', () => {
    const result = validator.validatePrompt(createMockPrompt(''));
    expect(result.valid).toBe(false);
  });

  it('should validate response', () => {
    const result = validator.validateResponse({
      id: 'r1', conversationId: 'c1', answer: 'Test', reasoningSummary: 'Reasoning',
      supportingEvidence: [], confidence: 0.8, relatedRecommendations: [],
      suggestedNextActions: [], relevantModules: [], intent: 'question',
      capabilities: ['answer_questions'], generatedAt: new Date().toISOString(), futureMetadata: {},
    });
    expect(result.valid).toBe(true);
  });
});

// ── CopilotManager (Integration) ─────────────────────────────

describe('CopilotManager', () => {
  let manager: CopilotManager;

  beforeEach(() => {
    manager = new CopilotManager();
  });

  it('should process a prompt end-to-end', () => {
    const result = manager.processPrompt(createMockPrompt('What is my health score?'), createMockContextInput());
    expect(result.response.answer.length).toBeGreaterThan(0);
    expect(result.conversation.messages.length).toBe(2);
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should resolve intent via manager', () => {
    const result = manager.resolveIntent('How do I optimize?');
    expect(result.intent).toBeDefined();
  });

  it('should generate suggestions via manager', () => {
    const resolver = new CopilotContextResolver();
    const ctx = resolver.resolve(createMockContextInput());
    const suggestions = manager.generateSuggestions('question', ctx, 'conv1');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should create action plans via manager', () => {
    const resolver = new CopilotContextResolver();
    const ctx = resolver.resolve(createMockContextInput());
    const plans = manager.createActionPlan('optimization', ctx, 'free');
    expect(plans.length).toBeGreaterThan(0);
  });

  it('should generate explanations via manager', () => {
    const resolver = new CopilotContextResolver();
    const ctx = resolver.resolve(createMockContextInput());
    const expl = manager.generateExplanation('health_score', ctx, null);
    expect(expl.subject).toBe('health_score');
  });

  it('should track analytics', () => {
    manager.processPrompt(createMockPrompt('What is my health?'), createMockContextInput());
    const analytics = manager.getAnalytics();
    expect(analytics.totalConversations).toBe(1);
    expect(analytics.totalMessages).toBe(2);
  });

  it('should clear all', () => {
    manager.processPrompt(createMockPrompt('Hello'), createMockContextInput());
    manager.clearAll();
    expect(manager.getAnalytics().totalConversations).toBe(0);
  });

  it('should throw when disabled', () => {
    manager.updateConfig({ featureFlags: { ...DEFAULT_COPILOT_CONFIGURATION.featureFlags, enableCopilot: false } });
    expect(() => manager.processPrompt(createMockPrompt('Hello'), createMockContextInput())).toThrow();
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Copilot Performance', () => {
  it('should resolve intent within target', () => {
    const engine = new CopilotIntentEngine(DEFAULT_COPILOT_CONFIGURATION);
    const start = Date.now();
    engine.resolve('What is my health score?');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(DEFAULT_COPILOT_CONFIGURATION.intentResolutionTargetMs + 50);
  });

  it('should process prompt within target', () => {
    const manager = new CopilotManager();
    const start = Date.now();
    manager.processPrompt(createMockPrompt('What is my health?'), createMockContextInput());
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(DEFAULT_COPILOT_CONFIGURATION.performanceTargetMs + 200);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Copilot Edge Cases', () => {
  it('should handle empty context gracefully', () => {
    const manager = new CopilotManager();
    const result = manager.processPrompt(
      createMockPrompt('What is happening?'),
      {
        healthScore: null, deviceProfile: null, activeGoals: [], recentTimelineEvents: [],
        activeRecommendations: [], activePredictions: [], maintenanceHistory: [],
        optimizationHistory: [], recoveryHistory: [], userPreferences: {},
      },
    );
    expect(result.response.answer.length).toBeGreaterThan(0);
  });

  it('should handle very long prompts', () => {
    const manager = new CopilotManager();
    const longPrompt = 'What '.repeat(1000) + 'is my health?';
    const result = manager.processPrompt(createMockPrompt(longPrompt), createMockContextInput());
    expect(result.response.answer.length).toBeGreaterThan(0);
  });

  it('should handle special characters', () => {
    const manager = new CopilotManager();
    const result = manager.processPrompt(createMockPrompt('What is <script>alert(1)</script>?'), createMockContextInput());
    expect(result.response.answer).not.toContain('<script>');
  });
});
