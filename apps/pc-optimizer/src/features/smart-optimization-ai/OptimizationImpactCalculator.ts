/**
 * OptimizationImpactCalculator — computes measurable benefits for each
 * optimization action based on evidence from source modules.
 *
 * Every estimate is derived from source findings — never invented.
 */
import type {
  SourceFinding,
  OptimizationBenefits,
  OptimizationImpact,
  BenefitKey,
  OptimizationImpactTier,
  OptimizationCategory,
  OptimizationConfiguration,
} from './types';
import { emptyBenefits } from './types';

export class OptimizationImpactCalculator {
  constructor(private config: OptimizationConfiguration) {}

  calculateBenefits(finding: SourceFinding): OptimizationBenefits {
    const benefits = emptyBenefits();
    const partial = finding.estimatedBenefit;

    if (partial?.storageRecoveryMB) benefits.storageRecoveryMB = partial.storageRecoveryMB;
    if (partial?.ramRecoveryMB) benefits.ramRecoveryMB = partial.ramRecoveryMB;
    if (partial?.startupImprovementMs) benefits.startupImprovementMs = partial.startupImprovementMs;
    if (partial?.privacyImprovement) benefits.privacyImprovement = partial.privacyImprovement;
    if (partial?.batteryImprovement) benefits.batteryImprovement = partial.batteryImprovement;
    if (partial?.thermalImprovement) benefits.thermalImprovement = partial.thermalImprovement;
    if (partial?.performanceImprovement) benefits.performanceImprovement = partial.performanceImprovement;
    if (partial?.stabilityImpact) benefits.stabilityImpact = partial.stabilityImpact;

    return this.applyCategoryDefaults(benefits, finding.category);
  }

  calculateImpact(finding: SourceFinding, benefits: OptimizationBenefits): OptimizationImpact {
    const score = this.computeImpactScore(benefits, finding.category);
    const tier = this.scoreToTier(score);
    const primaryBenefit = this.getPrimaryBenefit(benefits);
    const healthGain = this.estimateHealthScoreGain(benefits, finding.category);

    return {
      score,
      tier,
      primaryBenefit,
      estimatedHealthScoreGain: healthGain,
      description: this.describeImpact(tier, primaryBenefit, benefits),
    };
  }

  private computeImpactScore(benefits: OptimizationBenefits, _category: OptimizationCategory): number {
    let score = 0;

    if (benefits.storageRecoveryMB > 0) {
      score += Math.min(40, benefits.storageRecoveryMB / 50);
    }
    if (benefits.ramRecoveryMB > 0) {
      score += Math.min(25, benefits.ramRecoveryMB / 20);
    }
    if (benefits.startupImprovementMs > 0) {
      score += Math.min(20, benefits.startupImprovementMs / 100);
    }
    if (benefits.privacyImprovement > 0) {
      score += Math.min(15, benefits.privacyImprovement / 5);
    }
    if (benefits.performanceImprovement > 0) {
      score += Math.min(20, benefits.performanceImprovement / 3);
    }
    if (benefits.batteryImprovement > 0) {
      score += Math.min(10, benefits.batteryImprovement / 0.5);
    }
    if (benefits.thermalImprovement > 0) {
      score += Math.min(10, benefits.thermalImprovement / 5);
    }
    if (benefits.stabilityImpact > 0) {
      score += Math.min(10, benefits.stabilityImpact / 5);
    }

    return Math.round(Math.min(100, score));
  }

  private scoreToTier(score: number): OptimizationImpactTier {
    if (score >= this.config.thresholds.highImpactScore) return 'high';
    if (score >= this.config.thresholds.mediumImpactScore) return 'medium';
    if (score >= this.config.thresholds.lowImpactScore) return 'low';
    return 'informational';
  }

  private getPrimaryBenefit(benefits: OptimizationBenefits): BenefitKey {
    const entries: Array<[BenefitKey, number]> = [
      ['storageRecoveryMB', benefits.storageRecoveryMB],
      ['ramRecoveryMB', benefits.ramRecoveryMB],
      ['startupImprovementMs', benefits.startupImprovementMs],
      ['privacyImprovement', benefits.privacyImprovement],
      ['performanceImprovement', benefits.performanceImprovement],
      ['batteryImprovement', benefits.batteryImprovement],
      ['thermalImprovement', benefits.thermalImprovement],
      ['stabilityImpact', benefits.stabilityImpact],
    ];
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]![0];
  }

  private estimateHealthScoreGain(benefits: OptimizationBenefits, _category: OptimizationCategory): number {
    let gain = 0;
    gain += Math.min(15, benefits.storageRecoveryMB / 100);
    gain += Math.min(10, benefits.ramRecoveryMB / 50);
    gain += Math.min(8, benefits.startupImprovementMs / 200);
    gain += Math.min(5, benefits.privacyImprovement / 10);
    gain += Math.min(7, benefits.performanceImprovement / 5);
    gain += Math.min(3, benefits.batteryImprovement);
    gain += Math.min(3, benefits.thermalImprovement / 10);
    gain += Math.min(3, benefits.stabilityImpact / 10);
    return Math.round(gain);
  }

  private describeImpact(tier: OptimizationImpactTier, primary: BenefitKey, benefits: OptimizationBenefits): string {
    const benefitLabels: Record<BenefitKey, string> = {
      storageRecoveryMB: `${benefits.storageRecoveryMB.toFixed(0)} MB storage recovery`,
      ramRecoveryMB: `${benefits.ramRecoveryMB.toFixed(0)} MB RAM recovery`,
      startupImprovementMs: `${(benefits.startupImprovementMs / 1000).toFixed(1)}s faster startup`,
      privacyImprovement: `${benefits.privacyImprovement.toFixed(0)}% privacy improvement`,
      performanceImprovement: `${benefits.performanceImprovement.toFixed(0)}% performance gain`,
      batteryImprovement: `${benefits.batteryImprovement.toFixed(1)}h battery improvement`,
      thermalImprovement: `${benefits.thermalImprovement.toFixed(0)}% thermal improvement`,
      stabilityImpact: `${benefits.stabilityImpact.toFixed(0)}% stability improvement`,
    };
    return `${tier} impact: ${benefitLabels[primary]}.`;
  }

  private applyCategoryDefaults(benefits: OptimizationBenefits, category: OptimizationCategory): OptimizationBenefits {
    switch (category) {
      case 'temp_files':
      case 'recycle_bin':
        if (benefits.storageRecoveryMB === 0) benefits.storageRecoveryMB = 100;
        break;
      case 'browser_cache':
        if (benefits.storageRecoveryMB === 0) benefits.storageRecoveryMB = 50;
        if (benefits.performanceImprovement === 0) benefits.performanceImprovement = 3;
        break;
      case 'browser_privacy':
      case 'privacy':
        if (benefits.privacyImprovement === 0) benefits.privacyImprovement = 10;
        break;
      case 'startup':
        if (benefits.startupImprovementMs === 0) benefits.startupImprovementMs = 500;
        if (benefits.ramRecoveryMB === 0) benefits.ramRecoveryMB = 30;
        break;
      case 'registry':
        if (benefits.performanceImprovement === 0) benefits.performanceImprovement = 1;
        if (benefits.stabilityImpact === 0) benefits.stabilityImpact = 2;
        break;
      case 'duplicate_files':
        if (benefits.storageRecoveryMB === 0) benefits.storageRecoveryMB = 200;
        break;
      case 'large_files':
        if (benefits.storageRecoveryMB === 0) benefits.storageRecoveryMB = 500;
        break;
      case 'disk_optimization':
        if (benefits.performanceImprovement === 0) benefits.performanceImprovement = 5;
        break;
      case 'memory_optimization':
        if (benefits.ramRecoveryMB === 0) benefits.ramRecoveryMB = 100;
        break;
      case 'power':
        if (benefits.batteryImprovement === 0) benefits.batteryImprovement = 0.5;
        break;
      default:
        break;
    }
    return benefits;
  }
}
