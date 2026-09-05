/**
 * StartupEntryCard - Display a single startup entry with controls
 */

import React from 'react';
import { Button } from '@avs/ui';
import clsx from 'clsx';
import { ShieldCheckIcon, ShieldExclamationIcon, ClockIcon, BoltIcon } from '@heroicons/react/24/outline';
import type { StartupEntry } from '../startup.types';

interface StartupEntryCardProps {
  entry: StartupEntry;
  onDisable: (entry: StartupEntry) => void;
  onEnable: (entry: StartupEntry) => void;
  loading?: boolean;
}

export const StartupEntryCard = React.memo(function StartupEntryCard({ entry, onDisable, onEnable, loading }: StartupEntryCardProps) {
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return { text: 'text-semantic-danger', bg: 'bg-semantic-danger', label: 'High' };
      case 'medium': return { text: 'text-semantic-warning', bg: 'bg-semantic-warning', label: 'Medium' };
      case 'low': return { text: 'text-semantic-success', bg: 'bg-semantic-success', label: 'Low' };
      default: return { text: 'text-text-muted', bg: 'bg-text-muted', label: 'Unknown' };
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'registry': return 'Registry';
      case 'folder': return 'Startup Folder';
      case 'task': return 'Task Scheduler';
      default: return 'Unknown';
    }
  };

  const formatBootImpact = (ms?: number) => {
    if (ms === undefined || ms === null) return '—';
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  };

  const impact = getImpactColor(entry.impact);
  const isSigned = entry.signatureStatus === 'Signed';

  return (
    <div
      className={clsx(
        'group relative overflow-hidden rounded-[var(--avs-radius-lg)] border transition-all',
        entry.enabled
          ? 'border-[var(--avs-border)] bg-[var(--avs-surface)] hover:border-[color-mix(in_srgb,var(--avs-brand-primary)_30%,var(--avs-border))]'
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
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--avs-radius-md)]',
            entry.enabled
              ? 'bg-[var(--avs-surface-muted)] text-text-secondary group-hover:text-[var(--avs-brand-primary)]'
              : 'bg-[var(--avs-surface-muted)] text-text-muted',
          )}
        >
          <BoltIcon className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-small font-semibold text-text-primary">{entry.name}</h3>
            <span className={clsx('text-caption font-medium', impact.text)}>
              {impact.label}
            </span>
            {!isSigned && (
              <ShieldExclamationIcon className="h-3.5 w-3.5 text-semantic-warning shrink-0" title="Unsigned or unknown signature" />
            )}
          </div>
          <p className="mt-0.5 truncate text-caption text-text-muted">
            {entry.publisher || 'Unknown publisher'} • {getSourceLabel(entry.source)}
          </p>
          <div className="mt-1 flex items-center gap-3 text-caption text-text-muted">
            <span className="flex items-center gap-1">
              <ClockIcon className="h-3 w-3" />
              {formatBootImpact(entry.bootImpactMs)}
            </span>
            {isSigned && (
              <span className="flex items-center gap-1 text-semantic-success">
                <ShieldCheckIcon className="h-3 w-3" />
                Signed
              </span>
            )}
            {entry.lastLaunch && (
              <span className="hidden sm:flex items-center gap-1">
                Last: {entry.lastLaunch}
              </span>
            )}
          </div>
        </div>

        {/* Action */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          {entry.enabled ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDisable(entry)}
              disabled={loading}
              data-testid={`disable-${entry.name.replace(/\s+/g, '-').toLowerCase()}`}
            >
              Disable
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onEnable(entry)}
              disabled={loading}
              data-testid={`enable-${entry.name.replace(/\s+/g, '-').toLowerCase()}`}
            >
              Enable
            </Button>
          )}
          <span className={clsx('text-caption', entry.enabled ? 'text-semantic-success' : 'text-text-muted')}>
            {entry.enabled ? '● Enabled' : '○ Disabled'}
          </span>
        </div>
      </div>
    </div>
  );
});
