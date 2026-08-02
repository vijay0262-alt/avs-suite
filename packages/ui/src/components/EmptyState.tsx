import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
  'data-testid'?: string;
}

/**
 * EmptyState — premium empty state with icon, title, description, and optional action.
 */
export function EmptyState({ icon, title, description, action, className, ...rest }: EmptyStateProps) {
  return (
    <div
      className={clsx('flex flex-col items-center justify-center py-12 text-center', className)}
      {...rest as Record<string, unknown>}
    >
      {icon && (
        <div className="mb-4 p-4 rounded-[var(--avs-radius-xl)] bg-[var(--avs-surface-muted)] text-[var(--avs-text-muted)]">
          {icon}
        </div>
      )}
      <div className="text-base font-semibold text-[var(--avs-text-primary)]">{title}</div>
      {description && (
        <div className="mt-1.5 max-w-sm text-sm text-[var(--avs-text-secondary)]">{description}</div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 text-sm font-medium text-[var(--avs-brand-primary)] hover:text-[var(--avs-brand-accent)] transition-colors"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}
