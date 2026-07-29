/**
 * Report Health Delta — computes and formats health score changes.
 *
 * Provides the "88 → 94 (+6)" display from before/after health scores.
 */
import type { HealthDeltaDisplay } from './types';
import { formatHealthDelta, determineHealthTrend } from './types';

export class ReportHealthDelta {
  compute(before: number | null, after: number | null): HealthDeltaDisplay {
    const delta = before !== null && after !== null ? after - before : null;
    return {
      before,
      after,
      delta,
      formatted: formatHealthDelta(before, after),
      trend: determineHealthTrend(before, after),
    };
  }

  formatCompact(before: number | null, after: number | null): string {
    if (before === null || after === null) return 'N/A';
    const delta = after - before;
    const sign = delta >= 0 ? '+' : '';
    return `${before} → ${after} (${sign}${delta})`;
  }

  formatPercentage(before: number | null, after: number | null): string {
    if (before === null || after === null) return 'N/A';
    const delta = after - before;
    const sign = delta >= 0 ? '+' : '';
    return `${before}% → ${after}% (${sign}${delta}%)`;
  }

  isImprovement(delta: HealthDeltaDisplay): boolean {
    return delta.trend === 'improved';
  }

  isSignificant(delta: HealthDeltaDisplay, threshold: number = 3): boolean {
    return delta.delta !== null && Math.abs(delta.delta) >= threshold;
  }

  describeTrend(delta: HealthDeltaDisplay): string {
    switch (delta.trend) {
      case 'improved':
        return delta.delta !== null
          ? `Health improved by ${delta.delta} points`
          : 'Health improved';
      case 'declined':
        return delta.delta !== null
          ? `Health declined by ${Math.abs(delta.delta)} points`
          : 'Health declined';
      case 'unchanged':
        return 'Health remained stable';
      case 'unknown':
        return 'Health change could not be determined';
    }
  }
}
