/**
 * Plan Estimator — estimates benefits for optimization plans.
 *
 * Estimates: Health Score Improvement, Storage Recovery, Startup Improvement,
 * Performance Improvement, Privacy Improvement, Maintenance Reduction,
 * Estimated User Time Saved.
 *
 * Never exaggerates estimates.
 */
import type {
  Recommendation,
} from '../ai-intelligence/recommendations/types';
import type {
  PlanConfiguration,
  PlanRiskLevel as PlanRisk,
} from './types';
import { riskToPlanRisk, planRiskToWeight } from './types';

export interface PlanEstimate {
  estimatedDuration: number;
  estimatedHealthGain: number;
  estimatedStorageRecovery: number;
  estimatedPerformanceGain: number;
  estimatedPrivacyGain: number;
  estimatedStartupGain: number;
  estimatedRisk: PlanRisk;
  confidenceScore: number;
  rollbackAvailable: boolean;
}

export class PlanEstimator {
  private _config: PlanConfiguration;

  constructor(config: PlanConfiguration) {
    this._config = config;
  }

  updateConfig(config: PlanConfiguration): void {
    this._config = config;
  }

  estimate(recommendations: Recommendation[]): PlanEstimate {
    const rules = this._config.benefitRules;

    let totalDuration = 0;
    let totalHealthGain = 0;
    let totalStorageRecovery = 0;
    let totalPerformanceGain = 0;
    let totalPrivacyGain = 0;
    let totalStartupGain = 0;
    let totalConfidence = 0;
    let allRollbackAvailable = true;

    const riskWeights: number[] = [];

    for (const rec of recommendations) {
      totalDuration += rec.benefits.estimatedTime;
      totalHealthGain += rec.benefits.estimatedHealthIncrease ?? 0;
      totalStorageRecovery += rec.benefits.estimatedSpaceRecovered ?? 0;
      totalPerformanceGain += rec.benefits.estimatedPerformanceGain ?? 0;
      totalPrivacyGain += rec.benefits.estimatedPrivacyImprovement ?? 0;
      totalConfidence += rec.scores.confidenceScore;

      if (rec.category === 'startup') {
        totalStartupGain += rec.benefits.estimatedPerformanceGain ?? 0;
      }

      if (!rec.safety.rollbackAvailable) {
        allRollbackAvailable = false;
      }

      riskWeights.push(planRiskToWeight(riskToPlanRisk(rec.safety.riskLevel)));
    }

    const count = recommendations.length || 1;

    return {
      estimatedDuration: Math.round(totalDuration),
      estimatedHealthGain: Math.min(rules.maxHealthGain, Math.round(totalHealthGain * rules.healthGainMultiplier)),
      estimatedStorageRecovery: Math.min(rules.maxStorageRecovery, Math.round(totalStorageRecovery * rules.storageRecoveryMultiplier)),
      estimatedPerformanceGain: Math.round(totalPerformanceGain * rules.performanceGainMultiplier),
      estimatedPrivacyGain: Math.round(totalPrivacyGain * rules.privacyGainMultiplier),
      estimatedStartupGain: Math.round(totalStartupGain * rules.startupGainMultiplier),
      estimatedRisk: this._calculateOverallRisk(riskWeights),
      confidenceScore: totalConfidence / count,
      rollbackAvailable: allRollbackAvailable,
    };
  }

  estimateStep(rec: Recommendation) {
    const risk = riskToPlanRisk(rec.safety.riskLevel);

    return {
      estimatedDuration: rec.benefits.estimatedTime,
      estimatedBenefit: rec.benefits.estimatedBenefit,
      riskLevel: risk,
      rollbackAvailable: rec.safety.rollbackAvailable,
      rollbackMethod: rec.safety.rollbackAvailable ? 'automatic' : null,
      rollbackConfidence: rec.safety.rollbackAvailable ? rec.scores.safetyScore : 0,
      estimatedRollbackTime: rec.safety.rollbackAvailable ? Math.round(rec.benefits.estimatedTime * 0.5) : 0,
      confidence: rec.scores.confidenceScore,
    };
  }

  private _calculateOverallRisk(riskWeights: number[]): PlanRisk {
    if (riskWeights.length === 0) return this._config.riskRules.defaultRisk;
    const avg = riskWeights.reduce((a, b) => a + b, 0) / riskWeights.length;
    if (avg >= 75) return 'high';
    if (avg >= 50) return 'medium';
    if (avg >= 25) return 'low';
    if (avg >= 10) return 'very_low';
    return 'none';
  }
}
