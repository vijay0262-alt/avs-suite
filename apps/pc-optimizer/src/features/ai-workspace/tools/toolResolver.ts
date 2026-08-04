/**
 * AI Tool Framework — Resolver
 *
 * EPIC 5 PHASE A PART 2
 *
 * Resolves intents and context to the most appropriate tool.
 * Uses intent matching, capability matching, and context availability.
 */
import type { ToolResolutionResult, Tool, AIAssistantIntentType, AIAssistantContext } from './types';
import type { ToolRegistry } from './toolRegistry';

export class ToolResolver {
  private _registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this._registry = registry;
  }

  resolve(intent: AIAssistantIntentType, context: AIAssistantContext): ToolResolutionResult {
    const allTools = this._registry.getByIntent(intent);
    if (allTools.length === 0) {
      return {
        selectedTool: null,
        alternatives: [],
        reason: `No tools registered for intent "${intent}"`,
        confidence: 0,
        futureMetadata: {},
      };
    }

    const candidates = allTools.filter((t) => t.canHandle(intent, context));

    if (candidates.length === 0) {
      const fallback = allTools
        .filter((t) => t.definition.status === 'active')
        .map((t) => t.definition);
      return {
        selectedTool: null,
        alternatives: fallback,
        reason: 'Tools exist for this intent but required context is not available',
        confidence: 0.3,
        futureMetadata: {},
      };
    }

    const scored = candidates.map((tool) => ({
      tool,
      score: this._scoreTool(tool, intent, context),
    }));

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0]!;
    const alternatives = scored.slice(1).map((s) => s.tool.definition);

    return {
      selectedTool: best.tool.definition,
      alternatives,
      reason: `Selected "${best.tool.definition.name}" based on intent match, context availability, and risk level`,
      confidence: best.score,
      futureMetadata: {},
    };
  }

  private _scoreTool(tool: Tool, intent: AIAssistantIntentType, context: AIAssistantContext): number {
    let score = 0;

    if (tool.definition.supportedIntents.includes(intent)) score += 0.4;

    const availableContext = tool.definition.requiredContext.filter((req) =>
      context.sources.some((s) => s.type === req && s.available),
    );
    if (tool.definition.requiredContext.length > 0) {
      score += 0.3 * (availableContext.length / tool.definition.requiredContext.length);
    } else {
      score += 0.3;
    }

    const riskScores: Record<string, number> = { none: 0.2, low: 0.15, medium: 0.1, high: 0.05, critical: 0 };
    score += riskScores[tool.definition.riskLevel] ?? 0;

    if (tool.definition.status === 'active') score += 0.1;

    return Math.min(score, 1.0);
  }
}
