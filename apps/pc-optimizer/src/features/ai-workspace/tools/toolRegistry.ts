/**
 * AI Tool Framework — Registry
 *
 * EPIC 5 PHASE A PART 2
 *
 * Central registry for all tools.
 * Supports registration, unregistration, querying, and discovery.
 */
import type { Tool, ToolDefinition, ToolDiscoveryResult, ToolSearchQuery, ToolCategory, ToolPlugin } from './types';
import type { AIAssistantIntentType, AIAssistantCapability } from '../aiAssistant/types';

export class ToolRegistry {
  private _tools: Map<string, Tool> = new Map();
  private _plugins: Map<string, { plugin: ToolPlugin; tools: Tool[] }> = new Map();

  register(tool: Tool): boolean {
    if (this._tools.has(tool.definition.id)) {
      return false;
    }
    this._tools.set(tool.definition.id, tool);
    return true;
  }

  unregister(toolId: string): boolean {
    return this._tools.delete(toolId);
  }

  getTool(toolId: string): Tool | null {
    return this._tools.get(toolId) ?? null;
  }

  getAllTools(): Tool[] {
    return Array.from(this._tools.values());
  }

  getAllDefinitions(): ToolDefinition[] {
    return this.getAllTools().map((t) => t.definition);
  }

  hasTool(toolId: string): boolean {
    return this._tools.has(toolId);
  }

  count(): number {
    return this._tools.size;
  }

  discover(query?: ToolSearchQuery): ToolDiscoveryResult {
    let tools = this.getAllDefinitions();

    if (query?.query) {
      const q = query.query.toLowerCase();
      tools = tools.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q),
      );
    }

    if (query?.category) {
      tools = tools.filter((t) => t.category === query.category);
    }

    if (query?.intent) {
      tools = tools.filter((t) => t.supportedIntents.includes(query.intent!));
    }

    if (query?.capability) {
      tools = tools.filter((t) => t.requiredCapabilities.includes(query.capability!));
    }

    if (query?.riskLevel) {
      tools = tools.filter((t) => t.riskLevel === query.riskLevel);
    }

    return {
      tools,
      totalCount: this._tools.size,
      filteredCount: tools.length,
      futureMetadata: {},
    };
  }

  search(query: string): ToolDefinition[] {
    const q = query.toLowerCase();
    return this.getAllDefinitions().filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }

  getByCategory(category: ToolCategory): Tool[] {
    return this.getAllTools().filter((t) => t.definition.category === category);
  }

  getByIntent(intent: AIAssistantIntentType): Tool[] {
    return this.getAllTools().filter((t) => t.definition.supportedIntents.includes(intent));
  }

  getByCapability(capability: AIAssistantCapability): Tool[] {
    return this.getAllTools().filter((t) => t.definition.requiredCapabilities.includes(capability));
  }

  getToolMetadata(toolId: string): ToolDefinition | null {
    return this._tools.get(toolId)?.definition ?? null;
  }

  registerPlugin(plugin: ToolPlugin): boolean {
    if (this._plugins.has(plugin.getPluginName())) return false;
    const tools = plugin.getTools();
    for (const tool of tools) {
      this.register(tool);
    }
    this._plugins.set(plugin.getPluginName(), { plugin, tools });
    return true;
  }

  unregisterPlugin(pluginName: string): boolean {
    const entry = this._plugins.get(pluginName);
    if (!entry) return false;
    for (const tool of entry.tools) {
      this.unregister(tool.definition.id);
    }
    this._plugins.delete(pluginName);
    return true;
  }

  clear(): void {
    this._tools.clear();
    this._plugins.clear();
  }
}
