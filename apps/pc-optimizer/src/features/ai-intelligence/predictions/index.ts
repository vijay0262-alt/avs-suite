/**
 * AI Prediction Engine — Barrel Export.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every prediction must be
 *    evidence-based, traceable back to historical data and trend analysis,
 *    with a confidence score."
 *
 * The Prediction Engine forecasts future system behavior using historical
 * context and trend analysis. It NEVER executes optimizations. It NEVER
 * modifies the system. It ONLY predicts future trends.
 *
 * Pipeline:
 *   History → Knowledge → Trend Analysis → Prediction Engine →
 *   Predictions → Future Consumers (Dashboard, AI Assistant, Automation,
 *   Reports, Notifications)
 *
 * It does NOT perform AI learning.
 * It does NOT execute optimizations.
 * It ONLY predicts future trends using historical data.
 */

// Types
export type {
  PredictionType,
  PredictionCategory,
  TimeHorizon,
  TimeHorizonConfig,
  PredictionTrendType,
  RiskLevel,
  ImpactLevel,
  PredictionStatus,
  PredictionEvidence,
  Prediction,
  PredictionList,
  PredictionListMetadata,
  PredictionStatistics,
  PredictionValidationIssue,
  PredictionValidationResult,
  PredictionFilter,
  PredictionTimelinePeriod,
  PredictionTimelineEntry,
  PredictionTimeline,
  PredictionHistoryEntry,
  PredictionAccuracyRecord,
  ConfidenceRules,
  RiskRules,
  ExpirationConfig,
  ModelSettings,
  PredictionConfiguration,
  PredictionEventType,
  PredictionEventListener,
  PredictionProviderPlugin,
  TrendAnalysisResult,
  ProjectedValue,
  PersonalizationContext,
} from './types';

export {
  generatePredictionId,
  generatePredictionListId,
  generatePredictionTimelineEntryId,
  generatePredictionHistoryId,
  generateAccuracyRecordId,
  clampScore,
  createPredictionEvidence,
  getTimeHorizonHours,
  getTimeHorizonLabel,
  formatDateForHorizon,
} from './types';

// Events
export { PredictionEventEmitter, predictionEvents } from './predictionEvents';

// Configuration
export { DEFAULT_PREDICTION_CONFIG, DEFAULT_TIME_HORIZONS, createPredictionConfig } from './predictionConfiguration';

// Registry
export { PredictionRegistry } from './predictionRegistry';

// Analyzer
export { PredictionAnalyzer } from './predictionAnalyzer';

// Model
export { PredictionModel } from './predictionModel';

// Validator
export { PredictionValidator } from './predictionValidator';

// Timeline
export { PredictionTimelineManager } from './predictionTimeline';

// History
export { PredictionHistory } from './predictionHistory';

// Engine
export { PredictionEngine } from './predictionEngine';

// Builder
export { PredictionBuilder } from './predictionBuilder';

// Manager
export { PredictionManager, predictionManager } from './predictionManager';
