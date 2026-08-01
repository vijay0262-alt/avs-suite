/**
 * ThreatConfiguration — manages investigation engine configuration.
 */
import type { InvestigationConfiguration } from './types';
import { DEFAULT_INVESTIGATION_CONFIG } from './types';

export class ThreatConfigurationManager {
  private config: InvestigationConfiguration;

  constructor(overrides?: Partial<InvestigationConfiguration>) {
    this.config = { ...DEFAULT_INVESTIGATION_CONFIG, ...overrides };
    this.validate();
  }

  get(): InvestigationConfiguration {
    return { ...this.config };
  }

  update(updates: Partial<InvestigationConfiguration>): void {
    this.config = { ...this.config, ...updates };
    this.validate();
  }

  reset(): void {
    this.config = { ...DEFAULT_INVESTIGATION_CONFIG };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isCorrelationEnabled(): boolean {
    return this.config.enableCorrelation;
  }

  isTimelineEnabled(): boolean {
    return this.config.enableTimeline;
  }

  isKnowledgeBaseEnabled(): boolean {
    return this.config.enableKnowledgeBase;
  }

  isFalsePositiveAnalysisEnabled(): boolean {
    return this.config.enableFalsePositiveAnalysis;
  }

  isContextualAnalysisEnabled(): boolean {
    return this.config.enableContextualAnalysis;
  }

  isReportsEnabled(): boolean {
    return this.config.enableReports;
  }

  isVisualizationEnabled(): boolean {
    return this.config.enableVisualization;
  }

  getMinConfidenceThreshold(): number {
    return this.config.minConfidenceThreshold;
  }

  getCorrelationTimeWindow(): number {
    return this.config.correlationTimeWindow;
  }

  getMaxInvestigations(): number {
    return this.config.maxInvestigations;
  }

  private validate(): void {
    if (this.config.minConfidenceThreshold < 0 || this.config.minConfidenceThreshold > 1) {
      throw new Error('minConfidenceThreshold must be between 0 and 1');
    }
    if (this.config.maxInvestigations < 1) {
      throw new Error('maxInvestigations must be at least 1');
    }
    if (this.config.correlationTimeWindow < 0) {
      throw new Error('correlationTimeWindow must be non-negative');
    }
  }
}
