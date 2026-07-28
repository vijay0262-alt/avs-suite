/**
 * Assistant Context Builder — aggregates data from all AVS
 * platform modules into a single context object.
 *
 * Data sources:
 *   AI Health Engine, Dashboard, Optimization Planner,
 *   Execution History, Maintenance Reports,
 *   Storage Intelligence, Browser Health, Windows Health,
 *   Startup Optimizer, Duplicate Engine,
 *   Configuration/Capabilities, Subscriptions
 *
 * This module is read-only with respect to all other systems.
 * It never modifies any service, engine, or configuration.
 *
 * This module does NOT modify any existing architecture.
 */
import type { AssistantContext } from './types';
import type { HealthReport } from '../ai-health-engine/types';
import type { OptimizationPlan } from '../optimization-planner/types';
import type { ExecutionRecord, ExecutionStatistics, ExecutionReport } from '../maintenance-history/types';
import type { CapabilityInfo } from '../config-sync/types';
import type { TrendAnalysis } from '../ai-health-engine/types';

export interface ContextBuilderInput {
  healthReport?: HealthReport | null;
  optimizationPlan?: OptimizationPlan | null;
  executionHistory?: ExecutionRecord[];
  executionStatistics?: ExecutionStatistics | null;
  executionReport?: ExecutionReport | null;
  capabilities?: { available: CapabilityInfo[]; locked: CapabilityInfo[] };
  trends?: TrendAnalysis | null;
}

export class AssistantContextBuilder {
  build(input: ContextBuilderInput): AssistantContext {
    return {
      healthReport: input.healthReport ?? null,
      optimizationPlan: input.optimizationPlan ?? null,
      executionHistory: input.executionHistory ?? [],
      executionStatistics: input.executionStatistics ?? null,
      executionReport: input.executionReport ?? null,
      capabilities: input.capabilities ?? { available: [], locked: [] },
      trends: input.trends ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  hasHealthData(ctx: AssistantContext): boolean {
    return ctx.healthReport !== null;
  }

  hasOptimizationData(ctx: AssistantContext): boolean {
    return ctx.optimizationPlan !== null;
  }

  hasExecutionData(ctx: AssistantContext): boolean {
    return ctx.executionHistory.length > 0;
  }

  hasTrendData(ctx: AssistantContext): boolean {
    return ctx.trends !== null;
  }

  getOverallScore(ctx: AssistantContext): number | null {
    return ctx.healthReport?.overall.score ?? null;
  }

  getHealthLevel(ctx: AssistantContext): string | null {
    return ctx.healthReport?.overall.level ?? null;
  }

  getCategoryResult(ctx: AssistantContext, categoryId: string): { score: number; issues: { title: string; description: string; severity: string }[] } | null {
    const category = ctx.healthReport?.categories.find((c) => c.categoryId === categoryId);
    if (!category) return null;
    return {
      score: category.score,
      issues: category.issues.map((i) => ({ title: i.title, description: i.description, severity: i.severity })),
    };
  }

  getRecommendations(ctx: AssistantContext): { id: string; title: string; priority: string; riskLevel: string; estimatedBenefit: number; category: string }[] {
    if (!ctx.healthReport) return [];
    return ctx.healthReport.recommendations.map((r) => ({
      id: r.id,
      title: r.title,
      priority: r.priority,
      riskLevel: r.riskLevel,
      estimatedBenefit: r.estimatedBenefit,
      category: r.category,
    }));
  }

  getInsights(ctx: AssistantContext): { id: string; title: string; explanation: string; category: string; severity: string }[] {
    if (!ctx.healthReport) return [];
    return ctx.healthReport.insights.map((i) => ({
      id: i.id,
      title: i.title,
      explanation: i.explanation,
      category: i.category,
      severity: i.severity,
    }));
  }

  getRecentExecutions(ctx: AssistantContext, limit: number): ExecutionRecord[] {
    return ctx.executionHistory.slice(0, limit);
  }

  getLastExecution(ctx: AssistantContext): ExecutionRecord | null {
    return ctx.executionHistory[0] ?? null;
  }

  getOptimizationItems(ctx: AssistantContext): { id: string; title: string; priority: string; risk: string; estimatedBenefit: number; category: string }[] {
    if (!ctx.optimizationPlan) return [];
    return ctx.optimizationPlan.items.map((item) => ({
      id: item.id,
      title: item.title,
      priority: item.priority,
      risk: item.risk,
      estimatedBenefit: item.estimatedBenefit,
      category: item.category,
    }));
  }

  getAvailableCapabilities(ctx: AssistantContext): string[] {
    return ctx.capabilities.available.map((c) => c.id);
  }

  getLockedCapabilities(ctx: AssistantContext): string[] {
    return ctx.capabilities.locked.map((c) => c.id);
  }

  getDataAvailabilitySummary(ctx: AssistantContext): { source: string; available: boolean }[] {
    return [
      { source: 'Health Report', available: this.hasHealthData(ctx) },
      { source: 'Optimization Plan', available: this.hasOptimizationData(ctx) },
      { source: 'Execution History', available: this.hasExecutionData(ctx) },
      { source: 'Trends', available: this.hasTrendData(ctx) },
      { source: 'Capabilities', available: ctx.capabilities.available.length > 0 },
    ];
  }
}

export const assistantContextBuilder = new AssistantContextBuilder();
