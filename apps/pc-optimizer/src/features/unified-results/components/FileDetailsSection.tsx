/**
 * FileDetailsSection — collapsible list of file names/paths found or cleaned,
 * grouped by module and category.
 *
 * Used in UnifiedResultsView to show the user exactly which files were
 * detected during scan (detection) or which were cleaned (results).
 */
import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { UnifiedFileDetailGroup } from '../unifiedResultsTypes';

export interface FileDetailsSectionProps {
  groups: UnifiedFileDetailGroup[];
  /** Label for the section heading */
  title: string;
  /** Whether these are detected files or cleaned files */
  variant?: 'detected' | 'cleaned';
}

export function FileDetailsSection({
  groups,
  title,
  variant = 'detected',
}: FileDetailsSectionProps) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const toggleModule = (key: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allItems = groups.flatMap((g) => g.items);
  if (allItems.length === 0) return null;

  const itemColor = variant === 'cleaned'
    ? 'text-semantic-success'
    : 'text-semantic-danger';

  const dotColor = variant === 'cleaned'
    ? 'bg-semantic-success'
    : 'bg-semantic-danger';

  return (
    <div data-testid="file-details-section">
      <h3 className="mb-3 text-small font-semibold uppercase tracking-wide text-text-muted">
        {title} ({allItems.length} {allItems.length === 1 ? 'item' : 'items'})
      </h3>
      <div className="space-y-2">
        {groups.map((group) => {
          const moduleKey = `${group.moduleLabel}-${group.title}`;
          const isExpanded = expandedModules.has(moduleKey);
          const hasItems = group.items.length > 0;

          return (
            <div
              key={moduleKey}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] overflow-hidden"
            >
              {/* Module header */}
              <button
                onClick={() => hasItems && toggleModule(moduleKey)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left ${
                  hasItems ? 'hover:bg-[var(--avs-surface-muted)] cursor-pointer' : 'cursor-default'
                }`}
                disabled={!hasItems}
              >
                {hasItems ? (
                  isExpanded
                    ? <ChevronDownIcon className="h-4 w-4 shrink-0 text-text-muted" />
                    : <ChevronRightIcon className="h-4 w-4 shrink-0 text-text-muted" />
                ) : (
                  <span className="h-4 w-4 shrink-0" />
                )}
                <span className="text-small font-medium text-text-primary flex-1 truncate">
                  {group.moduleLabel}: {group.title}
                </span>
                <span className="text-caption text-text-muted shrink-0">
                  {group.items.length} {group.items.length === 1 ? 'file' : 'files'}
                  {group.totalSize ? ` · ${formatFileSize(group.totalSize)}` : ''}
                </span>
              </button>

              {/* File list */}
              {isExpanded && hasItems && (
                <div className="border-t border-[var(--avs-border)] bg-[var(--avs-surface-muted)]">
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {group.items.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 px-3 py-1.5"
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                        <span
                          className={`text-caption font-mono truncate flex-1 ${itemColor}`}
                          title={item.name}
                        >
                          {item.name}
                        </span>
                        {item.size ? (
                          <span className="text-caption text-text-muted shrink-0 tabular-nums">
                            {formatFileSize(item.size)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
