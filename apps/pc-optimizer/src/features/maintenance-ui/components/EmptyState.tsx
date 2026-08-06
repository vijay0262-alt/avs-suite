/**
 * EmptyState — polished empty state with icon, message, and optional guidance.
 */
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
}

export function EmptyState({ icon, title, description, action, testId }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-center"
      data-testid={testId ?? 'empty-state'}
    >
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--avs-surface-muted)] text-[var(--avs-text-muted)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--avs-text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-small text-[var(--avs-text-secondary)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
