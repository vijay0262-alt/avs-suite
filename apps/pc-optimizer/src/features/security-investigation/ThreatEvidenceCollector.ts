/**
 * ThreatEvidenceCollector — aggregates and assesses evidence from threats.
 *
 * Collects all evidence from correlated threats, categorizes by source
 * and type, identifies the strongest evidence, and assesses overall
 * evidence quality.
 */
import type { Threat, SecurityEvidence, CollectedEvidence } from './types';

export class ThreatEvidenceCollector {
  collect(threats: Threat[]): CollectedEvidence {
    const items: SecurityEvidence[] = [];

    for (const threat of threats) {
      for (const evidence of threat.evidence) {
        items.push({ ...evidence });
      }
    }

    // Sort by timestamp (newest first)
    items.sort((a, b) => b.timestamp - a.timestamp);

    const bySource = this.countBy(items, (e) => e.source);
    const byType = this.countBy(items, (e) => e.type);
    const strongestEvidence = this.findStrongest(items);
    const evidenceQuality = this.assessQuality(items, bySource);

    return {
      total: items.length,
      bySource,
      byType,
      items,
      strongestEvidence,
      evidenceQuality,
    };
  }

  private countBy(items: SecurityEvidence[], selector: (e: SecurityEvidence) => string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = selector(item);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  private findStrongest(items: SecurityEvidence[]): SecurityEvidence | null {
    if (items.length === 0) return null;

    // Strongest = most descriptive + earliest (root cause)
    const scored = items.map((e) => ({
      evidence: e,
      score: e.description.length + (e.type.includes('known') || e.type.includes('bad') ? 100 : 0),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0]!.evidence;
  }

  private assessQuality(items: SecurityEvidence[], bySource: Record<string, number>): CollectedEvidence['evidenceQuality'] {
    const total = items.length;
    const sourceCount = Object.keys(bySource).length;

    if (total >= 10 && sourceCount >= 3) return 'very_strong';
    if (total >= 6 && sourceCount >= 2) return 'strong';
    if (total >= 3) return 'moderate';
    return 'weak';
  }
}
