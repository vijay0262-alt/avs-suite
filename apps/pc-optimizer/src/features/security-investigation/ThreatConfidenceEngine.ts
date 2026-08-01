/**
 * ThreatConfidenceEngine — computes investigation-level confidence.
 *
 * Combines individual threat confidence scores with evidence quality,
 * correlation strength, and mitigating factors to produce a single
 * investigation confidence with transparent reasoning.
 */
import type { Threat, InvestigationConfidence, ConfidenceFactor } from './types';
import { confidenceToLabel } from './types';

export class ThreatConfidenceEngine {
  compute(threats: Threat[], correlationCount: number, falsePositiveFactors: string[]): InvestigationConfidence {
    const factors: ConfidenceFactor[] = [];

    if (threats.length === 0) {
      return {
        score: 0,
        label: 'very_low',
        reasoning: 'No threats to assess.',
        factors,
        mitigatingFactors: [],
      };
    }

    // Factor 1: Average threat confidence
    const avgConfidence = threats.reduce((sum, t) => sum + t.confidence, 0) / threats.length;
    factors.push({
      factor: 'Average threat confidence',
      impact: avgConfidence * 0.3,
      description: `Average confidence across ${threats.length} threat(s): ${(avgConfidence * 100).toFixed(0)}%`,
    });

    // Factor 2: Evidence volume
    const totalEvidence = threats.reduce((sum, t) => sum + t.evidence.length, 0);
    const evidenceBoost = Math.min(totalEvidence * 0.02, 0.15);
    factors.push({
      factor: 'Evidence volume',
      impact: evidenceBoost,
      description: `${totalEvidence} pieces of evidence collected — ${totalEvidence >= 10 ? 'strong corroboration' : totalEvidence >= 5 ? 'moderate corroboration' : 'limited corroboration'}`,
    });

    // Factor 3: Correlation strength
    if (correlationCount > 0) {
      const correlationBoost = Math.min(correlationCount * 0.05, 0.2);
      factors.push({
        factor: 'Correlation strength',
        impact: correlationBoost,
        description: `${correlationCount} correlation(s) found — correlated threats increase confidence`,
      });
    }

    // Factor 4: Multiple detection sources
    const sources = new Set(threats.map((t) => t.detectionSource));
    if (sources.size >= 3) {
      factors.push({
        factor: 'Multiple detection sources',
        impact: 0.1,
        description: `${sources.size} independent detection source(s) — cross-provider validation`,
      });
    }

    // Factor 5: MITRE ATT&CK mapping presence
    const mitreCount = threats.filter((t) => t.mitreAttack !== null).length;
    if (mitreCount > 0) {
      factors.push({
        factor: 'MITRE ATT&CK mapping',
        impact: Math.min(mitreCount * 0.03, 0.1),
        description: `${mitreCount} threat(s) with MITRE ATT&CK mapping — structured attack framework alignment`,
      });
    }

    // Calculate raw score
    let score = factors.reduce((sum, f) => sum + f.impact, 0);

    // Apply mitigating factors (false positive indicators reduce confidence)
    const mitigatingFactors: string[] = [];
    for (const fp of falsePositiveFactors) {
      mitigatingFactors.push(fp);
      score -= 0.05;
    }

    score = Math.max(0, Math.min(1, score));
    const label = confidenceToLabel(score);

    const reasoning = this.buildReasoning(score, label, factors, mitigatingFactors);

    return { score, label, reasoning, factors, mitigatingFactors };
  }

  private buildReasoning(
    score: number,
    label: string,
    factors: ConfidenceFactor[],
    mitigatingFactors: string[],
  ): string {
    const factorDesc = factors.map((f) => `${f.factor}: ${f.description}`).join('; ');
    const mitigatingDesc = mitigatingFactors.length > 0
      ? ` Mitigating factors: ${mitigatingFactors.join('; ')}.`
      : '';
    return `Confidence assessed as ${label.toUpperCase().replace('_', ' ')} (${(score * 100).toFixed(0)}%). ${factorDesc}.${mitigatingDesc}`;
  }
}
