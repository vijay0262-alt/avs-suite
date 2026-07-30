/**
 * Natural Language Action Engine — Intent Classifier
 *
 * EPIC 5 PHASE A PART 4
 *
 * Classifies natural language requests into action intents.
 * Uses keyword matching and phrase matching with confidence scoring.
 */
import type { IntentDefinition, ClassifiedIntent, ActionType, ExtractedEntity, ActionRiskLevel, PermissionLevel } from './types';
import { generateIntentId, clampConfidence } from './types';

export class IntentClassifier {
  private _definitions: IntentDefinition[];

  constructor(definitions: IntentDefinition[]) {
    this._definitions = definitions;
  }

  updateDefinitions(definitions: IntentDefinition[]): void {
    this._definitions = definitions;
  }

  classify(request: string): ClassifiedIntent | null {
    const lower = request.toLowerCase().trim();
    if (!lower) return null;

    const scored = this._definitions
      .map((def) => ({ def, score: this._scoreIntent(def, lower) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;

    const best = scored[0]!;
    if (best.score < best.def.minConfidence) return null;

    return {
      id: generateIntentId(),
      intent: best.def.actionType,
      confidence: clampConfidence(best.score),
      entities: [],
      parameters: {},
      requiredTools: best.def.requiredTools,
      requiredPermissions: best.def.requiredPermissions,
      riskLevel: best.def.riskLevel,
      rawRequest: request,
      futureMetadata: {},
    };
  }

  classifyWithEntities(request: string, entities: ExtractedEntity[]): ClassifiedIntent | null {
    const intent = this.classify(request);
    if (!intent) return null;
    intent.entities = entities;
    return intent;
  }

  private _scoreIntent(def: IntentDefinition, lower: string): number {
    let score = 0;

    // Phrase matching (higher weight)
    for (const phrase of def.phrases) {
      if (lower.includes(phrase.toLowerCase())) {
        score += 0.5;
      }
    }

    // Keyword matching
    for (const keyword of def.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += 0.2;
      }
    }

    // Required entities boost
    if (def.requiredEntities.length > 0) {
      // This is a placeholder — actual entity matching happens after extraction
      // But we can check if entity-related keywords appear
    }

    return score;
  }

  getIntentDefinition(actionType: ActionType): IntentDefinition | null {
    return this._definitions.find((d) => d.actionType === actionType) ?? null;
  }

  getAllIntentDefinitions(): IntentDefinition[] {
    return [...this._definitions];
  }
}
