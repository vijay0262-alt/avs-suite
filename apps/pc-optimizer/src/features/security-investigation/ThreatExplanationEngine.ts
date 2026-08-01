/**
 * ThreatExplanationEngine — generates human-readable explanations.
 *
 * For every investigation, explains:
 *   - What happened
 *   - Why AVS Shield detected it
 *   - Which evidence supports it
 *   - How confident the AI is
 *   - Possible false-positive factors
 *   - Recommended next steps
 *
 * The AI must never invent information. Every explanation is
 * traceable to evidence from the detected threats.
 */
import type { Threat, ThreatExplanation, CollectedEvidence, InvestigationConfidence, FalsePositiveAnalysis } from './types';
import type { ThreatKnowledgeBase } from './ThreatKnowledgeBase';

export class ThreatExplanationEngine {
  constructor(private knowledgeBase: ThreatKnowledgeBase) {}

  explain(
    threats: Threat[],
    evidence: CollectedEvidence,
    confidence: InvestigationConfidence,
    falsePositive: FalsePositiveAnalysis,
  ): ThreatExplanation {
    const primaryThreat = threats[0]!;
    const category = primaryThreat.category;
    const kbEntry = this.knowledgeBase.get(category);

    const whatHappened = this.buildWhatHappened(threats, kbEntry);
    const whyDetected = this.buildWhyDetected(threats, evidence);
    const evidenceSummary = this.buildEvidenceSummary(evidence);
    const confidenceReasoning = this.buildConfidenceReasoning(confidence);
    const possibleFalsePositiveFactors = this.buildFalsePositiveFactors(threats, falsePositive);
    const userFriendlyExplanation = this.buildUserFriendlyExplanation(threats, kbEntry, evidence, confidence);
    const technicalExplanation = this.buildTechnicalExplanation(threats, evidence, kbEntry);

    return {
      whatHappened,
      whyDetected,
      evidenceSummary,
      confidenceReasoning,
      possibleFalsePositiveFactors,
      userFriendlyExplanation,
      technicalExplanation,
    };
  }

  private buildWhatHappened(threats: Threat[], kbEntry: { userFriendlyName: string; whatIsIt: string; description: string } | null): string {
    if (threats.length === 1) {
      const t = threats[0]!;
      const kbDesc = kbEntry?.description ?? '';
      return `${kbEntry?.userFriendlyName ?? t.name} was detected on your system. ${kbDesc} The detection is based on ${t.evidence.length} piece(s) of evidence identified by the ${t.detectionSource} provider.`;
    }

    const categories = [...new Set(threats.map((t) => t.category))];
    const threatNames = threats.map((t) => t.name);
    return `${threats.length} related security issues were detected and correlated into a single investigation. The detection includes: ${threatNames.join(', ')}. These threats span ${categories.length} category/categories: ${categories.join(', ')}. This suggests a coordinated attack pattern rather than isolated incidents.`;
  }

  private buildWhyDetected(threats: Threat[], evidence: CollectedEvidence): string {
    const indicators: string[] = [];
    for (const t of threats) {
      for (const ev of t.evidence.slice(0, 3)) {
        indicators.push(ev.description);
      }
    }

    if (indicators.length === 0) {
      return 'AVS Shield detected this threat through automated security analysis. No specific indicators were available for detailed explanation.';
    }

    return `AVS Shield detected this threat because the following indicator(s) were identified: ${indicators.join('; ')}. The detection system requires multiple supporting indicators to minimize false positives. ${evidence.total} total piece(s) of evidence were collected from ${Object.keys(evidence.bySource).length} detection source(s).`;
  }

  private buildEvidenceSummary(evidence: CollectedEvidence): string {
    if (evidence.total === 0) return 'No evidence was collected for this investigation.';

    const sources = Object.entries(evidence.bySource).map(([src, count]) => `${src}: ${count} piece(s)`);
    const types = Object.entries(evidence.byType).map(([type, count]) => `${type}: ${count}`);

    return `Evidence quality: ${evidence.evidenceQuality}. ${evidence.total} piece(s) of evidence collected from ${Object.keys(evidence.bySource).length} source(s). Sources: ${sources.join(', ')}. Evidence types: ${types.slice(0, 5).join(', ')}${types.length > 5 ? '...' : ''}. Strongest evidence: ${evidence.strongestEvidence?.description ?? 'N/A'}.`;
  }

  private buildConfidenceReasoning(confidence: InvestigationConfidence): string {
    const factorDescs = confidence.factors.map((f) => `${f.factor} (${(f.impact * 100).toFixed(0)}% impact): ${f.description}`);
    const mitigatingDesc = confidence.mitigatingFactors.length > 0
      ? ` However, confidence was reduced due to: ${confidence.mitigatingFactors.join('; ')}.`
      : '';
    return `AVS Shield assesses confidence as ${confidence.label.toUpperCase().replace(/_/g, ' ')} (${(confidence.score * 100).toFixed(0)}%). ${factorDescs.join('; ')}.${mitigatingDesc}`;
  }

  private buildFalsePositiveFactors(threats: Threat[], falsePositive: FalsePositiveAnalysis): string[] {
    const factors: string[] = [];

    if (falsePositive.couldBeLegitimate) {
      factors.push('This detection may be a false positive — legitimate software can exhibit similar behavior.');
    }

    factors.push(...falsePositive.confidenceReducingFactors);

    for (const t of threats) {
      const kbEntry = this.knowledgeBase.get(t.category);
      if (kbEntry) {
        factors.push(...kbEntry.falsePositiveScenarios.slice(0, 2));
      }
    }

    return [...new Set(factors)];
  }

  private buildUserFriendlyExplanation(
    threats: Threat[],
    kbEntry: { userFriendlyName: string; whatIsIt: string; whyDangerous: string } | null,
    evidence: CollectedEvidence,
    confidence: InvestigationConfidence,
  ): string {
    const t = threats[0]!;
    const friendlyName = kbEntry?.userFriendlyName ?? t.name;
    const whatIs = kbEntry?.whatIsIt ?? '';
    const whyDangerous = kbEntry?.whyDangerous ?? '';

    if (threats.length === 1) {
      return `${friendlyName} was detected on your computer. ${whatIs} ${whyDangerous} AVS Shield found ${evidence.total} piece(s) of evidence supporting this detection, with ${confidence.label.replace(/_/g, ' ')} confidence (${(confidence.score * 100).toFixed(0)}%). ${falsePositiveText(confidence)}`;
    }

    return `${friendlyName} and ${threats.length - 1} related threat(s) were detected and linked together as a single security incident. ${whatIs} ${whyDangerous} AVS Shield correlated ${threats.length} separate detections based on shared evidence and timing. ${evidence.total} total piece(s) of evidence support this investigation, with ${confidence.label.replace(/_/g, ' ')} confidence (${(confidence.score * 100).toFixed(0)}%). ${falsePositiveText(confidence)}`;
  }

  private buildTechnicalExplanation(
    threats: Threat[],
    evidence: CollectedEvidence,
    kbEntry: { name: string; howItWorks: string; mitreTechniques: string[] } | null,
  ): string {
    const threatIds = threats.map((t) => t.id);
    const sources = Object.keys(evidence.bySource);
    const howItWorks = kbEntry?.howItWorks ?? '';
    const mitre = kbEntry?.mitreTechniques ?? [];

    return `Technical Analysis: ${threats.length} threat(s) [IDs: ${threatIds.join(', ')}] detected by ${sources.length} provider(s): ${sources.join(', ')}. ${howItWorks} Evidence breakdown: ${Object.entries(evidence.byType).map(([type, count]) => `${type} (${count})`).join(', ')}. MITRE ATT&CK techniques: ${mitre.length > 0 ? mitre.join(', ') : 'N/A'}. Evidence quality assessed as: ${evidence.evidenceQuality}.`;
  }
}

function falsePositiveText(confidence: InvestigationConfidence): string {
  if (confidence.mitigatingFactors.length > 0) {
    return `Note: Some factors may reduce confidence — ${confidence.mitigatingFactors.join('; ')}.`;
  }
  return '';
}
