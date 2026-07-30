/**
 * Natural Language Action Engine — Action Plan Formatter
 *
 * EPIC 5 PHASE A PART 4
 *
 * Formats action plans for display to users.
 * Includes explainability: why, evidence, tools, outcome, risks, rollback, alternatives.
 */
import type { ActionPlan, ActionExplanation } from './types';
import { getActionTypeLabel, getRiskLevelLabel, getActionPlanStatusLabel } from './types';

export interface FormattedActionPlan {
  title: string;
  summary: string;
  details: string;
  steps: string[];
  risks: string[];
  evidence: string[];
  rollback: string;
  alternatives: string;
  confidence: number;
  raw: ActionPlan;
}

export class ActionPlanFormatter {
  format(plan: ActionPlan): FormattedActionPlan {
    const exp = plan.explanation;

    return {
      title: `${getActionTypeLabel(plan.intent)} — Action Plan`,
      summary: exp.summary,
      details: exp.reasoning,
      steps: plan.steps.map((s, i) => `${i + 1}. ${s.description} (Risk: ${getRiskLevelLabel(s.riskLevel)}, ~${s.estimatedDurationMs}ms)`),
      risks: exp.potentialRisks,
      evidence: exp.evidence.map((e) => `• ${e.description}: ${e.value} (confidence: ${(e.confidence * 100).toFixed(0)}%)`),
      rollback: exp.rollbackAvailable ? 'Rollback available — you can undo this action if needed.' : 'No rollback available for this action.',
      alternatives: plan.alternatives.length > 0
        ? `${plan.alternatives.length} alternative plan(s) available.`
        : 'No alternative plans available.',
      confidence: plan.explanation.evidence.length > 0
        ? plan.explanation.evidence.reduce((sum, e) => sum + e.confidence, 0) / plan.explanation.evidence.length
        : 0.5,
      raw: plan,
    };
  }

  formatExplanation(explanation: ActionExplanation): string {
    const lines: string[] = [];
    lines.push(`Summary: ${explanation.summary}`);
    lines.push(`Reasoning: ${explanation.reasoning}`);
    lines.push(`Expected Outcome: ${explanation.expectedOutcome}`);
    if (explanation.potentialRisks.length > 0) {
      lines.push(`Potential Risks:`);
      for (const risk of explanation.potentialRisks) lines.push(`  • ${risk}`);
    }
    lines.push(`Rollback: ${explanation.rollbackAvailable ? 'Available' : 'Not available'}`);
    if (explanation.evidence.length > 0) {
      lines.push(`Evidence:`);
      for (const e of explanation.evidence) lines.push(`  • ${e.description}: ${e.value} (confidence: ${(e.confidence * 100).toFixed(0)}%)`);
    }
    return lines.join('\n');
  }

  formatCompact(plan: ActionPlan): string {
    const parts: string[] = [];
    parts.push(`[${getActionTypeLabel(plan.intent)}] ${plan.explanation.summary}`);
    parts.push(`Risk: ${getRiskLevelLabel(plan.estimatedRisk)} | Steps: ${plan.steps.length} | Status: ${getActionPlanStatusLabel(plan.status)}`);
    parts.push(`Expected: ${plan.estimatedBenefit}`);
    if (plan.requiresApproval) parts.push('⚠ Requires approval');
    return parts.join('\n');
  }
}
