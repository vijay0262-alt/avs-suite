/**
 * AI Tool Framework — Analytics
 *
 * EPIC 5 PHASE A PART 2
 *
 * Aggregate analytics for tool usage. No personal data stored.
 */
import type { ToolAnalytics as ToolAnalyticsData, ToolUsageCount, ToolTelemetryEntry, ExecutionStatus } from './types';
import type { ToolRegistry } from './toolRegistry';

export class ToolAnalytics {
  private _totalExecutions: number = 0;
  private _byStatus: Map<ExecutionStatus, number> = new Map();
  private _byTool: Map<string, number> = new Map();
  private _byCategory: Map<string, number> = new Map();
  private _executionTimeSum: number = 0;
  private _confidenceSum: number = 0;
  private _registry: ToolRegistry | null = null;

  setRegistry(registry: ToolRegistry): void {
    this._registry = registry;
  }

  record(entry: ToolTelemetryEntry): void {
    this._totalExecutions++;
    this._byStatus.set(entry.status, (this._byStatus.get(entry.status) ?? 0) + 1);
    this._byTool.set(entry.toolId, (this._byTool.get(entry.toolId) ?? 0) + 1);
    this._executionTimeSum += entry.durationMs;
    if (entry.status === 'success') {
      this._confidenceSum += entry.confidence;
    }

    if (this._registry) {
      const tool = this._registry.getTool(entry.toolId);
      if (tool) {
        const cat = tool.definition.category;
        this._byCategory.set(cat, (this._byCategory.get(cat) ?? 0) + 1);
      }
    }
  }

  getAnalytics(): ToolAnalyticsData {
    const byTool: Record<string, number> = {};
    for (const [key, val] of this._byTool) byTool[key] = val;

    const byCategory: Record<string, number> = {};
    for (const [key, val] of this._byCategory) byCategory[key] = val;

    const byStatus: Record<string, number> = {};
    for (const [key, val] of this._byStatus) byStatus[key] = val;

    const topTools: ToolUsageCount[] = Array.from(this._byTool.entries())
      .map(([toolId, count]) => ({
        toolId,
        toolName: this._registry?.getTool(toolId)?.definition.name ?? toolId,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const successCount = this._byStatus.get('success') ?? 0;

    return {
      totalExecutions: this._totalExecutions,
      successfulExecutions: successCount,
      failedExecutions: this._byStatus.get('failed') ?? 0,
      cancelledExecutions: this._byStatus.get('cancelled') ?? 0,
      byTool,
      byCategory,
      byStatus,
      averageExecutionTimeMs: this._totalExecutions > 0 ? this._executionTimeSum / this._totalExecutions : 0,
      averageConfidence: successCount > 0 ? this._confidenceSum / successCount : 0,
      topTools,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  reset(): void {
    this._totalExecutions = 0;
    this._byStatus.clear();
    this._byTool.clear();
    this._byCategory.clear();
    this._executionTimeSum = 0;
    this._confidenceSum = 0;
  }
}
