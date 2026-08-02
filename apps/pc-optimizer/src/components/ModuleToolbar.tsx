/**
 * ModuleToolbar — consistent search/filter/sort bar for module pages.
 *
 * Provides a unified layout for search input, filter dropdowns,
 * sort dropdown, and action buttons.
 */
import type { ReactNode } from 'react';

export interface ToolbarSelect {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}

export function ModuleToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  searchAriaLabel = 'Search',
  selects,
  children,
  testId = 'module-toolbar',
}: {
  search?: { value: string; onChange: (value: string) => void };
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  selects?: readonly ToolbarSelect[];
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="mb-4 flex flex-col gap-3 md:flex-row md:items-center"
      data-testid={testId}
    >
      {search !== undefined && onSearchChange && (
        <input
          type="text"
          aria-label={searchAriaLabel}
          placeholder={searchPlaceholder}
          value={search.value}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        />
      )}
      {selects?.map((sel) => (
        <select
          key={sel.ariaLabel}
          aria-label={sel.ariaLabel}
          value={sel.value}
          onChange={(e) => sel.onChange(e.target.value)}
          className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] px-3 py-1.5 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {sel.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
