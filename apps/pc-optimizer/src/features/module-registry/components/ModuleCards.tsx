/**
 * ModuleCards — dynamically renders module cards from the Module Registry.
 *
 * The Dashboard renders this component instead of hardcoding module cards.
 * New modules appear automatically when registered.
 */

import React from 'react';
import { Card, Button } from '@avs/ui';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { useModuleRegistry } from '../useModuleRegistry';
import { MODULE_LIFECYCLE_CONFIG } from '../moduleRegistry.types';
import type { ModuleRegistryEntry } from '../moduleRegistry.types';
import { getModuleStatus } from '../../dashboard/dashboard.utils';
import { MODULE_STATUS_CONFIG } from '../../dashboard/dashboard.types';

export interface ModuleCardsProps {
  onNavigate: (path: string) => void;
}

export const ModuleCards = React.memo(function ModuleCards({ onNavigate }: ModuleCardsProps) {
  const entries = useModuleRegistry();

  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="module-cards-grid">
      {entries.map((entry) => (
        <ModuleCard key={entry.metadata.moduleId} entry={entry} onNavigate={onNavigate} />
      ))}
    </div>
  );
});

function ModuleCard({ entry, onNavigate }: { entry: ModuleRegistryEntry; onNavigate: (path: string) => void }) {
  const { metadata, status, locked } = entry;
  const lifecycleConfig = MODULE_LIFECYCLE_CONFIG[status];
  const moduleStatus = getModuleStatus(0, 0, status === 'scanning' || status === 'cleaning' || status === 'optimizing');
  const statusConfig = MODULE_STATUS_CONFIG[moduleStatus];

  return (
    <Card
      className={`hover:border-border-hover transition-colors ${locked ? 'opacity-60' : ''}`}
      data-testid={`module-card-${metadata.moduleId}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-base font-semibold text-text-primary">{metadata.displayName}</div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusConfig.colorClass} ${statusConfig.bgClass}`}
            data-testid={`module-lifecycle-${metadata.moduleId}`}
          >
            {lifecycleConfig.label}
          </span>
        </div>
      </div>

      <div className="text-sm text-text-secondary mb-3">{metadata.description}</div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-text-muted">v{metadata.version}</span>
        <span className="text-xs text-text-muted">·</span>
        <span className="text-xs text-text-muted capitalize">{metadata.category}</span>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onNavigate(metadata.routePath)}
        rightIcon={<ChevronRightIcon className="h-4 w-4" />}
        disabled={locked}
        className="w-full justify-between"
      >
        {locked ? 'Locked' : 'Open'}
      </Button>
    </Card>
  );
}
