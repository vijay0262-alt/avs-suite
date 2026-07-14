import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
}

/**
 * Card — the primary containment surface. Uses a Mica-inspired soft
 * elevation with a 1-px border so it reads well in both themes.
 */
export function Card({
  title,
  actions,
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={clsx(
        'bg-[var(--avs-surface)] border border-[var(--avs-border)] rounded-[var(--avs-radius-lg)]',
        'shadow-[var(--avs-shadow-sm)] transition-shadow duration-[var(--avs-duration-normal)]',
        'hover:shadow-[var(--avs-shadow-md)]',
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
