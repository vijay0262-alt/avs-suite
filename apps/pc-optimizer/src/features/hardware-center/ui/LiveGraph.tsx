/**
 * LiveGraph — lightweight SVG line chart for real-time sensor data.
 *
 * Renders multiple series with smooth animations, auto-scaling Y axis,
 * and a configurable time window. No external chart library dependency.
 */
import { useMemo } from 'react';
import type { GraphSeries } from '../types';

interface LiveGraphProps {
  title: string;
  unit: string;
  series: GraphSeries[];
  windowSeconds: number;
  'data-testid'?: string;
}

const WIDTH = 400;
const HEIGHT = 120;
const PADDING = { top: 10, right: 10, bottom: 20, left: 35 };

export function LiveGraph({ title, unit, series, windowSeconds, ...rest }: LiveGraphProps) {
  const testId = rest['data-testid'];

  const { paths, yMin, yMax, xLabels } = useMemo(() => {
    if (series.length === 0 || !series[0] || series[0].points.length === 0) {
      return { paths: [], yMin: 0, yMax: 100, xLabels: [] };
    }

    const now = Date.now();
    const minTime = now - windowSeconds * 1000;

    const allPoints = series.flatMap((s) => s.points);
    const values = allPoints.map((p) => p.v);
    const rawMin = Math.min(...values, 0);
    const rawMax = Math.max(...values, 1);
    const padding = (rawMax - rawMin) * 0.1 || 1;
    const yMin = Math.floor(rawMin - padding);
    const yMax = Math.ceil(rawMax + padding);

    const plotW = WIDTH - PADDING.left - PADDING.right;
    const plotH = HEIGHT - PADDING.top - PADDING.bottom;

    const xScale = (t: number) => {
      const ratio = (t - minTime) / (windowSeconds * 1000);
      return PADDING.left + Math.max(0, Math.min(1, ratio)) * plotW;
    };

    const yScale = (v: number) => {
      const ratio = (v - yMin) / (yMax - yMin || 1);
      return PADDING.top + (1 - Math.max(0, Math.min(1, ratio))) * plotH;
    };

    const paths = series.map((s) => {
      const pts = s.points.filter((p) => p.t >= minTime);
      if (pts.length === 0) return { name: s.name, color: s.color, d: '' };
      const d = pts
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.t).toFixed(1)} ${yScale(p.v).toFixed(1)}`)
        .join(' ');
      return { name: s.name, color: s.color, d };
    });

    const xLabels = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const secs = Math.round(windowSeconds * (1 - ratio));
      const x = PADDING.left + ratio * plotW;
      return { x, label: `-${secs}s` };
    });

    return { paths, yMin, yMax, xLabels };
  }, [series, windowSeconds]);

  return (
    <div data-testid={testId}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        <div className="flex items-center gap-3">
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span className="text-xs text-text-secondary">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={title}
      >
        {/* Y axis labels */}
        <text x={PADDING.left - 5} y={PADDING.top + 4} textAnchor="end" className="fill-text-muted text-[10px]">
          {yMax.toFixed(0)}
        </text>
        <text x={PADDING.left - 5} y={HEIGHT - PADDING.bottom} textAnchor="end" className="fill-text-muted text-[10px]">
          {yMin.toFixed(0)}
        </text>
        <text x={PADDING.left - 5} y={HEIGHT / 2} textAnchor="end" className="fill-text-muted text-[10px]">
          {unit}
        </text>

        {/* Grid lines */}
        <line x1={PADDING.left} y1={PADDING.top} x2={WIDTH - PADDING.right} y2={PADDING.top} stroke="var(--avs-border)" strokeWidth="0.5" />
        <line x1={PADDING.left} y1={HEIGHT - PADDING.bottom} x2={WIDTH - PADDING.right} y2={HEIGHT - PADDING.bottom} stroke="var(--avs-border)" strokeWidth="0.5" />
        <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={HEIGHT - PADDING.bottom} stroke="var(--avs-border)" strokeWidth="0.5" />

        {/* X axis labels */}
        {xLabels.map((label, i) => (
          <text key={i} x={label.x} y={HEIGHT - 5} textAnchor="middle" className="fill-text-muted text-[10px]">
            {label.label}
          </text>
        ))}

        {/* Series paths */}
        {paths.map((p) => (
          <path
            key={p.name}
            d={p.d}
            fill="none"
            stroke={p.color}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}
