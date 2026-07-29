/**
 * Insight Prioritizer — assigns data-driven priority to insights.
 *
 * Priority levels:
 *   critical, important, recommended, informational, celebration
 *
 * Priority is derived from importance score and insight type.
 * Never hardcoded — all thresholds configurable.
 */
import type { Insight, InsightPriority, PriorityRules, InsightType } from './types';

export class InsightPrioritizer {
  private _rules: PriorityRules;

  constructor(rules: PriorityRules) {
    this._rules = rules;
  }

  updateRules(rules: PriorityRules): void {
    this._rules = rules;
  }

  /**
   * Assign priority to an insight in-place.
   */
  prioritize(insight: Insight): InsightPriority {
    const priority = this._derivePriority(insight.importanceScore, insight.type);
    insight.priority = priority;
    return priority;
  }

  /**
   * Prioritize multiple insights.
   */
  prioritizeAll(insights: Insight[]): void {
    for (const insight of insights) {
      this.prioritize(insight);
    }
  }

  /**
   * Derive priority from importance score and type.
   */
  derivePriority(importanceScore: number, type: InsightType): InsightPriority {
    return this._derivePriority(importanceScore, type);
  }

  /**
   * Sort insights by priority (highest first).
   */
  sortByPriority(insights: Insight[]): Insight[] {
    const order: Record<InsightPriority, number> = {
      critical: 0,
      important: 1,
      recommended: 2,
      celebration: 3,
      informational: 4,
    };
    return [...insights].sort((a, b) => {
      const pa = order[a.priority];
      const pb = order[b.priority];
      if (pa !== pb) return pa - pb;
      return b.importanceScore - a.importanceScore;
    });
  }

  // ── Private ────────────────────────────────────────────────

  private _derivePriority(importanceScore: number, type: InsightType): InsightPriority {
    if (type === 'achievement' || type === 'milestone') return 'celebration';

    if (importanceScore >= this._rules.criticalThreshold) return 'critical';
    if (importanceScore >= this._rules.importantThreshold) return 'important';
    if (importanceScore >= this._rules.recommendedThreshold) return 'recommended';
    return 'informational';
  }
}
