/**
 * StartupEntryCard - Display a single startup entry with a toggle
 */

import React from 'react';
import { Button } from '@avs/ui';
import clsx from 'clsx';
import { BoltIcon } from '@heroicons/react/24/outline';
import type { StartupEntry } from '../startup.types';

interface StartupEntryCardProps {
  entry: StartupEntry;
  onDisable: (entry: StartupEntry) => void;
  onEnable: (entry: StartupEntry) => void;
  /** True while this entry's toggle RPC is in flight. */
  pending?: boolean;
}

const IMPACT_STYLES: Record<string, { text: string; bg: string; label: string }> = {
  high: { text: 'text-semantic-danger', bg: 'bg-semantic-danger', label: 'High' },
  medium: { text: 'text-semantic-warning', bg: 'bg-semantic-warning', label: 'Medium' },
  low: { text: 'text-semantic-success', bg: 'bg-semantic-success', label: 'Low' },
};

const SOURCE_LABELS: Record<string, string> = {
  registry_run: 'Registry',
  registry_run_once: 'Registry (RunOnce)',
  startup_folder: 'Startup Folder',
  task_scheduler: 'Task Scheduler',
  startup_service: 'Service',
};

export const StartupEntryCard = React.memo(function StartupEntryCard({ entry, onDisable, onEnable, pending }: StartupEntryCardProps) {
  const impact = IMPACT_STYLES[entry.impact] ?? { text: 'text-text-muted', bg: 'bg-text-muted', label: 'Unknown' };
  // Services can't be toggled from here — they need sc config + admin.
  const canToggle = entry.source !== 'startup_service';

  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-[var(--avs-radius-lg)] border transition-all',
        entry.enabled
          ? 'border-[var(--avs-border)] bg-[var(--avs-surface)]'
          : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)] opacity-75',
      )}
      data-testid={`startup-entry-${entry.name.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Impact indicator bar */}
        <div className={clsx('absolute left-0 top-0 h-full w-1', impact.bg, entry.enabled ? 'opacity-80' : 'opacity-30')} />

        {/* Icon */}
        <div
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)]',
            entry.enabled ? 'text-text-secondary' : 'text-text-muted',
          )}
        >
          <BoltIcon className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-small font-semibold text-text-primary">{entry.name}</h3>
            <span className={clsx('text-caption font-medium', impact.text)}>{impact.label}</span>
          </div>
          <p className="mt-0.5 truncate text-caption text-text-muted">
            {entry.publisher || 'Unknown publisher'} • {SOURCE_LABELS[entry.source] ?? 'Unknown'}
          </p>
        </div>

        {/* Action */}
        <div className="flex shrink-0 items-center gap-3">
          <span className={clsx('text-caption', entry.enabled ? 'text-semantic-success' : 'text-text-muted')}>
            {entry.enabled ? 'Enabled' : 'Disabled'}
          </span>
          {canToggle ? (
            entry.enabled ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onDisable(entry)}
                disabled={pending}
                data-testid={`disable-${entry.name.replace(/\s+/g, '-').toLowerCase()}`}
              >
                {pending ? 'Working…' : 'Disable'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onEnable(entry)}
                disabled={pending}
                data-testid={`enable-${entry.name.replace(/\s+/g, '-').toLowerCase()}`}
              >
                {pending ? 'Working…' : 'Enable'}
              </Button>
            )
          ) : (
            <span className="text-caption text-text-muted">Managed by Windows</span>
          )}
        </div>
      </div>
    </div>
  );
});
