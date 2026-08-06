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
      className={clsx(
        'flex flex-col items-center justify-center py-16 text-center animate-fade-in',
        className,
      )}
      {...rest as Record<string, unknown>}
    >
      {icon && (
        <div className="mb-5 p-5 rounded-[var(--avs-radius-2xl)] bg-[var(--avs-surface-muted)] text-[var(--avs-text-muted)] shadow-sm">
          {icon}
        </div>
      )}
      <div className="text-body font-semibold text-[var(--avs-text-primary)]">{title}</div>
      {description && (
        <div className="mt-2 max-w-sm text-small text-[var(--avs-text-secondary)] leading-relaxed">
          {description}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 inline-flex items-center gap-1 text-small font-medium text-[var(--avs-brand-primary)] hover:text-[var(--avs-brand-accent)] transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)] focus:outline-none focus-visible:shadow-focus rounded-[var(--avs-radius-sm)] px-2 py-1"
        >
          {action.label}
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}
