/**
 * Tool Registry — exposes orchestrator tools only.
 *
 * Never exposes system modules directly. Only registered tools
 * are available to the orchestrator.
 */
import type { OrchestratorTool } from './types';

export class ToolRegistry {
  private _tools: Map<string, OrchestratorTool> = new Map();

  registerTool(tool: OrchestratorTool): boolean {
    if (!tool.name) return false;
    if (this._tools.has(tool.name)) return false;
    this._tools.set(tool.name, tool);
    return true;
  }

  unregisterTool(name: string): boolean {
    return this._tools.delete(name);
  }

  getTool(name: string): OrchestratorTool | undefined {
    return this._tools.get(name);
  }

  getTools(): OrchestratorTool[] {
    return Array.from(this._tools.values());
  }

  getAvailableTools(): OrchestratorTool[] {
    return this.getTools().filter((t) => t.isAvailable());
  }

  getToolNames(): string[] {
    return Array.from(this._tools.keys());
  }

  hasTool(name: string): boolean {
    return this._tools.has(name);
  }

  get count(): number {
    return this._tools.size;
  }

  clear(): void {
    this._tools.clear();
  }
}
