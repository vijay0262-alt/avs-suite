import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Card } from './Card';

export interface RecommendationCardProps {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  description: string;
  impact?: string;
  priority?: 'low' | 'medium' | 'high';
  action?: { label: string; onClick: () => void };
  className?: string;
  'data-testid'?: string;
}

const priorityConfig = {
  low: { label: 'Low Priority', tone: 'text-[var(--avs-success)] bg-[color-mix(in_srgb,var(--avs-success)_12%,transparent)]' },
  medium: { label: 'Medium Priority', tone: 'text-[var(--avs-warning)] bg-[color-mix(in_srgb,var(--avs-warning)_12%,transparent)]' },
  high: { label: 'High Priority', tone: 'text-[var(--avs-danger)] bg-[color-mix(in_srgb,var(--avs-danger)_12%,transparent)]' },
};

/**
 * RecommendationCard — AI recommendation with priority badge, impact estimate, and action.
 */
export function RecommendationCard({
  icon,
  iconColor = 'text-[var(--avs-brand-primary)]',
  title,
  description,
  impact,
  priority = 'medium',
  action,
  className,
  ...rest
}: RecommendationCardProps) {
  const config = priorityConfig[priority];

  return (
    <Card
      variant="gradient"
      className={clsx('hover:border-[var(--avs-border-hover)]', className)}
      {...rest as Record<string, unknown>}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="shrink-0 p-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)]">
            <span className={clsx('block', iconColor)}>{icon}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-sm font-medium text-[var(--avs-text-primary)]">{title}</div>
            <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0', config.tone)}>
              {config.label}
            </span>
          </div>
          <div className="text-xs text-[var(--avs-text-secondary)] leading-relaxed">{description}</div>
          {impact && (
            <div className="mt-2 text-xs font-medium text-[var(--avs-brand-primary)]">
              Expected impact: {impact}
            </div>
          )}
          {action && (
            <button
              onClick={action.onClick}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--avs-brand-primary)] hover:text-[var(--avs-brand-accent)] transition-colors"
            >
              {action.label} →
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
