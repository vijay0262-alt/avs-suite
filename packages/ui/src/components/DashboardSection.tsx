import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface DashboardSectionProps {
  title?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * DashboardSection — consistent section wrapper with title, icon, and action area.
 * Provides uniform spacing between dashboard sections.
 */
export function DashboardSection({
  title,
  icon,
  actions,
  children,
  className,
  ...rest
}: DashboardSectionProps) {
  return (
    <section className={clsx('animate-slide-up', className)} {...rest as Record<string, unknown>}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {icon && (
              <span className="text-[var(--avs-brand-primary)] flex items-center">
                {icon}
              </span>
            )}
            {title && (
              <h2 className="text-section-title text-[var(--avs-text-primary)]">
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
