/**
 * AI Health Engine — Barrel Export
 *
 * Intelligent analysis engine that evaluates overall PC health.
 * Analysis only — never modifies the system.
 */

// Types
export type {
  HealthCategoryId,
  Severity,
  Confidence,
  CategoryResult,
  CategoryIssue,
  OverallHealthScore,
  CategoryScoreEntry,
  HealthLevel,
  LetterGrade,
  HealthInsight,
  HealthRecommendation,
  RecommendationPriority,
  RiskLevel,
  TrendAnalysis,
  CategoryTrend,
  TrendDirection,
  HealthReport,
  HealthAnalysisInput,
  CategoryWeights,
  HealthEventType,
  HealthEventPayloads,
  HealthEventListener,
  CategoryAnalyzer,
} from './types';
export {
  DEFAULT_CATEGORY_WEIGHTS,
  scoreToLevel,
  scoreToLetter,
  severityToPriority,
  clampScore,
} from './types';

// Events
export { healthEvents } from './healthEvents';

// Score Calculator
export { HealthScoreCalculator, healthScoreCalculator } from './healthScoreCalculator';

// Category Analyzers
export {
  AnalyzerRegistry,
  createDefaultRegistry,
  StorageHealthAnalyzer,
  PerformanceAnalyzer,
  MemoryUsageAnalyzer,
  StartupAnalyzer,
  BrowserHealthAnalyzer,
  PrivacyAnalyzer,
  TempFilesAnalyzer,
  RecycleBinAnalyzer,
  SystemUpdatesAnalyzer,
  DriversAnalyzer,
  SecurityAnalyzer,
} from './healthCategoryAnalyzers';

// Insight Generator
export { HealthInsightGenerator, healthInsightGenerator } from './healthInsightGenerator';

// Recommendation Engine
export { RecommendationEngine, recommendationEngine } from './recommendationEngine';

// Trend Analyzer
export { TrendAnalyzer, trendAnalyzer } from './trendAnalyzer';
export type { HealthSnapshot } from './trendAnalyzer';

// Report Builder
export { HealthReportBuilder, healthReportBuilder } from './healthReportBuilder';

// Cache
export { HealthCache, healthCache } from './healthCache';

// Main Analyzer
export { HealthAnalyzer, healthAnalyzer } from './healthAnalyzer';
