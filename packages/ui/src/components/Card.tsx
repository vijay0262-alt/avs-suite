import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  variant?: 'default' | 'glass' | 'gradient' | 'elevated';
}

const variants: Record<NonNullable<CardProps['variant']>, string> = {
  default:
    'bg-[var(--avs-surface)] border border-[var(--avs-border)] ' +
    'shadow-[var(--avs-shadow-sm)] hover:shadow-[var(--avs-shadow-md)]',
  glass:
    'bg-[var(--avs-glass-bg)] backdrop-blur-[var(--avs-glass-blur)] ' +
    'border border-[var(--avs-glass-border)] shadow-[var(--avs-shadow-md)] ' +
    'hover:shadow-[var(--avs-shadow-lg)]',
  gradient:
    'bg-gradient-surface border border-[var(--avs-border)] ' +
    'shadow-[var(--avs-shadow-sm)] hover:shadow-[var(--avs-shadow-glow)]',
  elevated:
    'bg-[var(--avs-surface-elevated)] border border-[var(--avs-border)] ' +
    'shadow-[var(--avs-shadow-md)] hover:shadow-[var(--avs-shadow-lg)]',
};

/**
 * Card — the primary containment surface.
 *
 * Variants:
 *   default  — solid surface with subtle shadow
 *   glass    — frosted glass with backdrop blur (premium)
 *   gradient — subtle gradient with glow on hover
 *   elevated— raised surface for emphasis
 */
export function Card({
  title,
  actions,
  padded = true,
  variant = 'glass',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-[var(--avs-radius-xl)]',
        'transition-all duration-[var(--avs-duration-normal)] ease-[var(--avs-easing)]',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          {title && (
            <h3 className="text-sm font-semibold tracking-tight text-[var(--avs-text-primary)]">
              {title}
            </h3>
          )}
          {actions}
        </div>
      )}
      <div className={clsx(padded && 'px-5 py-4')}>{children}</div>
    </div>
  );
}
