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
      className="mb-7 flex items-start justify-between gap-6"
      data-testid={testId ?? 'page-header'}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="h-1 w-8 rounded-full shadow-glow" style={{ background: 'var(--avs-gradient-brand)' }} />
          <h1 className="text-page-title text-text-primary">{title}</h1>
        </div>
        {description && (
          <p className="mt-2 max-w-2xl text-small text-text-secondary leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
