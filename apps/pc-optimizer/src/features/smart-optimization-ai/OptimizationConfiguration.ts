/**
 * OptimizationConfiguration — manages optimization engine configuration.
 *
 * Provides safe defaults and validation. Configuration controls risk
 * tolerance, action limits, rollback, learning, and more.
 */
import {
  DEFAULT_OPTIMIZATION_CONFIG,
  type OptimizationConfiguration,
  type RiskLevel,
  type OptimizationCategory,
  type OptimizationStyle,
} from './types';

const RISK_ORDER: RiskLevel[] = ['none', 'low', 'moderate', 'high', 'severe'];

export class OptimizationConfigurationManager {
  private config: OptimizationConfiguration;

  constructor(config?: Partial<OptimizationConfiguration>) {
    this.config = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };
    this.validate();
  }

  get(): OptimizationConfiguration {
    return { ...this.config };
  }

  update(updates: Partial<OptimizationConfiguration>): void {
    this.config = { ...this.config, ...updates };
    this.validate();
  }

  setRiskTolerance(risk: RiskLevel): void {
    this.config.riskTolerance = risk;
  }

  setPreferredStyle(style: OptimizationStyle): void {
    this.config.preferredStyle = style;
  }

  excludeCategory(category: OptimizationCategory): void {
    if (!this.config.excludedCategories.includes(category)) {
      this.config.excludedCategories = [...this.config.excludedCategories, category];
    }
  }

  includeCategory(category: OptimizationCategory): void {
    this.config.excludedCategories = this.config.excludedCategories.filter((c) => c !== category);
  }

  isCategoryExcluded(category: OptimizationCategory): boolean {
    return this.config.excludedCategories.includes(category);
  }

  isRiskAcceptable(risk: RiskLevel): boolean {
    const toleratedIndex = RISK_ORDER.indexOf(this.config.riskTolerance);
    const riskIndex = RISK_ORDER.indexOf(risk);
    return riskIndex <= toleratedIndex;
  }

  isConfidenceAcceptable(confidence: number): boolean {
    return confidence >= this.config.minConfidence;
  }

  private validate(): void {
    if (this.config.maxActions < 1) this.config.maxActions = 1;
    if (this.config.maxHighImpactActions < 0) this.config.maxHighImpactActions = 0;
    if (this.config.minConfidence < 0) this.config.minConfidence = 0;
    if (this.config.minConfidence > 1) this.config.minConfidence = 1;
    if (this.config.planExpiryMinutes < 1) this.config.planExpiryMinutes = 1;
    if (this.config.thresholds.highImpactScore < 0) this.config.thresholds.highImpactScore = 0;
    if (this.config.thresholds.maxRiskScore < 0) this.config.thresholds.maxRiskScore = 0;
  }
}
