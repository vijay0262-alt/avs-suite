/**
 * ThreatSummaryBuilder — generates concise investigation summaries.
 *
 * Creates a title, one-liner, and key metadata for each investigation.
 */
import type { Threat, ThreatSummary, ThreatCategory } from './types';
import type { ThreatKnowledgeBase } from './ThreatKnowledgeBase';

export class ThreatSummaryBuilder {
  constructor(private knowledgeBase: ThreatKnowledgeBase) {}

  build(threats: Threat[]): ThreatSummary {
    const primary = threats[0]!;
    const category = primary.category;
    const friendlyName = this.knowledgeBase.getUserFriendlyName(category);

    const title = threats.length === 1
      ? friendlyName
      : `${friendlyName} + ${threats.length - 1} Related`;

    const oneLiner = this.buildOneLiner(threats, category);
    const detectedAt = Math.min(...threats.map((t) => t.detectionTime));
    const lastActivity = Math.max(...threats.map((t) => t.detectionTime));

    return {
      title,
      oneLiner,
      category,
      threatCount: threats.length,
      primaryThreatName: primary.name,
      detectedAt,
      lastActivity,
    };
  }

  private buildOneLiner(threats: Threat[], _category: ThreatCategory): string {
    const primary = threats[0]!;
    const evidenceCount = threats.reduce((sum, t) => sum + t.evidence.length, 0);

    if (threats.length === 1) {
      return `${primary.name} — ${evidenceCount} indicator(s) detected.`;
    }

    const categories = [...new Set(threats.map((t) => t.category))];
    return `${threats.length} correlated threat(s) across ${categories.length} category/categories — ${evidenceCount} total indicator(s). Primary: ${primary.name}.`;
  }
}
