/**
 * StartupEntryCard - Display a single startup entry with controls
 */

import { Button } from '@avs/ui';
import type { StartupEntry } from '../startup.types';

interface StartupEntryCardProps {
  entry: StartupEntry;
  onDisable: (entry: StartupEntry) => void;
  onEnable: (entry: StartupEntry) => void;
  loading?: boolean;
}

export function StartupEntryCard({ entry, onDisable, onEnable, loading }: StartupEntryCardProps) {
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-green-500';
      default: return 'text-gray-500';
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

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-bg-secondary transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-text-primary truncate">{entry.name}</h3>
            <span className={`text-xs font-medium ${getImpactColor(entry.impact)}`}>
              {entry.impact.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-1">{entry.publisher}</p>
          <p className="text-xs text-text-muted mb-2">{getSourceLabel(entry.source)} • {entry.location}</p>
          <p className="text-xs text-text-muted truncate font-mono">{entry.command}</p>
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
          <span className={`text-xs text-center ${entry.enabled ? 'text-green-500' : 'text-gray-500'}`}>
            {entry.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>
    </div>
  );
}
