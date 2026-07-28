/**
 * Recommendation Explainer — explains individual recommendations
 * in detail.
 *
 * For each recommendation, provides:
 *   Why recommended, Risk, Benefit, Estimated time,
 *   Estimated recovery, Required capability, Alternative actions
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  AssistantContext,
  RecommendationExplanation,
} from './types';
import type { HealthRecommendation } from '../ai-health-engine/types';
import type { OptimizationItem } from '../optimization-planner/types';
import { formatBytes, formatDuration } from './types';

export class RecommendationExplainer {
  explainRecommendation(
    rec: HealthRecommendation,
    context: AssistantContext,
  ): RecommendationExplanation {
    const alternatives = this._findAlternatives(rec, context);
    const capabilityName = this._getCapabilityName(rec.requiredCapability, context);

    return {
      recommendationId: rec.id,
      title: rec.title,
      whyRecommended: rec.reason,
      risk: this._explainRisk(rec.riskLevel),
      benefit: `Estimated +${rec.estimatedBenefit} points to your health score in the ${rec.category} category.`,
      estimatedTime: formatDuration(rec.estimatedTimeSeconds),
      estimatedRecovery: this._estimateRecovery(rec, context),
      requiredCapability: capabilityName,
      alternativeActions: alternatives,
      category: rec.category,
    };
  }

  explainOptimizationItem(
    item: OptimizationItem,
    context: AssistantContext,
  ): RecommendationExplanation {
    const alternatives = this._findAlternativeItems(item, context);
    const capabilityName = this._getCapabilityName(item.requiredCapability, context);

    return {
      recommendationId: item.id,
      title: item.title,
      whyRecommended: item.description,
      risk: this._explainRisk(item.risk),
      benefit: `Estimated +${item.estimatedBenefit} points to health score. ${item.estimatedSpaceRecovery > 0 ? `Recovers ${formatBytes(item.estimatedSpaceRecovery)} of storage.` : ''}`,
      estimatedTime: formatDuration(item.estimatedDurationSeconds),
      estimatedRecovery: item.estimatedSpaceRecovery > 0 ? formatBytes(item.estimatedSpaceRecovery) : 'N/A',
      requiredCapability: capabilityName,
      alternativeActions: alternatives,
      category: item.category,
    };
  }

  explainAll(context: AssistantContext): RecommendationExplanation[] {
    const recs = context.healthReport?.recommendations ?? [];
    return recs.map((rec) => this.explainRecommendation(rec, context));
  }

  explainSafest(context: AssistantContext): RecommendationExplanation[] {
    const all = this.explainAll(context);
    return all.filter((e) => e.risk.includes('low') || e.risk.includes('no risk'));
  }

  private _explainRisk(risk: string): string {
    switch (risk) {
      case 'none':
        return 'No risk — this action is completely safe.';
      case 'low':
        return 'Low risk — this action is unlikely to cause issues.';
      case 'medium':
        return 'Medium risk — review the details before proceeding.';
      case 'high':
        return 'High risk — carefully consider before proceeding. Manual review recommended.';
      default:
        return `Risk level: ${risk}`;
    }
  }

  private _estimateRecovery(rec: HealthRecommendation, ctx: AssistantContext): string {
    if (rec.category === 'storage' || rec.category === 'temp_files' || rec.category === 'recycle_bin') {
      const plan = ctx.optimizationPlan;
      if (plan) {
        const item = plan.items.find((i) => i.category === rec.category);
        if (item && item.estimatedSpaceRecovery > 0) {
          return formatBytes(item.estimatedSpaceRecovery);
        }
      }
    }
    return 'N/A';
  }

  private _findAlternatives(rec: HealthRecommendation, ctx: AssistantContext): string[] {
    const allRecs = ctx.healthReport?.recommendations ?? [];
    return allRecs
      .filter((r) => r.id !== rec.id && r.category === rec.category)
      .slice(0, 3)
      .map((r) => `${r.title} (+${r.estimatedBenefit} points, ${r.riskLevel} risk)`);
  }

  private _findAlternativeItems(item: OptimizationItem, ctx: AssistantContext): string[] {
    if (!ctx.optimizationPlan) return [];
    return ctx.optimizationPlan.items
      .filter((i) => i.id !== item.id && i.category === item.category && !i.isLocked && !i.isSkipped)
      .slice(0, 3)
      .map((i) => `${i.title} (+${i.estimatedBenefit} points, ${i.risk} risk)`);
  }

  private _getCapabilityName(capabilityId: string | null, ctx: AssistantContext): string | null {
    if (!capabilityId) return null;
    const available = ctx.capabilities.available.find((c) => c.id === capabilityId);
    if (available) return available.display_name;
    const locked = ctx.capabilities.locked.find((c) => c.id === capabilityId);
    if (locked) return `${locked.display_name} (requires upgrade)`;
    return capabilityId;
  }
}

export const recommendationExplainer = new RecommendationExplainer();
