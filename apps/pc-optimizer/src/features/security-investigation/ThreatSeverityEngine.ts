/**
 * ThreatSeverityEngine — computes investigation-level severity.
 *
 * Combines individual threat severities with contextual factors
 * to produce a single investigation severity with reasoning.
 */
import type { Threat, ThreatSeverity, InvestigationSeverity, SeverityFactor } from './types';
import { severityToScore } from './types';

const SEVERITY_ORDER: ThreatSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];

export class ThreatSeverityEngine {
  compute(threats: Threat[]): InvestigationSeverity {
    const factors: SeverityFactor[] = [];

    if (threats.length === 0) {
      return {
        level: 'info',
        score: 0,
        reasoning: 'No threats detected.',
        factors,
      };
    }

    // Factor 1: Maximum individual threat severity
    const maxSeverity = this.getMaxSeverity(threats);
    const maxScore = severityToScore(maxSeverity);
    factors.push({
      factor: 'Maximum threat severity',
      weight: maxScore * 0.4,
      description: `Highest individual threat severity: ${maxSeverity}`,
    });

    // Factor 2: Average severity across all threats
    const avgScore = threats.reduce((sum, t) => sum + severityToScore(t.severity), 0) / threats.length;
    factors.push({
      factor: 'Average threat severity',
      weight: avgScore * 0.2,
      description: `Average severity score across ${threats.length} threat(s): ${avgScore.toFixed(1)}`,
    });

    // Factor 3: Threat count (correlation amplifies severity)
    const countWeight = Math.min(threats.length * 5, 20);
    factors.push({
      factor: 'Correlated threat count',
      weight: countWeight,
      description: `${threats.length} correlated threat(s) — multiple detections amplify severity`,
    });

    // Factor 4: Critical category presence
    const criticalCategories = ['spyware', 'ransomware', 'rootkit', 'bootkit', 'backdoor', 'keylogger'];
    const hasCritical = threats.some((t) => criticalCategories.includes(t.category));
    if (hasCritical) {
      factors.push({
        factor: 'Critical threat category',
        weight: 15,
        description: 'Investigation includes a critical threat category (spyware, ransomware, rootkit, backdoor, or keylogger)',
      });
    }

    // Factor 5: Evidence volume
    const totalEvidence = threats.reduce((sum, t) => sum + t.evidence.length, 0);
    if (totalEvidence >= 10) {
      factors.push({
        factor: 'Strong evidence base',
        weight: 10,
        description: `${totalEvidence} pieces of evidence across all threats — strong corroboration`,
      });
    }

    // Factor 6: MITRE ATT&CK coverage
    const mitreCount = threats.filter((t) => t.mitreAttack !== null).length;
    if (mitreCount >= 3) {
      factors.push({
        factor: 'MITRE ATT&CK coverage',
        weight: 5,
        description: `${mitreCount} threats with MITRE ATT&CK mapping — indicates structured attack pattern`,
      });
    }

    const totalScore = Math.min(100, factors.reduce((sum, f) => sum + f.weight, 0));
    const level = this.scoreToLevel(totalScore);
    const reasoning = this.buildReasoning(level, totalScore, factors);

    return { level, score: totalScore, reasoning, factors };
  }

  private getMaxSeverity(threats: Threat[]): ThreatSeverity {
    let maxIdx = 0;
    for (const t of threats) {
      const idx = SEVERITY_ORDER.indexOf(t.severity);
      if (idx > maxIdx) maxIdx = idx;
    }
    return SEVERITY_ORDER[maxIdx]!;
  }

  private scoreToLevel(score: number): ThreatSeverity {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 35) return 'medium';
    if (score >= 15) return 'low';
    return 'info';
  }

  private buildReasoning(level: ThreatSeverity, score: number, factors: SeverityFactor[]): string {
    const factorDescriptions = factors.map((f) => `${f.factor}: ${f.description}`).join('; ');
    return `Investigation severity assessed as ${level.toUpperCase()} (score: ${score.toFixed(0)}/100). ${factorDescriptions}.`;
  }
}
