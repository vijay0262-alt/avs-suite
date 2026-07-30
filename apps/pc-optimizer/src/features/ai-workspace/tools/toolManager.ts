/**
 * AI Tool Framework — Tool Manager
 *
 * EPIC 5 PHASE A PART 2
 *
 * The main public API facade for the AI Tool Framework.
 * Public APIs: registerTool(), executeTool(), discoverTools(),
 * searchTools(), validateTool(), getToolMetadata(), getToolStatistics()
 *
 * The Copilot communicates exclusively through tools.
 * Business modules remain isolated.
 * New AI capabilities require only registering a new tool.
 */
import type {
  ToolConfiguration,
  Tool,
  ToolInput,
  ToolResult,
  ToolDiscoveryResult,
  ToolSearchQuery,
  ToolDefinition,
  ToolValidationResult,
  ToolAnalytics as ToolAnalyticsData,
  ToolResolutionResult,
  ToolPlugin,
  CopilotIntentType,
  CopilotContext,
  PermissionLevel,
  CopilotCapability,
  ToolPermissionResult,
} from './types';
import { DEFAULT_TOOL_CONFIGURATION, createToolConfiguration, validateToolConfiguration } from './toolConfiguration';
import { ToolEvents, toolEvents } from './toolEvents';
import { ToolRegistry } from './toolRegistry';
import { ToolResolver } from './toolResolver';
import { ToolValidator } from './toolValidator';
import { ToolPermissionEngine } from './toolPermissionEngine';
import { ToolExecutor } from './toolExecutor';
import { ToolResultFormatter } from './toolResultFormatter';
import { ToolTelemetry } from './toolTelemetry';
import { ToolAnalytics } from './toolAnalytics';

export class ToolManager {
  private _config: ToolConfiguration;
  private _events: ToolEvents;
  private _registry: ToolRegistry;
  private _resolver: ToolResolver;
  private _validator: ToolValidator;
  private _permissionEngine: ToolPermissionEngine;
  private _executor: ToolExecutor;
  private _formatter: ToolResultFormatter;
  private _telemetry: ToolTelemetry;
  private _analytics: ToolAnalytics;

  constructor(config?: Partial<ToolConfiguration>) {
    this._config = config
      ? createToolConfiguration(config as never)
      : structuredClone(DEFAULT_TOOL_CONFIGURATION);

    const validation = validateToolConfiguration(this._config);
    if (!validation.valid) {
      throw new Error(`Invalid tool configuration: ${validation.errors.join('; ')}`);
    }

    this._events = new ToolEvents();
    this._registry = new ToolRegistry();
    this._resolver = new ToolResolver(this._registry);
    this._validator = new ToolValidator();
    this._permissionEngine = new ToolPermissionEngine(this._config);
    this._telemetry = new ToolTelemetry();
    this._analytics = new ToolAnalytics();
    this._analytics.setRegistry(this._registry);
    this._formatter = new ToolResultFormatter();
    this._executor = new ToolExecutor(
      this._config,
      this._registry,
      this._validator,
      this._permissionEngine,
      this._telemetry,
      this._events,
    );
  }

  // ── Public API ──────────────────────────────────────────────

  registerTool(tool: Tool): boolean {
    if (!this._config.featureFlags.enableToolFramework) {
      throw new Error('Tool framework is disabled');
    }

    const validation = this._validator.validateTool(tool);
    if (!validation.valid) {
      throw new Error(`Invalid tool: ${validation.errors.map((e) => e.message).join('; ')}`);
    }

    const registered = this._registry.register(tool);
    if (registered) {
      this._events.emit({
        type: 'tool_registered',
        toolId: tool.definition.id,
        timestamp: new Date().toISOString(),
        data: tool.definition,
      });
    }
    return registered;
  }

  async executeTool(input: ToolInput): Promise<ToolResult> {
    return this._executor.execute(input);
  }

  discoverTools(query?: ToolSearchQuery): ToolDiscoveryResult {
    if (!this._config.featureFlags.enableToolDiscovery) {
      throw new Error('Tool discovery is disabled');
    }
    const result = this._registry.discover(query);
    this._events.emit({
      type: 'tool_discovered',
      toolId: null,
      timestamp: new Date().toISOString(),
      data: { count: result.filteredCount },
    });
    return result;
  }

  searchTools(query: string): ToolDefinition[] {
    return this._registry.search(query);
  }

  validateTool(tool: Tool): ToolValidationResult {
    const result = this._validator.validateTool(tool);
    this._events.emit({
      type: 'tool_validated',
      toolId: tool.definition.id,
      timestamp: new Date().toISOString(),
      data: result,
    });
    return result;
  }

  getToolMetadata(toolId: string): ToolDefinition | null {
    return this._registry.getToolMetadata(toolId);
  }

  getToolStatistics(): ToolAnalyticsData {
    return this._analytics.getAnalytics();
  }

  // ── Resolution ──────────────────────────────────────────────

  resolveTool(intent: CopilotIntentType, context: CopilotContext): ToolResolutionResult {
    return this._resolver.resolve(intent, context);
  }

  // ── Formatting ──────────────────────────────────────────────

  formatResult(result: ToolResult): ReturnType<ToolResultFormatter['format']> {
    return this._formatter.format(result);
  }

  // ── Permission ──────────────────────────────────────────────

  checkPermission(
    toolId: string,
    currentLevel: PermissionLevel,
    userCapabilities: CopilotCapability[],
  ): ToolPermissionResult {
    const tool = this._registry.getTool(toolId);
    if (!tool) {
      return {
        allowed: false,
        reason: `Tool not found: ${toolId}`,
        requiredLevel: 'enterprise',
        currentLevel,
        missingCapabilities: [],
        futureMetadata: {},
      };
    }
    return this._permissionEngine.check(tool.definition, currentLevel, userCapabilities);
  }

  // ── Telemetry ───────────────────────────────────────────────

  getTelemetry(toolId?: string, limit?: number) {
    if (toolId) return this._telemetry.getEntriesForTool(toolId, limit);
    return this._telemetry.getEntries(limit);
  }

  // ── Configuration ───────────────────────────────────────────

  updateConfig(config: Partial<ToolConfiguration>): void {
    this._config = createToolConfiguration(config as never);
    this._permissionEngine.updateConfig(this._config);
    this._executor.updateConfig(this._config);
  }

  getConfig(): ToolConfiguration {
    return this._config;
  }

  // ── Plugin Registration ─────────────────────────────────────

  registerPlugin(plugin: ToolPlugin): boolean {
    if (!this._config.featureFlags.enableToolPlugins) {
      throw new Error('Tool plugins are disabled');
    }
    return this._registry.registerPlugin(plugin);
  }

  unregisterPlugin(pluginName: string): boolean {
    return this._registry.unregisterPlugin(pluginName);
  }

  // ── Events ──────────────────────────────────────────────────

  on(type: never, listener: never): void {
    this._events.on(type, listener);
  }

  off(type: never, listener: never): void {
    this._events.off(type, listener);
  }

  getEvents(): ToolEvents {
    return this._events;
  }

  // ── Utility ─────────────────────────────────────────────────

  getRegistry(): ToolRegistry {
    return this._registry;
  }

  clearAll(): void {
    this._registry.clear();
    this._telemetry.clear();
    this._analytics.reset();
    this._events.removeAllListeners();
  }
}

export { toolEvents };
