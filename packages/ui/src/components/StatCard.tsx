import clsx from 'clsx';
import type { ReactNode } from 'react';

export type StatCardTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  tone?: StatCardTone;
  description?: string;
  progress?: number;
  onClick?: () => void;
  className?: string;
  'data-testid'?: string;
}

const toneConfig: Record<StatCardTone, { iconBg: string; iconColor: string; ringColor: string; glow: string }> = {
  brand: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_15%,transparent)]',
    iconColor: 'text-[var(--avs-brand-primary)]',
    ringColor: 'var(--avs-brand-primary)',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-brand-primary)_15%,transparent)]',
  },
  success: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-success)_15%,transparent)]',
    iconColor: 'text-[var(--avs-success)]',
    ringColor: 'var(--avs-success)',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-success)_15%,transparent)]',
  },
  warning: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-warning)_15%,transparent)]',
    iconColor: 'text-[var(--avs-warning)]',
    ringColor: 'var(--avs-warning)',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-warning)_15%,transparent)]',
  },
  danger: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-danger)_15%,transparent)]',
    iconColor: 'text-[var(--avs-danger)]',
    ringColor: 'var(--avs-danger)',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-danger)_15%,transparent)]',
  },
  info: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-info)_15%,transparent)]',
    iconColor: 'text-[var(--avs-info)]',
    ringColor: 'var(--avs-info)',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-info)_15%,transparent)]',
  },
  neutral: {
    iconBg: 'bg-[var(--avs-surface-muted)]',
    iconColor: 'text-[var(--avs-text-muted)]',
    ringColor: 'var(--avs-text-muted)',
    glow: '',
  },
};

const RING_SIZE = 56;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * StatCard — premium score card with icon, value, circular progress ring, and glow on hover.
 * Used for the dashboard AI score cards row (Health, Security, Performance, Hardware, Storage).
 */
export function StatCard({
  label,
  value,
  unit,
  icon,
  tone = 'brand',
  description,
  progress,
  onClick,
  className,
  ...rest
}: StatCardProps) {
  const config = toneConfig[tone];
  const Comp = onClick ? 'button' : 'div';
  const clampedProgress = progress !== undefined ? Math.min(100, Math.max(0, progress)) : 0;
  const dashOffset = RING_CIRCUMFERENCE - (clampedProgress / 100) * RING_CIRCUMFERENCE;

  return (
    <Comp
      onClick={onClick}
      className={clsx(
        'group relative overflow-hidden rounded-[var(--avs-radius-xl)] p-5 text-left',
        'bg-gradient-surface border border-[var(--avs-border)]',
        'shadow-[var(--avs-shadow-sm)] transition-all duration-[var(--avs-duration-normal)] ease-[var(--avs-easing)]',
        config.glow,
        onClick && 'cursor-pointer hover:border-[var(--avs-border-hover)]',
        className,
      )}
      {...(rest as Record<string, unknown>)}
    >
      {/* Subtle top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--avs-glass-border)] to-transparent opacity-50" />

      <div className="flex items-start justify-between mb-4">
        {progress !== undefined ? (
          /* Circular progress ring with icon in center */
          <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="var(--avs-surface-muted)"
                strokeWidth={RING_STROKE}
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke={config.ringColor}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                className="transition-all duration-[var(--avs-duration-slow)] ease-[var(--avs-easing)]"
              />
            </svg>
            <div className={clsx('absolute inset-0 flex items-center justify-center', config.iconColor)}>
              {icon}
            </div>
          </div>
        ) : (
          <div className={clsx('flex h-10 w-10 items-center justify-center rounded-[var(--avs-radius-md)]', config.iconBg)}>
            <span className={config.iconColor}>{icon}</span>
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-[var(--avs-text-primary)] tabular-nums">{value}</span>
        {unit && <span className="text-sm text-[var(--avs-text-muted)] font-medium">{unit}</span>}
      </div>

      <div className="mt-1.5 text-sm font-semibold text-[var(--avs-text-primary)]">{label}</div>
      {description && (
        <div className="mt-0.5 text-xs text-[var(--avs-text-secondary)]">{description}</div>
      )}
    </Comp>
  );
}
