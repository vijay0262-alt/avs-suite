/**
 * AI Copilot Platform — Intent Engine
 *
 * EPIC 5 PHASE A PART 1
 *
 * Resolves user prompts to supported intents using keyword matching
 * and confidence scoring. Does NOT use machine learning.
 * Every resolution is deterministic and explainable.
 */
import type {
  CopilotConfiguration,
  IntentDefinition,
  IntentResolutionResult,
  AlternativeIntent,
  CopilotIntentType,
  CopilotCapability,
  CopilotProviderPlugin,
} from './types';
import { clampConfidence } from './types';

export class CopilotIntentEngine {
  private _config: CopilotConfiguration;
  private _plugins: CopilotProviderPlugin[] = [];

  constructor(config: CopilotConfiguration) {
    this._config = config;
  }

  updateConfig(config: CopilotConfiguration): void {
    this._config = config;
  }

  registerPlugin(plugin: CopilotProviderPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  resolve(prompt: string): IntentResolutionResult {
    const normalized = prompt.toLowerCase().trim();

    // Try plugins first
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.resolveIntent) {
        const result = plugin.resolveIntent(normalized);
        if (result && result.confidence >= this._config.intentDefinitions.minConfidenceThreshold) {
          return result;
        }
      }
    }

    // Built-in keyword matching
    return this._resolveBuiltin(normalized);
  }

  private _resolveBuiltin(normalized: string): IntentResolutionResult {
    const definitions = this._config.intentDefinitions.definitions;
    const scores: { definition: IntentDefinition; score: number; matched: string[] }[] = [];

    for (const def of definitions) {
      const matched: string[] = [];
      let score = 0;

      for (const keyword of def.keywords) {
        const kwLower = keyword.toLowerCase();
        if (normalized.includes(kwLower)) {
          matched.push(keyword);
          score += 1;
        }
      }

      // Normalize score by number of keywords to avoid bias
      const normalizedScore = def.keywords.length > 0
        ? score / def.keywords.length
        : 0;

      // Boost: if multiple keywords matched, increase confidence
      const confidence = clampConfidence(
        matched.length === 0 ? 0 : Math.min(0.5 + normalizedScore * 0.5, 1.0),
      );

      if (confidence >= def.minConfidence) {
        scores.push({ definition: def, score: confidence, matched });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0) {
      return {
        intent: 'conversation',
        confidence: 0.3,
        matchedKeywords: [],
        capabilities: ['answer_questions'],
        alternativeIntents: [],
        futureMetadata: {},
      };
    }

    const best = scores[0]!;
    const alternatives: AlternativeIntent[] = scores.slice(1, 4).map((s) => ({
      intent: s.definition.type,
      confidence: s.score,
      reason: `Matched ${s.matched.length} keywords: ${s.matched.join(', ')}`,
    }));

    return {
      intent: best.definition.type,
      confidence: best.score,
      matchedKeywords: best.matched,
      capabilities: best.definition.capabilities,
      alternativeIntents: alternatives,
      futureMetadata: {},
    };
  }

  getIntentDefinition(intent: CopilotIntentType): IntentDefinition | null {
    return this._config.intentDefinitions.definitions.find((d) => d.type === intent) ?? null;
  }

  getAllIntents(): IntentDefinition[] {
    return this._config.intentDefinitions.definitions;
  }

  getCapabilitiesForIntent(intent: CopilotIntentType): CopilotCapability[] {
    const def = this.getIntentDefinition(intent);
    return def?.capabilities ?? ['answer_questions'];
  }
}
