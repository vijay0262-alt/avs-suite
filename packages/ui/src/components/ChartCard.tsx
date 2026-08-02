import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Card } from './Card';

export interface ChartCardProps {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * ChartCard — container for live charts with title, icon, and action area.
 * Uses glass variant for premium chart presentation.
 */
export function ChartCard({
  title,
  icon,
  actions,
  children,
  className,
  ...rest
}: ChartCardProps) {
  return (
    <Card
      variant="glass"
      className={clsx(className)}
      {...rest as Record<string, unknown>}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[var(--avs-brand-primary)]">{icon}</span>}
          <h3 className="text-sm font-semibold tracking-tight text-[var(--avs-text-primary)]">{title}</h3>
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}
