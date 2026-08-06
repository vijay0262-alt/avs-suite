/**
 * ScanCounters — live animated counter grid.
 *
 * Displays a grid of counters that animate smoothly as values change.
 * Each counter shows an icon, label, and animated value.
 * Counters are configurable per-module via UnifiedScanCounterDef.
 */
import type { ReactNode } from 'react';
import {
  DocumentTextIcon,
  ServerStackIcon,
  CommandLineIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  EyeSlashIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  Squares2X2Icon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  CircleStackIcon,
  ClockIcon,
  ShieldExclamationIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import type { UnifiedScanCounterDef } from '../unifiedScanTypes';
import { formatCounterValue } from '../unifiedScanTypes';
import { useAnimatedCounter } from '../useAnimatedCounter';

const ICONS: Record<string, ReactNode> = {
  DocumentTextIcon: <DocumentTextIcon className="h-4 w-4" />,
  ServerStackIcon: <ServerStackIcon className="h-4 w-4" />,
  CommandLineIcon: <CommandLineIcon className="h-4 w-4" />,
  Cog6ToothIcon: <Cog6ToothIcon className="h-4 w-4" />,
  GlobeAltIcon: <GlobeAltIcon className="h-4 w-4" />,
  EyeSlashIcon: <EyeSlashIcon className="h-4 w-4" />,
  TrashIcon: <TrashIcon className="h-4 w-4" />,
  DocumentDuplicateIcon: <DocumentDuplicateIcon className="h-4 w-4" />,
  Squares2X2Icon: <Squares2X2Icon className="h-4 w-4" />,
  CpuChipIcon: <CpuChipIcon className="h-4 w-4" />,
  ExclamationTriangleIcon: <ExclamationTriangleIcon className="h-4 w-4" />,
  SparklesIcon: <SparklesIcon className="h-4 w-4" />,
  CircleStackIcon: <CircleStackIcon className="h-4 w-4" />,
  ClockIcon: <ClockIcon className="h-4 w-4" />,
  ShieldExclamationIcon: <ShieldExclamationIcon className="h-4 w-4" />,
  LinkIcon: <LinkIcon className="h-4 w-4" />,
};

export interface ScanCountersProps {
  definitions: UnifiedScanCounterDef[];
  values: Record<string, number>;
  maxVisible?: number;
}

function AnimatedCounter({
  def,
  value,
}: {
  def: UnifiedScanCounterDef;
  value: number;
}) {
  const animated = useAnimatedCounter(value);
  const displayValue = formatCounterValue(Math.round(animated), def.format);
  const icon = ICONS[def.icon] ?? <DocumentTextIcon className="h-4 w-4" />;

  return (
    <div
      className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2.5 transition-colors hover:bg-[var(--avs-surface-muted)]/80"
      data-testid={`scan-counter-${def.id}`}
    >
      <div className="flex items-center gap-1.5 text-text-muted mb-1">
        {icon}
        <span className="text-caption truncate">{def.label}</span>
      </div>
      <div className="text-base font-bold tabular-nums text-text-primary" aria-live="polite">
        {displayValue}
      </div>
    </div>
  );
}

export function ScanCounters({ definitions, values, maxVisible = 12 }: ScanCountersProps) {
  const visible = definitions.slice(0, maxVisible);

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5"
      data-testid="unified-scan-counters"
      role="group"
      aria-label="Live scan counters"
    >
      {visible.map((def) => (
        <AnimatedCounter
          key={def.id}
          def={def}
          value={values[def.id] ?? 0}
        />
      ))}
    </div>
  );
}
