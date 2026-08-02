import clsx from 'clsx';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  className?: string;
  'data-testid'?: string;
}

/**
 * Sparkline — lightweight inline SVG area chart for live metrics.
 * Renders a smooth gradient-filled area with a glowing stroke line.
 */
export function Sparkline({
  data,
  width = 120,
  height = 40,
  stroke = 'var(--avs-brand-primary)',
  fill = 'var(--avs-brand-primary)',
  strokeWidth = 1.5,
  className,
  ...rest
}: SparklineProps) {
  if (data.length < 2) {
    return <div className={clsx('opacity-30', className)} style={{ width, height }} {...rest as Record<string, unknown>} />;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  const gradientId = `spark-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={clsx('overflow-visible', className)}
      {...rest as Record<string, unknown>}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.3" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 3px var(--avs-brand-glow))' }}
      />
    </svg>
  );
}
