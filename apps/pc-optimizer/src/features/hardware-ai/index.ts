/**
 * Hardware AI Engine — barrel exports
 *
 * Public API for the AI Hardware Health Engine.
 * Consume HardwareSnapshot data and produce human-readable insights,
 * recommendations, risk assessments, and trend analysis.
 */

// Types
export * from './types';

// Events
export { hardwareAIEventBus } from './HardwareAIEvents';

// Core engine
export { HardwareAIEngine } from './HardwareAIEngine';

// Analyzers
export {
  CPUAnalyzer,
  GPUAnalyzer,
  MemoryAnalyzer,
  StorageAnalyzer,
  BatteryAnalyzer,
  NetworkAnalyzer,
  CoolingAnalyzer,
  ThermalAnalyzer,
  PowerAnalyzer,
  BaseAnalyzer,
} from './HardwareAnalyzers';
export { HardwareAnalyzer } from './HardwareAnalyzer';

// Scoring & trends
export { HealthScoringEngine } from './HealthScoringEngine';
export { TrendAnalyzer } from './TrendAnalyzer';
export { HardwareTrendHistory } from './HardwareTrendHistory';

// Insights & recommendations
export { HardwareInsightBuilder } from './HardwareInsightBuilder';
export { HardwareRecommendationEngine } from './HardwareRecommendationEngine';
export { HardwareRiskAssessmentEngine } from './HardwareRiskAssessment';

// Explanation
export { HardwareExplanationEngine } from './HardwareExplanationEngine';
