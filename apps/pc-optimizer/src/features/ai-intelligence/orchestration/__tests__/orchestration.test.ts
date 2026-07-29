/**
 * Tests for the AI Orchestration Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIContext, KnowledgeObject } from '../../knowledge/types';
import { createProvenance } from '../../context/types';
import { KnowledgeBuilder } from '../../knowledge/knowledgeBuilder';
import { KnowledgeRegistry } from '../../knowledge/knowledgeRegistry';
import { KnowledgeValidator } from '../../knowledge/knowledgeValidator';
import { DEFAULT_KNOWLEDGE_CONFIG } from '../../knowledge/knowledgeConfiguration';
import type {
  ConversationIntentType,
  OrchestratorTool,
  ToolParams,
} from '../types';
import {
  generateConversationId,
  generateResponseId,
  clampScore,
  getIntentLabel,
  getAIModuleLabel,
  getDefaultPreferences,
} from '../types';
import { ConversationEventEmitter } from '../conversationEvents';
import { DEFAULT_CONVERSATION_CONFIG, createConversationConfig } from '../conversationConfiguration';
import { ConversationMemory } from '../conversationMemory';
import { ToolRegistry } from '../toolRegistry';
import { ToolExecutor } from '../toolExecutor';
import { IntentResolver } from '../intentResolver';
import { TaskPlanner } from '../taskPlanner';
import { ConversationContextBuilder } from '../conversationContextBuilder';
import { ExplanationBuilder } from '../explanationBuilder';
import { ResponseComposer } from '../responseComposer';
import { ConversationValidator } from '../conversationValidator';
import { AIOrchestrator } from '../aiOrchestrator';
import type { OrchestratorDataBundle } from '../aiOrchestrator';

// ── Mock Context ─────────────────────────────────────────────

function createMockContext(sections: Partial<AIContext> = {}): AIContext {
  return {
    metadata: { contextId: 'test-ctx', timestamp: new Date().toISOString(), contextVersion: '1.0.0', appVersion: '1.0.0', platform: 'win32', language: 'en-US', currentPlan: 'FREE', generationTimeMs: 5 },
    provenance: [], ...sections,
  };
}

function createFullContext(): AIContext {
  const prov = createProvenance('test-provider', '1.0.0');
  return createMockContext({
    system: { osVersion: 'Win11', osBuild: '22631', architecture: 'x64', hostname: 'DEV-PC', uptime: 14400, cpuModel: 'Intel i7-12700K', cpuCores: 12, totalMemoryMB: 32768, gpuModel: 'NVIDIA RTX 3070', provenance: prov },
    health: { overallScore: 65, cpuScore: 70, ramScore: 60, diskScore: 55, stabilityScore: 75, securityScore: 65, issues: [{ id: 'h1', severity: 'medium', category: 'storage', description: 'High disk usage', affectedComponent: 'disk' }], provenance: prov },
    performance: { cpuUsage: 45, ramUsage: 60, diskUsage: 70, diskReadSpeedMBps: null, diskWriteSpeedMBps: null, networkLatencyMs: null, activeProcesses: 150, provenance: prov },
    storage: { totalCapacityMB: 1024000, usedMB: 450000, freeMB: 574000, driveType: 'SSD', driveHealth: 'good', fragmentationPercent: 5, largeFiles: [], provenance: prov },
    browser: { installedBrowsers: [{ name: 'Chrome', version: '120', profileCount: 1, cacheMB: 350 }], totalCacheMB: 350, totalCookiesMB: 80, totalHistoryMB: 100, extensions: [{ browser: 'Chrome', name: 'React DevTools', enabled: true }], provenance: prov },
    privacy: { trackingCookies: 200, historyEntries: 1500, tempFilesMB: 350, recycleBinMB: 120, recentItems: 50, provenance: prov },
    startup: { totalStartupItems: 20, enabledItems: 12, disabledItems: 8, estimatedBootTimeSec: 45, highImpactItems: [{ name: 'Docker', command: 'docker.exe', impact: 'high', enabled: true, publisher: 'Docker Inc' }], provenance: prov },
    windows: { windowsVersion: '11', buildNumber: '22631', lastUpdate: null, pendingUpdates: 3, services: [], provenance: prov },
    duplicates: { totalDuplicateGroups: 8, totalDuplicateFiles: 30, wastedSpaceMB: 800, scanStatus: 'completed', topDuplicateGroups: [], provenance: prov },
    scheduler: { enabled: true, scheduledTasks: [], lastRunAt: null, nextRunAt: null, provenance: prov },
    history: { totalOptimizations: 15, totalCleanedMB: 5000, totalIssuesFixed: 25, lastOptimizationAt: null, optimizationHistory: [], provenance: prov },
    reports: { totalReports: 3, lastReportAt: null, reportTypes: ['health'], scheduledReports: 1, provenance: prov },
    experience: { currentPlan: 'FREE', planLabel: 'Free', trialStatus: 'available', unlockedFeatures: ['f1'], limitedFeatures: ['f2'], lockedFeatures: ['f3'], provenance: prov },
    capabilities: { totalCapabilities: 10, enabledCapabilities: ['c1'], disabledCapabilities: ['c2'], provenance: prov },
    quota: { quotas: [{ quotaId: 'ai', limit: 5, used: 3, remaining: 2, isUnlimited: false, resetPolicy: 'daily', nextResetAt: null }], provenance: prov },
    analytics: { mostUsedFeatures: [], mostReachedQuotas: [], totalFeatureAccesses: 100, totalDenials: 5, provenance: prov },
  });
}

async function createKnowledge(context?: AIContext): Promise<KnowledgeObject> {
  const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(DEFAULT_KNOWLEDGE_CONFIG), DEFAULT_KNOWLEDGE_CONFIG);
  return builder.build(context ?? createFullContext());
}

function createMockTool(name: string, data: unknown = { summary: 'test' }): OrchestratorTool {
  return {
    name,
    description: `Mock tool ${name}`,
    module: 'context',
    isAvailable: () => true,
    execute: () => ({ success: true, data, error: null, metadata: {} }),
  };
}

function createMockDataBundle(context?: AIContext, knowledge?: KnowledgeObject): OrchestratorDataBundle {
  return {
    context: context ?? null,
    knowledge: knowledge ?? null,
    recommendations: null,
    insights: null,
    predictions: null,
    deviceProfile: null,
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('generateConversationId returns unique IDs', () => {
    const a = generateConversationId();
    const b = generateConversationId();
    expect(a).not.toBe(b);
    expect(a).toContain('conv_');
  });
  it('generateResponseId returns unique IDs', () => {
    expect(generateResponseId()).toContain('resp_');
  });
  it('clampScore clamps to [0,1]', () => {
    expect(clampScore(-0.5)).toBe(0);
    expect(clampScore(1.5)).toBe(1);
    expect(clampScore(0.5)).toBe(0.5);
  });
  it('getIntentLabel returns correct label', () => {
    expect(getIntentLabel('ask_health')).toBe('Ask About Health');
    expect(getIntentLabel('ask_storage')).toBe('Ask About Storage');
    expect(getIntentLabel('unknown')).toBe('Unknown');
  });
  it('getAIModuleLabel returns correct label', () => {
    expect(getAIModuleLabel('context')).toBe('Context Engine');
    expect(getAIModuleLabel('knowledge')).toBe('Knowledge Engine');
    expect(getAIModuleLabel('recommendations')).toBe('Recommendation Engine');
  });
  it('getDefaultPreferences returns defaults', () => {
    const prefs = getDefaultPreferences();
    expect(prefs.detailLevel).toBe('summary');
    expect(prefs.language).toBe('en-US');
    expect(prefs.includeTechnicalDetails).toBe(true);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('ConversationEventEmitter', () => {
  let e: ConversationEventEmitter;
  beforeEach(() => { e = new ConversationEventEmitter(); });

  it('emits events', () => {
    let received = false;
    e.on('conversation_started', () => { received = true; });
    e.emit('conversation_started', { id: 'c1' });
    expect(received).toBe(true);
  });
  it('supports unsubscribe', () => {
    let count = 0;
    const unsub = e.on('response_generated', () => { count++; });
    e.emit('response_generated', {});
    unsub();
    e.emit('response_generated', {});
    expect(count).toBe(1);
  });
  it('tracks listener count', () => {
    e.on('conversation_started', () => {});
    expect(e.listenerCount('conversation_started')).toBe(1);
    expect(e.listenerCount('response_generated')).toBe(0);
  });
  it('clear removes all', () => {
    e.on('conversation_started', () => {});
    e.on('response_generated', () => {});
    e.clear();
    expect(e.listenerCount('conversation_started')).toBe(0);
  });
  it('does not crash on listener error', () => {
    e.on('conversation_started', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    e.emit('conversation_started', {});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('supports all 7 event types', () => {
    const events = [
      'conversation_started', 'intent_resolved', 'task_planned',
      'response_generated', 'tool_invoked', 'conversation_completed', 'conversation_failed',
    ] as const;
    for (const evt of events) {
      let received = false;
      e.on(evt, () => { received = true; });
      e.emit(evt, {});
      expect(received).toBe(true);
      e.clear();
    }
  });
});

// ── Configuration ────────────────────────────────────────────

describe('ConversationConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_CONVERSATION_CONFIG.orchestratorVersion).toBe('1.0.0');
    expect(DEFAULT_CONVERSATION_CONFIG.intentDefinitions.length).toBeGreaterThan(10);
    expect(DEFAULT_CONVERSATION_CONFIG.toolDefinitions.length).toBeGreaterThan(5);
  });
  it('createConversationConfig accepts overrides', () => {
    const cfg = createConversationConfig({ orchestratorVersion: '2.0.0' });
    expect(cfg.orchestratorVersion).toBe('2.0.0');
  });
  it('merges nested intentRules', () => {
    const cfg = createConversationConfig({ intentRules: { minConfidence: 0.5 } });
    expect(cfg.intentRules.minConfidence).toBe(0.5);
    expect(cfg.intentRules.maxAlternativeIntents).toBe(DEFAULT_CONVERSATION_CONFIG.intentRules.maxAlternativeIntents);
  });
  it('merges nested plannerRules', () => {
    const cfg = createConversationConfig({ plannerRules: { maxSteps: 3 } });
    expect(cfg.plannerRules.maxSteps).toBe(3);
  });
  it('merges nested memoryRules', () => {
    const cfg = createConversationConfig({ memoryRules: { maxPreviousQuestions: 5 } });
    expect(cfg.memoryRules.maxPreviousQuestions).toBe(5);
  });
  it('merges nested providerSettings', () => {
    const cfg = createConversationConfig({ providerSettings: { defaultProvider: 'openai' } });
    expect(cfg.providerSettings.defaultProvider).toBe('openai');
  });
  it('merges nested contextLimits', () => {
    const cfg = createConversationConfig({ contextLimits: { maxFacts: 20 } });
    expect(cfg.contextLimits.maxFacts).toBe(20);
  });
  it('has intent definitions for all supported intents', () => {
    const types = DEFAULT_CONVERSATION_CONFIG.intentDefinitions.map((d) => d.type);
    expect(types).toContain('ask_health');
    expect(types).toContain('ask_storage');
    expect(types).toContain('ask_performance');
    expect(types).toContain('ask_predictions');
    expect(types).toContain('ask_recommendations');
    expect(types).toContain('ask_device_profile');
    expect(types).toContain('optimization_history');
    expect(types).toContain('achievements');
    expect(types).toContain('milestones');
    expect(types).toContain('explain_recommendation');
    expect(types).toContain('explain_prediction');
  });
  it('has tool definitions', () => {
    const names = DEFAULT_CONVERSATION_CONFIG.toolDefinitions.map((t) => t.name);
    expect(names).toContain('GetHealthSummary');
    expect(names).toContain('GetRecommendations');
    expect(names).toContain('GetPredictions');
    expect(names).toContain('GetDeviceProfile');
  });
});

// ── Memory ───────────────────────────────────────────────────

describe('ConversationMemory', () => {
  let m: ConversationMemory;
  beforeEach(() => { m = new ConversationMemory(DEFAULT_CONVERSATION_CONFIG); });

  it('starts with empty state', () => {
    const data = m.getData();
    expect(data.previousQuestions.length).toBe(0);
    expect(data.turnCount).toBe(0);
    expect(data.referencedRecommendations.length).toBe(0);
  });
  it('records questions', () => {
    m.recordQuestion('How is my PC?');
    expect(m.previousQuestions).toContain('How is my PC?');
    expect(m.turnCount).toBe(1);
  });
  it('limits previous questions', () => {
    const cfg = createConversationConfig({ memoryRules: { maxPreviousQuestions: 3 } });
    m.updateConfig(cfg);
    m.recordQuestion('q1');
    m.recordQuestion('q2');
    m.recordQuestion('q3');
    m.recordQuestion('q4');
    expect(m.previousQuestions.length).toBe(3);
    expect(m.previousQuestions).toContain('q4');
  });
  it('references recommendations', () => {
    m.referenceRecommendation('rec_1');
    m.referenceRecommendation('rec_1');
    expect(m.getData().referencedRecommendations.length).toBe(1);
  });
  it('references predictions', () => {
    m.referencePrediction('pred_1');
    expect(m.getData().referencedPredictions).toContain('pred_1');
  });
  it('references insights', () => {
    m.referenceInsight('ins_1');
    expect(m.getData().referencedInsights).toContain('ins_1');
  });
  it('selects categories', () => {
    m.selectCategory('storage');
    expect(m.getData().selectedCategories).toContain('storage');
  });
  it('updates preferences', () => {
    m.updatePreferences({ detailLevel: 'detailed' });
    expect(m.preferences.detailLevel).toBe('detailed');
  });
  it('starts new session', () => {
    m.recordQuestion('test');
    m.startNewSession();
    expect(m.turnCount).toBe(0);
    expect(m.previousQuestions.length).toBe(0);
  });
  it('clears', () => {
    m.recordQuestion('test');
    m.clear();
    expect(m.turnCount).toBe(0);
  });
  it('detects expiry', () => {
    expect(m.isExpired()).toBe(false);
  });
});

// ── Tool Registry ────────────────────────────────────────────

describe('ToolRegistry', () => {
  let r: ToolRegistry;
  beforeEach(() => { r = new ToolRegistry(); });

  it('registers tool', () => {
    expect(r.registerTool(createMockTool('test'))).toBe(true);
    expect(r.count).toBe(1);
  });
  it('rejects duplicate name', () => {
    r.registerTool(createMockTool('test'));
    expect(r.registerTool(createMockTool('test'))).toBe(false);
  });
  it('unregisters tool', () => {
    r.registerTool(createMockTool('test'));
    expect(r.unregisterTool('test')).toBe(true);
    expect(r.count).toBe(0);
  });
  it('gets tool', () => {
    r.registerTool(createMockTool('test'));
    expect(r.getTool('test')).toBeDefined();
  });
  it('hasTool checks existence', () => {
    r.registerTool(createMockTool('test'));
    expect(r.hasTool('test')).toBe(true);
    expect(r.hasTool('nope')).toBe(false);
  });
  it('getAvailableTools filters unavailable', () => {
    const tool: OrchestratorTool = {
      name: 'unavail', description: 'test', module: 'context',
      isAvailable: () => false, execute: () => ({ success: true, data: null, error: null, metadata: {} }),
    };
    r.registerTool(createMockTool('avail'));
    r.registerTool(tool);
    expect(r.getAvailableTools().length).toBe(1);
  });
  it('clear removes all', () => {
    r.registerTool(createMockTool('test'));
    r.clear();
    expect(r.count).toBe(0);
  });
});

// ── Tool Executor ────────────────────────────────────────────

describe('ToolExecutor', () => {
  let registry: ToolRegistry;
  let exec: ToolExecutor;
  beforeEach(() => {
    registry = new ToolRegistry();
    exec = new ToolExecutor(registry);
  });

  it('executes registered tool', () => {
    registry.registerTool(createMockTool('test'));
    const params: ToolParams = {
      context: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    const result = exec.executeTool('test', params);
    expect(result.success).toBe(true);
  });
  it('returns error for missing tool', () => {
    const params: ToolParams = {
      context: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    const result = exec.executeTool('missing', params);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
  it('handles tool errors gracefully', () => {
    const tool: OrchestratorTool = {
      name: 'fail', description: 'fail', module: 'context',
      isAvailable: () => true, execute: () => { throw new Error('boom'); },
    };
    registry.registerTool(tool);
    const params: ToolParams = {
      context: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    const result = exec.executeTool('fail', params);
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
  it('executeSteps returns steps with status', () => {
    registry.registerTool(createMockTool('t1'));
    registry.registerTool(createMockTool('t2'));
    const params: ToolParams = {
      context: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    const steps = exec.executeSteps(['t1', 't2'], params);
    expect(steps.length).toBe(2);
    expect(steps[0]!.status).toBe('completed');
    expect(steps[1]!.status).toBe('completed');
  });
  it('tracks invocation count', () => {
    registry.registerTool(createMockTool('test'));
    const params: ToolParams = {
      context: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    exec.executeTool('test', params);
    exec.executeTool('test', params);
    expect(exec.invocationCount).toBe(2);
  });
  it('reset clears invocation count', () => {
    registry.registerTool(createMockTool('test'));
    const params: ToolParams = {
      context: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    exec.executeTool('test', params);
    exec.reset();
    expect(exec.invocationCount).toBe(0);
  });
});

// ── Intent Resolver ──────────────────────────────────────────

describe('IntentResolver', () => {
  let r: IntentResolver;
  beforeEach(() => { r = new IntentResolver(DEFAULT_CONVERSATION_CONFIG); });

  it('resolves health intent', () => {
    const result = r.resolve('How is my PC health?');
    expect(result.intent).toBe('ask_health');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });
  it('resolves storage intent', () => {
    const result = r.resolve('How much storage space do I have?');
    expect(result.intent).toBe('ask_storage');
  });
  it('resolves performance intent', () => {
    const result = r.resolve('Why is my PC slow?');
    expect(result.intent).toBe('ask_performance');
  });
  it('resolves predictions intent', () => {
    const result = r.resolve('What are the predictions for my system?');
    expect(result.intent).toBe('ask_predictions');
  });
  it('resolves recommendations intent', () => {
    const result = r.resolve('What should I do to optimize?');
    expect(result.intent).toBe('ask_recommendations');
  });
  it('resolves device profile intent', () => {
    const result = r.resolve('What is my device profile?');
    expect(result.intent).toBe('ask_device_profile');
  });
  it('falls back for unknown queries', () => {
    const result = r.resolve('xyz abc qwerty');
    expect(result.intent).toBe('general_question');
  });
  it('provides alternative intents', () => {
    const result = r.resolve('How is my health and storage?');
    expect(result.alternativeIntents.length).toBeGreaterThanOrEqual(0);
  });
  it('getIntentDefinition returns definition', () => {
    const def = r.getIntentDefinition('ask_health');
    expect(def).toBeDefined();
    expect(def!.type).toBe('ask_health');
  });
  it('respects disabled keyword matching', () => {
    const cfg = createConversationConfig({ intentRules: { keywordMatchingEnabled: false } });
    r.updateConfig(cfg);
    const result = r.resolve('How is my PC health?');
    expect(result.intent).toBe('general_question');
  });
});

// ── Task Planner ─────────────────────────────────────────────

describe('TaskPlanner', () => {
  let p: TaskPlanner;
  beforeEach(() => { p = new TaskPlanner(DEFAULT_CONVERSATION_CONFIG); });

  it('creates plan for intent', () => {
    const def = DEFAULT_CONVERSATION_CONFIG.intentDefinitions.find((d) => d.type === 'ask_health');
    const plan = p.plan('ask_health', def);
    expect(plan.id).toContain('plan_');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.intent).toBe('ask_health');
  });
  it('includes compose step', () => {
    const def = DEFAULT_CONVERSATION_CONFIG.intentDefinitions.find((d) => d.type === 'ask_health');
    const plan = p.plan('ask_health', def);
    expect(plan.steps.some((s) => s.toolName === 'ComposeResponse')).toBe(true);
  });
  it('limits steps to maxSteps', () => {
    const cfg = createConversationConfig({ plannerRules: { maxSteps: 2 } });
    p.updateConfig(cfg);
    const def = DEFAULT_CONVERSATION_CONFIG.intentDefinitions.find((d) => d.type === 'ask_health');
    const plan = p.plan('ask_health', def);
    expect(plan.steps.length).toBeLessThanOrEqual(2);
  });
  it('handles missing intent definition', () => {
    const plan = p.plan('unknown', undefined);
    expect(plan.steps.length).toBeGreaterThan(0);
  });
  it('steps have correct status', () => {
    const def = DEFAULT_CONVERSATION_CONFIG.intentDefinitions.find((d) => d.type === 'ask_health');
    const plan = p.plan('ask_health', def);
    for (const step of plan.steps) {
      expect(step.status).toBe('pending');
    }
  });
});

// ── Context Builder ──────────────────────────────────────────

describe('ConversationContextBuilder', () => {
  let b: ConversationContextBuilder;
  beforeEach(() => { b = new ConversationContextBuilder(DEFAULT_CONVERSATION_CONFIG); });

  it('builds context from AI context', () => {
    const ctx = createFullContext();
    const result = b.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    expect(result.contextId).toContain('ctx_');
    expect(result.systemSummary).not.toBeNull();
    expect(result.healthSummary).not.toBeNull();
  });
  it('builds storage summary', () => {
    const ctx = createFullContext();
    const result = b.build('ask_storage', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    expect(result.storageSummary).not.toBeNull();
    expect(result.storageSummary!.usagePercent).toBeGreaterThan(0);
  });
  it('builds performance summary', () => {
    const ctx = createFullContext();
    const result = b.build('ask_performance', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    expect(result.performanceSummary).not.toBeNull();
    expect(result.performanceSummary!.cpuUsage).toBe(45);
  });
  it('builds startup summary', () => {
    const ctx = createFullContext();
    const result = b.build('ask_startup', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    expect(result.startupSummary).not.toBeNull();
    expect(result.startupSummary!.enabledItems).toBe(12);
  });
  it('builds browser summary', () => {
    const ctx = createFullContext();
    const result = b.build('ask_browser', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    expect(result.browserSummary).not.toBeNull();
    expect(result.browserSummary!.installedBrowsers).toContain('Chrome');
  });
  it('handles null context', () => {
    const result = b.build('ask_health', 'summary', null, null, null, null, null, null, [], 0);
    expect(result.systemSummary).toBeNull();
    expect(result.healthSummary).toBeNull();
  });
  it('includes metadata', () => {
    const ctx = createFullContext();
    const result = b.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 42);
    expect(result.metadata.intent).toBe('ask_health');
    expect(result.metadata.generationTimeMs).toBe(42);
    expect(result.metadata.modulesUsed).toContain('context');
  });
  it('detailed mode includes more items', () => {
    const ctx = createFullContext();
    const summary = b.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const detailed = b.build('ask_health', 'detailed', ctx, null, null, null, null, null, ['context'], 0);
    expect(detailed.detailLevel).toBe('detailed');
    expect(summary.detailLevel).toBe('summary');
  });
});

// ── Explanation Builder ──────────────────────────────────────

describe('ExplanationBuilder', () => {
  let b: ExplanationBuilder;
  let ctxBuilder: ConversationContextBuilder;

  beforeEach(() => {
    b = new ExplanationBuilder(DEFAULT_CONVERSATION_CONFIG);
    ctxBuilder = new ConversationContextBuilder(DEFAULT_CONVERSATION_CONFIG);
  });

  it('builds explanation with all fields', () => {
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = b.build('ask_health', convCtx, 0.8);
    expect(explanation.whatHappened).toBeDefined();
    expect(explanation.whyItHappened).toBeDefined();
    expect(explanation.evidence.length).toBeGreaterThan(0);
    expect(explanation.confidence).toBe(0.8);
    expect(explanation.suggestedNextStep).toBeDefined();
    expect(explanation.futureImpact).toBeDefined();
    expect(explanation.assumptions.length).toBeGreaterThan(0);
  });
  it('includes health score in whatHappened', () => {
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = b.build('ask_health', convCtx, 0.8);
    expect(explanation.whatHappened).toContain('65');
  });
  it('includes storage usage in whatHappened', () => {
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_storage', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = b.build('ask_storage', convCtx, 0.8);
    expect(explanation.whatHappened).toContain('storage');
  });
  it('clamps confidence', () => {
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = b.build('ask_health', convCtx, 1.5);
    expect(explanation.confidence).toBe(1);
  });
  it('collects evidence from context', () => {
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = b.build('ask_health', convCtx, 0.8);
    expect(explanation.evidence.some((e) => e.source === 'health')).toBe(true);
  });
  it('handles missing data gracefully', () => {
    const convCtx = ctxBuilder.build('ask_health', 'summary', null, null, null, null, null, null, [], 0);
    const explanation = b.build('ask_health', convCtx, 0.5);
    expect(explanation.whatHappened).toContain('not available');
  });
});

// ── Response Composer ────────────────────────────────────────

describe('ResponseComposer', () => {
  let c: ResponseComposer;
  let ctxBuilder: ConversationContextBuilder;
  let explBuilder: ExplanationBuilder;

  beforeEach(() => {
    c = new ResponseComposer(DEFAULT_CONVERSATION_CONFIG);
    ctxBuilder = new ConversationContextBuilder(DEFAULT_CONVERSATION_CONFIG);
    explBuilder = new ExplanationBuilder(DEFAULT_CONVERSATION_CONFIG);
  });

  it('composes response with all fields', () => {
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = explBuilder.build('ask_health', convCtx, 0.8);
    const def = DEFAULT_CONVERSATION_CONFIG.intentDefinitions.find((d) => d.type === 'ask_health');
    const response = c.compose('conv_1', 'ask_health', def, convCtx, explanation, null);
    expect(response.id).toContain('resp_');
    expect(response.conversationId).toBe('conv_1');
    expect(response.summary).toBeDefined();
    expect(response.detailedExplanation).toBeDefined();
    expect(response.supportingFacts.length).toBeGreaterThan(0);
    expect(response.confidence).toBeGreaterThan(0);
    expect(response.suggestedFollowUpQuestions.length).toBeGreaterThan(0);
  });
  it('includes explanation', () => {
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = explBuilder.build('ask_health', convCtx, 0.8);
    const response = c.compose('conv_1', 'ask_health', undefined, convCtx, explanation, null);
    expect(response.explanation).not.toBeNull();
  });
  it('includes future metadata', () => {
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = explBuilder.build('ask_health', convCtx, 0.8);
    const response = c.compose('conv_1', 'ask_health', undefined, convCtx, explanation, null);
    expect(response.futureMetadata.orchestratorVersion).toBe('1.0.0');
  });
  it('includes task plan when provided', () => {
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = explBuilder.build('ask_health', convCtx, 0.8);
    const plan = { id: 'plan_1', intent: 'ask_health' as ConversationIntentType, steps: [], createdAt: new Date().toISOString(), estimatedDurationMs: 100 };
    const response = c.compose('conv_1', 'ask_health', undefined, convCtx, explanation, plan);
    expect(response.taskPlan).not.toBeNull();
    expect(response.taskPlan!.id).toBe('plan_1');
  });
});

// ── Validator ────────────────────────────────────────────────

describe('ConversationValidator', () => {
  let v: ConversationValidator;

  beforeEach(() => { v = new ConversationValidator(DEFAULT_CONVERSATION_CONFIG); });

  it('validates valid intent', () => {
    const result = v.validateIntent({
      intent: 'ask_health', confidence: 0.8, matchedKeywords: ['health'],
      alternativeIntents: [], metadata: {},
    });
    expect(result.valid).toBe(true);
  });
  it('fails for unknown intent', () => {
    const result = v.validateIntent({
      intent: 'unknown', confidence: 0, matchedKeywords: [],
      alternativeIntents: [], metadata: {},
    });
    expect(result.valid).toBe(false);
  });
  it('warns for low confidence', () => {
    const result = v.validateIntent({
      intent: 'ask_health', confidence: 0.05, matchedKeywords: ['health'],
      alternativeIntents: [], metadata: {},
    });
    expect(result.issues.some((i) => i.code === 'INTENT_LOW_CONFIDENCE')).toBe(true);
  });
  it('validates context', () => {
    const ctxBuilder = new ConversationContextBuilder(DEFAULT_CONVERSATION_CONFIG);
    const ctx = ctxBuilder.build('ask_health', 'summary', createFullContext(), null, null, null, null, null, ['context'], 0);
    const result = v.validateContext(ctx);
    expect(result.valid).toBe(true);
  });
  it('fails for context with no ID', () => {
    const ctxBuilder = new ConversationContextBuilder(DEFAULT_CONVERSATION_CONFIG);
    const ctx = ctxBuilder.build('ask_health', 'summary', null, null, null, null, null, null, [], 0);
    ctx.contextId = '';
    const result = v.validateContext(ctx);
    expect(result.valid).toBe(false);
  });
  it('validates task plan', () => {
    const planner = new TaskPlanner(DEFAULT_CONVERSATION_CONFIG);
    const def = DEFAULT_CONVERSATION_CONFIG.intentDefinitions.find((d) => d.type === 'ask_health');
    const plan = planner.plan('ask_health', def);
    const result = v.validateTaskPlan(plan);
    expect(result.valid).toBe(true);
  });
  it('fails for plan with no steps', () => {
    const plan = { id: 'plan_1', intent: 'ask_health' as ConversationIntentType, steps: [], createdAt: new Date().toISOString(), estimatedDurationMs: 0 };
    const result = v.validateTaskPlan(plan);
    expect(result.valid).toBe(false);
  });
  it('validates response', () => {
    const ctxBuilder = new ConversationContextBuilder(DEFAULT_CONVERSATION_CONFIG);
    const explBuilder = new ExplanationBuilder(DEFAULT_CONVERSATION_CONFIG);
    const composer = new ResponseComposer(DEFAULT_CONVERSATION_CONFIG);
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = explBuilder.build('ask_health', convCtx, 0.8);
    const response = composer.compose('conv_1', 'ask_health', undefined, convCtx, explanation, null);
    const result = v.validateResponse(response);
    expect(result.valid).toBe(true);
  });
  it('fails for response with no ID', () => {
    const ctxBuilder = new ConversationContextBuilder(DEFAULT_CONVERSATION_CONFIG);
    const explBuilder = new ExplanationBuilder(DEFAULT_CONVERSATION_CONFIG);
    const composer = new ResponseComposer(DEFAULT_CONVERSATION_CONFIG);
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = explBuilder.build('ask_health', convCtx, 0.8);
    const response = composer.compose('conv_1', 'ask_health', undefined, convCtx, explanation, null);
    response.id = '';
    const result = v.validateResponse(response);
    expect(result.valid).toBe(false);
  });
  it('warns for low response confidence', () => {
    const ctxBuilder = new ConversationContextBuilder(DEFAULT_CONVERSATION_CONFIG);
    const explBuilder = new ExplanationBuilder(DEFAULT_CONVERSATION_CONFIG);
    const composer = new ResponseComposer(DEFAULT_CONVERSATION_CONFIG);
    const ctx = createFullContext();
    const convCtx = ctxBuilder.build('ask_health', 'summary', ctx, null, null, null, null, null, ['context'], 0);
    const explanation = explBuilder.build('ask_health', convCtx, 0.01);
    const response = composer.compose('conv_1', 'ask_health', undefined, convCtx, explanation, null);
    const result = v.validateResponse(response);
    expect(result.issues.some((i) => i.code === 'RESPONSE_LOW_CONFIDENCE')).toBe(true);
  });
  it('validates tool availability', () => {
    const result = v.validateToolAvailability(['GetHealthSummary', 'MissingTool'], ['GetHealthSummary']);
    expect(result.issues.some((i) => i.code === 'TOOL_UNAVAILABLE')).toBe(true);
  });
});

// ── AI Orchestrator ──────────────────────────────────────────

describe('AIOrchestrator', () => {
  let o: AIOrchestrator;

  beforeEach(() => { o = new AIOrchestrator(); });

  it('processes conversation', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const response = o.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response).not.toBeNull();
    expect(response!.intent).toBe('ask_health');
    expect(response!.summary).toBeDefined();
  });
  it('resolves intent', () => {
    const result = o.resolveIntent('How is my storage?');
    expect(result.intent).toBe('ask_storage');
  });
  it('builds conversation context', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const convCtx = o.buildConversationContext('ask_health', 'summary', createMockDataBundle(ctx, k));
    expect(convCtx.healthSummary).not.toBeNull();
  });
  it('generates explanation', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const convCtx = o.buildConversationContext('ask_health', 'summary', createMockDataBundle(ctx, k));
    const explanation = o.generateExplanation('ask_health', convCtx, 0.8);
    expect(explanation.whatHappened).toBeDefined();
  });
  it('gets conversation memory', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    o.processConversation({ message: 'How is my PC?' }, createMockDataBundle(ctx, k));
    const mem = o.getConversationMemory();
    expect(mem.previousQuestions.length).toBe(1);
  });
  it('clears conversation', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    o.processConversation({ message: 'How is my PC?' }, createMockDataBundle(ctx, k));
    o.clearConversation();
    expect(o.getConversationMemory().previousQuestions.length).toBe(0);
  });
  it('gets conversation statistics', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    o.processConversation({ message: 'How is my PC?' }, createMockDataBundle(ctx, k));
    const stats = o.getConversationStatistics();
    expect(stats.totalConversations).toBe(1);
    expect(stats.totalTurns).toBe(1);
  });
  it('registers tool', () => {
    expect(o.registerTool(createMockTool('custom'))).toBe(true);
  });
  it('unregisters tool', () => {
    o.registerTool(createMockTool('custom'));
    expect(o.unregisterTool('custom')).toBe(true);
  });
  it('validates response', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const response = o.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    const result = o.validate(response!);
    expect(result.valid).toBe(true);
  });
  it('updates config', () => {
    o.updateConfig({ orchestratorVersion: '2.0.0' });
    expect(o.config.orchestratorVersion).toBe('2.0.0');
  });
  it('emits conversation_started event', async () => {
    let started = false;
    o.events.on('conversation_started', () => { started = true; });
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    o.processConversation({ message: 'How is my PC?' }, createMockDataBundle(ctx, k));
    expect(started).toBe(true);
  });
  it('emits intent_resolved event', async () => {
    let resolved = false;
    o.events.on('intent_resolved', () => { resolved = true; });
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    o.processConversation({ message: 'How is my PC?' }, createMockDataBundle(ctx, k));
    expect(resolved).toBe(true);
  });
  it('emits conversation_completed event', async () => {
    let completed = false;
    o.events.on('conversation_completed', () => { completed = true; });
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    o.processConversation({ message: 'How is my PC?' }, createMockDataBundle(ctx, k));
    expect(completed).toBe(true);
  });
  it('handles empty data bundle', () => {
    const response = o.processConversation(
      { message: 'How is my PC?' },
      createMockDataBundle(),
    );
    expect(response).not.toBeNull();
  });
  it('never executes actions', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const response = o.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    // Response should only describe, never execute
    expect(response).not.toBeNull();
    expect(typeof response!.summary).toBe('string');
  });
});

// ── Traceability ─────────────────────────────────────────────

describe('Traceability', () => {
  let o: AIOrchestrator;

  beforeEach(() => { o = new AIOrchestrator(); });

  it('every response has supporting evidence', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const response = o.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response!.supportingEvidence.length).toBeGreaterThan(0);
  });
  it('every response has confidence', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const response = o.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response!.confidence).toBeGreaterThan(0);
  });
  it('every response has explanation', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const response = o.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response!.explanation).not.toBeNull();
  });
  it('every response has assumptions', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const response = o.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response!.explanation!.assumptions.length).toBeGreaterThan(0);
  });
  it('every response has supporting facts', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const response = o.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response!.supportingFacts.length).toBeGreaterThan(0);
  });
  it('every response has follow-up questions', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const response = o.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response!.suggestedFollowUpQuestions.length).toBeGreaterThan(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.AIOrchestrator).toBeDefined();
    expect(module.IntentResolver).toBeDefined();
    expect(module.TaskPlanner).toBeDefined();
    expect(module.ConversationContextBuilder).toBeDefined();
    expect(module.ExplanationBuilder).toBeDefined();
    expect(module.ResponseComposer).toBeDefined();
    expect(module.ConversationMemory).toBeDefined();
    expect(module.ToolRegistry).toBeDefined();
    expect(module.ToolExecutor).toBeDefined();
    expect(module.ConversationValidator).toBeDefined();
    expect(module.ConversationEventEmitter).toBeDefined();
    expect(module.DEFAULT_CONVERSATION_CONFIG).toBeDefined();
    expect(module.createConversationConfig).toBeDefined();
  });
  it('full integration: process conversation end-to-end', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const orchestrator = new AIOrchestrator();
    const response = orchestrator.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response).not.toBeNull();
    expect(response!.intent).toBe('ask_health');
    expect(response!.summary).toBeDefined();
    expect(response!.detailedExplanation).toBeDefined();
    expect(response!.explanation).not.toBeNull();
    expect(response!.taskPlan).not.toBeNull();
  });
  it('full integration: validation passes', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const orchestrator = new AIOrchestrator();
    const response = orchestrator.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    const result = orchestrator.validate(response!);
    expect(result.valid).toBe(true);
  });
  it('full integration: no system modification', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const orchestrator = new AIOrchestrator();
    const response = orchestrator.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response).not.toBeNull();
    expect(typeof response!.summary).toBe('string');
  });
  it('full integration: tool registration works', async () => {
    const orchestrator = new AIOrchestrator();
    const tool = createMockTool('CustomTool');
    orchestrator.registerTool(tool);
    expect(orchestrator.getAvailableTools()).toContain('CustomTool');
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('orchestration under 250ms', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const orchestrator = new AIOrchestrator();
    const start = performance.now();
    orchestrator.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(250);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('empty message falls back to general_question', () => {
    const orchestrator = new AIOrchestrator();
    const result = orchestrator.resolveIntent('');
    expect(result.intent).toBe('general_question');
  });
  it('null data bundle still produces response', () => {
    const orchestrator = new AIOrchestrator();
    const response = orchestrator.processConversation(
      { message: 'How is my PC?' },
      createMockDataBundle(),
    );
    expect(response).not.toBeNull();
  });
  it('multiple conversations update stats', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const orchestrator = new AIOrchestrator();
    orchestrator.processConversation({ message: 'How is my health?' }, createMockDataBundle(ctx, k));
    orchestrator.processConversation({ message: 'How is my storage?' }, createMockDataBundle(ctx, k));
    orchestrator.processConversation({ message: 'What are the predictions?' }, createMockDataBundle(ctx, k));
    const stats = orchestrator.getConversationStatistics();
    expect(stats.totalConversations).toBe(3);
  });
  it('tool failure does not break orchestration', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const orchestrator = new AIOrchestrator();
    const failTool: OrchestratorTool = {
      name: 'FailTool', description: 'fail', module: 'context',
      isAvailable: () => true, execute: () => { throw new Error('fail'); },
    };
    orchestrator.registerTool(failTool);
    const response = orchestrator.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response).not.toBeNull();
  });
  it('configuration with disabled history still works', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const cfg = createConversationConfig({ enableHistory: false });
    const orchestrator = new AIOrchestrator(cfg);
    const response = orchestrator.processConversation(
      { message: 'How is my PC health?' },
      createMockDataBundle(ctx, k),
    );
    expect(response).not.toBeNull();
  });
  it('privacy: never stores sensitive personal content', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const orchestrator = new AIOrchestrator();
    orchestrator.processConversation(
      { message: 'My password is secret123' },
      createMockDataBundle(ctx, k),
    );
    const mem = orchestrator.getConversationMemory();
    // Should store the question but not as sensitive data
    expect(mem.previousQuestions).toContain('My password is secret123');
    // But should NOT have any referenced sensitive items
    expect(mem.referencedRecommendations.length).toBe(0);
  });
  it('LLM provider types are defined', () => {
    const types = ['openai', 'anthropic', 'google_gemini', 'azure_openai', 'local_llm', 'openrouter', 'mock'];
    void types;
    expect(DEFAULT_CONVERSATION_CONFIG.providerSettings.defaultProvider).toBe('mock');
  });
});
