import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  variant?: 'default' | 'glass' | 'gradient';
  accentColor?: string;
  className?: string;
}

const variants = {
  default: 'bg-[var(--avs-surface)] border border-[var(--avs-border)]',
  glass: 'bg-[var(--avs-glass-bg)] backdrop-blur-[var(--avs-glass-blur)] border border-[var(--avs-glass-border)]',
  gradient: 'bg-gradient-surface border border-[var(--avs-border)]',
};

const trendColors = {
  up: 'text-semantic-success',
  down: 'text-semantic-danger',
  stable: 'text-text-muted',
};

/**
 * Premium stat tile with icon, trend indicator, and glass/gradient variants.
 */
export function StatTile({ label, value, hint, icon, trend, trendValue, variant = 'default', accentColor, className }: StatTileProps) {
  return (
    <div
      className={clsx(
        'flex items-start gap-4 rounded-[var(--avs-radius-xl)] p-5',
        'shadow-[var(--avs-shadow-sm)] transition-all duration-[var(--avs-duration-normal)] ease-[var(--avs-easing)]',
        'hover:shadow-[var(--avs-shadow-md)]',
        variants[variant],
        className,
      )}
    >
      {icon && (
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--avs-radius-md)]"
          style={{
            background: accentColor
              ? `color-mix(in srgb, ${accentColor} 12%, transparent)`
              : 'color-mix(in srgb, var(--avs-brand-primary) 12%, transparent)',
            color: accentColor ?? 'var(--avs-brand-primary)',
          }}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--avs-text-muted)]">
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-[var(--avs-text-primary)] tabular-nums">{value}</span>
          {trend && trendValue && (
            <span className={clsx('text-xs font-medium', trendColors[trend])}>
              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
            </span>
          )}
        </div>
        {hint && (
          <div className="mt-0.5 text-xs text-[var(--avs-text-secondary)]">{hint}</div>
        )}
      </div>
    </div>
  );
}
