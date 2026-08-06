/**
 * ScoreGauge — large circular animated score gauge.
 *
 * Renders an SVG circle with animated stroke-dashoffset.
 * Supports a primary score and secondary scores row.
 */
import { useAnimatedCounter } from '../../unified-scan/useAnimatedCounter';
import type { UnifiedScoreDisplay } from '../unifiedResultsTypes';
import { scoreColor, scoreStrokeColor } from '../unifiedResultsTypes';

export interface ScoreGaugeProps {
  score: UnifiedScoreDisplay;
  size?: 'large' | 'medium' | 'small';
  animate?: boolean;
}

export function ScoreGauge({ score, size = 'large', animate = true }: ScoreGaugeProps) {
  const animatedValue = useAnimatedCounter(score.value, animate ? 1200 : 0);
  const displayValue = Math.round(animatedValue);
  const max = score.max ?? 100;
  const radius = size === 'large' ? 56 : size === 'medium' ? 40 : 28;
  const strokeWidth = size === 'large' ? 8 : 6;
  const dimension = radius * 2 + strokeWidth * 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - animatedValue / max);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: dimension, height: dimension }}
      role="img"
      aria-label={`${score.label}: ${displayValue} out of ${max}`}
    >
      <svg
        className="absolute"
        width={dimension}
        height={dimension}
        viewBox={`0 0 ${dimension} ${dimension}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="var(--avs-surface-muted)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke={scoreStrokeColor(score.value)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: animate ? 'stroke-dashoffset 1s ease-out' : 'none' }}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span
          className={`font-bold tabular-nums ${scoreColor(displayValue)} ${
            size === 'large' ? 'text-4xl' : size === 'medium' ? 'text-statistic' : 'text-section-title'
          }`}
          aria-live="polite"
        >
          {displayValue}
        </span>
        <span
          className={`text-text-muted ${
            size === 'large' ? 'text-caption' : 'text-micro'
          }`}
        >
          {score.label}
        </span>
      </div>
    </div>
  );
}

export interface ScoreRowProps {
  primary: UnifiedScoreDisplay;
  secondary: UnifiedScoreDisplay[];
}

export function ScoreRow({ primary, secondary }: ScoreRowProps) {
  return (
    <div className="flex flex-col items-center gap-4" data-testid="score-row">
      {/* Primary score */}
      <div className="flex flex-col items-center gap-2">
        <ScoreGauge score={primary} size="large" />
        {primary.description && (
          <p className="text-caption text-text-muted max-w-xs text-center">{primary.description}</p>
        )}
      </div>

      {/* Secondary scores */}
      {secondary.length > 0 && (
        <div className="flex items-center justify-center gap-6">
          {secondary.map((score) => (
            <ScoreGauge key={score.label} score={score} size="medium" />
          ))}
        </div>
      )}
    </div>
  );
}
