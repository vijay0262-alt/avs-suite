/**
 * ThermalForecast — forecasts thermal behavior.
 *
 * Consumes temperature data from the TrendRepository.
 * Projects idle/load temperatures and assesses throttling risk.
 */
import type {
  ThermalForecast as ThermalForecastResult,
  HistoricalSeries,
  PredictionConfiguration,
  PredictionRisk,
} from './types';
import { scoreToRisk } from './types';
import { ForecastEngine } from './ForecastEngine';

export class ThermalForecastEngine {
  private forecastEngine: ForecastEngine;

  constructor(private config: PredictionConfiguration) {
    this.forecastEngine = new ForecastEngine(config);
  }

  generate(series: HistoricalSeries[]): ThermalForecastResult | null {
    const thermalSeries = series.filter((s) => s.domain === 'thermal');
    if (thermalSeries.length === 0) return null;

    const base = this.forecastEngine.forecast('thermal', thermalSeries, 'Thermal Forecast');

    const tempSeries = thermalSeries.filter((s) => s.metric === 'temperatureC');
    if (tempSeries.length === 0) {
      return {
        ...base,
        domain: 'thermal',
        projectedIdleTempC: 0,
        projectedLoadTempC: 0,
        tempIncreaseRatePerMonth: 0,
        throttlingRisk: 'none',
      };
    }

    const allTemps = tempSeries.flatMap((s) => s.dataPoints.map((p) => p.value));
    const currentIdleTemp = allTemps.length > 0 ? Math.min(...allTemps) : 0;
    const currentLoadTemp = allTemps.length > 0 ? Math.max(...allTemps) : 0;

    const tempIncreaseRatePerMonth = this.computeTempIncreaseRate(tempSeries);

    const projectedIdleTempC = currentIdleTemp + tempIncreaseRatePerMonth * 6;
    const projectedLoadTempC = currentLoadTemp + tempIncreaseRatePerMonth * 6;

    let throttlingRiskScore = 0;
    if (projectedLoadTempC > this.config.thermalThrottlingThresholdC) throttlingRiskScore += 50;
    else if (projectedLoadTempC > this.config.thermalThrottlingThresholdC - 10) throttlingRiskScore += 25;
    if (tempIncreaseRatePerMonth > 2) throttlingRiskScore += 20;
    if (base.overallTrend === 'rapid_degradation') throttlingRiskScore += 20;

    const throttlingRisk: PredictionRisk = scoreToRisk(throttlingRiskScore);

    return {
      ...base,
      domain: 'thermal',
      projectedIdleTempC: Math.round(projectedIdleTempC * 10) / 10,
      projectedLoadTempC: Math.round(projectedLoadTempC * 10) / 10,
      tempIncreaseRatePerMonth: Math.round(tempIncreaseRatePerMonth * 100) / 100,
      throttlingRisk,
    };
  }

  private computeTempIncreaseRate(series: HistoricalSeries[]): number {
    let totalRate = 0;
    let count = 0;
    for (const s of series) {
      const points = s.dataPoints;
      if (points.length < 2) continue;
      const first = points[0]!;
      const last = points[points.length - 1]!;
      const durationMonths = (last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24 * 30);
      if (durationMonths === 0) continue;
      totalRate += (last.value - first.value) / durationMonths;
      count++;
    }
    return count > 0 ? totalRate / count : 0;
  }
}
