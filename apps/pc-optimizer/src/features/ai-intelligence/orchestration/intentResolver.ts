/**
 * Intent Resolver — resolves user queries to supported intents.
 *
 * Uses keyword matching and confidence scoring.
 * No hardcoded logic — all intent definitions come from configuration.
 */
import type {
  ConversationIntentType,
  IntentResolutionResult,
  IntentDefinition,
  ConversationConfiguration,
} from './types';
import { clampScore } from './types';

export class IntentResolver {
  private _config: ConversationConfiguration;

  constructor(config: ConversationConfiguration) {
    this._config = config;
  }

  updateConfig(config: ConversationConfiguration): void {
    this._config = config;
  }

  resolve(message: string): IntentResolutionResult {
    const lowerMessage = message.toLowerCase();
    const definitions = this._config.intentDefinitions;
    const rules = this._config.intentRules;

    if (!rules.keywordMatchingEnabled) {
      return {
        intent: rules.fallbackIntent,
        confidence: 0,
        matchedKeywords: [],
        alternativeIntents: [],
        metadata: { reason: 'keyword_matching_disabled' },
      };
    }

    const scored: { def: IntentDefinition; score: number; matched: string[] }[] = [];

    for (const def of definitions) {
      const matched: string[] = [];
      let score = 0;

      for (const keyword of def.keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          matched.push(keyword);
          score += 1;
        }
      }

      // Normalize score by number of keywords
      if (def.keywords.length > 0) {
        score = score / Math.min(def.keywords.length, 5);
      }

      if (matched.length > 0) {
        scored.push({ def, score: clampScore(score), matched });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0 || scored[0]!.score < rules.minConfidence) {
      return {
        intent: rules.fallbackIntent,
        confidence: scored.length === 0 ? 0 : clampScore(scored[0]!.score),
        matchedKeywords: [],
        alternativeIntents: [],
        metadata: { reason: scored.length === 0 ? 'no_match' : 'below_threshold' },
      };
    }

    const top = scored[0]!;
    const alternatives = scored
      .slice(1, 1 + rules.maxAlternativeIntents)
      .map((s) => ({ intent: s.def.type, confidence: s.score }));

    return {
      intent: top.def.type,
      confidence: top.score,
      matchedKeywords: top.matched,
      alternativeIntents: alternatives,
      metadata: { definitionCount: definitions.length },
    };
  }

  getIntentDefinition(type: ConversationIntentType): IntentDefinition | undefined {
    return this._config.intentDefinitions.find((d) => d.type === type);
  }
}
