/**
 * Tests for the AI Tool Framework.
 *
 * Covers: registration, discovery, execution, validation, permissions,
 * events, telemetry, analytics, result formatting, built-in tools,
 * regression, performance, edge cases.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolManager } from '../toolManager';
import { ToolRegistry } from '../toolRegistry';
import { ToolResolver } from '../toolResolver';
import { ToolValidator } from '../toolValidator';
import { ToolPermissionEngine } from '../toolPermissionEngine';
import { ToolResultFormatter } from '../toolResultFormatter';
import { ToolTelemetry } from '../toolTelemetry';
import { ToolAnalytics } from '../toolAnalytics';
import { ToolEvents } from '../toolEvents';
import { createDefaultTools, ExplainHealthTool, OptimizationSessionTool } from '../builtinTools';
import { DEFAULT_TOOL_CONFIGURATION, createToolConfiguration, validateToolConfiguration } from '../toolConfiguration';
import { generateToolId, clampConfidence, getToolCategoryLabel, getRiskLevelLabel } from '../types';
import type { Tool, ToolInput, ToolResult, CopilotContext } from '../types';

function createMockContext(): CopilotContext {
  return {
    sources: [
      { type: 'health_score', available: true, data: 75, confidence: 0.9, evidence: [], futureMetadata: {} },
      { type: 'recommendations', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'predictions', available: true, data: [], confidence: 0.75, evidence: [], futureMetadata: {} },
      { type: 'timeline', available: true, data: [], confidence: 0.8, evidence: [], futureMetadata: {} },
      { type: 'goals', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'recovery_history', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'maintenance', available: true, data: [], confidence: 0.8, evidence: [], futureMetadata: {} },
      { type: 'user_preferences', available: true, data: {}, confidence: 1.0, evidence: [], futureMetadata: {} },
    ],
    healthScore: 75,
    deviceProfile: { profileType: 'gaming', performanceTier: 'high', confidence: 0.9, futureMetadata: {} },
    activeGoals: [{ id: 'g1', name: 'Improve Performance', status: 'in_progress', priority: 'high', progress: 0.5, futureMetadata: {} }],
    recentTimelineEvents: [{ id: 't1', title: 'Optimization completed', timestamp: new Date().toISOString(), category: 'optimization', severity: 'low', futureMetadata: {} }],
    activeRecommendations: [
      { id: 'r1', title: 'Clean temp files', category: 'storage', priority: 'high', confidence: 0.85, futureMetadata: {} },
      { id: 'r2', title: 'Disable startup apps', category: 'performance', priority: 'medium', confidence: 0.75, futureMetadata: {} },
    ],
    activePredictions: [{ id: 'p1', title: 'Disk space warning', category: 'storage', riskLevel: 'medium', confidence: 0.7, futureMetadata: {} }],
    maintenanceHistory: [{ id: 'm1', type: 'routine', timestamp: new Date().toISOString(), success: true, futureMetadata: {} }],
    optimizationHistory: [{ id: 'o1', timestamp: new Date().toISOString(), goal: 'quick_boost', success: true, healthDelta: 5, futureMetadata: {} }],
    recoveryHistory: [{ id: 'rc1', timestamp: new Date().toISOString(), type: 'rollback', success: true, futureMetadata: {} }],
    userPreferences: { theme: 'dark' },
    futureMetadata: {},
  } as CopilotContext;
}

function createMockInput(toolId: string, context?: CopilotContext, params?: Record<string, unknown>): ToolInput {
  return {
    toolId,
    context: context ?? createMockContext(),
    parameters: params ?? {},
    userPermissionLevel: 'free',
    userCapabilities: ['explain_health_score', 'explain_recommendations', 'explain_predictions', 'explain_timeline_events', 'explain_recovery_options', 'generate_reports', 'compare_strategies'],
    conversationId: 'conv1',
    futureMetadata: {},
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Tool Types & Helpers', () => {
  it('should generate unique tool IDs', () => {
    const id1 = generateToolId();
    const id2 = generateToolId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^tool_/);
  });

  it('should clamp confidence', () => {
    expect(clampConfidence(-0.5)).toBe(0);
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(0.5)).toBe(0.5);
  });

  it('should return category labels', () => {
    expect(getToolCategoryLabel('explanation')).toBe('Explanation');
    expect(getToolCategoryLabel('optimization')).toBe('Optimization');
  });

  it('should return risk level labels', () => {
    expect(getRiskLevelLabel('none')).toBe('None');
    expect(getRiskLevelLabel('critical')).toBe('Critical');
  });
});

// ── Configuration ────────────────────────────────────────────

describe('Tool Configuration', () => {
  it('should provide default configuration', () => {
    expect(DEFAULT_TOOL_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_TOOL_CONFIGURATION.featureFlags.enableToolFramework).toBe(true);
  });

  it('should create configuration with overrides', () => {
    const config = createToolConfiguration({ configVersion: '2.0.0' });
    expect(config.configVersion).toBe('2.0.0');
  });

  it('should validate configuration', () => {
    const result = validateToolConfiguration(DEFAULT_TOOL_CONFIGURATION);
    expect(result.valid).toBe(true);
  });

  it('should detect invalid configuration', () => {
    const config = createToolConfiguration({
      executionPolicies: { maxConcurrentExecutions: 0, defaultTimeoutMs: 30000, retryOnFailure: false, maxRetries: 0, enableTelemetry: true, futureMetadata: {} },
    });
    const result = validateToolConfiguration(config);
    expect(result.valid).toBe(false);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('Tool Events', () => {
  let events: ToolEvents;

  beforeEach(() => {
    events = new ToolEvents();
  });

  it('should register and emit events', () => {
    let received = false;
    events.on('tool_registered', () => { received = true; });
    events.emit({ type: 'tool_registered', toolId: 't1', timestamp: new Date().toISOString(), data: null });
    expect(received).toBe(true);
  });

  it('should unregister listeners', () => {
    let count = 0;
    const listener = () => { count++; };
    events.on('tool_executed', listener);
    events.emit({ type: 'tool_executed', toolId: 't1', timestamp: new Date().toISOString(), data: null });
    events.off('tool_executed', listener);
    events.emit({ type: 'tool_executed', toolId: 't1', timestamp: new Date().toISOString(), data: null });
    expect(count).toBe(1);
  });
});

// ── Registry ─────────────────────────────────────────────────

describe('Tool Registry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register tools', () => {
    const tools = createDefaultTools();
    for (const tool of tools) {
      expect(registry.register(tool)).toBe(true);
    }
    expect(registry.count()).toBe(12);
  });

  it('should not register duplicate tools', () => {
    const tool = new ExplainHealthTool();
    expect(registry.register(tool)).toBe(true);
    expect(registry.register(tool)).toBe(false);
  });

  it('should unregister tools', () => {
    const tool = new ExplainHealthTool();
    registry.register(tool);
    expect(registry.unregister(tool.definition.id)).toBe(true);
    expect(registry.hasTool(tool.definition.id)).toBe(false);
  });

  it('should discover tools', () => {
    for (const tool of createDefaultTools()) registry.register(tool);
    const result = registry.discover({ category: 'explanation' });
    expect(result.filteredCount).toBeGreaterThan(0);
    expect(result.tools.every((t) => t.category === 'explanation')).toBe(true);
  });

  it('should search tools', () => {
    for (const tool of createDefaultTools()) registry.register(tool);
    const results = registry.search('health');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((t) => t.name.includes('Health'))).toBe(true);
  });

  it('should get tools by intent', () => {
    for (const tool of createDefaultTools()) registry.register(tool);
    const tools = registry.getByIntent('explanation');
    expect(tools.length).toBeGreaterThan(0);
  });
});

// ── Resolver ────────────────────────────────────────────────

describe('Tool Resolver', () => {
  let registry: ToolRegistry;
  let resolver: ToolResolver;

  beforeEach(() => {
    registry = new ToolRegistry();
    for (const tool of createDefaultTools()) registry.register(tool);
    resolver = new ToolResolver(registry);
  });

  it('should resolve explanation intent to a tool', () => {
    const ctx = createMockContext();
    const result = resolver.resolve('explanation', ctx);
    expect(result.selectedTool).not.toBeNull();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should return alternatives', () => {
    const ctx = createMockContext();
    const result = resolver.resolve('explanation', ctx);
    expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
  });

  it('should return null when no tools match', () => {
    const ctx = createMockContext();
    const result = resolver.resolve('navigation', ctx);
    expect(result.selectedTool).toBeNull();
  });
});

// ── Validator ────────────────────────────────────────────────

describe('Tool Validator', () => {
  let validator: ToolValidator;

  beforeEach(() => {
    validator = new ToolValidator();
  });

  it('should validate a proper tool definition', () => {
    const tool = new ExplainHealthTool();
    const result = validator.validateTool(tool);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid tool definition', () => {
    const tool = new ExplainHealthTool();
    const badDef = { ...tool.definition, id: '' };
    const badTool = { ...tool, definition: badDef };
    const result = validator.validateTool(badTool as Tool);
    expect(result.valid).toBe(false);
  });

  it('should validate tool input', () => {
    const tool = new ExplainHealthTool();
    const input = createMockInput('explain_health');
    const result = validator.validateInput(input, tool);
    expect(result.valid).toBe(true);
  });
});

// ── Permission Engine ────────────────────────────────────────

describe('Tool Permission Engine', () => {
  let engine: ToolPermissionEngine;

  beforeEach(() => {
    engine = new ToolPermissionEngine(DEFAULT_TOOL_CONFIGURATION);
  });

  it('should allow free tools for free users', () => {
    const tool = new ExplainHealthTool();
    const result = engine.check(tool.definition, 'free', ['explain_health_score']);
    expect(result.allowed).toBe(true);
  });

  it('should block pro tools for free users', () => {
    const tool = new OptimizationSessionTool();
    const result = engine.check(tool.definition, 'free', ['generate_optimization_session']);
    expect(result.allowed).toBe(false);
  });

  it('should allow pro tools for pro users', () => {
    const tool = new OptimizationSessionTool();
    const result = engine.check(tool.definition, 'pro', ['generate_optimization_session']);
    expect(result.allowed).toBe(true);
  });

  it('should detect missing capabilities', () => {
    const tool = new ExplainHealthTool();
    const result = engine.check(tool.definition, 'free', []);
    expect(result.allowed).toBe(false);
    expect(result.missingCapabilities.length).toBeGreaterThan(0);
  });
});

// ── Executor ────────────────────────────────────────────────

describe('Tool Executor', () => {
  let manager: ToolManager;

  beforeEach(() => {
    manager = new ToolManager();
    for (const tool of createDefaultTools()) manager.registerTool(tool);
  });

  it('should execute a tool successfully', async () => {
    const input = createMockInput('explain_health');
    const result = await manager.executeTool(input);
    expect(result.status).toBe('success');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.summary).toContain('75');
  });

  it('should fail for non-existent tool', async () => {
    const input = createMockInput('nonexistent_tool');
    const result = await manager.executeTool(input);
    expect(result.status).toBe('failed');
  });

  it('should fail for permission denied', async () => {
    const input = createMockInput('create_optimization_session');
    input.userPermissionLevel = 'free';
    input.userCapabilities = [];
    const result = await manager.executeTool(input);
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('Permission');
  });

  it('should execute report generation tool', async () => {
    const input = createMockInput('generate_report');
    const result = await manager.executeTool(input);
    expect(result.status).toBe('success');
    expect(result.summary).toContain('System Report');
  });
});

// ── Result Formatter ─────────────────────────────────────────

describe('Tool Result Formatter', () => {
  let formatter: ToolResultFormatter;

  beforeEach(() => {
    formatter = new ToolResultFormatter();
  });

  it('should format a success result', () => {
    const result: ToolResult = {
      toolId: 'test',
      executionId: 'exec1',
      status: 'success',
      confidence: 0.85,
      summary: 'Test summary',
      details: {},
      supportingEvidence: [
        { source: 'test', metric: 'm', value: 1, timestamp: new Date().toISOString(), description: 'Test evidence', confidence: 0.9, futureMetadata: {} },
      ],
      recommendedActions: [],
      relatedModules: ['TestModule'],
      executionTime: 50,
      errorMessage: null,
      futureMetadata: {},
    };
    const formatted = formatter.format(result);
    expect(formatted.text).toContain('Test summary');
    expect(formatted.text).toContain('Evidence');
    expect(formatted.confidence).toBe(0.85);
  });

  it('should format a failure result', () => {
    const result: ToolResult = {
      toolId: 'test',
      executionId: 'exec1',
      status: 'failed',
      confidence: 0,
      summary: 'Failed',
      details: {},
      supportingEvidence: [],
      recommendedActions: [],
      relatedModules: [],
      executionTime: 10,
      errorMessage: 'Something went wrong',
      futureMetadata: {},
    };
    const formatted = formatter.format(result);
    expect(formatted.text).toContain('failed');
    expect(formatted.confidence).toBe(0);
  });
});

// ── Telemetry ────────────────────────────────────────────────

describe('Tool Telemetry', () => {
  let telemetry: ToolTelemetry;

  beforeEach(() => {
    telemetry = new ToolTelemetry();
  });

  it('should record entries', () => {
    telemetry.record({
      executionId: 'e1', toolId: 't1', status: 'success',
      startTime: new Date().toISOString(), endTime: new Date().toISOString(),
      durationMs: 50, confidence: 0.9, errorMessage: null, futureMetadata: {},
    });
    expect(telemetry.count()).toBe(1);
  });

  it('should compute average execution time', () => {
    telemetry.record({ executionId: 'e1', toolId: 't1', status: 'success', startTime: '', endTime: '', durationMs: 100, confidence: 0.9, errorMessage: null, futureMetadata: {} });
    telemetry.record({ executionId: 'e2', toolId: 't1', status: 'success', startTime: '', endTime: '', durationMs: 200, confidence: 0.8, errorMessage: null, futureMetadata: {} });
    expect(telemetry.getAverageExecutionTime()).toBe(150);
  });

  it('should clear entries', () => {
    telemetry.record({ executionId: 'e1', toolId: 't1', status: 'success', startTime: '', endTime: '', durationMs: 50, confidence: 0.9, errorMessage: null, futureMetadata: {} });
    telemetry.clear();
    expect(telemetry.count()).toBe(0);
  });
});

// ── Analytics ────────────────────────────────────────────────

describe('Tool Analytics', () => {
  let analytics: ToolAnalytics;
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    for (const tool of createDefaultTools()) registry.register(tool);
    analytics = new ToolAnalytics();
    analytics.setRegistry(registry);
  });

  it('should track executions', () => {
    analytics.record({ executionId: 'e1', toolId: 'explain_health', status: 'success', startTime: '', endTime: '', durationMs: 50, confidence: 0.9, errorMessage: null, futureMetadata: {} });
    const result = analytics.getAnalytics();
    expect(result.totalExecutions).toBe(1);
    expect(result.successfulExecutions).toBe(1);
  });

  it('should reset', () => {
    analytics.record({ executionId: 'e1', toolId: 't1', status: 'success', startTime: '', endTime: '', durationMs: 50, confidence: 0.9, errorMessage: null, futureMetadata: {} });
    analytics.reset();
    expect(analytics.getAnalytics().totalExecutions).toBe(0);
  });
});

// ── ToolManager (Integration) ────────────────────────────────

describe('ToolManager', () => {
  let manager: ToolManager;

  beforeEach(() => {
    manager = new ToolManager();
    for (const tool of createDefaultTools()) manager.registerTool(tool);
  });

  it('should register and discover tools', () => {
    const result = manager.discoverTools();
    expect(result.totalCount).toBe(12);
  });

  it('should search tools', () => {
    const results = manager.searchTools('health');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should get tool metadata', () => {
    const meta = manager.getToolMetadata('explain_health');
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe('Explain Health Score');
  });

  it('should validate tools', () => {
    const tool = new ExplainHealthTool();
    const result = manager.validateTool(tool);
    expect(result.valid).toBe(true);
  });

  it('should resolve tools', () => {
    const ctx = createMockContext();
    const result = manager.resolveTool('explanation', ctx);
    expect(result.selectedTool).not.toBeNull();
  });

  it('should check permissions', () => {
    const result = manager.checkPermission('explain_health', 'free', ['explain_health_score']);
    expect(result.allowed).toBe(true);
  });

  it('should get statistics', () => {
    const stats = manager.getToolStatistics();
    expect(stats.totalExecutions).toBe(0);
  });

  it('should format results', async () => {
    const input = createMockInput('explain_health');
    const result = await manager.executeTool(input);
    const formatted = manager.formatResult(result);
    expect(formatted.text.length).toBeGreaterThan(0);
  });

  it('should throw when framework disabled', () => {
    manager.updateConfig({ featureFlags: { ...DEFAULT_TOOL_CONFIGURATION.featureFlags, enableToolFramework: false } });
    expect(() => manager.registerTool(new ExplainHealthTool())).toThrow();
  });

  it('should clear all', () => {
    manager.clearAll();
    expect(manager.discoverTools().totalCount).toBe(0);
  });
});

// ── Built-in Tools ───────────────────────────────────────────

describe('Built-in Tools', () => {
  let manager: ToolManager;

  beforeEach(() => {
    manager = new ToolManager();
    for (const tool of createDefaultTools()) manager.registerTool(tool);
  });

  it('should execute ExplainHealthTool', async () => {
    const result = await manager.executeTool(createMockInput('explain_health'));
    expect(result.status).toBe('success');
    expect(result.relatedModules).toContain('HealthScore');
  });

  it('should execute ExplainRecommendationTool', async () => {
    const result = await manager.executeTool(createMockInput('explain_recommendation'));
    expect(result.status).toBe('success');
    expect(result.relatedModules).toContain('RecommendationEngine');
  });

  it('should execute ExplainPredictionTool', async () => {
    const result = await manager.executeTool(createMockInput('explain_prediction'));
    expect(result.status).toBe('success');
    expect(result.relatedModules).toContain('PredictionEngine');
  });

  it('should execute ExplainTimelineTool', async () => {
    const result = await manager.executeTool(createMockInput('explain_timeline'));
    expect(result.status).toBe('success');
    expect(result.relatedModules).toContain('TimelineEngine');
  });

  it('should execute ExplainGoalTool', async () => {
    const result = await manager.executeTool(createMockInput('explain_goal'));
    expect(result.status).toBe('success');
    expect(result.relatedModules).toContain('GoalsEngine');
  });

  it('should execute ShowRecoveryTool', async () => {
    const result = await manager.executeTool(createMockInput('show_recovery'));
    expect(result.status).toBe('success');
    expect(result.relatedModules).toContain('RecoveryCenter');
  });

  it('should execute ComparePlansTool', async () => {
    const result = await manager.executeTool(createMockInput('compare_plans'));
    expect(result.status).toBe('success');
  });

  it('should execute SimulationTool with pro permissions', async () => {
    const input = createMockInput('run_simulation');
    input.userPermissionLevel = 'pro';
    const result = await manager.executeTool(input);
    expect(result.status).toBe('success');
    expect(result.summary).toContain('Simulation');
  });

  it('should execute OptimizationSessionTool with pro permissions', async () => {
    const input = createMockInput('create_optimization_session');
    input.userPermissionLevel = 'pro';
    input.userCapabilities = ['generate_optimization_session'];
    const result = await manager.executeTool(input);
    expect(result.status).toBe('success');
    expect(result.summary).toContain('session');
  });

  it('should execute MaintenanceTool', async () => {
    const result = await manager.executeTool(createMockInput('start_maintenance'));
    expect(result.status).toBe('success');
  });

  it('should execute GoalCreationTool with pro permissions', async () => {
    const input = createMockInput('create_goal', undefined, { name: 'Test Goal', type: 'performance' });
    input.userPermissionLevel = 'pro';
    const result = await manager.executeTool(input);
    expect(result.status).toBe('success');
    expect(result.summary).toContain('Test Goal');
  });

  it('should execute ReportGenerationTool', async () => {
    const result = await manager.executeTool(createMockInput('generate_report'));
    expect(result.status).toBe('success');
    expect(result.summary).toContain('System Report');
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Tool Performance', () => {
  let manager: ToolManager;

  beforeEach(() => {
    manager = new ToolManager();
    for (const tool of createDefaultTools()) manager.registerTool(tool);
  });

  it('should discover tools under 50ms', () => {
    const start = Date.now();
    manager.discoverTools();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('should execute tool with low overhead', async () => {
    const input = createMockInput('explain_health');
    const start = Date.now();
    await manager.executeTool(input);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Tool Edge Cases', () => {
  let manager: ToolManager;

  beforeEach(() => {
    manager = new ToolManager();
    for (const tool of createDefaultTools()) manager.registerTool(tool);
  });

  it('should handle empty context gracefully', async () => {
    const emptyCtx: CopilotContext = {
      sources: [], healthScore: null, deviceProfile: null, activeGoals: [],
      recentTimelineEvents: [], activeRecommendations: [], activePredictions: [],
      maintenanceHistory: [], optimizationHistory: [], recoveryHistory: [],
      userPreferences: {}, futureMetadata: {},
    } as CopilotContext;
    const input = createMockInput('explain_health', emptyCtx);
    const result = await manager.executeTool(input);
    expect(result.status).toBe('failed');
  });

  it('should handle missing context source', async () => {
    const partialCtx = createMockContext();
    partialCtx.sources = partialCtx.sources.filter((s) => s.type !== 'health_score');
    partialCtx.healthScore = null;
    const input = createMockInput('explain_health', partialCtx);
    const result = await manager.executeTool(input);
    expect(result.status).toBe('failed');
  });

  it('should handle tool with no required context', async () => {
    const input = createMockInput('generate_report');
    const result = await manager.executeTool(input);
    expect(result.status).toBe('success');
  });

  it('should handle empty search query', () => {
    const results = manager.searchTools('');
    expect(results.length).toBe(12);
  });
});
