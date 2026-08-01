/**
 * ProcessRiskAssessment — evaluates system-wide process risk.
 *
 * Identifies high-risk processes, protected processes, and system risk factors.
 * Never recommends terminating critical system processes.
 */
import type { ProcessAnalysis, ProcessRiskAssessment, ProcessRiskEntry, ProcessRiskLevel, ProcessUrgency } from './types';

const RISK_PRIORITY: Record<ProcessRiskLevel, number> = {
  none: 0, low: 1, moderate: 2, high: 3, severe: 4,
};

const URGENCY_PRIORITY: Record<ProcessUrgency, number> = {
  none: 0, scheduled: 1, soon: 2, immediate: 3,
};

export class ProcessRiskAssessmentEngine {
  assess(analyses: ProcessAnalysis[]): ProcessRiskAssessment {
    const highRiskProcesses: ProcessRiskEntry[] = [];
    const systemRiskFactors: string[] = [];
    const mitigatingFactors: string[] = [];
    let protectedCount = 0;

    let overallRisk: ProcessRiskLevel = 'none';
    let overallUrgency: ProcessUrgency = 'none';

    for (const analysis of analyses) {
      if (analysis.safetyLevel === 'critical_system') {
        protectedCount++;
      }

      if (analysis.risk !== 'none' && analysis.safetyLevel !== 'critical_system') {
        highRiskProcesses.push({
          pid: analysis.pid,
          name: analysis.name,
          risk: analysis.risk,
          urgency: analysis.urgency,
          primaryConcern: analysis.impact.overall.primaryConcern,
          safetyLevel: analysis.safetyLevel,
        });

        if (RISK_PRIORITY[analysis.risk] > RISK_PRIORITY[overallRisk]) {
          overallRisk = analysis.risk;
        }
        if (URGENCY_PRIORITY[analysis.urgency] > URGENCY_PRIORITY[overallUrgency]) {
          overallUrgency = analysis.urgency;
        }

        if (analysis.risk === 'severe' || analysis.risk === 'high') {
          systemRiskFactors.push(`${analysis.name}: ${analysis.impact.overall.primaryConcern}`);
        }
      }

      if (analysis.health === 'healthy' && analysis.strengths.length > 0) {
        mitigatingFactors.push(`${analysis.name} is operating normally`);
      }
    }

    highRiskProcesses.sort((a, b) => RISK_PRIORITY[b.risk] - RISK_PRIORITY[a.risk]);

    return {
      overallRisk,
      overallUrgency,
      highRiskProcesses: highRiskProcesses.slice(0, 20),
      systemRiskFactors,
      mitigatingFactors,
      protectedProcesses: protectedCount,
    };
  }
}
