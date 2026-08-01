/**
 * ThreatReportGenerator — generates comprehensive investigation reports.
 *
 * Produces:
 *   - Executive Summary
 *   - Technical Details
 *   - Evidence section with quality assessment
 *   - Timeline
 *   - Recommendations
 *   - MITRE ATT&CK
 *   - Risk Score
 *   - Confidence
 *   - False-positive analysis
 */
import type {
  Threat,
  ThreatReport,
  ReportEvidenceSection,
  ReportEvidenceItem,
  TimelineEvent,
  RecommendedAction,
  MitreAttackMapping,
  FalsePositiveAnalysis,
  AffectedComponent,
  ThreatInvestigation,
  CollectedEvidence,
  SecurityEvidence,
} from './types';

export class ThreatReportGenerator {
  generate(
    investigation: ThreatInvestigation,
  threats: Threat[],
  evidence: CollectedEvidence,
  timeline: TimelineEvent[],
  recommendations: RecommendedAction[],
    falsePositive: FalsePositiveAnalysis,
    affectedComponents: AffectedComponent[],
  ): ThreatReport {
    return {
      investigationId: investigation.id,
      generatedAt: Date.now(),
      executiveSummary: this.buildExecutiveSummary(investigation),
      technicalDetails: this.buildTechnicalDetails(investigation),
      evidence: this.buildEvidenceSection(evidence),
      timeline,
      recommendations,
      mitreAttack: this.collectMitreMappings(threats),
      riskScore: this.computeRiskScore(investigation),
      confidenceScore: investigation.confidence.score,
      severity: investigation.severity.level,
      falsePositiveAnalysis: falsePositive,
      affectedComponents,
    };
  }

  private buildExecutiveSummary(inv: ThreatInvestigation): string {
    const summary = inv.summary;
    const severity = inv.severity.level.toUpperCase();
    const confidence = `${(inv.confidence.score * 100).toFixed(0)}%`;

    return `INVESTIGATION REPORT — ${summary.title}

Detected: ${new Date(summary.detectedAt).toLocaleString()}
Severity: ${severity}
Confidence: ${confidence}
Risk: ${inv.risk}
Threats: ${summary.threatCount} correlated detection(s)

${summary.oneLiner}

${inv.explanation.whatHappened}

${inv.explanation.userFriendlyExplanation}

Estimated Impact: ${inv.estimatedImpact}
Estimated Recovery: ${inv.estimatedRecovery}

Recommended Actions:
${inv.recommendedActions.map((a, i) => `  ${i + 1}. [${a.priority.toUpperCase()}] ${a.action}`).join('\n')}`;
  }

  private buildTechnicalDetails(inv: ThreatInvestigation): string {
    const threatDetails = inv.threatIds.map((id) => `  - ID: ${id}`).join('\n');

    const correlationInfo = inv.relationships.length > 0
      ? `\nCorrelations (${inv.relationships.length}):\n${inv.relationships.map((r) => `  - ${r.type}: ${r.description} (strength: ${(r.strength * 100).toFixed(0)}%)`).join('\n')}`
      : '\nNo correlations detected.';

    return `TECHNICAL DETAILS

Threats (${inv.threatIds.length}):
${threatDetails}
${correlationInfo}

Severity Assessment: ${inv.severity.level.toUpperCase()} (score: ${inv.severity.score.toFixed(0)}/100)
${inv.severity.reasoning}

Confidence Assessment: ${inv.confidence.label.toUpperCase().replace(/_/g, ' ')} (${(inv.confidence.score * 100).toFixed(0)}%)
${inv.confidence.reasoning}

Evidence Quality: ${inv.evidence.evidenceQuality}
Total Evidence Items: ${inv.evidence.total}

Timeline Events: ${inv.timeline.length}
Affected Components: ${inv.affectedComponents.length}`;
  }

  private buildEvidenceSection(evidence: CollectedEvidence): ReportEvidenceSection {
    const items: ReportEvidenceItem[] = evidence.items.map((e) => ({
      source: e.source,
      type: e.type,
      value: e.value,
      description: e.description,
      timestamp: e.timestamp,
      significance: this.assessSignificance(e),
    }));

    const summary = `${evidence.total} piece(s) of evidence collected from ${Object.keys(evidence.bySource).length} source(s). Quality: ${evidence.evidenceQuality}. Strongest evidence: ${evidence.strongestEvidence?.description ?? 'N/A'}.`;

    const qualityAssessment = this.assessEvidenceQuality(evidence);

    return { summary, items, qualityAssessment };
  }

  private assessSignificance(evidence: SecurityEvidence): ReportEvidenceItem['significance'] {
    if (evidence.type.includes('known_bad') || evidence.type.includes('encoded_command') || evidence.type.includes('process_injection')) {
      return 'critical';
    }
    if (evidence.type.includes('unsigned') || evidence.type.includes('download') || evidence.type.includes('beacon') || evidence.type.includes('hidden')) {
      return 'important';
    }
    if (evidence.type.includes('suspicious') || evidence.type.includes('low_reputation') || evidence.type.includes('unknown')) {
      return 'supporting';
    }
    return 'minor';
  }

  private assessEvidenceQuality(evidence: CollectedEvidence): string {
    switch (evidence.evidenceQuality) {
      case 'very_strong':
        return 'Evidence quality is very strong — multiple independent sources with 10+ items provide high-confidence corroboration.';
      case 'strong':
        return 'Evidence quality is strong — multiple sources with 6+ items provide good corroboration.';
      case 'moderate':
        return 'Evidence quality is moderate — 3+ items provide reasonable support but additional verification is recommended.';
      case 'weak':
        return 'Evidence quality is weak — fewer than 3 items. Additional verification is strongly recommended before taking action.';
      default:
        return 'Evidence quality could not be assessed.';
    }
  }

  private collectMitreMappings(threats: Threat[]): MitreAttackMapping[] {
    const mappings: MitreAttackMapping[] = [];
    const seen = new Set<string>();

    for (const t of threats) {
      if (t.mitreAttack) {
        const key = t.mitreAttack.technique;
        if (!seen.has(key)) {
          seen.add(key);
          mappings.push(t.mitreAttack);
        }
      }
    }

    return mappings;
  }

  private computeRiskScore(inv: ThreatInvestigation): number {
    const severityWeight = inv.severity.score * 0.5;
    const confidenceWeight = inv.confidence.score * 100 * 0.3;
    const evidenceWeight = Math.min(inv.evidence.total * 2, 20);
    return Math.round(severityWeight + confidenceWeight + evidenceWeight);
  }
}
