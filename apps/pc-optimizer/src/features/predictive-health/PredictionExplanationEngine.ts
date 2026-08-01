/**
 * PredictionExplanationEngine — generates human-readable explanations
 * for every prediction.
 *
 * Every explanation answers:
 *   - What is predicted?
 *   - Why?
 *   - Supporting evidence?
 *   - How confident?
 *   - What the user should do?
 *   - What happens if ignored?
 *
 * Never invents information. All explanations are derived from
 * the prediction's evidence and analysis.
 */
import type { Prediction, PredictionExplanation, ForecastDomain, PredictionRisk } from './types';

export class PredictionExplanationEngine {
  explain(prediction: Prediction): PredictionExplanation {
    return {
      predictionId: prediction.id,
      whatIsPredicted: this.explainWhat(prediction),
      why: this.explainWhy(prediction),
      supportingEvidence: this.explainEvidence(prediction),
      howConfident: this.explainConfidence(prediction),
      whatUserShouldDo: this.explainAction(prediction),
      whatHappensIfIgnored: this.explainIfIgnored(prediction),
      uncertaintyFactors: this.explainUncertainty(prediction),
    };
  }

  explainAll(predictions: Prediction[]): PredictionExplanation[] {
    return predictions.map((p) => this.explain(p));
  }

  private explainWhat(p: Prediction): string {
    const domainLabel = p.domain.replace(/_/g, ' ');
    return `Based on ${p.historicalSamples} data points, ${domainLabel} ${p.behavior.replace(/_/g, ' ')} is projected. ` +
      `Current value: ${p.currentValue.toFixed(1)}${p.currentValueUnit}. ` +
      `Projected value: ${p.projectedValue.toFixed(1)}${p.projectedValueUnit} within ${p.projectionHorizonDays} days.`;
  }

  private explainWhy(p: Prediction): string {
    const direction = p.behavior === 'improving' ? 'improving'
      : p.behavior === 'gradual_degradation' ? 'gradually declining'
      : p.behavior === 'rapid_degradation' ? 'rapidly declining'
      : 'changing';

    return `The ${p.domain.replace(/_/g, ' ')} trend is ${direction}. ` +
      `Trend strength (R²) is ${p.trendStrength.toFixed(3)}, indicating ${p.trendStrength > 0.7 ? 'strong' : p.trendStrength > 0.5 ? 'moderate' : 'weak'} correlation. ` +
      `Observed change: ${((p.projectedValue - p.currentValue) / Math.max(1, Math.abs(p.currentValue)) * 100).toFixed(1)}% projected over the prediction horizon.`;
  }

  private explainEvidence(p: Prediction): string {
    if (p.evidence.length === 0) return 'No supporting evidence available.';
    const recent = p.evidence.slice(0, 3);
    const descriptions = recent.map((e) => `${e.description} (source: ${e.source})`);
    return `Supporting evidence (${p.evidence.length} data points): ${descriptions.join('; ')}.`;
  }

  private explainConfidence(p: Prediction): string {
    const label = p.confidenceLabel.replace(/_/g, ' ');
    return `Confidence: ${(p.confidence * 100).toFixed(0)}% (${label}). ` +
      `Based on ${p.historicalSamples} historical samples with trend strength R²=${p.trendStrength.toFixed(3)}. ` +
      `Uncertainty range: ±${p.uncertainty.toFixed(1)}${p.projectedValueUnit}.`;
  }

  private explainAction(p: Prediction): string {
    if (p.recommendation) return p.recommendation.action;
    if (p.behavior === 'improving') return 'No action needed — the trend is improving. Continue regular monitoring.';
    if (p.risk === 'none' || p.risk === 'low') return 'Monitor the trend. No immediate action required.';
    if (p.risk === 'moderate') return 'Consider preventive action within the next few weeks.';
    if (p.risk === 'high' || p.risk === 'severe') return 'Immediate attention recommended. Review the prediction details and take preventive action.';
    return 'Continue monitoring.';
  }

  private explainIfIgnored(p: Prediction): string {
    return this.getIgnoredConsequence(p.domain, p.risk, p.projectedValue, p.projectedValueUnit);
  }

  private getIgnoredConsequence(
    domain: ForecastDomain,
    risk: PredictionRisk,
    _projectedValue: number,
    _unit: string,
  ): string {
    if (risk === 'none' || risk === 'low') {
      return 'If ignored, the trend may continue but is unlikely to cause immediate issues.';
    }

    switch (domain) {
      case 'storage':
        return `If ignored, available storage may fall below critical levels, potentially causing system instability, failed updates, and data loss.`;
      case 'battery':
        return `If ignored, battery health may continue to decline, reducing battery life and eventually requiring battery replacement.`;
      case 'thermal':
        return `If ignored, rising temperatures may lead to thermal throttling, reduced performance, and potential hardware damage.`;
      case 'memory_pressure':
        return `If ignored, memory pressure may worsen, causing application crashes, system slowdowns, and reduced responsiveness.`;
      case 'system_health':
        return `If ignored, overall system health may decline, leading to reduced performance and increased risk of failures.`;
      case 'startup_performance':
        return `If ignored, startup time may continue to increase, delaying system availability after boot.`;
      case 'reliability':
        return `If ignored, system reliability may degrade, increasing the risk of unexpected failures and data loss.`;
      default:
        return `If ignored, the projected trend may continue, potentially leading to degraded performance or functionality.`;
    }
  }

  private explainUncertainty(p: Prediction): string[] {
    const factors: string[] = [];
    if (p.historicalSamples < 10) factors.push(`Limited historical data (${p.historicalSamples} samples)`);
    if (p.trendStrength < 0.7) factors.push(`Moderate trend strength (R²=${p.trendStrength.toFixed(3)})`);
    if (p.projectionHorizonDays > 90) factors.push(`Long prediction horizon (${p.projectionHorizonDays} days)`);
    if (p.uncertainty > Math.abs(p.projectedValue) * 0.2) factors.push(`High uncertainty (±${p.uncertainty.toFixed(1)}${p.projectedValueUnit})`);
    return factors;
  }
}
