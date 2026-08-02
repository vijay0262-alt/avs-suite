import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Card } from './Card';

export interface InsightCardProps {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  severity?: 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  'data-testid'?: string;
}

const severityConfig = {
  success: { border: 'border-l-[var(--avs-success)]', bg: 'bg-[color-mix(in_srgb,var(--avs-success)_5%,transparent)]' },
  warning: { border: 'border-l-[var(--avs-warning)]', bg: 'bg-[color-mix(in_srgb,var(--avs-warning)_5%,transparent)]' },
  danger: { border: 'border-l-[var(--avs-danger)]', bg: 'bg-[color-mix(in_srgb,var(--avs-danger)_5%,transparent)]' },
  info: { border: 'border-l-[var(--avs-brand-primary)]', bg: 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)]' },
};

/**
 * InsightCard — AI insight with icon, severity accent, description, and optional action.
 */
export function InsightCard({
  icon,
  iconColor = 'text-[var(--avs-brand-primary)]',
  title,
  description,
  action,
  severity = 'info',
  className,
  ...rest
}: InsightCardProps) {
  const config = severityConfig[severity];

  return (
    <Card
      variant="gradient"
      className={clsx('border-l-2', config.border, config.bg, className)}
      padded={false}
      {...rest as Record<string, unknown>}
    >
      <div className="flex items-start gap-3 p-4">
        {icon && (
          <div className="shrink-0">
            <span className={clsx('block', iconColor)}>{icon}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--avs-text-primary)]">{title}</div>
          <div className="mt-0.5 text-xs text-[var(--avs-text-secondary)] leading-relaxed">{description}</div>
          {action && (
            <button
              onClick={action.onClick}
              className="mt-2 text-xs font-medium text-[var(--avs-brand-primary)] hover:text-[var(--avs-brand-accent)] transition-colors"
            >
              {action.label} →
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
