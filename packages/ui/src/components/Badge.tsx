import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--avs-surface-muted)] text-[var(--avs-text-secondary)]',
  brand: 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_12%,transparent)] text-[var(--avs-brand-primary)]',
  success: 'bg-[var(--avs-success-bg)] text-[var(--avs-success)]',
  warning: 'bg-[var(--avs-warning-bg)] text-[var(--avs-warning)]',
  danger: 'bg-[var(--avs-danger-bg)] text-[var(--avs-danger)]',
  info: 'bg-[var(--avs-info-bg)] text-[var(--avs-info)]',
};

const dotColors: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--avs-text-muted)]',
  brand: 'bg-[var(--avs-brand-primary)]',
  success: 'bg-[var(--avs-success)]',
  warning: 'bg-[var(--avs-warning)]',
  danger: 'bg-[var(--avs-danger)]',
  info: 'bg-[var(--avs-info)]',
};

/** Small pill-shaped label with optional status dot. */
export function Badge({ tone = 'neutral', dot = false, className, ...rest }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-medium',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', dotColors[tone])} aria-hidden />
      )}
      {rest.children}
    </span>
  );
}
