import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--avs-surface-muted)] text-[var(--avs-text-secondary)]',
  brand: 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_15%,transparent)] text-[var(--avs-brand-primary)] shadow-[0_0_8px_color-mix(in_srgb,var(--avs-brand-primary)_20%,transparent)]',
  success: 'bg-[color-mix(in_srgb,var(--avs-success)_15%,transparent)] text-[var(--avs-success)]',
  warning: 'bg-[color-mix(in_srgb,var(--avs-warning)_18%,transparent)] text-[var(--avs-warning)]',
  danger: 'bg-[color-mix(in_srgb,var(--avs-danger)_15%,transparent)] text-[var(--avs-danger)] shadow-[0_0_8px_color-mix(in_srgb,var(--avs-danger)_20%,transparent)]',
};

/** Small pill-shaped label. */
export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
