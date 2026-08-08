import clsx from 'clsx';
import { useState, useCallback, type ReactNode } from 'react';

export interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Collapsed by default.  Defaults to true. */
  defaultCollapsed?: boolean;
  /** Unique key for persisting expand/collapse state in localStorage. */
  storageKey?: string;
  'data-testid'?: string;
}

/**
 * CollapsibleSection — a section that can be expanded/collapsed.
 *
 * - Collapsed by default
 * - Remembers user preference via localStorage when storageKey is provided
 * - Smooth height animation via CSS
 * - Accessible: button role, aria-expanded, aria-controls
 */
export function CollapsibleSection({
  title,
  icon,
  actions,
  children,
  className,
  defaultCollapsed = true,
  storageKey,
  ...rest
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(`avs-collapse-${storageKey}`);
        if (stored !== null) return stored === '1';
      } catch {
        // ignore
      }
    }
    return defaultCollapsed;
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          localStorage.setItem(`avs-collapse-${storageKey}`, next ? '1' : '0');
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [storageKey]);

  const contentId = `collapse-content-${storageKey ?? title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <section className={clsx('animate-slide-up', className)} {...rest as Record<string, unknown>}>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={toggle}
          className="flex items-center gap-2.5 text-left group"
          aria-expanded={!collapsed}
          aria-controls={contentId}
        >
          {icon && (
            <span className="text-[var(--avs-brand-primary)] flex items-center">
              {icon}
            </span>
          )}
          <h2 className="text-section-title text-[var(--avs-text-primary)] group-hover:text-[var(--avs-brand-primary)] transition-colors">
            {title}
          </h2>
          <svg
            className={clsx('h-4 w-4 text-[var(--avs-text-muted)] transition-transform duration-200', collapsed ? '' : 'rotate-90')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {!collapsed && (
        <div id={contentId} className="animate-fade-in">
          {children}
        </div>
      )}
    </section>
  );
}
