/**
 * PageHeader — consistent hero for every feature page.
 * Kept in `components/` so it can be reused across the sidebar-driven
 * top-level routes.
 */
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  testId?: string;
}

export function PageHeader({ title, description, actions, testId }: PageHeaderProps) {
  return (
    <header
      className="mb-6 flex items-start justify-between gap-6"
      data-testid={testId ?? 'page-header'}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
