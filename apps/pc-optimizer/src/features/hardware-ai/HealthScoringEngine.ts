/**
 * HealthScoringEngine — computes overall system health from component analyses.
 *
 * Aggregates per-component scores into a system-wide score with
 * weighted averaging based on component criticality.
 */
import type { ComponentAnalysis } from './types';
import type { HealthLevel } from '../hardware-center/types';

const COMPONENT_WEIGHTS: Record<string, number> = {
  cpu: 1.5,
  gpu: 1.2,
  ram: 1.3,
  storage: 1.4,
  battery: 0.8,
  network: 0.6,
  cooling: 1.1,
  operating_system: 0.7,
  motherboard: 0.5,
  power_supply: 0.5,
};

export class HealthScoringEngine {
  computeOverallScore(analyses: ComponentAnalysis[]): number {
    if (analyses.length === 0) return 100;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const analysis of analyses) {
      const weight = COMPONENT_WEIGHTS[analysis.category] ?? 1.0;
      weightedSum += analysis.healthScore * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100;
  }

  computeOverallHealth(score: number): HealthLevel {
    if (score >= 85) return 'good';
    if (score >= 65) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  computeOverallConfidence(analyses: ComponentAnalysis[]): number {
    if (analyses.length === 0) return 0;
    const sum = analyses.reduce((acc, a) => acc + a.confidence, 0);
    return sum / analyses.length;
  }

  countIssues(analyses: ComponentAnalysis[]): number {
    return analyses.reduce((acc, a) => acc + a.issues.length, 0);
  }
}
