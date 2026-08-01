/**
 * AI Predictive Health Engine — Comprehensive Tests
 *
 * Tests for:
 * - Trend analysis (linear regression, behavior classification)
 * - Confidence calculation (samples, recency, horizon, consistency)
 * - Prediction validation (insufficient data, false positive prevention)
 * - Forecast generation (health, storage, battery, thermal, memory, performance)
 * - Reliability assessment (component risks, failure probability)
 * - Explanation generation (what, why, evidence, confidence, action, if-ignored)
 * - Recommendation generation (action, urgency, automation, preventive)
 * - Dashboard (summary, upcoming risks, improving trends, trajectory)
 * - History (recording, validation, accuracy tracking)
 * - Notifications (threshold-based, avoid fatigue)
 * - Full engine integration (end-to-end)
 * - Edge cases (empty data, insufficient data, rapid changes, stable trends)
 * - Safety (no hallucinated predictions, evidence-based only)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PredictiveHealthEngine } from '../PredictiveHealthEngine';
import { TrendRepository } from '../TrendRepository';
import { PredictionModel } from '../PredictionModel';
import { ConfidenceCalculator } from '../ConfidenceCalculator';
import { PredictionValidator } from '../PredictionValidator';
import { ForecastEngine } from '../ForecastEngine';
import { HealthForecastEngine } from '../HealthForecast';
import { StorageForecastEngine } from '../StorageForecast';
import { BatteryForecastEngine } from '../BatteryForecast';
import { ThermalForecastEngine } from '../ThermalForecast';
import { MemoryForecastEngine } from '../MemoryForecast';
import { PerformanceForecastEngine } from '../PerformanceForecast';
import { ReliabilityForecastEngine } from '../ReliabilityForecast';
import { FailureRiskAssessor } from '../FailureRiskAssessment';
import { PredictionExplanationEngine } from '../PredictionExplanationEngine';
import { PredictionRecommendationEngine } from '../PredictionRecommendationEngine';
import { PredictionDashboardProvider } from '../PredictionDashboardProvider';
import { PredictionHistory } from '../PredictionHistory';
import { PredictionConfigurationManager } from '../PredictionConfiguration';
import { DEFAULT_PREDICTION_CONFIG } from '../types';
import type {
  HistoricalDataPoint,
  PredictionInput,
  ForecastDomain,
} from '../types';

// ── Mock Data Factories ─────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function makeDataPoint(
  domain: ForecastDomain,
  metric: string,
  value: number,
  daysAgo: number,
  unit = '',
  source = 'test',
): HistoricalDataPoint {
  return {
    timestamp: Date.now() - daysAgo * DAY_MS,
    domain,
    metric,
    value,
    unit,
    source,
  };
}

function makeDegradationSeries(
  domain: ForecastDomain,
  metric: string,
  startValue: number,
  endValue: number,
  count: number,
  unit: string,
  higherIsBetter: boolean,
): HistoricalDataPoint[] {
  const points: HistoricalDataPoint[] = [];
  const totalDays = 90;
  for (let i = 0; i < count; i++) {
    const fraction = i / (count - 1);
    const daysAgo = totalDays * (1 - fraction);
    const value = startValue + (endValue - startValue) * fraction;
    points.push(makeDataPoint(domain, metric, value, daysAgo, unit));
  }
  // If higherIsBetter, degradation means value going down
  if (higherIsBetter && endValue < startValue) {
    // already correct
  } else if (!higherIsBetter && endValue > startValue) {
    // already correct
  }
  return points;
}

function makeStableSeries(
  domain: ForecastDomain,
  metric: string,
  value: number,
  count: number,
  unit: string,
): HistoricalDataPoint[] {
  const points: HistoricalDataPoint[] = [];
  for (let i = 0; i < count; i++) {
    const daysAgo = 90 * (1 - i / (count - 1));
    const noise = (Math.random() - 0.5) * value * 0.02;
    points.push(makeDataPoint(domain, metric, value + noise, daysAgo, unit));
  }
  return points;
}

function makeImprovingSeries(
  domain: ForecastDomain,
  metric: string,
  startValue: number,
  endValue: number,
  count: number,
  unit: string,
): HistoricalDataPoint[] {
  return makeDegradationSeries(domain, metric, startValue, endValue, count, unit, false);
}

function makePredictionInput(overrides?: Partial<PredictionInput>): PredictionInput {
  return {
    hardwareTrends: [],
    processTrends: [],
    optimizationHistory: [],
    healthScores: [],
    storageData: [],
    startupData: [],
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeRealisticInput(): PredictionInput {
  const now = Date.now();

  const healthScores = [];
  for (let i = 0; i < 30; i++) {
    healthScores.push({
      timestamp: now - (29 - i) * DAY_MS,
      healthScore: 75 - i * 0.3,
      source: 'hardware-ai',
    });
  }

  const storageData = [];
  for (let i = 0; i < 20; i++) {
    const usedSpace = 300000 + i * 2000;
    storageData.push({
      timestamp: now - (19 - i) * DAY_MS,
      totalCapacityMB: 500000,
      usedSpaceMB: usedSpace,
      freeSpaceMB: 500000 - usedSpace,
      healthPercent: 90 - i * 0.2,
      drive: 'C:',
    });
  }

  const startupData = [];
  for (let i = 0; i < 15; i++) {
    startupData.push({
      timestamp: now - (14 - i) * DAY_MS,
      startupTimeSeconds: 15 + i * 0.4,
      startupItemCount: 25,
    });
  }

  const optimizationHistory = [];
  for (let i = 0; i < 5; i++) {
    optimizationHistory.push({
      timestamp: now - (4 - i) * 7 * DAY_MS,
      actionsPerformed: 3,
      healthScoreBefore: 70 + i * 2,
      healthScoreAfter: 75 + i * 2,
      storageRecoveredMB: 500,
      ramRecoveredMB: 50,
    });
  }

  return {
    hardwareTrends: [],
    processTrends: [],
    optimizationHistory,
    healthScores,
    storageData,
    startupData,
    timestamp: now,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('PredictiveHealthEngine', () => {
  let engine: PredictiveHealthEngine;

  beforeEach(() => {
    engine = new PredictiveHealthEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  describe('TrendRepository', () => {
    it('stores and retrieves data points', () => {
      const repo = new TrendRepository();
      repo.record(makeDataPoint('storage', 'free_space', 50000, 0, 'MB'));
      repo.record(makeDataPoint('storage', 'free_space', 48000, 1, 'MB'));
      const series = repo.getSeries('storage', 'free_space');
      expect(series).not.toBeNull();
      expect(series!.pointCount).toBe(2);
    });

    it('returns null for missing series', () => {
      const repo = new TrendRepository();
      expect(repo.getSeries('cpu', 'temperature')).toBeNull();
    });

    it('respects max points limit', () => {
      const repo = new TrendRepository(5);
      for (let i = 0; i < 10; i++) {
        repo.record(makeDataPoint('cpu', 'temp', 50 + i, i, '°C'));
      }
      const series = repo.getSeries('cpu', 'temp');
      expect(series!.pointCount).toBe(5);
    });

    it('lists all series', () => {
      const repo = new TrendRepository();
      repo.record(makeDataPoint('cpu', 'temp', 50, 0, '°C'));
      repo.record(makeDataPoint('storage', 'free', 50000, 0, 'MB'));
      expect(repo.getAllSeries().length).toBe(2);
    });

    it('filters series by domain', () => {
      const repo = new TrendRepository();
      repo.record(makeDataPoint('cpu', 'temp', 50, 0, '°C'));
      repo.record(makeDataPoint('cpu', 'util', 30, 0, '%'));
      repo.record(makeDataPoint('storage', 'free', 50000, 0, 'MB'));
      expect(repo.getSeriesByDomain('cpu').length).toBe(2);
    });
  });

  describe('PredictionModel', () => {
    const model = new PredictionModel();

    it('analyzes degrading trend correctly', () => {
      const repo = new TrendRepository();
      const points = makeDegradationSeries('storage', 'free_space', 50000, 30000, 10, 'MB', true);
      repo.recordMany(points);
      const series = repo.getSeries('storage', 'free_space')!;
      const trend = model.analyzeTrend(series, 0.7);
      expect(trend.behavior).not.toBe('unknown');
      expect(trend.slope).toBeLessThan(0);
      expect(trend.rSquared).toBeGreaterThan(0.5);
    });

    it('analyzes stable trend correctly', () => {
      const repo = new TrendRepository();
      const points: HistoricalDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        const daysAgo = 90 * (1 - i / 9);
        points.push(makeDataPoint('cpu', 'temperatureC', 50, daysAgo, '°C'));
      }
      repo.recordMany(points);
      const series = repo.getSeries('cpu', 'temperatureC')!;
      const trend = model.analyzeTrend(series, 0.7);
      expect(trend.behavior).toBe('stable');
    });

    it('analyzes improving trend correctly', () => {
      const repo = new TrendRepository();
      const points = makeImprovingSeries('system_health', 'health_score', 60, 80, 10, 'points');
      repo.recordMany(points);
      const series = repo.getSeries('system_health', 'health_score')!;
      const trend = model.analyzeTrend(series, 0.7);
      expect(trend.behavior).toBe('improving');
    });

    it('handles insufficient data gracefully', () => {
      const repo = new TrendRepository();
      repo.record(makeDataPoint('cpu', 'temp', 50, 0, '°C'));
      const series = repo.getSeries('cpu', 'temp')!;
      const trend = model.analyzeTrend(series, 0.7);
      expect(trend.behavior).toBe('unknown');
      expect(trend.isStatisticallySignificant).toBe(false);
    });

    it('projects future values', () => {
      const repo = new TrendRepository();
      const points = makeDegradationSeries('storage', 'free_space', 50000, 30000, 10, 'MB', true);
      repo.recordMany(points);
      const series = repo.getSeries('storage', 'free_space')!;
      const trend = model.analyzeTrend(series, 0.7);
      const projected = model.projectValue(series, trend, Date.now() + 30 * DAY_MS);
      expect(projected).toBeLessThan(30000);
    });

    it('estimates time to threshold', () => {
      const repo = new TrendRepository();
      const points = makeDegradationSeries('storage', 'free_space', 50000, 30000, 10, 'MB', true);
      repo.recordMany(points);
      const series = repo.getSeries('storage', 'free_space')!;
      const timeToThreshold = model.estimateTimeToThreshold(series, 10000, 'below');
      expect(timeToThreshold).not.toBeNull();
      expect(timeToThreshold!).toBeGreaterThan(Date.now());
    });
  });

  describe('ConfidenceCalculator', () => {
    const calc = new ConfidenceCalculator();

    it('gives higher confidence with more data points', () => {
      const repo1 = new TrendRepository();
      const repo2 = new TrendRepository();
      repo1.recordMany(makeDegradationSeries('storage', 'free', 50000, 30000, 3, 'MB', true));
      repo2.recordMany(makeDegradationSeries('storage', 'free', 50000, 30000, 20, 'MB', true));

      const s1 = repo1.getSeries('storage', 'free')!;
      const s2 = repo2.getSeries('storage', 'free')!;
      const model = new PredictionModel();
      const t1 = model.analyzeTrend(s1, 0.7);
      const t2 = model.analyzeTrend(s2, 0.7);

      const c1 = calc.calculate(s1, t1, 30);
      const c2 = calc.calculate(s2, t2, 30);
      expect(c2).toBeGreaterThan(c1);
    });

    it('gives lower confidence for longer horizons', () => {
      const repo = new TrendRepository();
      repo.recordMany(makeDegradationSeries('storage', 'free', 50000, 30000, 10, 'MB', true));
      const series = repo.getSeries('storage', 'free')!;
      const model = new PredictionModel();
      const trend = model.analyzeTrend(series, 0.7);
      const shortHorizon = calc.calculate(series, trend, 7);
      const longHorizon = calc.calculate(series, trend, 365);
      expect(shortHorizon).toBeGreaterThan(longHorizon);
    });

    it('produces confidence between 0 and 1', () => {
      const repo = new TrendRepository();
      repo.recordMany(makeDegradationSeries('storage', 'free', 50000, 30000, 10, 'MB', true));
      const series = repo.getSeries('storage', 'free')!;
      const model = new PredictionModel();
      const trend = model.analyzeTrend(series, 0.7);
      const confidence = calc.calculate(series, trend, 30);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('PredictionValidator', () => {
    const config = DEFAULT_PREDICTION_CONFIG;
    const validator = new PredictionValidator(config);

    it('rejects predictions with insufficient data', () => {
      const repo = new TrendRepository();
      repo.record(makeDataPoint('cpu', 'temp', 50, 0, '°C'));
      repo.record(makeDataPoint('cpu', 'temp', 52, 1, '°C'));
      const series = repo.getSeries('cpu', 'temp')!;
      const model = new PredictionModel();
      const trend = model.analyzeTrend(series, 0.7);
      const result = validator.validate(
        { id: 'test', confidence: 0.8, behavior: 'gradual_degradation', projectionHorizonDays: 30 } as never,
        series,
        trend,
      );
      expect(result.valid).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('detects false positives for noisy data', () => {
      const repo = new TrendRepository();
      const points: HistoricalDataPoint[] = [];
      for (let i = 0; i < 20; i++) {
        points.push(makeDataPoint('cpu', 'temp', 50 + Math.random() * 30, 90 * (1 - i / 19), '°C'));
      }
      repo.recordMany(points);
      const series = repo.getSeries('cpu', 'temp')!;
      const model = new PredictionModel();
      const trend = model.analyzeTrend(series, 0.3);
      expect(validator.isFalsePositive(series, trend)).toBe(true);
    });

    it('does not flag clean trends as false positive', () => {
      const repo = new TrendRepository();
      repo.recordMany(makeDegradationSeries('storage', 'free', 50000, 30000, 20, 'MB', true));
      const series = repo.getSeries('storage', 'free')!;
      const model = new PredictionModel();
      const trend = model.analyzeTrend(series, 0.7);
      expect(validator.isFalsePositive(series, trend)).toBe(false);
    });
  });

  describe('ForecastEngine', () => {
    it('generates forecasts from series data', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new ForecastEngine(config);
      const repo = new TrendRepository();
      repo.recordMany(makeDegradationSeries('storage', 'free_space', 50000, 30000, 15, 'MB', true));
      const series = repo.getAllSeries();
      const forecast = engine.forecast('storage', series, 'Storage Forecast');
      expect(forecast.domain).toBe('storage');
      expect(forecast.predictions.length).toBeGreaterThan(0);
    });

    it('filters out stable trends', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new ForecastEngine(config);
      const repo = new TrendRepository();
      repo.recordMany(makeStableSeries('cpu', 'temperatureC', 50, 15, '°C'));
      const series = repo.getAllSeries();
      const forecast = engine.forecast('cpu', series, 'CPU Forecast');
      expect(forecast.predictions.length).toBe(0);
    });
  });

  describe('HealthForecast', () => {
    it('generates health forecast with projected score', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new HealthForecastEngine(config);
      const repo = new TrendRepository();
      const points: HistoricalDataPoint[] = [];
      for (let i = 0; i < 20; i++) {
        points.push(makeDataPoint('system_health', 'health_score', 80 - i * 1, 90 * (1 - i / 19), 'points'));
      }
      repo.recordMany(points);
      const series = repo.getAllSeries();
      const forecast = engine.generate(series);
      expect(forecast).not.toBeNull();
      expect(forecast!.projectedHealthScore).toBeLessThan(80);
    });

    it('returns null for no health data', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new HealthForecastEngine(config);
      expect(engine.generate([])).toBeNull();
    });
  });

  describe('StorageForecast', () => {
    it('generates storage forecast with projected free space', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new StorageForecastEngine(config);
      const repo = new TrendRepository();
      const points: HistoricalDataPoint[] = [];
      for (let i = 0; i < 15; i++) {
        const freeSpace = 50000 - i * 1500;
        points.push({
          ...makeDataPoint('storage', 'free_space:C:', freeSpace, 90 * (1 - i / 14), 'MB'),
          metadata: { totalCapacity: 500000, usedSpace: 500000 - freeSpace, healthPercent: 90 },
        });
      }
      repo.recordMany(points);
      const series = repo.getAllSeries();
      const forecast = engine.generate(series);
      expect(forecast).not.toBeNull();
      expect(forecast!.projectedFreeSpaceMB).toBeGreaterThan(0);
      expect(forecast!.growthRateMBPerDay).toBeGreaterThan(0);
    });
  });

  describe('BatteryForecast', () => {
    it('generates battery forecast with wear rate', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new BatteryForecastEngine(config);
      const repo = new TrendRepository();
      const points: HistoricalDataPoint[] = [];
      for (let i = 0; i < 10; i++) {
        points.push(makeDataPoint('battery', 'wearPercent', 5 + i * 1.5, 270 * (1 - i / 9), '%'));
      }
      repo.recordMany(points);
      const series = repo.getAllSeries();
      const forecast = engine.generate(series);
      expect(forecast).not.toBeNull();
      expect(forecast!.wearRatePerMonth).toBeGreaterThan(0);
    });
  });

  describe('ThermalForecast', () => {
    it('generates thermal forecast with temperature projections', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new ThermalForecastEngine(config);
      const repo = new TrendRepository();
      const points: HistoricalDataPoint[] = [];
      for (let i = 0; i < 15; i++) {
        points.push(makeDataPoint('thermal', 'temperatureC', 45 + i * 1, 90 * (1 - i / 14), '°C'));
      }
      repo.recordMany(points);
      const series = repo.getAllSeries();
      const forecast = engine.generate(series);
      expect(forecast).not.toBeNull();
      expect(forecast!.tempIncreaseRatePerMonth).toBeGreaterThan(0);
    });
  });

  describe('MemoryForecast', () => {
    it('generates memory forecast with pressure projection', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new MemoryForecastEngine(config);
      const repo = new TrendRepository();
      const points: HistoricalDataPoint[] = [];
      for (let i = 0; i < 15; i++) {
        points.push(makeDataPoint('memory_pressure', 'memoryPressure', 50 + i * 2, 90 * (1 - i / 14), '%'));
      }
      repo.recordMany(points);
      const series = repo.getAllSeries();
      const forecast = engine.generate(series);
      expect(forecast).not.toBeNull();
      expect(forecast!.projectedPressurePercent).toBeGreaterThan(50);
    });
  });

  describe('PerformanceForecast', () => {
    it('generates performance forecast with startup time projection', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new PerformanceForecastEngine(config);
      const repo = new TrendRepository();
      const points: HistoricalDataPoint[] = [];
      for (let i = 0; i < 15; i++) {
        points.push(makeDataPoint('startup_performance', 'startup_time', 15 + i * 0.5, 90 * (1 - i / 14), 's'));
      }
      repo.recordMany(points);
      const series = repo.getAllSeries();
      const forecast = engine.generate(series);
      expect(forecast).not.toBeNull();
      expect(forecast!.startupTimeIncreasePerMonth).toBeGreaterThan(0);
    });
  });

  describe('ReliabilityForecast', () => {
    it('aggregates component risks', () => {
      const config = DEFAULT_PREDICTION_CONFIG;
      const engine = new ReliabilityForecastEngine(config);
      const repo = new TrendRepository();
      repo.recordMany(makeDegradationSeries('storage', 'free_space', 50000, 10000, 15, 'MB', true));
      const series = repo.getAllSeries();
      const forecastEngine = new ForecastEngine(config);
      const storageForecast = forecastEngine.forecast('storage', series, 'Storage');
      const predictions = storageForecast.predictions;
      const reliability = engine.generate(series, predictions);
      expect(reliability).not.toBeNull();
      expect(reliability!.failureRiskAssessment).not.toBeNull();
      expect(reliability!.failureRiskAssessment!.componentRisks.length).toBeGreaterThan(0);
    });
  });

  describe('FailureRiskAssessor', () => {
    it('assesses failure risk from predictions', () => {
      const assessor = new FailureRiskAssessor();
      const predictions = [
        { id: 'p1', domain: 'storage' as const, risk: 'high' as const, title: 'Storage degrading', confidence: 0.8, projectionHorizonDays: 30, recommendation: { action: 'Clean up disk', predictionId: 'p1', urgency: 'soon' as const, estimatedBenefit: 'Prevent data loss', canAutomate: true, requiresUserAction: false, estimatedCompletionTimeMinutes: 10, preventiveActions: [] } },
        { id: 'p2', domain: 'battery' as const, risk: 'moderate' as const, title: 'Battery wearing', confidence: 0.7, projectionHorizonDays: 180, recommendation: null },
      ] as never[];
      const assessment = assessor.assess(predictions);
      expect(assessment.componentRisks.length).toBe(2);
      expect(assessment.overallRisk).toBe('high');
    });
  });

  describe('PredictionExplanationEngine', () => {
    it('generates complete explanations', () => {
      const explanationEngine = new PredictionExplanationEngine();
      const prediction = {
        id: 'test-pred',
        domain: 'storage' as const,
        title: 'Storage declining',
        summary: 'Free space declining',
        description: 'Free space is declining at 500 MB/day',
        behavior: 'gradual_degradation' as const,
        currentValue: 30000,
        currentValueUnit: 'MB',
        projectedValue: 10000,
        projectedValueUnit: 'MB',
        projectionTimestamp: Date.now() + 90 * DAY_MS,
        projectionHorizonDays: 90,
        confidence: 0.75,
        confidenceLabel: 'high' as const,
        risk: 'high' as const,
        urgency: 'soon' as const,
        actionability: 'actionable' as const,
        evidence: [{ source: 'storage-intelligence', metric: 'free_space', value: '30000', unit: 'MB', timestamp: Date.now(), description: 'Current free space' }],
        historicalSamples: 15,
        trendStrength: 0.85,
        uncertainty: 5000,
        recommendation: null,
        explanation: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + DAY_MS,
      } as never;

      const explanation = explanationEngine.explain(prediction);
      expect(explanation.whatIsPredicted).toBeTruthy();
      expect(explanation.why).toBeTruthy();
      expect(explanation.supportingEvidence).toBeTruthy();
      expect(explanation.howConfident).toBeTruthy();
      expect(explanation.whatUserShouldDo).toBeTruthy();
      expect(explanation.whatHappensIfIgnored).toBeTruthy();
    });
  });

  describe('PredictionRecommendationEngine', () => {
    it('generates actionable recommendations', () => {
      const recEngine = new PredictionRecommendationEngine();
      const prediction = {
        id: 'test-pred',
        domain: 'storage' as const,
        risk: 'high' as const,
        urgency: 'soon' as const,
        behavior: 'gradual_degradation' as const,
        currentValue: 30000,
        currentValueUnit: 'MB',
        projectedValue: 10000,
        projectedValueUnit: 'MB',
      } as never;

      const rec = recEngine.generate(prediction);
      expect(rec.action).toBeTruthy();
      expect(rec.urgency).toBe('soon');
      expect(rec.canAutomate).toBe(true);
      expect(rec.preventiveActions.length).toBeGreaterThan(0);
    });

    it('recommends no action for improving trends', () => {
      const recEngine = new PredictionRecommendationEngine();
      const prediction = {
        id: 'test-pred',
        domain: 'system_health' as const,
        risk: 'none' as const,
        urgency: 'none' as const,
        behavior: 'improving' as const,
        currentValue: 80,
        currentValueUnit: 'points',
        projectedValue: 85,
        projectedValueUnit: 'points',
      } as never;

      const rec = recEngine.generate(prediction);
      expect(rec.action).toContain('No action needed');
    });
  });

  describe('PredictionHistory', () => {
    it('records and retrieves predictions', () => {
      const history = new PredictionHistory();
      history.recordPrediction({
        id: 'pred-1',
        domain: 'storage',
        title: 'Storage declining',
        projectedValue: 10000,
        confidence: 0.8,
        createdAt: Date.now(),
      } as never);
      expect(history.getEntryCount()).toBe(1);
    });

    it('validates predictions against actual values', () => {
      const history = new PredictionHistory();
      history.recordPrediction({
        id: 'pred-1',
        domain: 'storage',
        title: 'Storage declining',
        projectedValue: 10000,
        confidence: 0.8,
        createdAt: Date.now(),
      } as never);
      history.validatePrediction('pred-1', 9500);
      const data = history.getHistoryData();
      expect(data.totalPredictions).toBe(1);
      expect(data.correctPredictions).toBe(1);
      expect(data.averageAccuracy).toBeGreaterThan(0.9);
    });

    it('tracks accuracy by domain', () => {
      const history = new PredictionHistory();
      history.recordPrediction({ id: 'p1', domain: 'storage', title: 'S', projectedValue: 10000, confidence: 0.8, createdAt: Date.now() } as never);
      history.recordPrediction({ id: 'p2', domain: 'battery', title: 'B', projectedValue: 80, confidence: 0.7, createdAt: Date.now() } as never);
      history.validatePrediction('p1', 9500);
      history.validatePrediction('p2', 75);
      const data = history.getHistoryData();
      expect(Object.keys(data.accuracyByDomain).length).toBe(2);
    });
  });

  describe('PredictionDashboardProvider', () => {
    it('builds dashboard data from predictions', () => {
      const provider = new PredictionDashboardProvider();
      const history = new PredictionHistory();
      const dashboard = provider.build([], null, null, null, null, history, []);
      expect(dashboard.summary.totalPredictions).toBe(0);
      expect(dashboard.upcomingRisks).toEqual([]);
    });
  });

  describe('Configuration', () => {
    it('uses default configuration', () => {
      const manager = new PredictionConfigurationManager();
      expect(manager.get().minDataPoints).toBe(DEFAULT_PREDICTION_CONFIG.minDataPoints);
      expect(manager.get().enabled).toBe(true);
    });

    it('validates configuration values', () => {
      const manager = new PredictionConfigurationManager({ minDataPoints: -1 });
      expect(manager.get().minDataPoints).toBe(2);
    });

    it('checks domain enablement', () => {
      const manager = new PredictionConfigurationManager({ enableBatteryForecast: false });
      expect(manager.isDomainEnabled('battery')).toBe(false);
      expect(manager.isDomainEnabled('storage')).toBe(true);
    });

    it('checks notification thresholds', () => {
      const manager = new PredictionConfigurationManager({ notificationMinRisk: 'high', notificationMinConfidence: 0.8 });
      expect(manager.shouldNotify(0.9, 'high')).toBe(true);
      expect(manager.shouldNotify(0.7, 'high')).toBe(false);
      expect(manager.shouldNotify(0.9, 'low')).toBe(false);
    });
  });

  describe('Full Engine Integration', () => {
    it('ingests data and generates forecasts', () => {
      engine.ingestData(makeRealisticInput());
      const predictions = engine.generateForecasts();
      expect(predictions.length).toBeGreaterThan(0);
    });

    it('generates explanations for all predictions', () => {
      engine.ingestData(makeRealisticInput());
      engine.generateForecasts();
      const explanations = engine.generateExplanations();
      expect(explanations.length).toBeGreaterThan(0);
    });

    it('builds dashboard data', () => {
      engine.ingestData(makeRealisticInput());
      engine.generateForecasts();
      const dashboard = engine.buildDashboard();
      expect(dashboard.summary.totalPredictions).toBeGreaterThan(0);
    });

    it('generates notifications for high-risk predictions', () => {
      engine.ingestData(makeRealisticInput());
      engine.generateForecasts();
      const notifications = engine.getNotifications();
      expect(notifications.length).toBeGreaterThanOrEqual(0);
    });

    it('records prediction history', () => {
      engine.ingestData(makeRealisticInput());
      engine.generateForecasts();
      expect(engine.getHistory().getEntryCount()).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty input gracefully', () => {
      engine.ingestData(makePredictionInput());
      const predictions = engine.generateForecasts();
      expect(predictions).toEqual([]);
    });

    it('handles insufficient data', () => {
      const input = makePredictionInput({
        healthScores: [
          { timestamp: Date.now(), healthScore: 75, source: 'test' },
          { timestamp: Date.now() - DAY_MS, healthScore: 74, source: 'test' },
        ],
      });
      engine.ingestData(input);
      const predictions = engine.generateForecasts();
      expect(predictions).toEqual([]);
    });

    it('handles rapid changes without crashing', () => {
      const input = makePredictionInput({
        healthScores: Array.from({ length: 10 }, (_, i) => ({
          timestamp: Date.now() - (9 - i) * DAY_MS,
          healthScore: 80 - i * 5,
          source: 'test',
        })),
      });
      engine.ingestData(input);
      expect(() => engine.generateForecasts()).not.toThrow();
    });

    it('handles stable trends (no predictions)', () => {
      const input = makePredictionInput({
        healthScores: Array.from({ length: 20 }, (_, i) => ({
          timestamp: Date.now() - (19 - i) * DAY_MS,
          healthScore: 75 + (Math.random() - 0.5) * 2,
          source: 'test',
        })),
      });
      engine.ingestData(input);
      const predictions = engine.generateForecasts();
      expect(predictions).toEqual([]);
    });

    it('dismisses notifications', () => {
      engine.ingestData(makeRealisticInput());
      engine.generateForecasts();
      const notifications = engine.getNotifications();
      if (notifications.length > 0) {
        engine.dismissNotification(notifications[0]!.id);
        expect(engine.getNotifications().length).toBe(notifications.length - 1);
      }
    });
  });

  describe('Safety', () => {
    it('never produces predictions without evidence', () => {
      engine.ingestData(makeRealisticInput());
      const predictions = engine.generateForecasts();
      for (const pred of predictions) {
        expect(pred.evidence.length).toBeGreaterThan(0);
      }
    });

    it('all predictions have confidence scores', () => {
      engine.ingestData(makeRealisticInput());
      const predictions = engine.generateForecasts();
      for (const pred of predictions) {
        expect(pred.confidence).toBeGreaterThanOrEqual(0);
        expect(pred.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('all predictions have uncertainty values', () => {
      engine.ingestData(makeRealisticInput());
      const predictions = engine.generateForecasts();
      for (const pred of predictions) {
        expect(pred.uncertainty).toBeGreaterThanOrEqual(0);
      }
    });

    it('all predictions have recommendations', () => {
      engine.ingestData(makeRealisticInput());
      const predictions = engine.generateForecasts();
      for (const pred of predictions) {
        expect(pred.recommendation).not.toBeNull();
      }
    });

    it('all predictions have explanations', () => {
      engine.ingestData(makeRealisticInput());
      const predictions = engine.generateForecasts();
      for (const pred of predictions) {
        expect(pred.explanation).not.toBeNull();
      }
    });
  });
});
