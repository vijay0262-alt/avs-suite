/**
 * AI Predictive Health Engine — barrel exports
 *
 * EPIC 5 — AI Predictive Health
 *
 * Public API for the AI Predictive Health Engine.
 * Analyzes historical trends and forecasts future system health.
 * Every prediction is evidence-based with confidence scores.
 */

// Types
export * from './types';

// Events
export { predictionEventBus } from './PredictionEvents';

// Configuration
export { PredictionConfigurationManager } from './PredictionConfiguration';

// Core engine
export { PredictiveHealthEngine } from './PredictiveHealthEngine';

// Data collection
export { TrendRepository } from './TrendRepository';
export { TrendCollector } from './TrendCollector';

// Forecasting
export { ForecastEngine } from './ForecastEngine';
export { PredictionModel } from './PredictionModel';

// Confidence & Validation
export { ConfidenceCalculator } from './ConfidenceCalculator';
export { PredictionValidator } from './PredictionValidator';

// Domain Forecasts
export { HealthForecastEngine } from './HealthForecast';
export { StorageForecastEngine } from './StorageForecast';
export { BatteryForecastEngine } from './BatteryForecast';
export { ThermalForecastEngine } from './ThermalForecast';
export { MemoryForecastEngine } from './MemoryForecast';
export { PerformanceForecastEngine } from './PerformanceForecast';
export { ReliabilityForecastEngine } from './ReliabilityForecast';
export { FailureRiskAssessor } from './FailureRiskAssessment';

// Explanation & Recommendations
export { PredictionExplanationEngine } from './PredictionExplanationEngine';
export { PredictionRecommendationEngine } from './PredictionRecommendationEngine';

// Dashboard & History
export { PredictionDashboardProvider } from './PredictionDashboardProvider';
export { PredictionHistory } from './PredictionHistory';
