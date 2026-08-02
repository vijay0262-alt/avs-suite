import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Card } from './Card';

export interface GaugeCardProps {
  title: string;
  value: number;
  max?: number;
  unit?: string;
  icon?: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  description?: string;
  className?: string;
  'data-testid'?: string;
}

const toneColors = {
  brand: { stroke: 'var(--avs-brand-primary)', text: 'text-[var(--avs-brand-primary)]', glow: 'var(--avs-brand-glow)' },
  success: { stroke: 'var(--avs-success)', text: 'text-[var(--avs-success)]', glow: 'rgba(74, 222, 128, 0.15)' },
  warning: { stroke: 'var(--avs-warning)', text: 'text-[var(--avs-warning)]', glow: 'rgba(251, 191, 36, 0.15)' },
  danger: { stroke: 'var(--avs-danger)', text: 'text-[var(--avs-danger)]', glow: 'rgba(248, 113, 113, 0.15)' },
};

/**
 * GaugeCard — circular gauge with gradient stroke, glow, and animated fill.
 */
export function GaugeCard({
  title,
  value,
  max = 100,
  unit = '',
  icon,
  tone = 'brand',
  description,
  className,
  ...rest
}: GaugeCardProps) {
  const config = toneColors[tone];
  const pct = Math.min(1, Math.max(0, value / max));
  const circumference = 2 * Math.PI * 45;
  const dashOffset = circumference * (1 - pct);

  return (
    <Card variant="gradient" className={clsx('relative overflow-hidden', className)} {...rest as Record<string, unknown>}>
      <div className="flex flex-col items-center">
        <div className="relative h-36 w-36" role="img" aria-label={`${title}: ${value}${unit} out of ${max}${unit}`}>
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id={`gauge-${tone}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={config.stroke} stopOpacity="1" />
                <stop offset="100%" stopColor={config.stroke} stopOpacity="0.6" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--avs-surface-muted)" strokeWidth="6" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={`url(#gauge-${tone})`}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
                filter: `drop-shadow(0 0 6px ${config.glow})`,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {icon && <div className={clsx('mb-1', config.text)}>{icon}</div>}
            <div className={clsx('text-3xl font-bold tabular-nums', config.text)}>
              {Math.round(value)}
            </div>
            <div className="text-xs text-[var(--avs-text-muted)]">{unit}</div>
          </div>
        </div>
        <div className="mt-3 text-center">
          <div className="text-sm font-semibold text-[var(--avs-text-primary)]">{title}</div>
          {description && <div className="mt-0.5 text-xs text-[var(--avs-text-secondary)]">{description}</div>}
        </div>
      </div>
    </Card>
  );
}
