/**
 * Recommendation Scorer — scores each recommendation independently.
 *
 * Scores are normalized 0.0–1.0.
 * Higher is better for impact, safety, urgency, confidence, overall.
 * Lower effort score means less effort (0.0 = no effort, 1.0 = extreme effort).
 *
 * Future scoring models should be replaceable via configuration weights.
 */
import type {
  Recommendation,
  RecommendationScores,
  RecommendationPriority,
  ScoringWeights,
  PriorityThresholds,
  RecommendationConfiguration,
} from './types';
import { clampScore } from './types';

export class RecommendationScorer {
  private _weights: ScoringWeights;
  private _thresholds: PriorityThresholds;

  constructor(config: RecommendationConfiguration) {
    this._weights = config.scoringWeights;
    this._thresholds = config.priorityThresholds;
  }

  updateConfig(config: RecommendationConfiguration): void {
    this._weights = config.scoringWeights;
    this._thresholds = config.priorityThresholds;
  }

  /**
   * Score a recommendation in-place. Returns the updated scores.
   */
  score(rec: Recommendation): RecommendationScores {
    const impact = this._calculateImpact(rec);
    const safety = this._calculateSafety(rec);
    const urgency = this._calculateUrgency(rec);
    const effort = this._calculateEffort(rec);
    const confidence = rec.evidence.confidence;

    const overall = this._calculateOverall(impact, safety, urgency, effort, confidence);

    const scores: RecommendationScores = {
      impactScore: clampScore(impact),
      safetyScore: clampScore(safety),
      urgencyScore: clampScore(urgency),
      effortScore: clampScore(effort),
      confidenceScore: clampScore(confidence),
      overallScore: clampScore(overall),
    };

    rec.scores = scores;
    rec.priority = this._derivePriority(scores.overallScore);
    return scores;
  }

  /**
   * Score multiple recommendations.
   */
  scoreAll(recommendations: Recommendation[]): void {
    for (const rec of recommendations) {
      this.score(rec);
    }
  }

  /**
   * Derive priority from overall score. Never hardcode.
   */
  derivePriority(overallScore: number): RecommendationPriority {
    return this._derivePriority(overallScore);
  }

  // ── Private ────────────────────────────────────────────────

  private _derivePriority(overallScore: number): RecommendationPriority {
    if (overallScore >= this._thresholds.critical) return 'critical';
    if (overallScore >= this._thresholds.high) return 'high';
    if (overallScore >= this._thresholds.medium) return 'medium';
    if (overallScore >= this._thresholds.low) return 'low';
    return 'informational';
  }

  private _calculateOverall(
    impact: number,
    safety: number,
    urgency: number,
    effort: number,
    confidence: number,
  ): number {
    // Effort is inverted: lower effort = higher score contribution
    const effortContribution = 1.0 - effort;
    return (
      impact * this._weights.impact +
      safety * this._weights.safety +
      urgency * this._weights.urgency +
      effortContribution * this._weights.effort +
      confidence * this._weights.confidence
    );
  }

  private _calculateImpact(rec: Recommendation): number {
    let impact = 0.5;

    const benefits = rec.benefits;
    let benefitCount = 0;

    if (benefits.estimatedSpaceRecovered !== null && benefits.estimatedSpaceRecovered > 0) {
      impact += 0.15;
      benefitCount++;
    }
    if (benefits.estimatedPerformanceGain !== null && benefits.estimatedPerformanceGain > 0) {
      impact += 0.15;
      benefitCount++;
    }
    if (benefits.estimatedPrivacyImprovement !== null && benefits.estimatedPrivacyImprovement > 0) {
      impact += 0.10;
      benefitCount++;
    }
    if (benefits.estimatedHealthIncrease !== null && benefits.estimatedHealthIncrease > 0) {
      impact += 0.15;
      benefitCount++;
    }

    // More benefits = higher impact
    if (benefitCount > 2) impact += 0.05;

    // Evidence count contributes to impact
    if (rec.evidence.evidenceCount > 5) impact += 0.05;

    return clampScore(impact);
  }

  private _calculateSafety(rec: Recommendation): number {
    let safety = 1.0;

    const risk = rec.safety.riskLevel;
    if (risk === 'critical') safety = 0.0;
    else if (risk === 'high') safety = 0.2;
    else if (risk === 'medium') safety = 0.5;
    else if (risk === 'low') safety = 0.8;
    else if (risk === 'none') safety = 1.0;

    if (rec.safety.rollbackAvailable) safety += 0.1;
    if (!rec.safety.requiresConfirmation) safety += 0.05;
    if (rec.safety.warnings.length > 0) safety -= 0.1;

    return clampScore(safety);
  }

  private _calculateUrgency(rec: Recommendation): number {
    let urgency = 0.3;

    // Category-based urgency
    if (rec.category === 'security') urgency = 0.9;
    else if (rec.category === 'health') urgency = 0.7;
    else if (rec.category === 'performance') urgency = 0.6;
    else if (rec.category === 'privacy') urgency = 0.65;
    else if (rec.category === 'storage') urgency = 0.5;
    else if (rec.category === 'startup') urgency = 0.45;
    else if (rec.category === 'browser') urgency = 0.4;
    else if (rec.category === 'duplicates') urgency = 0.35;
    else if (rec.category === 'windows') urgency = 0.5;
    else if (rec.category === 'maintenance') urgency = 0.3;
    else if (rec.category === 'automation') urgency = 0.25;

    // Evidence confidence boosts urgency
    urgency += rec.evidence.confidence * 0.1;

    return clampScore(urgency);
  }

  private _calculateEffort(rec: Recommendation): number {
    let effort = 0.5;

    const time = rec.benefits.estimatedTime;
    if (time <= 30) effort = 0.1;
    else if (time <= 60) effort = 0.2;
    else if (time <= 120) effort = 0.3;
    else if (time <= 300) effort = 0.5;
    else if (time <= 600) effort = 0.7;
    else effort = 0.9;

    // Confirmation required adds effort
    if (rec.safety.requiresConfirmation) effort += 0.1;

    // High risk adds effort
    if (rec.safety.riskLevel === 'high' || rec.safety.riskLevel === 'critical') effort += 0.15;

    return clampScore(effort);
  }
}
