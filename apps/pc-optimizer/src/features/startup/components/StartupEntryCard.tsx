/**
 * StartupEntryCard - Display a single startup entry with controls
 */

import React from 'react';
import { Button } from '@avs/ui';
import { ShieldCheckIcon, ClockIcon } from '@heroicons/react/24/outline';
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
      case 'high': return 'text-semantic-danger';
      case 'medium': return 'text-semantic-warning';
      case 'low': return 'text-semantic-success';
      default: return 'text-text-muted';
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
    if (ms === undefined || ms === null) return 'Unknown';
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  };

  return (
    <div className="border border-[var(--avs-border)] rounded-lg p-4 hover:bg-[var(--avs-surface-muted)] transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-small font-semibold text-text-primary truncate">{entry.name}</h3>
            <span className={`text-caption font-medium ${getImpactColor(entry.impact)}`}>
              {entry.impact.toUpperCase()}
            </span>
          </div>
          <p className="text-small text-text-secondary mb-2">{entry.publisher || 'Unknown publisher'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-caption text-text-muted mb-2">
            <span>{getSourceLabel(entry.source)} • {entry.location}</span>
            <span className="flex items-center gap-1">
              <ShieldCheckIcon className="h-3.5 w-3.5" />
              {entry.signatureStatus ?? 'Signature unknown'}
            </span>
            <span>Boot impact: {formatBootImpact(entry.bootImpactMs)}</span>
            {entry.lastLaunch && (
              <span className="flex items-center gap-1">
                <ClockIcon className="h-3.5 w-3.5" />
                Last launch: {entry.lastLaunch}
              </span>
            )}
          </div>
          <p className="text-caption text-text-muted truncate font-mono">{entry.command}</p>
        </div>
        <div className="flex flex-col gap-2">
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
          <span className={`text-caption text-center ${entry.enabled ? 'text-semantic-success' : 'text-text-muted'}`}>
            {entry.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>
    </div>
  );
});
