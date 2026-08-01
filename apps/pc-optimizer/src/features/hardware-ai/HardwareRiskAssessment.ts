/**
 * HardwareRiskAssessment — evaluates system-wide risk from component analyses.
 *
 * Determines overall risk level, urgency, and time-to-action estimates
 * based on the severity and type of detected issues.
 */
import type {
  ComponentAnalysis,
  HardwareRiskAssessment,
  ComponentRiskEntry,
  AIRiskLevel,
  AIUrgency,
} from './types';

const RISK_PRIORITY: Record<AIRiskLevel, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
  severe: 4,
};

const URGENCY_PRIORITY: Record<AIUrgency, number> = {
  none: 0,
  scheduled: 1,
  soon: 2,
  immediate: 3,
};

export class HardwareRiskAssessmentEngine {
  assess(analyses: ComponentAnalysis[]): HardwareRiskAssessment {
    const componentRisks: Record<string, ComponentRiskEntry> = {};
    const systemRiskFactors: string[] = [];
    const mitigatingFactors: string[] = [];

    let overallRisk: AIRiskLevel = 'none';
    let overallUrgency: AIUrgency = 'none';

    for (const analysis of analyses) {
      const entry: ComponentRiskEntry = {
        category: analysis.category,
        risk: analysis.risk,
        urgency: analysis.urgency,
        primaryConcern: this.getPrimaryConcern(analysis),
        timeToAction: this.estimateTimeToAction(analysis.urgency),
      };
      componentRisks[analysis.category] = entry;

      if (RISK_PRIORITY[analysis.risk] > RISK_PRIORITY[overallRisk]) {
        overallRisk = analysis.risk;
      }
      if (URGENCY_PRIORITY[analysis.urgency] > URGENCY_PRIORITY[overallUrgency]) {
        overallUrgency = analysis.urgency;
      }

      if (analysis.risk === 'severe' || analysis.risk === 'high') {
        systemRiskFactors.push(`${analysis.category}: ${entry.primaryConcern}`);
      }
      if (analysis.strengths.length > 0 && analysis.risk === 'none') {
        mitigatingFactors.push(`${analysis.category} is operating normally`);
      }
    }

    return {
      overallRisk,
      overallUrgency,
      componentRisks,
      systemRiskFactors,
      mitigatingFactors,
      estimatedTimeToAction: this.estimateTimeToAction(overallUrgency),
    };
  }

  private getPrimaryConcern(analysis: ComponentAnalysis): string {
    if (analysis.issues.length === 0) return 'No concerns detected';
    const critical = analysis.issues.find((i) => i.severity === 'critical');
    if (critical) return critical.title;
    const high = analysis.issues.find((i) => i.severity === 'high');
    if (high) return high.title;
    return analysis.issues[0]!.title;
  }

  private estimateTimeToAction(urgency: AIUrgency): string {
    switch (urgency) {
      case 'immediate': return 'Within 24 hours';
      case 'soon': return 'Within 1 week';
      case 'scheduled': return 'Within 1 month';
      default: return 'No action needed';
    }
  }
}
