/**
 * Natural Language Action Engine — Entity Extractor
 *
 * EPIC 5 PHASE A PART 4
 *
 * Extracts entities from natural language requests.
 * Uses pattern matching and synonym lookup.
 */
import type { EntityRule, ExtractedEntity, EntityType } from './types';

export class EntityExtractor {
  private _rules: EntityRule[];

  constructor(rules: EntityRule[]) {
    this._rules = rules;
  }

  updateRules(rules: EntityRule[]): void {
    this._rules = rules;
  }

  extract(request: string): ExtractedEntity[] {
    const lower = request.toLowerCase();
    const entities: ExtractedEntity[] = [];

    for (const rule of this._rules) {
      const entity = this._extractEntity(rule, lower, request);
      if (entity) entities.push(entity);
    }

    return entities;
  }

  private _extractEntity(rule: EntityRule, lower: string, original: string): ExtractedEntity | null {
    // Check patterns
    for (const pattern of rule.patterns) {
      const patternLower = pattern.toLowerCase();
      const idx = lower.indexOf(patternLower);
      if (idx >= 0) {
        return {
          type: rule.type,
          value: pattern,
          rawText: original.substring(idx, idx + pattern.length),
          confidence: 0.9,
          position: { start: idx, end: idx + pattern.length },
          futureMetadata: {},
        };
      }
    }

    // Check synonyms
    for (const [canonical, synonyms] of Object.entries(rule.synonyms)) {
      for (const synonym of synonyms) {
        const synLower = synonym.toLowerCase();
        const idx = lower.indexOf(synLower);
        if (idx >= 0) {
          return {
            type: rule.type,
            value: canonical,
            rawText: original.substring(idx, idx + synonym.length),
            confidence: 0.8,
            position: { start: idx, end: idx + synonym.length },
            futureMetadata: {},
          };
        }
      }
    }

    // Use default value if available
    if (rule.defaultValue) {
      return {
        type: rule.type,
        value: rule.defaultValue,
        rawText: '',
        confidence: 0.5,
        position: { start: -1, end: -1 },
        futureMetadata: {},
      };
    }

    return null;
  }

  getRule(type: EntityType): EntityRule | null {
    return this._rules.find((r) => r.type === type) ?? null;
  }

  getAllRules(): EntityRule[] {
    return [...this._rules];
  }
}
