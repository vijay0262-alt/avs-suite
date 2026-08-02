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

const toneConfig: Record<StatCardTone, { iconBg: string; iconColor: string; barColor: string; glow: string }> = {
  brand: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_15%,transparent)]',
    iconColor: 'text-[var(--avs-brand-primary)]',
    barColor: 'bg-[var(--avs-brand-primary)]',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-brand-primary)_15%,transparent)]',
  },
  success: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-success)_15%,transparent)]',
    iconColor: 'text-[var(--avs-success)]',
    barColor: 'bg-[var(--avs-success)]',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-success)_15%,transparent)]',
  },
  warning: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-warning)_15%,transparent)]',
    iconColor: 'text-[var(--avs-warning)]',
    barColor: 'bg-[var(--avs-warning)]',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-warning)_15%,transparent)]',
  },
  danger: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-danger)_15%,transparent)]',
    iconColor: 'text-[var(--avs-danger)]',
    barColor: 'bg-[var(--avs-danger)]',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-danger)_15%,transparent)]',
  },
  info: {
    iconBg: 'bg-[color-mix(in_srgb,var(--avs-info)_15%,transparent)]',
    iconColor: 'text-[var(--avs-info)]',
    barColor: 'bg-[var(--avs-info)]',
    glow: 'hover:shadow-[0_0_24px_color-mix(in_srgb,var(--avs-info)_15%,transparent)]',
  },
  neutral: {
    iconBg: 'bg-[var(--avs-surface-muted)]',
    iconColor: 'text-[var(--avs-text-muted)]',
    barColor: 'bg-[var(--avs-text-muted)]',
    glow: '',
  },
};

/**
 * StatCard — premium score card with icon, value, progress bar, and glow on hover.
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
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-[var(--avs-radius-md)]', config.iconBg)}>
          {icon}
        </div>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-[var(--avs-text-primary)] tabular-nums">{value}</span>
        {unit && <span className="text-sm text-[var(--avs-text-muted)] font-medium">{unit}</span>}
      </div>

      <div className="mt-1.5 text-sm font-semibold text-[var(--avs-text-primary)]">{label}</div>
      {description && (
        <div className="mt-0.5 text-xs text-[var(--avs-text-secondary)]">{description}</div>
      )}

      {progress !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-[var(--avs-surface-muted)] overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-[var(--avs-duration-slow)] ease-[var(--avs-easing)]', config.barColor)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </Comp>
  );
}
