/**
 * Simulation Comparison Engine — compares multiple simulation results.
 *
 * Produces deltas for each metric, determines a winner, and generates
 * a recommendation summary.
 */
import type {
  SimulationResult,
  SimulationComparison,
  SimulationDelta,
  SimulationConfiguration,
  ComparisonPlugin,
} from './types';
import { generateComparisonId, riskToScore } from './types';

export class SimulationComparisonEngine {
  private _config: SimulationConfiguration;
  private _plugins: ComparisonPlugin[] = [];

  constructor(config: SimulationConfiguration) {
    this._config = config;
  }

  registerPlugin(plugin: ComparisonPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  compare(simulations: SimulationResult[]): SimulationComparison {
    if (simulations.length < 2) {
      return {
        id: generateComparisonId(),
        simulations,
        generatedAt: new Date().toISOString(),
        deltas: [],
        winner: simulations[0]?.id ?? null,
        summary: 'Insufficient simulations for comparison',
        recommendation: 'At least two simulations are required for comparison',
        futureMetadata: {},
      };
    }

    const deltas = this._computeDeltas(simulations);
    const winner = this._determineWinner(simulations, deltas);
    const summary = this._generateSummary(simulations, deltas, winner);
    const recommendation = this._generateRecommendation(simulations, deltas, winner);

    return {
      id: generateComparisonId(),
      simulations,
      generatedAt: new Date().toISOString(),
      deltas,
      winner,
      summary,
      recommendation,
      futureMetadata: {},
    };
  }

  private _computeDeltas(simulations: SimulationResult[]): SimulationDelta[] {
    const deltas: SimulationDelta[] = [];

    const metrics: { metric: string; label: string; unit: string; higherIsBetter: boolean; getter: (s: SimulationResult) => number }[] = [
      { metric: 'estimatedHealthAfter', label: 'Health After', unit: '/100', higherIsBetter: true, getter: (s) => s.estimatedHealthAfter },
      { metric: 'estimatedStorageRecovered', label: 'Storage Recovered', unit: 'MB', higherIsBetter: true, getter: (s) => s.estimatedStorageRecovered },
      { metric: 'estimatedPerformanceGain', label: 'Performance Gain', unit: '%', higherIsBetter: true, getter: (s) => s.estimatedPerformanceGain },
      { metric: 'estimatedPrivacyImprovement', label: 'Privacy Improvement', unit: '%', higherIsBetter: true, getter: (s) => s.estimatedPrivacyImprovement },
      { metric: 'estimatedMemoryRecovery', label: 'Memory Recovery', unit: '%', higherIsBetter: true, getter: (s) => s.estimatedMemoryRecovery },
      { metric: 'estimatedStartupImprovement', label: 'Startup Improvement', unit: '%', higherIsBetter: true, getter: (s) => s.estimatedStartupImprovement },
      { metric: 'estimatedDuration', label: 'Duration', unit: 'ms', higherIsBetter: false, getter: (s) => s.estimatedDuration },
      { metric: 'estimatedRisk', label: 'Risk', unit: 'score', higherIsBetter: false, getter: (s) => riskToScore(s.estimatedRisk) },
      { metric: 'estimatedConfidence', label: 'Confidence', unit: '%', higherIsBetter: true, getter: (s) => s.estimatedConfidence },
    ];

    for (const m of metrics) {
      const rule = this._config.comparisonRules.find((r) => r.metric === m.metric && r.enabled);
      if (!rule) continue;

      const values = simulations.map(m.getter);
      const bestIndex = this._findBest(values, m.higherIsBetter);

      deltas.push({
        metric: m.metric,
        label: m.label,
        values,
        unit: m.unit,
        bestIndex,
        futureMetadata: {},
      });
    }

    for (const plugin of this._plugins) {
      if (plugin.isAvailable()) {
        const delta = plugin.compare(simulations, this._config);
        if (delta) deltas.push(delta);
      }
    }

    return deltas;
  }

  private _findBest(values: number[], higherIsBetter: boolean): number {
    let bestIdx = 0;
    let best = values[0]!;
    for (let i = 1; i < values.length; i++) {
      if (higherIsBetter ? values[i]! > best : values[i]! < best) {
        best = values[i]!;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private _determineWinner(simulations: SimulationResult[], deltas: SimulationDelta[]): string | null {
    const scores: number[] = new Array(simulations.length).fill(0);
    let totalWeight = 0;

    for (const delta of deltas) {
      const rule = this._config.comparisonRules.find((r) => r.metric === delta.metric && r.enabled);
      const weight = rule?.weight ?? 0.1;
      totalWeight += weight;

      for (let i = 0; i < simulations.length; i++) {
        if (i === delta.bestIndex) {
          scores[i]! += weight;
        }
      }
    }

    if (totalWeight === 0) return null;

    let bestIdx = 0;
    let bestScore = scores[0]!;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i]! > bestScore) {
        bestScore = scores[i]!;
        bestIdx = i;
      }
    }

    return simulations[bestIdx]?.id ?? null;
  }

  private _generateSummary(simulations: SimulationResult[], deltas: SimulationDelta[], winner: string | null): string {
    if (!winner) return 'No clear winner determined';
    const winnerSim = simulations.find((s) => s.id === winner);
    if (!winnerSim) return 'No clear winner determined';

    const healthGain = winnerSim.estimatedHealthAfter - winnerSim.estimatedHealthBefore;
    return `Plan "${winnerSim.planId}" is recommended: Health +${healthGain.toFixed(0)}, Storage +${winnerSim.estimatedStorageRecovered.toFixed(1)} MB, Time ${winnerSim.estimatedDuration}ms, Risk ${winnerSim.estimatedRisk}`;
  }

  private _generateRecommendation(simulations: SimulationResult[], _deltas: SimulationDelta[], winner: string | null): string {
    if (!winner) return 'No recommendation available — consider running more simulations';
    const winnerSim = simulations.find((s) => s.id === winner);
    if (!winnerSim) return 'No recommendation available';

    const parts: string[] = [];
    parts.push(`Recommended plan: ${winnerSim.planId}`);
    parts.push(`Estimated health improvement: +${(winnerSim.estimatedHealthAfter - winnerSim.estimatedHealthBefore).toFixed(0)} points`);
    parts.push(`Estimated storage recovery: ${winnerSim.estimatedStorageRecovered.toFixed(1)} MB`);
    parts.push(`Estimated duration: ${winnerSim.estimatedDuration}ms`);
    parts.push(`Risk level: ${winnerSim.estimatedRisk}`);
    parts.push(`Confidence: ${(winnerSim.estimatedConfidence * 100).toFixed(0)}%`);

    if (winnerSim.rollbackAvailability) {
      parts.push('Rollback is available');
    } else {
      parts.push('Warning: Rollback is NOT available');
    }

    return parts.join('. ');
  }

  get config(): SimulationConfiguration { return this._config; }
}
